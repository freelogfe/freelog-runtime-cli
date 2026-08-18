# CLI 双模式实现设计

> 文档角色：双模式当前实现参考。产品边界与 Console 映射见 [CLI双模式设计](./CLI双模式设计.md)；源码路径见 [Console源码证据索引](../对齐/Console源码证据索引.md)；分层规则见 [ARCHITECTURE.md](../../../packages/cli/src/ARCHITECTURE.md)。历史阶段编号只用于解释结构，不代表当前验收结果。

最后更新：2026-08-18

## 0. 复核摘要（2026-08-13）

> **结论先说：** 双模式命令与 Store 分层已经落地；Console parity 的当前状态只以能力矩阵中的 `SPEC/CODE/CONTRACT/ENV` 为准，不能由历史 P0–P6 阶段名推导。

对照 [Console源码证据索引](../对齐/Console源码证据索引.md) 与 `packages/cli/src` 现状：

| 维度 | Console / API | CLI 现状（2026-08-13） | 处置 |
|---|---|---|---|
| V-05 已发版维护 | `updateResourceVersionInfo`（无 deps） | ✅ `editReleasedVersion` | 保持 |
| V-01 首发 | Step1 + Step2 | ✅ `createThenPublish` + `publishVersion` | 保持 |
| V-06 同文件升版 | 同 sha1 `createVersion` | ✅ 会话 `--reuse-version`；工程 `publish --reuse-version` / manifest 空 filePath + fileSha1 | §24.1 |
| D-* deps | `createVersion` 请求体 | ✅ `depService` → Store；默认 `^latest`（batchInfo，无 latest 回退 `*`） | §24.1 D-01 |
| owner / Store | — | ✅ `ensureOwner(store)`；P5 无 service 层 cwd 包装 | 完成 |
| N-04 import-dir | creatorBatch | ✅ 50→generateResourceNames；`autoGenerateCover===2` | 2026-08-13 已对齐 |
| 合集 C-05/C-07 | 即时 item draft + merge | ✅ `collection item *` + `catalogueDraftTracking` | 保持；见 §24.2 |

---

## 1. 实现目标
| 目标 | 可验证标准 |
|---|---|
| 双模式共存 | 同一 service 函数接受 `ProjectStore`；工程/会话仅 Store 实现不同 |
| Console 业务零猜测 | §17–§19 每条操作有 Console 页面 + API 字段 + CLI service 三联证据 |
| 工程模式零回归 | 当前 mandatory 场景目录在绑定的提交和环境下 failed=0、未批准 skipped=0 |
| 会话 MVP 可测 | `verify-session-smoke.mjs` 覆盖 §17 会话 MVP = Y 的全部行 |

## 2. 非目标（首版不实现）

- 合集会话模式（`subject=collection` 的 EphemeralStore）
- 批量 `import-dir --session`
- 会话模式远端 draft API（V-04）
- 常驻 REPL shell
- 自动把 `--cwd` 写成工程目录

---

## 3. 概念分类

### 3.1 模式（Mode）

| 值 | 触发 | Store 实现 |
|---|---|---|
| `project` | 默认；存在 `freelog.manifest.json` 且未 `--session` | `ManifestStateStore` |
| `session` | 全局 `--session` / `--no-persist`（二选一 alias，实现定 `--session`） | `EphemeralStore` |

**解析优先级：** 显式 `--session` **始终**启用 EphemeralStore（即使 `--cwd` 下已有 manifest，也不写盘，见产品 §11.1）→ 无 `--session` 且有 manifest → project → 无 manifest 且无 resource-id → 按命令失败或 TTY 引导。

### 3.2 数据类（复用现有 DTO）

| 类 | 类型 | 含义 | 工程持久化 | 会话 |
|---|---|---|---|---|
| **ResourceProject** | `config/project/types.ts` | listing + 平台 resource 事实 | manifest.resource + state.resource | 内存；按需 fetch |
| **VersionProject** | 同上 | 发版/维护意图 | manifest.version + state.version 部分字段 | 内存；argv 组装 |
| **FreelogManifest** | 同上 | 完整 manifest 文档 | 磁盘 | 仅 `--export-project` 时生成 |
| **FreelogState** | 同上 | 平台事实缓存 | 磁盘 | 内存或 export 时生成 |
| **OperationContext** | 新建 | owner + resource + version 快照 + platform info | ensureSynced 产出 | ensureOperationContext 产出 |

**规则：** 不新增平行 DTO（如 `SessionPublishIntent.ts`）；会话模式在命令层写入 `ResourceProject` / `VersionProject` 形状，再交给 Store。

### 3.3 上下文（Context）

```typescript
/** services/sync/types.ts 扩展 */
interface OperationContext {
  mode: 'project' | 'session';
  auth: { userId: number | string; username?: string };
  resource: ResourceProject;
  version?: VersionProject;
  platform: PlatformResourceInfo; // 已有 fetchResourceInfo 返回
  listingDrifted: boolean;        // session 恒 false（不做 manifest 对账）
}
```

### 3.4 同步策略分类

| 函数 | 适用 Store | 行为 |
|---|---|---|
| `ensureSynced({ cwd })` | **仅** ManifestStateStore 内部 | owner + listing 漂移 → pull 或失败 |
| `ensureOwner({ store })` | **两模式共用**（P0 重构） | 读 `store.loadResource()`；无 id 时仅 `allowCreateWithoutId` 路径 |
| `ensureOperationContext(store, opts)` | **两模式共用** | `ensureOwner(store)` + 漂移对账（仅 project）+ fetch 平台事实 |
| `ensureSyncedReadOnly(store)` | project dry-run | 漂移即失败，不 pull |

**会话模式禁止：** listing 漂移检测、自动 pull 写 manifest、`saveVersionProject` 除非显式 export。

---

## 4. ProjectStore 接口

**位置：** `packages/cli/src/services/store/projectStore.ts`（接口 + factory）；`ManifestStateStore` 在 `config/project/manifestStateStore.ts`；`EphemeralStore` 在 `services/store/ephemeralStore.ts`。

