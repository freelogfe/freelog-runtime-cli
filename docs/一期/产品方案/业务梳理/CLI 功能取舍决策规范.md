# CLI 功能取舍决策规范

> 对照 [README.md](./README.md) 的 Console 业务梳理。只写**已有** `freelog-cli` 命令，不发明第二套。  
> 最后更新：2026-09-03（已按 Console 源码 + `packages/cli/src/commands` 重写；旧「合集五步扫目录 / batchService / collection-create」作废）

图例：✅ 对齐或可脚本化完成　⚠️ 简化 / 路径不同　❌ 不实现，走 Console

---

## 1. 定位

| 维度 | Console | CLI |
|------|---------|-----|
| 用户 | 发行者（含付费、RSS 验证码、微前端签约） | 开发者 / AI / CI（本地工程 + 免费优先） |
| 交互 | 向导、抽屉、微前端 | 命令 + manifest / 会话 |
| 上架 | 多处 `PUT status:1`（创建 Step4、加策略追问、开关） | **只** `online`；禁止 `update --status` |
| 草稿 | 300ms 自动 `saveVersionsDraft` | 显式 `draft push/pull/discard`；`version set` **只写本地意图** |
| 合集发版 | `PUT /v2/resources/catalogue/{id}` merge 草稿 | `collection publish`（不是 `createVersion`） |

硬红线：付费签约 / 支付、微前端授权面板、裁剪器、签约列表、收藏/收入/交易、节点展品独立产品。

---

## 2. 总表（按业务梳理编号）

| 编号 | Console | CLI 命令 | 决策 |
|------|---------|----------|------|
| F0 Step1 | 类型+标题+标识+可新建类型 | `create --type --title --name [--type-name]` | ✅ |
| F0 Step2 | 四入口上传 + 属性/依赖 + 写死 1.0.0 | `version set --file` + `publish` | ⚠️ 仅本地文件 |
| F0 Step3 | builder + 可跳过 | `policy template apply` / `policy apply` | ⚠️ 无付费、无执行预览 |
| F0 Step4 | listing + **status:1** | `update` + `online` | ⚠️ 上架必须拆开 |
| F1 | 单次最多 20，超出截断；大小写死 | `resource import-dir` 默认拆多批 | ⚠️ 见下 |
| C0 Step1 | `subjectType=4`，禁新建类型 | `collection create --type --title --name` | ✅；`--type-name` Console 合集没有 |
| C0 Step2 | 勾选我的资源 / RSS，每批 100 | `collection item add` / `rss bind` | ⚠️ 见下 |
| C0 Step3 | 同 F0 Step3 | **`collection policy apply`**，不要用资源 `policy` | ✅ |
| C0 Step4 | listing + collectRules + status:1 | `collection update` + `collect-rules set` + `online` | ⚠️ 上架拆开 |
| M0 | 路由 `:id`、semver、可 inherit | `version set` + `publish [--reuse-version]` | ⚠️ 见下 |
| M1 | 已发版只改描述；改属性/配置/依赖开 M0 | `version description` / `version show`；发新号 `update-version` | ✅；不跟 Console 改已发版 value |
| M2 | listing 即存，不上架 | `update` / `pull` | ✅ |
| M3 | 可上下线；加完可能追问上架 | `policy list/set` + 单独 `online` | ⚠️ CLI 不加完就上架 |
| M4 | 微前端补签，不增删依赖 | `dep auth` 仅免费；增删走下一版 `dep` + `publish` | ⚠️ |
| M5 | 签约列表只读 | — | ❌ |
| M6 | 无版本/无策略可当场补 | `validate --for online` + `online`/`offline` | ⚠️ CLI **不**在 online 里加策略 |
| C1 | 草稿 CRUD + 发布 merge；无新版本 | `collection item *` + `publish` + `draft --collection` | ✅ |
| C2 | listing + 收录规则即时保存 | `collection update` + `collect-rules` | ✅ |
| C3 | 同 M3–M6 | `collection policy *` + `online`/`offline` | 同 M3/M6 |
| L1 | 我的列表 + 卡片跳转 | 无列表命令；`resource` 搜索不是这页 | ❌ 列表 UI |
| L2 | 详情只读 | `pull` / `version show` / `collect-rules get` | ⚠️ 读模型，不当编辑器 |

分册细节以对应 P0 文档为准。本文只钉**命令对错**和**不能学 Console 的写法**。

---

## 3. 必须记住的差异

### 3.1 上架

Console 创建 Step4 / 侧栏加策略追问 / 开关 `resourceOnline` 都会 `PUT status:1`（无策略时甚至当场 `addPolicies`）。

CLI：`evaluateOnlineGates` 要求 **已有 `latestVersion` 且至少一条 `status===1` 的策略**，通过后才写 `status:1`。缺策略就失败，不会打开 builder。

```text
freelog-cli validate --for online --env <env>
freelog-cli online --yes --env <env>
freelog-cli offline --yes --env <env>
```

