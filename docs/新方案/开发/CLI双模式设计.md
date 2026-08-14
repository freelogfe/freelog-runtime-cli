# CLI 工程模式与会话模式

> 文档角色：双模式产品与技术设计。业务规则仍以 [DESIGN.md](../../../DESIGN.md) 与 [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md) 为准。**实现进度与 Console 代码对齐状态：** [CLI双模式实现设计](./CLI双模式实现设计.md) **§13（P0–P6 ✅）· §24（parity 矩阵）**。

最后更新：2026-08-14（增补 §12 双维持久化四模式 · studio/session 交互壳）

## 1. 结论（先看）

**工程模式**与**会话模式**共用同一套业务用例与平台门禁；差别仅在 **本地持久化策略**：

| | 工程模式 | 会话模式 |
|---|---|---|
| 用户意图 | `freelog.manifest.json`（可 Git） | 命令行 flag / 交互问答 / 单次 JSON（不默认落盘） |
| 平台事实 | `.freelog/state.json`（绑定 env） | 进程内内存；可选系统临时目录 |
| 典型用户 | CI、主题仓库、批量子工程 | Console 式「选资源 → 选文件 → 提交」 |
| 可复现性 | 目录即契约 | 当次命令参数即契约 |

**会话模式消除的是「本地缓存与平台长期对齐」类问题，不是业务规则本身。**

> **命名固定：** 本文「会话模式」= **Store 不落盘（S=1）** 仅此一项。凭据是否落盘（Auth）是独立维度；四模式见 [CLI双维持久化设计](./CLI双维持久化设计.md) 与 DESIGN §双维持久化。

**与 Console 对齐：** 两种模式都必须满足 [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md) 中同一能力 ID 的门禁与 API 语义。**P6 Console parity 代码缺口已全部完成**；已裁决差异见 [CLI双模式实现设计](./CLI双模式实现设计.md) §23；后续缺口登记 §24.3。

## 2. 业务一层、Store 一层（禁止双实现）

### 2.0 分层与 Console 的对应

```text
                    Console UI 向导                CLI 命令（工程 / 会话）
                           │                              │
                           └──────────┬───────────────────┘
                                      ▼
                         同一套 services 用例（Console PARITY 真源）
                           · publishVersion / updateListing / editReleasedVersion
                           · buildCreateVersionParams（→ createVersion API）
                           · authorizationTree / shared guards / fileProperty
                           · evaluateOnlineGates / policySetStatus / …
                                      │
                                      ▼
                              platform（tools-lib API）
                                      ▲
                         adapters（DTO 映射，与 Console 同源字段）
                                      │
                         ProjectStore（唯一允许因模式而变的层）
                           ├─ ManifestStateStore：读写在 cwd 的 manifest/state
                           └─ EphemeralStore：内存 Intent + 按需 fetch 平台事实
```

| 层 | 工程 / 会话 | Console 关系 | 是否允许写两套 |
|---|---|---|---|
| **platform + adapters** | 共用 | 与 Console 调同一 API、同一 payload 形状 | **禁止** |
| **services/shared guards** | 共用 | 对应 `FORM-*` 与 creator 门禁 | **禁止** |
| **services 用例**（publish/update/edit/online…） | 共用 | 能力矩阵 R/V/D 的 CODE 真源 | **禁止** |
| **ProjectStore** | 二选一注入 | Console 无本地 Store；CLI 独有 | **仅此层双实现** |
| **commands** | 参数/TTY 不同 | Console 页面对应不同入口 | 可有两条 **薄** 命令路径，但必须汇入同一 service |

**反模式（实现时 code review 拒绝）：**

- `publishVersionSession.ts` 复制 `publishVersion.ts` 的上传/门禁/API 逻辑  
- 会话模式跳过 `authorizationTree` 或 `buildCreateVersionParams`  
- 工程模式与会话模式各写一份 `createVersion` payload 拼装  

**允许的差异（仅命令层）：**