```typescript
export type ProjectMode = 'project' | 'session';

export interface ProjectStore {
  mode(): ProjectMode;

  /** 工程：resolveCwd(cwd)；会话：仅 auth 起点，禁止写 manifest/state */
  rootDir(): string;

  subject(): 'resource'; // MVP 仅 resource；collection 二期

  // --- 读 ---
  loadResource(): ResourceProject;
  loadVersion(): VersionProject | null;
  tryLoadVersion(): VersionProject | null;
  loadState(): FreelogState;           // session：内存合成，env 来自 --env
  resolveResourceId(): string | undefined;

  // --- 写（session 默认 no-op，除非 export） ---
  saveResource(patch: Partial<ResourceProject>): void;
  saveVersion(patch: Partial<VersionProject>): void;
  savePlatformFacts(patch: Partial<FreelogState['resource']>): void;
  saveVersionFacts(patch: Partial<FreelogState['version']>): void;

  /** 工程：写 manifest+state；会话：抛错或 no-op */
  persist(): void;

  /** 仅 session + --export-project：写出最小工程 */
  exportProject(targetDir: string): void;

  /** 是否允许 listing 漂移对账 */
  supportsListingSync(): boolean;
}

export interface ProjectStoreFactoryOpts {
  cwd?: string;
  session?: boolean;
  resourceId?: string;
  /** 会话 Intent 种子（命令层填） */
  seed?: {
    resource?: Partial<ResourceProject>;
    version?: Partial<VersionProject>;
  };
}
```

### 4.1 ManifestStateStore 行为

| 方法 | 实现 |
|---|---|
| `load*` | 委托现有 `loadResourceProject` / `loadVersionProject` / `loadState` |
| `save*` | 委托 `saveResourceProject` / `saveVersionProject` / `savePlatformResourceState` |
| `persist` | 原子写 manifest + state（现有逻辑） |
| `exportProject` | **禁止**（throw `CLI_ONLY_SESSION`） |
| `supportsListingSync` | `true` |

### 4.2 EphemeralStore 行为

| 方法 | 实现 |
|---|---|
| 构造 | 合并 `seed` + 若提供 `resourceId` 则 `fetchResourceInfo` 填 resource 事实 |
| `loadResource` / `loadVersion` | 返回内存副本 |
| `save*` | 只改内存 |
| `persist` | **no-op** |
| `exportProject` | 见 §9 |
| `supportsListingSync` | `false` |
| `rootDir` | `resolveCwd(cwd)` **仅** auth；文档与 `--session` help 明示不写盘 |

### 4.3 Factory

```typescript
export function createProjectStore(opts: ProjectStoreFactoryOpts): ProjectStore {
  if (opts.session) return new EphemeralStore(opts);
  return new ManifestStateStore(opts.cwd);
}
```

命令层在解析 argv 后调用 factory，**禁止** service 内读全局 `--session`。

---

## 5. ensureOperationContext

**位置：** `services/sync/operationContext.ts`

```typescript
export async function ensureOperationContext(opts: {
  store: ProjectStore;
  noAutoPull?: boolean;
  dryRun?: boolean;
  allowCreateWithoutId?: boolean;
}): Promise<OperationContext> {
  const owner = await ensureOwner({
    store: opts.store,
    allowCreateWithoutId: opts.allowCreateWithoutId,
  });
  let resource = { ...opts.store.loadResource(), ...owner.resource };
  let platform = owner.info;

  if (opts.store.supportsListingSync()) {
    const drifted = listingDrifted(resource, platform);
    if (drifted) {
      if (opts.noAutoPull || opts.dryRun) {
        throw cliError(I18N_KEYS.resource_info_mismatch, { code: 3, ... });
      }
      const pulled = await pullResourceToLocal({ store: opts.store });
      resource = pulled.resource;
      platform = pulled.info;
    }
  } else if (opts.store.resolveResourceId()) {
    platform = await fetchResourceInfo(opts.store.resolveResourceId()!);
    resource = applyPlatformFactsToResource(resource, platform);
  }

  return {
    mode: opts.store.mode(),
    auth: owner.auth,
    resource,
    version: opts.store.tryLoadVersion() ?? undefined,
    platform,
    listingDrifted: false,
  };
}
```

**P0 连带重构：** `ensureOwner`、`pullResourceToLocal`、`savePlatformResourceState` 调用链改为接受 `ProjectStore`，**禁止** session 路径触发 `loadManifest` / `saveState` 写盘。

**dry-run：** 只读路径调用 `ensureOperationContext`，**不得** `save*` / `persist`。

---

## 6. Service 改造清单

### 6.1 第一波（Store 注入，行为不变）

目标：签名改为 `{ store: ProjectStore; ... }`，内部用 `store.loadVersion()` 替代 `loadVersionProject(cwd)`。

| Service | 文件 | 备注 |
|---|---|---|
| `publishVersion` | `services/resource/publishVersion.ts` | 核心；成功后 `store.saveVersion` / `store.savePlatformFacts` |
| `createResource` | `services/resourceService.ts` | 会话首发前置；`store.saveResource` |
| `editReleasedVersion` | `services/versionEditService.ts` | V-05；`--sync-properties` 无 manifest 时 merge 底 = 平台 |
| `updateListing` | `services/resourceService.ts` | R-02 |
| `dep add/remove/update/list` | `services/depService.ts` | 改 manifest → 改 `store.saveVersion`；会话可复用，**不必**新造 publish 专用 dep flag |
| `dep auth` | `services/depAuthService.ts` | 需 `--resource-id` |
| `online/offline` | `services/onlineService.ts` | |
| `policy *` | `services/policyService.ts` | |
| `release` | `services/releaseService.ts` | 工程为主 |
| `draft *` | `services/draftService.ts` | **拒绝** session store |

**P5 完成：** 第一波 service 仅接受 `store: ProjectStore`；命令层经 `projectStoreFromCwd` / `resolveCommandProjectStore` 注入，已删除 service 内 `cwd` 兼容包装。

**兼容层（短期）：** ~~保留 `publishVersion({ cwd })` 薄包装~~ → P5 已移除；命令层负责 Store 构造。

### 6.2 明确不改造（首版）

| 模块 | 原因 |
|---|---|
| `services/batch/*` | 工程模式专用 |
| `services/collection/*` | 合集 session 二期 |
| `services/init/*` | 工程 scaffold |
| `draftService` session | V-04 会话不做 |

### 6.3 会话首发编排（新增，Console Step1+2）

**现状：** `publishVersion` 在 L155 取 `ctx.resource.resourceId!`；无 id 必失败。Console 首发是两次 API。

**设计：** 命令层或薄编排 `createThenPublish({ store, ... })`：

```text
ensureOperationContext(store, { allowCreateWithoutId: true })
  → createResource({ store, title, typeCode, name? })   // 写 store 内存
  → 组装 VersionProject（file/version/deps…）
  → publishVersion({ store })
  → 可选 store.exportProject(exportDir)
```

**不得**在 `publishVersion` 内隐式 create（保持单一职责）；编排函数放 `services/resource/createThenPublish.ts`。

### 6.4 第二波（会话命令）

| 命令 | 文件 | 行为 |
|---|---|---|
| 全局 `--session` | `core/command.ts` 或 `bin` 注册 | 传入 factory |
| `resource publish` | **扩展** `commands/resource.ts` | 组装 seed → `createThenPublish` 或 `publishVersion({ store })` |
| `resource update` | 同上 | → `updateListing({ store })` |
| `resource create` | 可选 | 仅 create 不 publish |
| `version edit` 扩展 | `commands/version.ts` | 接受 `--resource-id --session` |

