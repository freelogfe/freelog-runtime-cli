# CLI 功能取舍决策规范

> 对照 [README.md](./README.md) 的 Console 业务梳理。只写**已有** `freelog-cli` 命令，不发明第二套。  
> 最后更新：2026-09-07（单资源部分按新命令面 `create-version`/`update-version`/`version draft pull` 与字段级校验对照表修正；合集部分仍为 09-03 口径，见 §4 注）

图例：✅ 对齐或可脚本化完成　⚠️ 简化 / 路径不同　❌ 不实现，走 Console

---

## 1. 定位

| 维度 | Console | CLI |
|------|---------|-----|
| 用户 | 发行者（含付费、RSS 验证码、微前端签约） | 开发者 / AI / CI（本地工程 + 免费优先） |
| 交互 | 向导、抽屉、微前端 | 命令 + 会话 / 显式旗标 |
| 上架 | 多处 `PUT status:1`（创建 Step4、加策略追问、开关） | **只** `online`；禁止 `update --status` |
| 草稿 | 300ms 自动 `saveVersionsDraft` | 只写本地 `N.version.json`；`version draft pull` / `discard` 显式同步 |
| 合集发版 | `PUT /v2/resources/catalogue/{id}` merge 草稿 | `collection publish`（不是 `createVersion`） |

硬红线：付费签约 / 支付、微前端授权面板、裁剪器、签约列表、收藏/收入/交易、节点展品独立产品。

---

## 2. 总表（按业务梳理编号）

| 编号 | Console | CLI 命令 | 决策 |
|------|---------|----------|------|
| F0 Step1 | 类型+标题+标识+可新建类型 | `create --type --title --name [--type-name]` | ✅ |
| F0 Step2 | 四入口上传 + 属性/依赖 + 写死 1.0.0 | `create-version --prepare`（上传解析备稿）→ `create-version --yes` | ✅ 2026-09-07 更新 |
| F0 Step3 | builder + 可跳过 | `policy template apply` / `policy apply` | ⚠️ 无付费、无执行预览 |
| F0 Step4 | listing + **status:1** | `update` + `online` | ⚠️ 上架必须拆开 |
| F1 | 单次最多 20，超出截断；大小写死 | `resource import-dir` 默认拆多批 | ⚠️ 见下 |
| C0 Step1 | `subjectType=4`，禁新建类型 | `collection create --type --title --name` | ✅；`--type-name` Console 合集没有 |
| C0 Step2 | 勾选我的资源 / RSS，每批 100 | `collection item add` / `rss bind` | ⚠️ 见下 |
| C0 Step3 | 同 F0 Step3 | **`collection policy apply`**，不要用资源 `policy` | ✅ |
| C0 Step4 | listing + collectRules + status:1 | `collection update` + `collect-rules set` + `online` | ⚠️ 上架拆开 |
| M0 | 路由 `:id`、semver、可 inherit | `version draft pull` → 改稿 → `update-version --yes --version/--bump`（`--reuse-version` 认底，`--file` 换文件） | ✅ 2026-09-07 更新 |
| M1 | 已发版只改描述；改属性/配置/依赖开 M0 | `version description` / `version show`；发新号 `update-version` | ✅；不跟 Console 改已发版 value |
| M2 | listing 即存，不上架 | `update` | ✅ |
| M3 | 可上下线；加完可能追问上架 | `policy list/set` + 单独 `online` | ⚠️ CLI 不加完就上架 |
| M4 | 微前端补签，不增删依赖 | 无独立补签命令：`draft pull` → 补签 → `update-version`（不分免费/付费） | ✅ 2026-09-07 更新 |
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
| 版本号 | 写死 `1.0.0` | `FVersionInput`，须 `> latest` | 首版同样写死 `1.0.0`；新号 `update-version --version` / `--bump` |
| 文件 | 四入口 | 同左，可 inherit 上一版 | `create` / `--file`；新号先 `version draft pull` 回显（即 inherit），换文件 `update-version --file`，本地文件不在不准续用 sha1 |
| videoCover | UI 有，**不传** createVersion | 同 | CLI 同样不传 |
| 草稿 | 300ms | 有草稿则跳过 inherit | 只写本地 `N.version.json`；`version draft pull` / `discard` 显式同步 |
| 成功后 | 进 Step3 | 成功页，不进策略 | 策略另走 `policy` |