- 工程：`version set` 写 manifest → `publish`  
- 会话：`resource publish --file --resource-id` 在命令层组装 `Intent` 后 **直接调用** `publishVersion({ store })`  

### 2.1 Console 步骤 → 同一 service（两种模式仅 Intent 来源不同）

| 能力 ID | Console 页面 / 动作 | 共用 service | API | 工程模式 Intent | 会话模式 Intent |
|---|---|---|---|---|---|
| R-01 | `creator/Step1` 创建身份 | `createResource` | `Resource.create` | manifest + `create` | `publish --session` 内嵌，或 `resource create --session` |
| V-01/V-02 | `creator/Step2` 或 `versionCreator/$id` 选文件发行 | `publishVersion` | **`createVersion`** | manifest.version + filePath | `--resource-id` `--file` `--version`（首发无 id） |
| V-06 | `versionCreator` 选「上个版本」继承 fileSha1 | `publishVersion` | **`createVersion`** | manifest 保留 deps/attrs + 新 version | `--reuse-version <ver>` + 新 version；**无** `--file` |
| R-02 | `sidebar/info/$id` 改 listing | `updateListing` | `Resource.update` | manifest / `update` flags | `--resource-id` + listing flags |
| V-05 | `sidebar/versionInfo/$id` 改说明/属性 | `editReleasedVersion` | **`updateResourceVersionInfo`** | `version edit` | `version edit --resource-id --session`；**不含**改 deps 列表 |
| D-* 声明 | `versionCreator` / `creator/Step2` 编辑 depList | `publishVersion`（payload 内） | **`createVersion` 请求体** | manifest `dep *` → `publish` | publish 命令行/JSON 内联 deps（**不是** `version edit`） |
| D-05 签约 | `sidebar/versionInfo` / `sidebar/dependency` 内 `FMicroAPP_Authorization` | `dep auth` + 授权树 | 合同 batch | manifest deps + `dep auth` | `--resource-id` + 同 dep auth 流程 |
| P-* | `sidebar/policy` + online 门禁 | `onlineResource` / `policy *` | 策略/上下架 API | state + gates | fetch 平台事实 + 同 gates + `--resource-id` |
| V-04 草稿 | 维护页草稿 badge → 跳 creator | `draft *` | `saveVersionsDraft` | `draft push/pull` | **默认跳过**（见 §6） |

会话模式 **不实现** Console 没有的捷径；`EQUIVALENT` 仅表示「交互路径不同，平台结果相同」。

### 2.2 Console 维护页三条路径（源码核对，避免混 API）

Console `sidebar/versionInfo/$id` 上用户可见的维护动作，在平台层 **分属三条路径**；会话/工程模式都必须映射到同一 service，**不得**合并成一条「万能 edit」：

```text
维护页 sidebar/versionInfo/$id
  ├─ 改已发版 description / 属性
  │     → resourceVersionEditorPage.updateDataSource / syncAllProperties
  │     → updateResourceVersionInfo          → CLI: version edit（V-05）
  │
  ├─ 点「更新版本」（新发版，可改 deps / 换文件 / 继承「上个版本」）
  │     → LinkTo.resourceVersionCreator → versionCreator/$id
  │     → createVersion                        → CLI: publish / resource publish（V-01/V-06/D-*）
  │
  └─ 依赖区 FMicroAPP_Authorization（展示 + 补签约，不改已锁定 dep 列表）
        → dep auth / 合同流                     → CLI: dep auth（D-05）
```

**关键边界（索引 §4–§6）：**

- `UpdateResourceVersionInfoParamsType` **无** `dependencies`；改 dep 列表 **只能** `createVersion`。
- `resolveResources` 属合同解析字段，**不是**「改依赖列表」；签约仍走 D-05。
- Console「上个版本」= 新 version 号 + **同一 fileSha1** + 可改 deps；CLI 会话侧用 `--reuse-version`（或等价 flag）表达，仍走 `publishVersion`。