现有 `publish` / `update` / `version edit` **保留**；无 `--session` 时行为不变。

---

## 7. 命令层规格（会话 MVP）

> **完整无 OPEN 规格见 §20**；Console 对照见 §17–§19。本节为摘要。

### 7.1 全局 flag

| Flag | 类型 | 说明 |
|---|---|---|
| `--session` | boolean | 启用 EphemeralStore |
| `--resource-id` | string | 维护/发新版必填（首发 create 除外） |
| `--export-project` | path | 成功后写出工程；见 §9 |
| `--reuse-version` | semver | 从该已发版继承 fileSha1/fileName；**无 `--file`** |
| `--cwd` | path | 会话：仅 auth；工程：项目根 |

### 7.2 `resource publish --session` Intent 组装

| 场景 | 必填 flag | seed 规则 |
|---|---|---|
| 首发 | `--file`, `--resource-type`, `--title`, `--version` 或 `--bump` | `createResource` 在 publish 内；version.filePath=file |
| 发新版+换文件 | `--resource-id`, `--file`, `--version` | fetch 平台 → merge version |
| 发新版+同文件 | `--resource-id`, `--reuse-version`, `--version` | 从平台读 reuse 版 fileSha1/filename → filePath 置空或 sentinel |
| 发新版+改 deps | `dep add/remove/update --session --export-project <dir>`，随后在导出工程 publish；或在 `freelog-cli session` 单进程完成 | 命令会话不跨进程保留 Store |

**deps：** `01` 命令会话的 `dep add/remove/update` 只用于形成并导出工程，必须带 `--export-project`；`11` 交互会话可在同一进程修改后 publish。**禁止** version edit 改 deps，也禁止两条独立 `--session` 命令假定共享 Store。

### 7.3 `version edit --session`

| 字段 | 允许 |
|---|---|
| `--description` | ✓ |
| `--sync-properties` | ✓ |
| `--video-cover` | ✓（CLI 增强） |
| deps 相关 flag | **✗** 直接报错，hint 指向 `resource publish` |

### 7.4 输出（§11.3 落地）

成功 JSON envelope 增加（会话/create 后）：

```json
{
  "resourceId": "...",
  "resourceName": "...",
  "version": "1.0.0",
  "mode": "session",
  "persisted": false,
  "exportProject": null
}
```

`--export-project` 成功时 `exportProject: "<path>"`, `persisted: true`。

---

## 8. `--reuse-version` 算法

对齐 Console `versionCreator`「上个版本」（`resourceVersionInfo1` + 同 sha1 `createVersion`）。

### 8.1 平台快照（新增 helper）

**位置：** 扩展 `services/versionPropertyService.ts` → `fetchReleasedVersionSnapshot`：

| 字段 | 来源 API | 用途 |
|---|---|---|
| fileSha1, filename | `resourceVersionInfo1` | 跳过本地上传 |
| dependencies, description | 同上 | 默认继承（Console L577–605） |
| baseUpcastResources | `fetchResourceInfo` | 与 Console 一致 |
| inputAttrs, customPropertyDescriptors | 已有 mapper | `inheritDataFromVersionConfig` |

### 8.2 publish 管线分支

1. 命令层校验：`--reuse-version` 与 `--file` **互斥**。
2. 调用 `fetchReleasedVersionSnapshot({ resourceId, version: reuseVersion })` 填入 `VersionProject`。
3. **`processFileForPublish` / `planFileForPublish` 新增分支：** 当 `versionConfig.reusePlatformFile === true`（或 `filePath` 空且 `fileSha1` 已设）→ **不读本地盘**，直接返回 `{ fileSha1, filename, filePath: '', isTempFile: false }`。
4. `uploadFileIfNeeded`：sha1 已在平台 → `'reused'`（现有逻辑已支持）。
5. `inheritDataFromVersionConfig(versionCfg)`：deps/attrs 以 **seed/argv 覆盖** 快照；默认继承快照 deps（`--no-inherit-deps` 清空）。

**已实现（P1）：** `processFile.ts` 中 `isReusePlatformFile` / `resolveReusePlatformFile`（空 `filePath` + 已有 `fileSha1` 或 `reusePlatformFile===true` 时不读本地盘）。证据：`processFile.test.ts`、`sessionPublish.test.ts`。

---

## 9. `--export-project` 规格

**触发：** 仅 `store.mode()==='session'` 且命令成功结束。

**目标目录：** 必须为空或仅含 `.git`；否则 exit 4。

**写出文件：**

| 文件 | 内容 |
|---|---|
| `freelog.manifest.json` | 最小 resource manifest：identity、resource listing、version 块（含 deps/attrs） |
| `.freelog/state.json` | resourceId、owner、latestVersion、fileSha1、env |
| `.gitignore` | `.freelog/state.json`、`.freelog-auth` |

**不写出：** draftSync、batch report、collection 块。

**之后：** 用户可在该目录去掉 `--session`，进入工程模式。

---

## 10. 错误码与门禁（模式无关）

| 场景 | code | 模式差异 |
|---|---|---|
| session 下对无 `--resource-id` 的 maintenance 命令 | 4 | 工程 cwd 无 bind 同理 |
| session 下 `version edit` 带 dep flag | 4 | 工程应用 `dep *` + publish |
| session 下 `draft push` | 4 | hint：工程模式或不要 --session |
| `--export-project` 非空目录 | 4 | |
| listing 漂移 | 3 | **仅 project** |
| 授权未解决 | 5 | 相同 |

---

## 11. 目录与文件新增

```text
packages/cli/src/
  services/store/
    projectStore.ts
    ephemeralStore.ts
  config/project/
    manifestStateStore.ts
  services/sync/
    operationContext.ts
    owner.ts                    # 改为 store 入参
  services/resource/
    createThenPublish.ts        # 会话首发编排
  services/versionPropertyService.ts  # + fetchReleasedVersionSnapshot
  services/processFile.ts       # reuse 分支
  commands/
    resource.ts                 # 已有：扩展 publish | update 子命令
```

**架构测试扩展（`architectureBoundary.test.ts`）：**

1. `services/` 下禁止 `*Session*.ts`（`*sessionStore*` 除外）
2. `services/**/*.ts` 禁止 import `loadManifest` / `loadVersionProject` — 必须经 Store（允许 `config/project/` 与 store 实现本身）
3. `commands/resource.ts` 不得 import `platform/`

---

## 12. 测试分层