### 3.2 单资源创建 vs 新版本

| | Console F0 Step2 | Console M0 | CLI |
|--|------------------|------------|-----|
| 版本号 | 写死 `1.0.0` | `FVersionInput`，须 `> latest` | `version set --version`；`version bump` 只改 manifest |
| 文件 | 四入口 | 同左，可 inherit 上一版 | 仅 `--file`；inherit 用 **`publish --reuse-version`**（与 `--file` 互斥） |
| videoCover | UI 有，**不传** createVersion | 同 | `version set --video-cover` 写本地意图；是否随 publish 上传以实现为准 |
| 草稿 | 300ms | 有草稿则跳过 inherit | `version set` 不调草稿 API；`draft push/pull/discard` 显式同步 |
| 成功后 | 进 Step3 | 成功页，不进策略 | 策略另走 `policy` |

### 3.3 批量 F1

| Console | CLI `resource import-dir` |
|---------|---------------------------|
| 单次最多 20，超出截断 | 默认按 20 **拆多批**；`--strict-batch-limit` 才超限报错 |
| 类型须 `supportCreateBatch=2`，禁新建 | `--resource-type`（**不是** `--type`） |
| 大小写死 视频 1GB / 其它 200MB | 用类型 `fileMaxSize` |
| 完成页签约/加入合集 | ❌ |

### 3.4 合集：Console 四步 ≠ CLI 扫目录

Console **没有**扫本地目录。主路径是勾选已有普通资源（每批 100）或 RSS。

CLI 对照主路径：

```text
freelog-cli collection create --type <code> --title "..." --name <short> --yes --env <env>
freelog-cli collection item add <resourceId> --env <env>
freelog-cli collection publish --yes --env <env>
freelog-cli collection policy template apply <templateId> --yes --env <env>
freelog-cli online --yes --env <env>
```

CLI **额外**能力（Console 向导没有）：

- `collection init-from-folder`：本地媒体目录 → 先发子资源再写入目录草稿
- `collection item import-dir`：同类扫目录加项

RSS：CLI **有** `collection rss send-code` / `bind --code` / `sync` / `inspect` / `status`。旧文「CLI 跳过验证码」作废。TTY 不渲染验证码图，码从邮箱抄到 `--code`。

合集**没有** `versionCreator`。`collection version set` 只写本地发布说明意图。维护发布 = `collection publish`（`isMergeCatalogueDraft`）。

### 3.5 策略

推荐：`policy template list` → `policy template apply <id>`（合集换 `collection policy template …`）。

高级：`policy apply --from-file` / `policy init` 脚手架。`policy set --id --on|--off` 对照侧栏开关。

付费 / TransactionEvent / 支付 Dialog：❌。`dep auth` 遇到付费策略拒绝。

### 3.6 依赖

| 时机 | Console | CLI |
|------|---------|-----|
| 发新版时改树 | Step2 / M0 微前端 | `dep add/remove/update` + `publish` |
| 已发版补签 | M4 `resourceDepAuth`（可付费） | `dep auth --policy-map` 仅免费 |
| 看树 | 微前端 | `dep list --tree` |

### 3.7 列表 / 详情 / 签约

L1 卡片跳转、空态、批量管理：❌ 无 Console 列表命令。`resource` 搜索是另一条读路径。

L2 详情无编辑入口：不要用详情当 `update`。读用 `pull` / `version show`。

M5 授权合约：❌。`GET /v2/contracts` 只在 Console。

---

## 4. 命令速查（已存在，勿新造）

脚手架怎么对 Console：见 [01-脚手架设计前置对照.md](./01-脚手架设计前置对照.md)。`init` 只写本地工程；打平台用 `create` / `collection create`；已有资源用 `bind`。

**单资源**：`login` `init` `create` `bind` `type` `template` `version {set,bump,edit,show}` `publish` `update` `policy {init,template,apply,list,set}` `dep *` `draft` `online` `offline` `validate`/`doctor` `pull` `status` `resource import-dir`

**合集**：`collection {create,init-from-folder,item,update,version,policy,properties,publish,collect-rules,rss,logs}`；上架仍用顶层 `online`/`offline`。属性即时保存对照 C1：`collection properties sync`。

**工程/会话**：`--session --resource-id`、`--env`、`--yes`、`--cwd`

---

## 5. 验收时对照这份，不要对照旧段落

已作废（见到即当错）：

- 合集五步、扫 `feed.xml`、`collection-create --config ep-order.yaml`
- 批量 `batchService.*`、F1 叫 F2
- CLI 上架用 `update --status 1`
- 合集策略用资源命令 `policy apply`（须 `collection policy`）
- `resource import-dir --type`（正确 flag：`--resource-type`）
- inherit 写在 `version set --reuse-version`（正确：`publish --reuse-version`）

修订：v2.0 2026-09-03 按源码业务梳理重写。