证据索引：[Console源码证据索引](../对齐/Console源码证据索引.md) §4–§6。

## 3. 哪些「各种注意」会消失 / 不会消失

### 3.1 会话模式下不再需要的用户心智

- manifest 与 state **漂移**、双边变更冲突（`pull --apply-listing --force`）
- state **`env` 与 `--env` 不一致**（无长期 state 文件）
- 误把 `.freelog/state.json` **提交进 Git**
- **bind 错目录**、工程壳与 resourceId 绑死
- 本地 **draftSync / listingFingerprint** 与远端草稿对账（会话模式默认不启用远端草稿同步，见 §5）
- 「先 init 空壳再 bind」的 **仪式性步骤**

### 3.2 两种模式都必须保留的门禁（与 Console 相同，实现于 shared/services）

- 显式 **`--env`**（非 TTY 写操作）
- **owner** 与登录账号一致
- **frozen**、**semver**、非叶子 type、online 前策略/正式版
- **依赖授权树**、`batchSignContracts`、authExcluded 语义
- **dry-run** 零平台写入
- 失败 **exit code + envelope**（或 documented 人类模式）

平台 API 契约、Console 表单限制、payload 形状 **不因模式而改变**；parity 脚本对两种模式 **共用同一断言**（仅 fixture 目录策略不同）。

## 4. 架构：统一用例 + 可插拔 Store

在现有分层上增加 **Store 抽象**，service 不直接假设「一定读写 manifest/state 文件」：

```text
commands（参数 / TTY / 输出）
  → services（用例：publish / update / version edit / …）
      → gates（与 today 相同：owner / frozen / auth tree / …）
      → platform（tools-lib API）
      → ProjectStore（读写意图与事实）
           ├─ ManifestStateStore   ← 工程模式（cwd 下 manifest + state）
           └─ EphemeralStore       ← 会话模式（内存 + 可选 scratch）
```

### 4.1 ProjectStore 职责（设计接口）

| 能力 | 说明 |
|---|---|
| `loadIntent()` | 发版/维护意图：类型、标题、version、filePath、deps、attrs… |
| `loadFacts()` | 平台事实：resourceId、owner、status、latestVersion、policies… |
| `resolveResourceId()` | 创建前可为空；维护/发新版必须可解析 |
| `saveIntent()` / `saveFacts()` | 工程模式写磁盘；会话模式默认 no-op 或仅写内存 |
| `mode()` | `'project' \| 'session'` |

**规则：** `publishVersion`、`updateListing`、`editReleasedVersion` 等改为依赖 `ProjectStore`，而不是直接 `loadManifest(cwd)`。

**同步重构：** 今日 `ensureSynced(cwd)` 含 listing 漂移检测与写 state，属于 **工程模式 Store** 行为。会话模式应使用 `ensureOperationContext(store)`：必要时 **只读** `fetchResourceInfo(resourceId)`，**不** 做 manifest/state 漂移对账。owner/frozen 等门禁仍在 **同一** `ensureOwner` / guards 路径。

### 4.2 临时文件 vs 持久缓存

会话模式 **仍可能需要** OS 临时目录，但性质不同：

- 上传前本地文件路径、zip 打包、SHA1 计算 → **过程产物**，命令结束可删
- **不是**用户工程里的「平台事实缓存」，不参与下次命令 unless 用户显式 `--keep-scratch`

## 5. 交互模型

### 5.1 工程模式（现状，保持）

```text
init → manifest/state 壳
create / bind → 写入 resourceId 到 state
version set / dep / manifest 编辑
publish / update / version edit
```

### 5.2 会话模式（目标）