| 层级 | 内容 |
|---|---|
| 单元 | `EphemeralStore` seed/merge；`exportProject`；`reuse-version` 规划 |
| 架构 | §11 边界测试 |
| ENV 工程 | 现有 `verify-scenarios` 全量回归 |
| ENV 会话 | `verify-session-smoke.mjs` 覆盖 §17 **会话 MVP=Y** 每行至少 1 用例 |
| Parity | `payloadParity` 扩展：Console createVersion 字段集 ⊆ CLI builder 输出 |

---

## 13. 分阶段交付

| 阶段 | 交付物 | 门禁 | 状态 |
|---|---|---|---|
| **P0** | `ProjectStore` + `ManifestStateStore` + **`ensureOwner(store)`** + service 签名迁移 | 133/133 不变 | ✅ |
| **P1** | `ensureOperationContext` + `EphemeralStore` + `fetchReleasedVersionSnapshot` + processFile reuse 分支 | 单元 + 单测 reuse | ✅ |
| **P2** | `--session` + `createThenPublish` + `resource publish/update` + JSON 输出 | verify-session-smoke | ✅ |
| **P3** | `dep * --session` + `dep auth --session`（§22 平台 deps） | parity + auth ENV | ✅ |
| **P4** | `--export-project` | export 场景 ENV | ✅ |
| **P5** | 删除 cwd 兼容包装；文档 N-06 矩阵 ENV | 全量 CI | ✅ |
| **P6** | Console parity 代码缺口（§24.3） | `verify:p6-parity` + 当前完整单元门禁 | 代码已落地；冻结 ENV 仍需 fixture |

**P6 原则：** 先更新本文 §24 + [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md)，再改代码；禁止 silent drift。

---

## 14. 已定稿项（原待定，Console/CLI 复核后无 OPEN）

| 项 | 定稿 | 证据 |
|---|---|---|
| 持久化 flag | 仅 `--session` | 产品 §11 |
| 会话 deps 变更 | `01` 必须同时 `--export-project`；`11` 可在同进程改 Store 后 publish | Console deps 仅在 `createVersion`；跨进程内存不存在 |
| reuse 继承 | 默认继承 `resourceVersionInfo1` 的 deps/description/attrs；`--no-inherit-deps` 清空 deps | Console L577–605；attrs 过滤见 §23.12 / §24.1 V-06 inherit |
| version edit + sync、无 manifest | `mergeVersionPropertiesForSync({ platform, manifest: {} })` | Console syncAllProperties 以页内状态为全集 |
| 首发默认版本 | 未传 `--version` 且 `--bump` 时：`computeBumpedVersion(undefined)` → **`1.0.0`** | Console step2 固定 `1.0.0` |
| `authExcludedItems` | 无排除项时传 **`[]`**（API 类型 required） | tools-lib L334–338；Console step2 L514–543 |
| 会话 dep auth 依赖来源 | **`resourceVersionInfo1`**（`--version` 或 `latestVersion`）+ `fetchResourceInfo.baseUpcastResources` | PlatformResourceInfo 无 deps 字段 |
| TTY 向导 | P3 后；P2 **仅 flag** | — |
| `policy/online --session` | P2 纳入 store 注入；数据源 = **fetchResourceInfo** | sidebar 维护页 |

---

## 15. 与产品文档关系

| 产品设计 | 本文对应 |
|---|---|
| [CLI双模式设计](./CLI双模式设计.md) §2.2 三条路径 | §17、§20 |
| §11.1 `--cwd` | §4.2、§21 |
| §11.3 落盘 | §9、§20 |
| [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md) | §17 能力 ID 列 |

**变更准入：** 任何会话能力变更先核对 §17–§24 与 [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md)，再同时更新两种模式的测试和证据；不得以历史 P0–P6 交付记录替代当前验收。

---

## 16. 审查结论（PM + 架构）

| 维度 | 结论 |
|---|---|
| 双模式交付 | 命令与 Store 实现已落地；会话 MVP §17 全 Y 行有代码与 smoke，环境完成度见能力矩阵与日期化报告 |
| Console 复刻完整性 | 核心发版/维护 API 路径有实现；UI-only / OUT 见 §23；当前对齐状态以 §24 及能力矩阵的 `SPEC/CODE/CONTRACT/ENV` 为准 |
| 可维护性 | §18–§20 为实现规格；变更前必须重读 §24 和当前 Console 证据 |
| 无猜测原则 | 新发现的差异登记 §24.3；已裁决差异见 §23 |
| 文档顺序 | **对齐文档 → 实现设计 §24 → 代码**（用户要求 2026-08-13） |

---

## 17. Console 业务操作落地表（会话 MVP）

证据索引：[Console源码证据索引](../对齐/Console源码证据索引.md)。**会话 MVP** 列：Y = P2 必须实现；N = 明确不做（§23）。

| ID | Console 页面 / 动作 | 平台 API | CLI service | 工程 Intent | 会话 Intent | 会话 MVP |
|---|---|---|---|---|---|---|
| R-01 | `creator/Step1` 创建 | `Resource.create` | `createResource` | manifest + `create` flags | `--title --type [--name] [--type-name]` | Y |
| V-01 | `creator/Step2` / `versionCreator` 发行 | `createVersion` | `publishVersion` | manifest.version | 见 §20.1 | Y |
| V-02 | 选本地文件上传 | upload + sha1 | `processFileForPublish` | manifest.filePath | `--file` | Y |
| V-03 | 属性解析 | fileProperty API | `resolveCreateVersionPropertiesFromFile` | 同 publish | 同 publish | Y |
| V-05 | `sidebar/versionInfo` 改说明/属性 | `updateResourceVersionInfo` | `editReleasedVersion` | `version edit` | §20.3 | Y |
| V-06 | `versionCreator`「上个版本」 | `createVersion` + 同 sha1 | `publishVersion` + reuse | manifest 保留字段 | `--reuse-version` | Y |
| R-02 | `sidebar/info` / creator Step4 listing | `Resource.update` | `updateListing` | `update` flags | §20.2 | Y |
| D-* | versionCreator depList | `createVersion.dependencies` 等 | `dep *` → publish | manifest `dep *` | `dep add` + `--session` | Y |
| D-04 | step2 `step2_isCompleteAuthorization` | 发布前授权树 | `assessDeclaredAuthorization` | publish 内 | publish 内 | Y |
| D-05 | `FMicroAPP_Authorization` | 合同 batch | `depAuthFromMap` | `dep auth` | `dep auth --session --resource-id` + §22 | Y |
| P-01 | creator Step3 / sidebar policy | `Resource.update` addPolicies | `policy apply` | manifest/file | `policy apply --session --resource-id` | Y |
| P-02 | sidebar 启停策略 | `Resource.update` policies | `policy set` | manifest/state | `policy set --session --resource-id` | Y |
| P-03 | sidebar online（**严格门禁**） | `Resource.update` status=1 | `onlineResource` | `online` | `online --session --resource-id` | Y |
| P-04 | sidebar 下架 | `Resource.update` status=4 | `offlineResource` | `offline` | `offline --session --resource-id` | Y |
| V-04 | 草稿 badge | `saveVersionsDraft` | `draft *` | manifest | **跳过** | N |
| R-04 | bind 已有资源 | — | `bind` | `bind` | **`--resource-id` 等价**，无 bind 命令 | Y |
| C-* | 合集全流程 | 合集 API | `collection *` | manifest | — | N |
| N-04 | `creatorBatch` | `createBatch` | `import-dir` | 子工程 | — | N |