> 2026-09-07 更新：本表旧版写的是 `version set` + `publish` 旧 CLI 口径，已按新命令面（`create-version` / `update-version` / `version draft pull`）修正。自定义属性 value 上限 CLI 取 **140**（Console 两入口 100/140 不一致，取版本创建页 140；真网验证平台接受）。依赖签约不分免费/付费（付费为待执行态 `authStatus 128`）。

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

高级：`policy apply --from-file`。`policy set --id --on|--off` 对照侧栏开关。（旧文提的 `policy init` / `policy scaffold` 已不在新命令面。）

付费 / TransactionEvent / 支付 Dialog：CLI **不做支付**。`version dep add` 签约时不区分免费/付费——取对方第一条启用策略直接签；付费签完是待执行态（`authStatus 128`），支付留给平台侧收银台/授权处理器。`policy` 命令仍只做免费模板。

### 3.6 依赖

| 时机 | Console | CLI |
|------|---------|-----|
| 发新版时改树 | Step2 / M0 微前端 | 会话菜单 5/6，或 `version dep add` / `rm` / `range` + `update-version` |
| 已发版补签 | M4 `resourceDepAuth`（可付费） | 无独立命令：`version draft pull` → 补签 → `update-version`（不分免费/付费） |
| 看树 | 微前端 | `version show`（已发号） / `version dep list`（工作稿） |

### 3.7 列表 / 详情 / 签约

L1 卡片跳转、空态、批量管理：❌ 无 Console 列表命令。`resource` 搜索是另一条读路径。

L2 详情无编辑入口：不要用详情当 `update`。读用 `version show` / `version show --local`。

M5 授权合约：❌。`GET /v2/contracts` 只在 Console。

---

## 4. 命令速查（已存在，勿新造）

脚手架怎么对 Console：见 [01-脚手架设计前置对照.md](./01-脚手架设计前置对照.md)。`init` 只写本地工程；打平台用 `create` / `collection create`；已有资源用 `bind`。

**单资源（2026-09-07 与 `脚手架设计/COMMANDS.md` 对齐）**：`login` `logout` `init` `template` `type` `bind` `status` `create` `version {show,set,draft,description,attr,option,dep}` `create-version` `update-version` `update` `policy {list,template,apply,set}` `validate` `online` `offline`

**合集**：`collection {create,init-from-folder,item,update,version,policy,properties,publish,collect-rules,rss,logs}`；上架仍用顶层 `online`/`offline`。属性即时保存对照 C1：`collection properties sync`。

**共用旗**：`--env`、`--yes`、`--cwd`、`--json`、`--file`

---

## 5. 验收时对照这份，不要对照旧段落

已作废（见到即当错）：

- 合集五步、扫 `feed.xml`、`collection-create --config ep-order.yaml`
- 批量 `batchService.*`、F1 叫 F2
- CLI 上架用 `update --status 1`
- 合集策略用资源命令 `policy apply`（须 `collection policy`）
- `resource import-dir --type`（正确 flag：`--resource-type`）
- **旧单资源命令面**：`publish`、`version set --version`、`version bump`、`version edit`、顶层 `dep *`、`dep auth` / `dep init-auth-map`、`pull`、`doctor`（正确：`create-version` / `update-version` / `version draft pull` / `version dep add|rm|range|list`）
- 已发版补签用 `dep auth`（正确：`version draft pull` → 补签 → `update-version`）
- 续用旧底用 `publish --reuse-version`（正确：`update-version --reuse-version`）

修订：v2.0 2026-09-03 按源码业务梳理重写。