```text
login（凭据仍：工作区或全局，与模式无关）

# 新建并首发（无 resourceId）
freelog-cli resource publish \
  --file ./photo.png --resource-type RT005001 --title "..." \
  --session --yes --env dev

# 对已有资源发新版（Console：维护页 →「更新版本」→ versionCreator）
freelog-cli resource publish \
  --resource-id <id> --file ./v2.zip --version 2.0.0 \
  --session --yes --env dev

# 只改 deps、不换文件（Console：versionCreator +「上个版本」→ createVersion）
freelog-cli resource publish \
  --resource-id <id> --version 2.0.1 --reuse-version 2.0.0 \
  --dep-add 'RT001:1.0.0' \
  --session --yes --env dev

# 只改 listing，不换文件（Console：sidebar/info）
freelog-cli resource update \
  --resource-id <id> --title "..." --intro "..." \
  --session --yes --env dev

# 只改已发版元数据（Console：sidebar/versionInfo 内联编辑 → updateResourceVersionInfo）
freelog-cli version edit \
  --resource-id <id> --version 1.0.0 \
  --description "..." --sync-properties \
  --session --yes --env dev

# 依赖补签约，不改 dep 列表（Console：FMicroAPP_Authorization）
freelog-cli dep auth --resource-id <id> --session --yes --env dev
```

**禁止混用：** `version edit` **不得**携带 deps 变更；deps 变更 **只能** 出现在 `publish` / `createVersion` 路径（§2.2）。

**激活方式（二选一，实现时定稿）：**

- **A. 全局 flag**：`--session` / `--no-persist`（推荐：同一子命令，文档并列）
- **B. 顶层子命令**：`freelog-cli session publish …`（适合 help 分区，但易重复命令面）

产品倾向 **A + 文档分区**：命令相同，模式由 flag 决定；`status`/`diff`/`validate` 在会话模式下要么只读平台、要么明确「需要工程目录」。

### 5.3 交互式（TTY）

会话模式在 TTY 下允许 **逐步选文件/选资源**（对齐 Console 向导），非 TTY 必须传齐 flag + `--yes`。

## 6. 与草稿（draft）的关系

Console 在多步向导（creator / versionCreator）中会调用 `saveVersionsDraft` / `lookDraft`（V-04），用户可中途离开再回来。**会话模式默认不做这件事**：单次命令内组装完整 Intent → 直接 `createVersion` / `updateResourceVersionInfo`，等价于「向导一步走完」，避免 fingerprint 对账。

| 能力 | 工程模式 | 会话模式（默认） |
|---|---|---|
| 远端版本表单草稿（V-04） | `draft push/pull/discard` | **不调用** draft API；一次命令内意图 → 直接 createVersion / update |
| 本地 manifest 作草稿 | 是 | 否（除非 `--export-project`） |
| 合集目录草稿 | collection item * + publish | 可后续单列；首版会话模式聚焦 **单资源** |

若用户需要 Console 式「分多次填表再提交」，应使用 **工程模式** 或显式 `draft * --cwd <project>`，而不是在会话模式隐式同步草稿。

## 7. 命令与模式矩阵（首版范围）

| 用例 | Console 对照 | 工程模式 | 会话模式 MVP |
|---|---|---|---|
| 创建资源身份 | `creator/Step1` | `create` | `publish --session` 内嵌 create，或 `resource create --session` |
| 首发/发新版（含文件） | `versionCreator` / `creator/Step2` | `version set` + `publish` | `resource publish --file --session` |
| 发新版仅改 deps（同 fileSha1） | `versionCreator` +「上个版本」 | `dep *` + `publish`（inheritData） | `resource publish --reuse-version --session` |
| 更新 listing | `sidebar/info` | `update` | `resource update --session` |
| 已发版元数据（无文件、无升版） | `sidebar/versionInfo` 内联编辑 | `version edit` | `version edit --resource-id --session` |
| 依赖补签约（不改列表） | `FMicroAPP_Authorization` | `dep auth` | `dep auth --resource-id --session` |
| 策略/上下架 | `sidebar/policy` | `policy *` / `online` / `offline` | 同命令 + `--resource-id --session` |
| 批量 import-dir | `creatorBatch` | 子工程 manifest/state | **仍工程模式** |
| CI 可复现 | — | 首选工程模式 | 会话模式不替代 pipeline |