**Console 首发向导 Step3–4 与会话关系：** Step3（策略）= `policy apply`；Step4（listing + **`status:1` 直接上架**）在 CLI **拆成** `update` + `online`，且 `online` 走 **sidebar 严格门禁**（能力矩阵已裁决，见 §23.1）。

---

## 18. API 字段真源对照

### 18.1 `Resource.create`（R-01）

| API 字段 | Console 来源 | CLI 入参 | 会话 flag | 工程 fallback |
|---|---|---|---|---|
| `name` | `step1_resourceName_optimized` | `normalizeCreateName` | `--name` | manifest.identity.name |
| `resourceTypeCode` | `step1_resourceType.value` | `typeCode` | `--type` / `--resource-type` | manifest.resource.typeCode |
| `resourceTypeName` | `customInput` | `resourceTypeName` | `--type-name` | manifest.resource.typeName |
| `resourceTitle` | `step1_resourceTitle.trim()` | `title` | `--title` | manifest.resource.title |

**Console 证据：** `resourceCreatorPage/step1Effects.ts` L124–129。**CLI 真源：** `resourceService.createResource` L97–102。

### 18.2 `createVersion`（V-01 / V-06 / D-*）

tools-lib `CreateVersionParamsType`（L298–339）；Console `step2Effects.ts` L528–584、`resourceVersionCreatorPage.ts` L754–814。

| API 字段 | Console 赋值 | CLI `VersionProject` / builder | 会话来源 | 备注 |
|---|---|---|---|---|
| `resourceId` | 已创建资源 ID | `resourceId` | create 后 / `--resource-id` | |
| `version` | step2=`1.0.0`；creator=`versionInput` | `version` | `--version` / `--bump` | 首发默认 1.0.0 |
| `fileSha1` | 上传 / 上个版本 | 处理后 sha1 | `--file` / reuse 快照 | |
| `filename` | 文件 name | `filename` | 同左 | |
| `description` | creator 文本；step2=`''` | `description` | `--description` | |
| `dependencies` | directDependencies | `dependencies[]` | `dep add` + session | **不在** version edit |
| `baseUpcastResources` | baseUpcastResources | `baseUpcastResources[]` | manifest 同形 / 后续 `dep` 扩展 | fetchResourceInfo |
| `authExcludedItems` | 授权 UI 排除合同 | `authExcludedItems[]` | 空数组或 manifest 同形 | 必填 `[]` |
| `inputAttrs` | systemProperties additional | `inputAttrs` / fileProperty | fileProperty 解析 | |
| `customPropertyDescriptors` | customProperties + configurations | 同左 | fileProperty 解析 | |
| `batchSignContracts` | Console **未传** | manifest 可选 | 会话默认 **不传** | CLI 工程可选；见 §23.2 |
| `videoCover` | Console TODO 未传 | `videoCover` | `--video-cover` | §23.3 CLI 增强 |

**唯一 builder：** `buildCreateVersionParams` — 会话/工程 **必须** 经此函数，禁止命令层拼 payload。

### 18.3 `updateResourceVersionInfo`（V-05）

tools-lib L456–478；Console `resourceVersionEditorPage.ts` L531–596。

| API 字段 | Console 何时传 | CLI `version edit` | 会话 |
|---|---|---|---|
| `description` | 内联编辑 | `--description` | 同左 |
| `inputAttrs` | syncAllProperties / 部分 update | `--sync-properties` 时 merged | 同左 |
| `customPropertyDescriptors` | syncAllProperties | `--sync-properties` | merge 底=平台 |
| `resolveResources` | 合同解析（非改 deps） | **CLI 未暴露** | 不实现 |
| `dependencies` | **不存在** | **禁止** | **禁止** |

### 18.4 `Resource.update`（R-02 / P-01 / P-03 / P-04）

| 场景 | Console 字段 | CLI |
|---|---|---|
| R-02 listing | `resourceTitle` / `intro` / `coverImages` / `tags` | `updateListing` |
| P-01 加策略 | `addPolicies[{ policyName, policyText }]` | `policy apply` |
| P-03 online | sidebar：`status:1` + 门禁；creator Step4：**无门禁** `status:1` | `onlineResource` **sidebar 门禁** |
| P-04 offline | `status:4`（**非** 0；0=待发行） | `offlineResource` |

---

## 19. 发布与维护门禁（Console 同源，模式无关）

以下在 `publishVersion` / `createThenPublish` / `editReleasedVersion` / `onlineResource` 入口执行；**会话不得跳过**。

| 门禁 | Console 对应 | CLI 实现 | 失败 code |
|---|---|---|---|
| 显式 `--env`（非 TTY 写） | 选环境 | `assertExplicitEnvForWriteOperation` | 4 |
| 登录 / owner | 账号一致 | `ensureOwner` + `assertOwnerMatch` | 2/4 |
| 资源 frozen | 维护页禁用 | `isFrozenStatus` | 4 |
| 叶子类型 | Step1 类型树 | `assertLeafResourceTypeCode` | 4 |
| semver 递增 | 版本号规则 | `assertPublishableVersion` / `assertSemverLike` | 4 |
| 依赖授权完整 | `step2_isCompleteAuthorization` | `assessDeclaredAuthorization` | 5 |
| 文件类型/大小 | 类型配置 | `assertLocalFileAllowedByType` | 4 |
| 属性解析成功 | PropertyParser | `resolveCreateVersionPropertiesFromFile` 失败即停 | 4 |
| theme/widget runtime | 类型要求 | `needsRuntimeVersion` + `runtimeVersion` | 4 |
| online 正式版+策略 | sidebar | `evaluateOnlineGates` | 4 |
| listing 漂移 | 无（Console 无本地） | **仅工程** `listingDrifted` | 3 |

---

## 20. 会话命令完整规格

### 20.0 全局参数（新增 `cliSessionArgs`）

写入 `core/cliArgs.ts`，并入 `cliWriteCommandArgs` / 根命令：

| Flag | 类型 | 必填 | 说明 |
|---|---|---|---|
| `--session` | boolean | 会话命令 Y | 启用 EphemeralStore |
| `--resource-id` | string | 维护类 Y | 等价工程 `bind` 后的 id |
| `--export-project` | path | N | 成功后写出工程（§9） |

既有：`--cwd` `--env` `--yes` `--json` `--no-auto-pull` `--dry-run`（publish）。

### 20.1 `resource publish --session`

| 子场景 | 必填 | 可选 | 调用链 |
|---|---|---|---|
| 首发 | `--file --title --type` | `--name` `--type-name` `--version` `--bump` `--description` | `createThenPublish` |
| 发新版+文件 | `--resource-id --file --version` | 继承平台 deps；改 deps 使用导出工程或交互会话 | `publishVersion` |
| 同文件升版 | `--resource-id --reuse-version --version` | `--no-inherit-deps`；改 deps 使用导出工程或交互会话 | §8 + `publishVersion` |
| dry-run | 同上 | `--dry-run` | 不写平台；session 仍不写盘 |

**互斥：** `--reuse-version` ⊥ `--file`；`--resource-id` ⊥ 首发（无 id）。

### 20.2 `resource update --session`

| Flag | 映射 API |
|---|---|
| `--title` | `resourceTitle` |
| `--intro` | `intro` |
| `--cover` | `coverImages[0]` |
| `--tags` | `tags[]` |

至少一项非空；走 `updateListing({ store })`。

### 20.3 `version edit --session`

| Flag | API 字段 |
|---|---|
| `--version` | 目标已发版（positional 或 flag，与工程一致） |
| `--description` | `description` |
| `--sync-properties` | `inputAttrs` + `customPropertyDescriptors` |

至少一项；当前仅允许 `description` 和 `--sync-properties`。Console 已发布版本维护页没有视频封面入口，因此拒绝 `--video-cover`；同时拒绝任何 dep 相关参数（code 4 + hint → publish）。

### 20.4 `dep add|remove|update --session`

| 要求 | 行为 |
|---|---|
| `--resource-id` | 必填 |
| `--session` | 必填 |
| 无 manifest | 改 EphemeralStore 内 `VersionProject`；命令结束即销毁 |
| `--export-project` | `add/remove/update` 必填；把变更后的版本意图导出为工程 |
| 后续 publish | 必须进入导出工程执行；禁止另一条 `resource publish --session` 假定能读取上条命令内存 |

### 20.5 `dep auth --session`

| 要求 | 行为 |
|---|---|
| `--resource-id` | 必填 |
| `--policy-map` | 必填（与工程相同） |
| 依赖列表来源 | §22：`resourceVersionInfo1` + baseUpcast |

### 20.6 `policy apply|set`、`online|offline --session`

| 命令 | 要求 |
|---|---|
| 全部 | `--session --resource-id --env --yes` |
| `policy apply` | `--from-file`（文件仍在磁盘，与 cwd 无关） |
| `online` | `fetchResourceInfo` → `evaluateOnlineGates` → `status:1` |

---

## 21. EphemeralStore 初始态与 seed

### 21.1 构造顺序

```text
1. rootDir = resolveCwd(cwd)           // 仅 auth
2. memory.resource = seed.resource ?? EMPTY_RESOURCE
3. memory.version = seed.version ?? null
4. memory.state.env = getCliEnv()
5. 若 resourceId：async fetchResourceInfo → 填充 resource 事实（构造后 refresh 或 lazy ensureOperationContext）
```

`EMPTY_RESOURCE`：`{ resourceName: '', resourceType: [] }` — **不**读 manifest。

### 21.2 seed 由谁写入

| 命令 | seed.resource | seed.version |
|---|---|---|
| `resource publish` 首发 | title, typeCode, typeName | filePath, version, description |
| `resource publish` 发新版 | resourceId（fetch） | file/reuse-version, version |
| `dep add --session --export-project` | — | patch dependencies，随后导出工程 |
| `version edit --session` | resourceId | target version 标识 |

---

## 22. 会话模式平台事实数据源

| 数据 | 工程 | 会话 |
|---|---|---|
| resourceId / listing / status / policies | state + fetch | **`fetchResourceInfo(resourceId)`** |
| latestVersion | state | fetch |
| 某版 fileSha1 / deps / attrs | state + manifest | **`fetchReleasedVersionSnapshot`** |
| baseUpcastResources | manifest | **fetchResourceInfo**（与 Console versionCreator L597 一致） |
| dep auth 声明 deps | manifest.version | **resourceVersionInfo1(version)** |
| owner | state + fetch | fetch + auth |

**禁止猜测：** 会话 **never** 从 `--cwd` manifest 读业务字段；cwd 仅 auth。

---

## 23. CLI 特殊性取舍（Console 复刻之后）

### 23.1 上架门禁（P-03）

| | Console creator Step4 | Console 策略页 post-policy | Console sidebar / 发版成功页 | CLI |
|---|---|---|---|---|
| 行为 | `status:1` **无**门禁 | 弹窗后直接 `status:1` | `resourceOnline` 三分支门禁 | **`evaluateOnlineGates`** |

**裁决：** 已写入能力矩阵；会话 `online` 与工程一致，**不**复制任一条 Console 软上架路径（见 `Console完整业务梳理` Step4 三条汇总表）。

### 23.2 `batchSignContracts`

Console createVersion **不传**；CLI 工程 manifest 可带。会话 MVP：**不传**；付费/复杂签约走 `dep auth` + Console 接力（D-05 OUT 部分）。

### 23.3 `videoCover`

Console 新版本表单存在视频封面输入，CLI `version set` 保留下一版意图；Console 已发布版本维护页没有入口，CLI 不开放 `version edit --video-cover`。平台新版本提交契约继续由 ENV 验证，不把已发版维护扩成 CLI_ONLY 能力。

### 23.4 本地工程能力（会话不做）

| 能力 | 原因 |
|---|---|
| manifest/state 漂移对账 | Console 无本地 Store |
| draft V-04 | 会话 = 单次提交 |
| `import-dir` / 合集 | Console 批量页独立产品 |
| 云存储选文件 | Console 能力，CLI OUT |
| `--export-project` | **CLI 独有**；Console 无等价 |

### 23.5 工程模式保留、会话不复制

| | 工程 | 会话 |
|---|---|---|
| `init` / scaffold | Y | N（用 export 或手动 init） |
| `validate` / `diff` / `release` | Y | N（或只读平台版二期） |
| Git changelog → description | Y | N |
| 顶层 `publish`/`update`/`create` | Y | N（用 `resource publish/update --session`） |

### 23.6 追加策略正文语法（P-01）

Console Step3 / sidebar `fPolicyBuilder3` **首条**策略无运行时正文校验；**追加**策略由 Builder UI 保证格式。