## 8. 变更与验收顺序

**实现规格（类型、接口、Console 逐字段落地、命令参数）：** [CLI双模式实现设计](./CLI双模式实现设计.md)（§17–§23 为 Console 复刻真源；§23 为 CLI 取舍）。

摘要：

1. 先更新 [DESIGN.md](../../../DESIGN.md)、字段账本和 Console `FORM-*` 证据，明确业务门禁与范围。
2. 两种模式只在 Store 边界分流：共享服务、`ensureOperationContext(store)`、`publishVersion / updateListing / editReleasedVersion` 不得复制业务分支或回退到直接 `loadManifest(cwd)`。
3. 为变更补齐工程模式、会话模式和负向门禁测试；需要平台事实的能力再补目标环境证据。
4. 最后更新能力矩阵和日期化报告；报告必须固定 CLI commit、Console commit、环境、账号角色和结果。

**架构测试：** 扩展 `architectureBoundary.test.ts` — 禁止 `services/` 下出现 `*Session*.ts` 业务副本；Store 实现仅在 `config/project/` 或 `services/store/`。

## 9. 非目标（会话模式也不做）

- 不取消 `--env`、owner、授权树
- 不把批量 report/resume 默认写进用户仓库（报告仍可进 `.freelog/reports` 或 tmp）
- 不用会话模式绕过支付/验证码（仍 OUT + Console 接力）
- **`--session` flag 不得写 manifest/state**（S=0 即非 session；多账号落盘用 `studio`，见 §12）

## 10. 与 DESIGN 的关系

- DESIGN 中「本地工程为工作面」描述 **默认主推路径**，不排斥会话模式。
- DESIGN 已明确：**同一业务规则，工程持久化与会话 ephemeral 两种 Store，用户按场景选择。**
- 能力矩阵已登记 **N-06 会话式发行**；会话↔页面映射见 [Console源码证据索引](../对齐/Console源码证据索引.md) §10、[CLI拓扑与Console对照](../对齐/CLI拓扑与Console对照.md) §3.9。

## 11. 待决问题（已拍板，2026-08-13）

> Console 源码核对后的产品结论汇总；**页面→API 映射真源**见 §2.2 与 [Console源码证据索引](../对齐/Console源码证据索引.md)。

### 11.1 `--session` 与 `--cwd` 同时出现

**结论：`--cwd` 在会话模式下仅影响 auth 解析（及可选 scratch 父目录），不写该目录的 manifest/state。**

| 模式 | `--cwd` 作用 |
|---|---|
| 工程模式 | 项目根：manifest/state/config 读写 + auth 起点 |
| 会话模式 | **仅** auth 向上解析起点；Intent 来自 argv/交互；Facts 来自内存/`fetchResourceInfo`；**禁止**向 `--cwd` 写入 manifest/state |

例：在 monorepo 根 `--cwd packages/foo --session` 使用团队 `.freelog-auth`，但不污染 `packages/foo` 的工程文件。

若用户要在会话成功后落盘，用 **`--export-project <dir>`**（见 11.3），而不是静默写入 `--cwd`。

### 11.2 `version edit` 与 deps（Console 源码核对）

**完整路径：** [Console源码证据索引](../对齐/Console源码证据索引.md) §4–§6。

**结论（与 §2.2 一致）：**

- **`version edit`**（会话/工程共用）：仅 **V-05** — `description`、`--sync-properties` / attrs、`video-cover`（CLI 增强）；API = **`updateResourceVersionInfo`**。
- **改依赖列表**：**V-01/V-06** — 必须 **`createVersion`**（`publish` / `resource publish`）；可 **同一 fileSha1 升版本**（Console「上个版本」）。
- **仅补签约**：**D-05** — `dep auth`，对齐维护页 `FMicroAPP_Authorization`。

**收回：** 早期「`--deps-from` + version edit」；deps 变更 **不得** 走 `editReleasedVersion`。

### 11.3 会话 create 成功后的落盘