CLI `policy apply` 在资源**已有策略**时额外执行 `assertPolicySyntaxForAppend`：正文须含 `FOR PUBLIC` 与 `Initial:`（大小写不敏感）。首条策略不受此限。

**裁决：** CLI 更严；对齐文档见 `FORM-POL-APPEND`。verify 脚本 policy 文件须满足 append 规则。

### 23.7 依赖 versionRange 默认（D-01）

| 场景 | Console | CLI | 代码状态 |
|---|---|---|---|
| 云存储导入 metadata deps | `^` + latestVersion | —（CLI 无云存储） | OUT |
| 用户手动 `dep add` | UI 可编辑 | 默认 `^${latestVersion}`（`batchInfo`）；无 latest 回退 `*` | ✅ P6-1 |
| createVersion 提交 | `versionRange \|\| ''` | 同左 | ✅ |

**裁决：** 显式 `--version` / `--version-range` 优先；未传时 `batchInfo.isLoadLatestVersionInfo=1` 解析 latest；API 失败或无 latest 时回退 `*`（不阻断 add）。

### 23.8 `--reuse-version` 入口

| 模式 | 入口 | 代码状态 |
|---|---|---|
| 会话 | `resource publish --session --reuse-version <semver>` | ✅ `sessionPublishIntent.ts` → `reuseVersionIntent.ts` |
| 工程 | manifest 留 `fileSha1`、清空 `filePath` | ✅ `processFile.ts` 启发式 |
| 工程 | 独立 flag | ✅ `publish --reuse-version`（P6-2） |

Console「上个版本」UI 仅 versionCreator；工程用户用 `publish --reuse-version`（自动 seed `fileSha1`/`reusePlatformFile`，**无需**手改 manifest 清 filePath）。

**持久化：** `saveVersionProject` 在 `reusePlatformFile===true` 时保留 `state.version.fileSha1`，避免 reuse 后被 `changedPublishInput` 清空。

### 23.9 Sidebar 上架原子写（↷）

Console `resourceOnline` 在**零策略**时可一次 `update` 写 `status:1` + `addPolicies`（`sidebar/Sider/index.tsx` L373–409）；**全禁用**时弹 `fPolicyOperator` 再上架。

CLI **拆步**：先 `policy apply`，再 `online`；无内嵌 Builder。功能等价、交互不同 — 见 `Console完整业务梳理` §8.2.1、`CLI拓扑` §3.7 ↷。

**第三条软上架：** 策略页 `online_afterSuccessCreatePolicy` 在用户新增策略后直接 `status:1`（无 `evaluateOnlineGates`）— CLI **不复制**；须显式 `online`。

### 23.10 Sidebar batchAuth 告警（D-04 / ↷）

Console `resourceSider.fetchInfo` 在 `latestVersion !== ''` 时调 `Resource.batchAuth`；`!isAuth` → 依赖 Tab 警告（`FORM-SIDER-AUTH-WARN`）。**不阻止**发版/上架。

CLI publish 预检 `assessDeclaredAuthorization` 对未授权 deps **硬失败**（code 5）— 比 Console 告警更严，符合 CLI 显式失败原则。

### 23.11 平台草稿 vs reuse-version 优先级

| 场景 | Console | CLI 工程 | CLI 会话 |
|---|---|---|---|
| versionCreator 进入 | `lookDraft` 有值 → 草稿态，**不** inherit latest | `draft pull` 优先于 manifest | 无 V-04 draft |
| 无草稿 + 有 latest | inherit `resourceVersionInfo1`（filtered） | manifest 保留字段 / reuse 启发式 | `--reuse-version` + platform snapshot |

**裁决：** 工程模式 `draft pull` 与 `--reuse-version`/manifest 意图冲突时，以 **draft 优先**（对齐 Console L544–687）。

### 23.12 reuse 继承 attrs 过滤（V-06 / ↷）

Console versionCreator inherit 仅 **`insertMode === 2`** 附加属性；`supportOptionalConfig !== 2` 时 **不**带入 optional customConfigurations（L617–655）。

CLI `fetchReleasedVersionSnapshot`（P6-3）：有 `systemPropertyDescriptors` 时以 `insertMode===2` 为准（忽略 raw `inputAttrs`）；`customPropertyDescriptors` 保留 `readonlyText`，仅 `supportOptionalConfig===2` 时保留 editable/select 类。调用方传入 `resourceTypeCode`（reuse 路径已传）。

**边界：** CLI reuse 直传 createVersion，**不** re-parse 文件 — 与 §8.2 设计一致；P6-3 只对齐 inherit 过滤。

---

## 24. Console 代码对齐状态（编码真源）

> **维护顺序：** [对齐文档](../对齐/) 发现 Console 事实 → **更新本节** → 改 `packages/cli/src` → 补测试/ENV。

### 24.1 已实现并有代码/契约证据

| 能力 ID | Console 锚点 | CLI 实现 | 证据 |
|---|---|---|---|
| R-01–V-03 | creator Step1–2 | `createResource` / `publishVersion` / fileProperty | verify-scenarios |
| V-05 | versionInfo 维护 | `editReleasedVersion` | S6e |
| V-06 会话 | versionCreator 上个版本 | `--reuse-version` + `reuseVersionIntent` | sessionPublish.test + verify:p6-parity |
| V-06 工程 | 同上 | `publish --reuse-version` / manifest fileSha1 无 filePath | publishReuse.test + verify:p6-parity |
| D-01 | dep add 默认 range | `resolveDefaultDepVersionRange`（batchInfo → `^latest`） | depVersionRange.test + verify:p6-parity |
| D-04 | 发行前授权 | `assessDeclaredAuthorization` code 5 | publish guards |
| D-05 | dep auth | `depAuthService` / session platform deps | depAuth tests |
| P-01–P-04 | sidebar 策略/上下架 | policy/online/offline + gates | onlineGates.test |
| P-02 末条启用 | `atLeastOneUsing` | `assertPolicyStatusChangeAllowed` | policyService |
| P-04 下架 | status:**4** | `offlineResource` | onlineService.test |
| P6-4 冻结 | versionCreator 位掩码 | `isFrozenStatus`：`publishVersion` + `onlineService` | frozenStatus.test + onlineService.test（online E2E 可选 `FREELOG_TEST_FROZEN_RESOURCE_ID`） |
| V-06 inherit | versionCreator L617–655 | `fetchReleasedVersionSnapshot` insertMode / supportOptionalConfig | versionPropertySnapshot.test |
| N-06 会话 MVP | §17 全 Y | EphemeralStore + `--session` 命令族 | verify:session-smoke |
| N-04 batch name | Handle L362–428 | `resolveInitialBatchResourceName` + `applyGeneratedResourceNames` | batch.test |
| N-04 batch cover | `autoGenerateCover===2` | `isAutoGenerateCoverEnabled` | batch.test |
| C-05/C-07 | §8.5.1 即时 draft + merge | `collection item *` + `catalogueDraftTracking` | collection tests |
| C-09 rules | STARTS_WITH 前缀 | `normalizeCollectRulesBody` | collectRulesContract |