**问题是什么：** 会话模式默认不写本地工程；用户首发成功后若要继续用 Git/CI 或 `version set`，需要一种 **可选** 方式拿到 `resourceId` 和工程壳，而不是强迫先 `init` + 手工 `bind`。

**结论：**

1. **默认（必须）：** stdout/`--json` 输出 `resourceId`、`resourceName`、`version` 等；人类模式一行摘要。零落盘。
2. **可选：`--export-project <dir>`** — 在指定空目录生成最小工程（manifest + state + `.gitignore`），等价「Console 上创建完 → 本地 bind 壳」；**不**默认写入 `--cwd`。
3. **不提供 `--save-project` 静默写 cwd** — 避免与会话「不持久化」语义冲突。

**最佳实践：** 一次性操作用会话；要长期维护再 `--export-project` 或显式 `init` + `bind <resourceId>`。

## 12. 双维持久化四模式（2026-08-14）

Auth 与 Store 独立；`session` **仅指 S=1**。完整规格：[CLI双维持久化设计](./CLI双维持久化设计.md)。

| 编码 | 入口 | Store | Auth |
|:---:|---|:-:|:-:|
| 00 | `login` + 工程命令 | 落盘 | 落盘 |
| 01 | `xxx --session` | 不落盘 | 落盘 |
| 10 | `freelog-cli studio` | 落盘 | 不落盘（进程内存） |
| 11 | `freelog-cli session` | 不落盘 | 不落盘 |

### 12.1 `01` 命令会话（已实现）

现有 `--session` → EphemeralStore；凭据仍解析 `.freelog-auth`。单条命令、适合脚本与已 login 用户。

### 12.2 `11` 交互会话（`freelog-cli session`）

**实现状态：已完成**（菜单全接 session services；详见 [CLI双模式实现设计 §25](./CLI双模式实现设计.md#25-交互壳sessionstudio)）

- **TTY only**；启动后 no-save 登录 → 选资源 → 菜单（publish / update / dep / policy / online…）
- 全程 **A=1 S=1**；退出清空；可选导出工程转 00
- 复用同一套 session services（`publishVersion({ store: EphemeralStore })` 等）
- **切换账号（菜单 10）后**：若仍绑定旧 resourceId，写操作经 `ensureOwner` 拒绝；须菜单 9 重选资源
- **写操作确认**：交互壳用 clack confirm（非 `--yes`）；写前打印当前登录账号（同 `applyWriteCommandFlags` 语义）

### 12.3 `10` 多账号工作区（`freelog-cli studio`）

**实现状态：已完成**（单文件首发 + 子工程维护 + owner 门禁；详见 [CLI双模式实现设计 §25](./CLI双模式实现设计.md#25-交互壳sessionstudio)）

- **同一人**多个 Freelog 账号；同一文件夹多个视频逐条发行
- **A=1 S=0**：不写 `.freelog-auth`；每个视频一个子目录，`state.owner.userId` 绑定发行账号
- 菜单：选文件发行 / 进入子工程 / **切换账号** / 概况 / 退出
- **不替代** 同账号整批 `import-dir`（00）
- **子工程维护**：仅列出含 `resourceId` 的有效 Freelog 子目录；owner 不匹配 code 2，提示切换账号（菜单 3）
- **维护发行**：confirm 前打印 `summarizePublishPreflight`（与工程 `publish` TTY 一致）

### 12.4 owner 与 state.userId

落盘子工程（00 / 10）写操作门禁以 **`state.resource.owner`** 为准；会话 Store（01 / 11）以平台 fetch + 当前 auth 为准。切换 studio 账号不影响已落盘子目录的 owner 字段。

---

**设计原则复述：** 与 Console 对齐的业务只实现 **一次**（services + adapters + guards）；工程/会话仅是 **Intent/Facts 从哪读写**；会话模式省的是 **长期本地缓存与对齐**，不是 **平台规则**，也 **不是** 第二套 publish/update 代码。