### 24.2 已裁决不对齐（**不改为代码**，§23）

| 项 | 原因 |
|---|---|
| Step3/4/策略页软上架 | CLI 统一 `evaluateOnlineGates` |
| Sidebar batchAuth 软告警 | CLI publish 硬失败（更安全） |
| 追加策略语法 | CLI 更严 `assertPolicySyntaxForAppend` |
| Sider 零策略 atomic 上架 | CLI 拆步 policy + online |
| 列表 batchUpdate / 向导跳过 | OUT / UI_ONLY |
| 云存储选文件 / deps 自动解析 | OUT |

### 24.3 尚未取得完整环境证据

P0–P6 只是历史交付批次，不代表后续 Console 变化自动对齐，也不能替代目标环境验收。当前至少保留以下未闭环证据：RSS 受控邮箱状态链、真实 frozen fixture、文件属性 `handleData` 的 Console 并排结果。它们不是已知代码缺失，但在证据完成前不得写成完整 parity。

---

## 25. 交互壳（session / studio）

> **实现状态：已完成**（2026-08-14）。交互壳只做 TTY 向导 → 组装 Intent → 调现有 service；禁止复制业务逻辑（§2）。

### 25.1 Store 与 Auth 选择

| 入口 | Auth | Store | 实现 |
|---|---|---|---|
| `freelog-cli session` | ephemeral（A=1） | `EphemeralStore`（S=1） | `context.createSessionStore` / `sessionShell` |
| `freelog-cli studio` 首发 | ephemeral | 子目录 `ManifestStateStore` | `studioPublish.ts` |
| `freelog-cli studio` 维护 | ephemeral | `projectStoreFromCwd(subdir)` | `studioActions.ts` + `assertStudioOwner` |

### 25.2 session（11）菜单矩阵

| 菜单 | service / 模块 | 测试 ID |
|---|---|---|
| 选资源（id / 搜索 / 新建） | `sessionActions.pickSessionResource` | `interactiveSession.test.ts`（search 路径） |
| 发新版 | `runSessionPublishWizard` → services | `interactiveSession.test.ts` + `sessionPublish.test.ts` |
| 改 listing | `runUpdateListingWizard` + `updateListing` | `interactiveSession.test.ts` + `resourceService.test.ts` |
| 改版本说明 | `editReleasedVersion` | `versionEditService.test.ts` |
| 依赖 | `depService` + `depAuthService` | `sessionDep.test.ts` |
| 策略 | `policyService` | `onlineGates.test.ts` 等 policy 相关单测 |
| 上架 / 下架 | `onlineService` | `onlineService.test.ts` |
| 导出工程 | `exportSessionProject` | `exportSessionProject.test.ts` + `interactiveSession.test.ts` |
| 切换账号 | `promptSwitchEphemeralAccount` | `authAndDebug.test.ts` + `ephemeralLogout.test.ts` |
| 写确认 | `confirmInteractiveWrite` / `confirmInteractiveOffline` | `interactiveSession.test.ts`（auth 提示） |

写操作统一：`interactiveWrite.confirmInteractiveWrite` + `assertExplicitEnvForWriteOperation`（等价 `applyWriteCommandFlags` 的 env 守卫，非 `--yes`）。

### 25.3 studio（10）菜单矩阵

| 菜单 | 行为 | 测试 ID |
|---|---|---|
| 选文件发行 | `studioPublishOneFile` → `writeItemConfigs` 写 `userId` | `interactiveStudio.test.ts` |
| 进入子工程维护 | `assertStudioOwner` → publish / update / version / online | `interactiveStudio.test.ts`（owner、preflight、listFreelogSubdirs） |
| 切换账号 | `promptSwitchEphemeralAccount` | `authAndDebug.test.ts` |
| owner 不匹配 | code 2 + 「请切换账号（菜单 3）」 | `interactiveStudio.test.ts`（`code: 2`） |

### 25.4 源码索引

- `packages/cli/src/services/interactive/context.ts`
- `packages/cli/src/services/interactive/sessionShell.ts` / `sessionActions.ts` / `runSessionPublishWizard.ts`
- `packages/cli/src/services/interactive/studioShell.ts` / `studioActions.ts` / `studioPublish.ts`
- `packages/cli/src/services/interactive/interactiveWrite.ts`
- `packages/cli/src/commands/sessionInteractive.ts` / `studio.ts`

### 25.5 测试分层

| 层级 | 覆盖 | 命令 / 文件 |
|---|---|---|
| 交互壳单测 | TTY  wiring、store 绑定、owner、preflight 顺序 | `interactiveSession.test.ts`、`interactiveStudio.test.ts`、`ephemeralLogout.test.ts` |
| Service 单测 | 平台规则与 API 适配（与 01 共用） | `sessionPublish.test.ts`、`sessionDep.test.ts`、`onlineService.test.ts` 等 |
| 文档治理 | §12/§25 实现状态、README 命令索引 | `documentationGovernance.test.ts` |
| 人工 TTY（L3-H） | 无落盘凭据、多账号 owner、export 转 00 | [探索测试清单 L3-H](../验证/探索测试清单.md#l3-h-交互壳session--studio) |

**CI 阻塞：** `pnpm --filter @freelog-cli/cli2 verify`（含上述单测）。**L3-H 不阻塞 CI**，但产品验收建议 dev TTY 签字。

### 25.6 UX 与 preflight

| 行为 | session (11) | studio (10) |
|---|---|---|
| 写前账号提示 | `confirmInteractiveWrite` → `logAuthContextIfInteractive` | 同左 |
| 写确认 | clack confirm（非 `--yes`） | 同左 |
| 切换账号 | 提示菜单 9 重选资源；写时 `ensureOwner` 兜底 | 维护入口 `assertStudioOwner`（state.owner） |
| 发行 preflight | `infoPublishFileConstraints`；**无** `validateProject`（无磁盘 manifest） | `summarizePublishPreflight` + confirm |
| 上架 preflight | `summarizeOnlineGates` | 同左 |
| 下架 confirm | `confirmInteractiveOffline`（与 `offline` 命令同源 i18n） | 同左 |
| 子工程列表 | — | 仅含有效 Freelog 子目录（`listFreelogSubdirs`） |

---

*后续对齐缺口登记于 §24.3；每项完成后仍须保留可复核的能力矩阵与验证证据。*
