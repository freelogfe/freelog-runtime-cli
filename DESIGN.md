# Freelog Runtime CLI 产品设计

## Source of truth

- 状态：Active
- 最后更新：2026-08-11
- 权威性：本文是 Freelog Runtime CLI 的唯一产品设计契约。
- 主要产品表面：终端交互、声明式本地工程、CI/自动化、Freelog 平台 API。
- 已审阅证据：`docs/新方案/`、`packages/cli/src/`、Console 资源页、CLI 单元与场景验证脚本。

本文定义“产品应当是什么”。它不记录某次测试数字，也不以当前代码反向定义产品。

发生冲突时按以下顺序处理：

1. 本文决定产品目标、边界、领域概念和交互原则。
2. `docs/新方案/使用/` 决定用户可见命令、流程、参数与排错（[目录](docs/新方案/使用/README.md) 为操作说明入口；已拆分为多页便于文档站点集成）。
3. `docs/新方案/开发/CLI字段账本.md`决定 manifest/state/API 字段契约。
4. `docs/新方案/开发/CLI脚手架设计.md`解释技术实现（含 citty 参数真源 `packages/cli/src/core/cliArgs.ts`，§4.1）。
5. `docs/新方案/对齐/Console表单字段与交互规则.md`提供字段级有效约束；`docs/新方案/对齐/`其余文档提供流程、源码和平台行为证据。
6. `docs/新方案/验证/`只定义测试入口并记录某个版本、环境下的实现证据。

若 2–5 与本文冲突，先修正文档，不得用“代码已经如此”替代产品决策。

## Brand

- 产品性格：明确、可靠、克制、可预判。
- 信任信号：执行前说明目标环境和副作用；失败说明原因、当前状态和下一步；机器输出稳定。
- 避免：隐藏写操作、模糊成功、静默降级、把 Console 页面结构机械复制成命令。

## Product goals

### 定位

Freelog Runtime CLI 是以本地工程为工作面的 Freelog 资源发行与生命周期工具：

> 本地文件和 manifest 表达发版意图，CLI 将 UI 中的隐性约束显式化，经校验、构建、压缩、上传和平台写入完成可重复发行。

它不是“没有界面的 Console”，也不是一组 API 的薄封装。

### 目标

1. 作者不打开 Console，也能完成本地文件型资源的主要生命周期。
2. 同一工程可被人手操作，也可进入 Git、脚本和 CI。
3. Console 依靠 UI 保证的约束，在 CLI 中都有可发现、可验证、可自动化的表达。
4. 模板、构建产物、目录压缩和批量目录处理成为 CLI 的一等能力。
5. 本地意图与平台事实边界清楚，跨端协作发生冲突时不静默覆盖。

### 非目标

- 不复制 Console 的列表运营、收藏、收入、节点管理和详情预览。
- 不实现必须依赖浏览器的支付、验证码、可视化编辑器和云存储选择器。
- 不承担视频转码、图片裁剪等内容生产能力。
- 不追求命令步骤与 Console 页面步骤一一对应。

### 成功信号

- 新用户能从模板或现有目录完成首次发行，不需要理解平台内部字段。
- 熟练用户可以只修改 manifest，并在非交互环境稳定复现相同结果。
- 所有写操作都有环境保护、预检、明确副作用和稳定错误语义。
- 同一业务规则在人类交互、声明式配置和 CI 模式下保持一致。

### 能力分类与证据维度

能力范围、交互方式和完成证据是三个独立维度，不得压缩成一个 `✅`：

| 维度 | 取值 | 含义 |
|---|---|---|
| 范围 | `CORE` / `ADVANCED` / `OUT` / `NATIVE` | 本地文件发行核心 / 高级平台维护 / 明确排除 / CLI 原生能力 |
| 对齐方式 | `PARITY` / `EQUIVALENT` / `CLI_ONLY` | 同业务语义与状态 / 同结果但交互不同 / Console 无对应物 |
| 证据 | `SPEC` / `CODE` / `ENV` / `CONTRACT` | 设计已定义 / 代码存在 / 目标环境可达 / Console 或 API 契约已核验 |

示例：显式 `draft push` 是 `CORE + EQUIVALENT`；模板是 `NATIVE + CLI_ONLY`；RSS 是 `ADVANCED + PARITY`；付费收银台是 `OUT`。

任何“已支持”声明必须同时说明范围、对齐方式和已有证据，不能用实现存在代替产品完成。

## Personas and jobs

### 主要用户

| 用户 | 主要任务 | 使用环境 |
|---|---|---|
| 内容作者 | 发布图片、音视频、小说等单资源或合集 | 本地终端，偏交互 |
| 前端开发者 | 从模板创建主题、插件、前端库并发布构建产物 | Git 工程，开发终端 |
| 批量运营者 | 将目录中的多个文件批量创建为资源或合集条目 | 本地目录，长任务 |
| CI/发布工程师 | 校验、构建、发版、上架，读取稳定结构化结果 | 非 TTY、自动化 |
| 测试与产品 | 对照 Console 的业务结果、复验门禁和失败路径 | dev/test 环境 |

### 用户任务

- 从模板开始一个可运行的 Freelog 工程。
- 将已有文件或已有工程接入 Freelog。
- 明确即将发布的版本、文件、属性、依赖和策略。
- 在写平台前发现输入、状态、权限和环境问题。
- 发布单资源、批量资源或合集，并能继续维护。
- 看懂本地与平台的差异，安全决定 pull、push 或保留本地意图。

## Information architecture

产品信息架构按用户任务组织，而不是按 Console 页面组织：

```text
环境与身份
  login / logout / config

工程立项
  init / template / bind / workspace

理解当前状态
  status / validate / doctor / diff / pull

准备发行意图
  version / draft / dep / policy / collection item

执行发行
  create / publish / release / resource import-dir / collection publish

维护平台对象
  update / policy / online / offline / collection maintenance
```

### 三种发行模式

| 模式 | 本地模型 | 平台结果 | 主入口 |
|---|---|---|---|
| 单资源 | 一个工程、一份 manifest/state、一个文件或构建目录 | 一个资源及其版本 | `init` → `create` → `publish` |
| 批量独立资源 | 一个输入目录，输出 N 个可独立维护的子工程 | N 个互不隶属的资源 | `resource import-dir` |
| 合集 | 一个合集工程，加 N 个条目引用或子资源 | 一个合集和有序条目 | `init collection` → `collection *` |

三种模式不得因命令相似而混淆。批量独立资源不是合集，合集条目也不是一个大压缩包中的普通文件。

### 工程模式与会话模式

同一套 Freelog 业务规则可通过两种 **本地 Store** 暴露（详见 [CLI双模式设计](docs/新方案/开发/CLI双模式设计.md)）：

| Store | 意图 | 平台事实 | 适用 |
|---|---|---|---|
| **工程模式** | `freelog.manifest.json` | `.freelog/state.json` | Git/CI、可复现、批量子工程 |
| **会话模式** | 当次 flag / 交互 | 内存（+ 可选系统临时目录） | Console 式选资源、选文件、提交 |

会话模式 **不** 降低 owner、授权、frozen、semver 等门禁；它消除的是 manifest/state 长期漂移、env 绑错 state、误提交缓存等 **持久化对齐** 问题。

## Domain model

### 本地对象

| 对象 | 作用 | 是否可提交 Git |
|---|---|---|
| `freelog.manifest.json` | 用户长期意图：发什么、使用什么类型、版本及本地路径 | 是 |
| `.freelog/state.json` | 平台事实缓存：ID、owner、状态、已发布版本、同步指纹 | 否 |
| `.freelog/config.json` | 项目级 CLI 偏好，例如默认环境 | 可选 |
| `.freelogignore` | 扫描、模板和压缩时忽略的本地内容 | 是 |
| `.freelog-auth`（工作区） | 目录树中的身份凭据；自命令 `cwd` 向上解析，供 monorepo 多账号隔离 | 否，必须 gitignore |
| `.freelog-auth`（全局） | 用户主目录下的默认身份凭据 | 否（位于用户目录） |
| 临时产物 | 压缩包、上传缓存、过程文件 | 否，完成或失败后可清理 |

### 不变量

1. manifest 只保存用户意图，平台 ID、owner、SHA1、远端状态和凭据不得进入 manifest。
2. state 只缓存平台事实，不成为用户长期配置入口。
3. `pull` 默认只刷新 state；只有显式操作才能将平台 listing 应用到 manifest。
4. manifest 与平台发生冲突时默认停止，由用户显式选择 pull、push 或 force。
5. 同一个 state 只能属于一个平台环境。
6. 身份凭据不得写入 manifest 或 state；不得提交 Git；工作区凭据与全局凭据的解析规则见下文「身份与凭据」。

### 身份与凭据

CLI 支持 **工作区凭据** 与 **全局凭据** 两层身份，用于 monorepo、多作者同机协作和 CI 默认账号并存。

#### 两层存储

| 层级 | 文件位置 | 典型用途 |
|---|---|---|
| 工作区 | 目录树中某层的 `.freelog-auth` | monorepo 根、业务线根目录绑定团队账号；子目录可覆盖为个人账号 |
| 全局 | 用户主目录 `~/.freelog-auth`（Windows：`%USERPROFILE%\.freelog-auth`） | 机器默认账号；无工作区凭据时的回退 |

凭据内容：`token`、`authorization`、`cookie`、`userId`、`username`、`environment`；**不保存密码**；敏感字段本地加密。

#### 解析顺序（读）

所有需要登录态的命令，以 **命令有效工作目录** 为起点（`--cwd`，否则 `process.cwd()`）：

1. 从该目录开始，**逐级向父目录**查找 `.freelog-auth`，直至文件系统根。
2. **命中第一份**有效凭据 → 作为当前登录态（scope = `workspace`），并记录来源路径。
3. 整条路径均未命中 → 读取全局 `~/.freelog-auth`（scope = `global`）。
4. 仍无有效凭据 → 视为未登录。

规则：

- **就近优先**：子目录的工作区凭据覆盖祖先目录的工作区凭据；不会被「更深层 manifest 所在目录」自动绑定，只认 `.freelog-auth` 文件本身。
- **与项目边界解耦**：是否存在 `freelog.manifest.json` 不影响凭据解析；未 init 的目录也可先 `login` 再 `init`。
- **环境绑定**：凭据内 `environment` 必须与当前 `--env` 一致，否则写操作失败（code 2）。
- **自动化测试** 可通过 `FREELOG_AUTH_PATH_GLOBAL` / `FREELOG_AUTH_PATH_WORKSPACE` 覆盖路径；该机制不对终端用户暴露，不写入使用说明的正文流程。

#### 写入与清除

| 命令 | 行为 |
|---|---|
| `login`（默认） | 在 **当前有效 cwd** 写入 `./.freelog-auth`（工作区凭据） |
| `login --global` / `-g` | 写入用户主目录 `.freelog-auth`（全局凭据） |
| `logout`（默认） | 删除 **当前上下文解析命中的** 那一份凭据（工作区或全局） |
| `logout --global` / `-g` | 仅删除全局凭据；目录树中的工作区凭据保留 |

`logout` 不删除 manifest、state 或 `.freelog/config.json`。

#### 多用户与 owner

- 平台资源 **owner** 缓存于 `.freelog/state.json`；**当前登录** 来自凭据解析。
- 写操作前必须验证 owner：登录 `userId` 与平台 owner 不一致时失败，并同时给出 owner 与 current。
- 交互式 **写命令** 在执行前一行展示：`当前登录: <username>（<env>，工作区凭据|全局凭据）`。
- `status` 只读展示：已登录账号、凭据 scope、资源所属 owner、以及二者是否一致（✅/❌）。

#### 安全与 Git

1. `.freelog-auth` **不得**进入 manifest/state。
2. `init` 与模板生成的 `.gitignore` **必须**包含 `.freelog-auth`。
3. 压缩、扫描、批量导入的 ignore 规则 **强制排除** `.freelog-auth`（不可被用户规则反选）。
4. 工作区凭据可以位于资源工程目录的祖先路径；**是否提交由 gitignore 保证**，CLI 不替用户做版本库决策。

#### 示例（monorepo）

```text
~/work/monorepo/.freelog-auth          ← 团队账号 A
~/work/monorepo/packages/theme-x/      ← 在此 cwd 操作 → 使用 A
~/work/monorepo/packages/theme-y/.freelog-auth  ← 个人账号 B
~/work/monorepo/packages/theme-y/      ← 在此 cwd 操作 → 使用 B（就近覆盖 A）
~/elsewhere/                           ← 无祖先凭据 → 回退全局 ~/.freelog-auth
```

### 字段所有权与可变性

| 对象 | 字段 | 创建后/发布后规则 | 本地归属 |
|---|---|---|---|
| 资源身份 | `name`、`resourceTypeCode`、`resourceTypeName` | 平台资源创建后不可修改；修改需新建资源 | manifest 意图，state 保存平台确认值 |
| 资源展示 | `resourceTitle`、`coverImages`、`intro`、`tags` | 创建后可维护 | manifest 意图；pull 默认不覆盖 |
| 资源状态 | `resourceId`、owner、`status`、`latestVersion` | 平台事实；只能通过专用业务动作变化 | state |
| 版本身份与文件 | `version`、`fileSha1`、`filename` | 版本发布后不可变；变更必须发布新版本 | 发布前为 manifest 意图，发布后事实进入 state |
| 版本可维护信息 | `description`、`inputAttrs`、`customPropertyDescriptors` | 发布后可通过版本维护 API 更新 | manifest 保存期望值，state 保存最近平台事实/同步基线 |
| 版本依赖图 | `dependencies`、`baseUpcastResources`、`authExcludedItems` | 随版本发布固化；修改需要新版本，除非平台契约明确开放维护 API | manifest |
| 视频封面 | `videoCover` | 新版本发布时可声明；已发版维护属于 CLI 增强，须平台契约确认后开放 | manifest |
| 策略定义 | `policyName`、`policyText`、期望启停状态 | 可新增和启停；已存在正文不原地修改 | manifest 保存意图，policyId 与实际状态进 state |
| 合集展示 | manifest `collection.display` ↔ API `catalogueProperty` | 合集发布时写入，可在新一次合集发布中修改 | manifest / 映射层 |
| 合集目录 | 条目、标题、顺序 | 先写目录草稿，合集发布时按 merge 规则合入 | state 保存远端目录草稿和同步指纹 |

字段账本必须按本矩阵展开到具体 schema；不得再用“版本不可变”概括全部版本字段。

### 三类草稿

| 草稿 | 内容 | CLI 动作 | 冲突与发布语义 |
|---|---|---|---|
| 资源版本表单草稿 | 版本号、文件、描述、属性、依赖、继承资源、排除项 | `draft push/pull/discard` | 本地与远端都变化时失败；发布版本后不自动代表远端草稿已删除，按 API 结果处理 |
| 合集版本表单草稿 | 描述、展示设置、属性、依赖、排除项 | `draft push/pull/discard --collection` | 使用独立 fingerprint；不能和资源版本草稿共用同步元数据 |
| 合集目录草稿 | 条目增删、标题、排序 | `collection item add/update/reorder/remove/import-dir` | 每次动作写目录草稿；`collection publish` 仅在目录变化时设置 merge=1 |

`draft push` 只处理“发版表单草稿”，不处理合集目录草稿。`discard` 必须明确目标草稿，不能一次模糊删除多个远端对象。

### 依赖与授权

| 类型 | 数据 | 规则 |
|---|---|---|
| 直接依赖 | `resourceId + versionRange` | versionRange 必须可解析；发布前验证目标存在和授权状态 |
| 基础上抛资源 | `resourceId` | 与直接依赖分开建模，不伪造 versionRange |
| 授权排除项 | `resourceId + excludedType + excludedValue` | 只描述合同/策略排除，不代表已经获得授权 |
| 授权完成状态 | 运行时查询结果 | 是发布硬门禁；不完整时失败并列出未解决依赖，不允许静默继续 |

付费收银台本身属于 `OUT`；CLI 可以使用已存在合同或处理平台允许的免费签约，但不能代替收银台。需要支付、策略不可验证或授权仍未完成时，CLI 必须形成浏览器接力：按当前环境返回资源或合集的 Console 依赖页 `actionUrl`、合约页 `contractsUrl`、稳定 `reason` 和完成网页操作后应重跑的 `nextCommand`。TTY 可展示可点击链接；非 TTY/JSON 模式不得自动打开浏览器。授权完成度必须按 manifest 声明的每个直接依赖逐项核对 Console 授权树；同一依赖存在历史合同时以“至少一份有效合同”为满足条件，缺节点、无合同或只有失效合同都不得视为已授权。

### 版本准备默认值

- 首次发布默认版本为 `1.0.0`。
- 维护期未显式指定版本时，建议值为平台 latestVersion 的 patch + 1；非交互写操作仍需在 manifest 或参数中确认该值，不能静默 bump。
- 没有本地显式值和远端草稿时，新版本可以继承 latestVersion 的文件、描述、属性、直接依赖、基础上抛资源和授权排除项；继承结果必须写入本地意图或在执行计划中完整展示。
- 本地显式值优先于继承值；远端草稿与本地均变化时进入冲突流程，不能自动合并复杂数组。

### 策略模型

- manifest 保存 `policyName`、未编码的 `policyText` 和期望启停状态；`policyId` 与平台实际状态只进入 state。
- URL 编码属于 API 适配层，不能要求用户在 manifest 手工编码。
- 新增策略前检查名称和正文重复；已有策略正文不原地修改，使用新增策略后启停切换。
- 已 online 的资源不得把全部策略停用；CLI 在写平台前执行至少一条启用策略门禁。

### 合集领域模型

1. 合集壳是 subjectType=4 的平台资源；合集本身不等于一个待压缩文件夹。
2. 合集条目可以来自：
   - 本地文件：CLI 先创建并发布子资源，再把它加入目录草稿；
   - 已有平台资源：只要目标资源 online、未被当前合集重复使用且当前用户具备加入所需的授权条件。
3. 单次选择/导入最多 100 个条目；更大输入由 CLI 分批，但最终仍需满足平台合集容量限制。
4. 条目至少包含 `itemId`、`itemTitle`、`sortId`、编号和挂载资源信息；本地 manifest 不复制平台完整条目对象。
5. `collection.display` 定义展示模式、排序方向、标题来源以及是否显示编号、图片和描述；映射到平台 `catalogueProperty`。
6. 目录内容变化通过稳定 fingerprint 判断；未变化发布 merge=0，变化发布 merge=1。

### 高级平台维护

RSS 和 collect-rules 定义为 `ADVANCED + PARITY`。`ADVANCED` 只表示它们不属于“本地文件发行核心链路”的导航分组，不降低对齐标准，也不允许从完整产品验收中豁免。完整产品签字时，两项都必须有独立的 mandatory 场景和目标环境证据。

- RSS 必须覆盖地址预检、重复占用、owner email、15 条单集阈值与日期范围、验证码、换源 GUID 风险确认、绑定、同步进度和失败项；不能把远端导入伪装成本地文件发行。
- RSS 合集由 feed 管理标题、封面、简介、更新状态、目录条目、展示设置、发版表单草稿和版本发布，CLI 必须拒绝这些人工写入；与 Console 一致，仅标签仍可单独维护。
- collect-rules 必须完整表达 `serializeStatus`、启停状态、`conditionType` 和 `filterConditions`；key/operator 组合、必填值、100/60 字长度和 `authIdentity STARTS_WITH` 的 username 前缀都必须与 Console 一致。
- RSS 与 collect-rules 的 Console 源码契约必须进入漂移检查；真实 dev 验收必须分别验证 get/set round-trip，以及 inspect/send-code/bind/status/sync 状态链。验证码只能来自受控测试 RSS 邮箱，不得在仓库保存。

### 生命周期

```text
未初始化
  → 已初始化（只有本地工程）
  → 已创建/已绑定（已有平台资源）
  → 已准备（版本文件、属性、依赖满足要求）
  → 已发布（存在正式版本；文件身份固化，描述和属性仍可维护）
  → 可上架（至少一条启用策略且通过门禁）
  → 已上架
  → 维护（新版本、基础信息、草稿、策略、上下架）
```

命令必须验证当前状态是否允许目标转换，不能依赖用户记住正确顺序。

## Design principles

### 1. 业务语义对齐，交互不复制

Console 是平台业务语义和约束的重要证据，但不是 CLI 信息架构模板。

- 对齐：平台对象、字段含义、状态转换、权限和业务门禁。
- 不对齐：页面步骤、弹窗、拖拽、防抖、按钮布局和微应用形态。
- CLI 增强：模板、构建、压缩、Git、批量目录、dry-run、结构化输出。

当 Console 内部存在冲突路径时，CLI 选择更稳定、更安全的业务语义并明确记录：首次创建向导 Step4 可直接写 `status:1`，但侧栏上架要求正式版本和至少一条启用策略。CLI 统一采用侧栏严格门禁，创建向导的宽松路径不作为 CLI 契约。

### 2. 把 UI 隐性约束变成显式契约

| Console 的约束方式 | CLI 的等价设计 |
|---|---|
| 下拉框限制可选值 | 动态查询类型/枚举并校验；不接受未知值 |
| 必填、长度、格式控件 | 参数解析与 schema 校验，写操作前一次性报告 |
| 分步向导 | 状态机与前置条件，不允许跳过必要业务阶段 |
| 禁用按钮 | 明确失败，给出缺失条件和下一条安全命令 |
| 确认弹窗 | TTY 确认；非交互必须 `--yes` |
| 页面当前账号和环境 | 写操作前展示当前登录与环境；验证 owner；`status` 对照 owner | 
| 300ms 防抖保存 | 显式 `draft push`，绝不静默远端写入 |
| 页面内存中的表单 | manifest 持久化，可审阅、可提交 Git |
| 进度条和逐项结果 | 终端进度；CI 使用 NDJSON 事件流和最终汇总 |
| 支付、验证码、微应用 | 明确说明边界并失败；支付/签约返回环境感知的 Console 接力链接，不伪造成功 |

### 3. 一套业务规则，三种交互模式

| 模式 | 适用情况 | 输入 | 输出 |
|---|---|---|---|
| 交互模式 | 初次使用、缺少参数 | 引导式选择和确认 | 人类可读进度与下一步 |
| 声明式模式 | 长期维护工程 | manifest、JSON/YAML | 差异和执行结果 |
| 自动化模式 | CI、批量任务 | 完整参数、文件、环境变量 | 稳定 JSON/NDJSON 和退出码 |

三种模式只能改变输入输出方式，不能改变门禁、安全要求和最终平台语义。

### 4. 默认安全，显式覆盖

- 读操作可以自动执行；写操作必须可识别。
- 环境解析顺序固定为：命令行 `--env` → `FREELOG_ENV` → 项目 `.freelog/config.json.defaultEnv` → production fallback。
- 读操作和交互式命令可以使用 production fallback，但必须显示当前环境。
- 非交互写操作只有在 flag、环境变量或项目配置至少一个明确提供环境时才允许执行；production fallback 不算显式环境。
- 交互式 production 写操作在执行前必须突出显示环境和目标，并二次确认。
- 覆盖远端或本地冲突需要 `--force --yes`，并输出被覆盖对象。
- `dry-run` 必须零持久副作用：不改 manifest/state、不构建、不生成压缩包、不上传、不写平台。
- dry-run 可以读取本地文件、计算单文件 SHA1，并进行只读平台查询；不得通过“自动 pull”回写 state。
- 对依赖构建或压缩后文件才能确定的字段，输出 `unresolved` 及其产生阶段，不伪造最终 SHA1/payload。
- dry-run 输出执行计划、已解析 payload、未决字段、只读查询和正常执行时的预期副作用。

### 5. 失败必须可行动

错误至少包含：稳定 code、发生了什么、为什么、当前关键状态、建议的下一步。不得吞掉平台异常后继续执行，也不得用模糊的“操作失败”代替业务原因。

## CLI-native capabilities

模板和压缩是产品核心能力，不是 Console parity 的附属实现。

### 模板

模板解决“从空目录到可构建工程”的问题：

- 主题和插件：生成 runtime 工程、manifest、运行时版本配置和构建入口。
- 前端库/软件库：生成 package 工程、manifest、namespace/包配置和构建入口。
- 其余资源：只建立 manifest，不强加前端工程。
- 合集：建立合集 manifest，不生成无意义的前端模板。

模板行为约束：

1. `init` 只创建本地工程，不创建平台资源。
2. 模板来源和版本必须可追溯，升级不得静默覆盖用户代码。
3. 模板必须生成可直接执行的最小工程和明确下一步。
4. 已有工程可选择 `scaffold none`，不能被迫套模板；非交互初始化必须同时显式给出 `--artifact-mode file|directory-zip`，不能根据类型展示名猜测。
5. v1 模板在 init 时锁定模板 ID、精确版本、runtime 和兼容矩阵；CLI 不提供原地升级用户代码。模板新版本只影响新建工程，安全修复通过显式迁移说明处理。
6. 模板包缺少自身 manifest 时视为无效，不允许静默合成兼容信息后继续。

### 构建与压缩

发行物分为两类：

| 发行物 | 输入 | 发布前处理 |
|---|---|---|
| 单文件资源 | 本地文件 | 校验类型、大小、存在性和 SHA1，原文件上传 |
| 工程型资源 | 构建产物目录 | 校验目录后生成临时 zip，再计算 SHA1 和上传 |

产品规则：

1. 是否压缩由资源类型能力决定，不能只靠展示名或散落的硬编码。
2. `publish` 消费已准备好的文件或构建目录；`release` 可以编排 validate → build → package → publish → online。
3. 内部统一能力字段为 `artifactMode: file | directory-zip`。平台适配层只读取显式能力字段 `artifactMode/compress/needCompress/isCompress/packageMode/filePackageMode` 并规范化为该字段；随后与 init 写入的模板能力核对。两者均缺失、任一值非法或两者冲突时校验失败，不按中文/英文展示名或类型 code 猜测。
4. 压缩必须遵守 ignore 规则，排除 state、凭据、缓存、源码垃圾和临时文件。
5. ignore v1 采用项目根相对的 POSIX 路径；支持空行、`#` 注释、`*`、`?`、`**` 和目录后缀 `/`；暂不支持 `!` 反选，出现时明确报错。`.freelog/`、auth、VCS 和系统临时文件是不可反选的强制排除项。
6. 相同输入、配置和 CLI 版本必须产生字节级相同的 zip：条目排序、时间戳、权限和路径分隔符均规范化。
7. 压缩包是临时上传产物，不回写为用户长期意图，成功或失败后均可清理。
8. 构建、压缩、上传和平台写入必须分别报告状态，不能合并成一个不可诊断的“发布失败”。

### Build contract

- `init` 可以安装依赖，但不自动构建。
- `publish` 只消费 manifest 指定的既有文件或构建目录，不执行任意构建命令。
- `release --build-cmd` 是显式编排能力：在项目 cwd 中执行用户提供的命令、继承当前环境、流式输出，非零退出立即停止；CLI 不猜测 package manager 或默认脚本。
- 提供 `--build-cmd` 时，build 前校验 manifest、owner、类型和版本等非产物契约，不要求尚未生成的产物；build 后必须再执行完整 publish 产物校验。
- dry-run 不执行 build，只显示命令、cwd、预期产物路径和未决字段。
- `release --bump` 必须先在内存形成计划版本，并用计划版本完成 build 前后校验；校验通过前不得把 bump 写入 manifest。build 完成后必须重新 validate 产物路径，再进入 package/upload 阶段；`release --online` 先按 publish 校验和发布，随后由 online service 执行动态上架门禁。

### 批量目录

- 扫描前展示将处理、忽略和拒绝的文件统计。
- 每个输入项拥有稳定结果：成功、失败、跳过及原因。
- 中断后可依据持久化报告重试失败项，不能只依赖终端滚屏。
- 平台批次限制由 CLI 自动分批，但最终仍按单资源提供结果和后续维护入口。

正式批量报告保存在 `.freelog/reports/<runId>.json`，并包含：schemaVersion、runId、命令、环境、输入目录 fingerprint、配置 fingerprint、开始/结束时间、每项幂等键、阶段、结果、resourceId/versionId、错误和清理状态。`.freelog/reports/latest.json` 只保存最近报告路径。

- 每项幂等键由规范化相对路径、内容 SHA1、资源类型和目标授权名共同确定。
- `--resume <report>` 从最后一个可安全恢复阶段继续；`--retry <report>` 只重新执行失败项。
- 平台成功但本地回写失败必须记录为 `remote_succeeded_local_pending`，重试时先查询并修复本地状态，不能重复创建平台资源。
- 远端写请求已经发出但客户端未能确认响应时记录为 `remote_outcome_unknown`；自动 `resume/retry` 必须停止并要求按授权名、版本和 owner 对账，不能猜测失败后重复创建。
- skip、failed、waived、passed 分开统计；skip 不得计入 passed。

## Interaction architecture

### 业务动作优先于命令名称

产品先定义以下动作，再映射为命令：

- 建立本地工程
- 创建或绑定平台对象
- 编辑长期意图
- 校验当前工程
- 比较本地与平台
- 保存或拉取草稿
- 构建和准备发行物
- 发布版本（版本号和文件身份不可变；描述和属性可维护）
- 管理策略与依赖
- 上下架
- 批量处理与失败重试

命令可以演进，但业务动作、前置条件和副作用必须稳定。

### 副作用等级

| 等级 | 行为 | 示例要求 |
|---|---|---|
| R0 | 纯读取 | 不登录也能完成的本地检查尽量离线运行 |
| L1 | 修改本地意图 | 显示修改文件；可通过 Git 审阅 |
| T2 | 生成临时产物/上传存储 | 显示路径、大小、SHA1；失败可清理 |
| P3 | 修改平台对象 | 环境、owner、目标 ID、动作必须明确 |
| D4 | 覆盖、删除或不可逆动作 | 必须显式确认，非交互要求 `--yes`，冲突时要求 `--force` |

复合命令必须按阶段报告副作用，失败时指出已完成到哪一步以及如何恢复。

### 机器输出协议

`--json` 使用单结果 envelope：

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "publish",
  "data": {},
  "warnings": [],
  "meta": { "env": "dev" }
}
```

失败时使用同一 envelope，将 `data` 替换为 `error: { code, message, hint, details }`。debug 信息只在显式 debug 时出现并完成敏感字段脱敏。

`--json-lines` 的每一行包含 `schemaVersion`、`command`、单调递增 `seq`、`event` 和 `data`；事件至少包括 start、item、warning、done。stdout 只输出协议数据，日志和诊断进入 stderr。新增可选字段保持向后兼容，删除/改义必须提升 schemaVersion。

### 同步与冲突

- 平台事实变化：`pull` 更新 state。
- 用户希望采用平台 listing：显式 `pull --apply-listing`。
- 用户希望把本地表单保存为平台草稿：显式 `draft push`。
- 本地和远端都变化：默认冲突，不按时间戳猜测赢家。
- 强制覆盖前输出差异摘要和覆盖方向。

## Interaction states

- Loading：长任务显示阶段、当前项和总量；JSON 模式发出结构化事件。
- Empty：说明缺少的是本地工程、平台对象、版本、策略还是合集条目。
- Error：稳定错误结构，包含恢复建议；部分成功必须明确列出成功项。
- Success：只在平台响应和必要本地回写完成后报告成功。
- Disabled：CLI 中表现为预检失败，不静默跳过。
- Offline/slow network：区分本地校验失败、网络失败和平台业务拒绝；可安全重试的步骤必须标识。

## Content voice

- 语气：直接、具体、不过度技术化。
- 术语：资源、版本、合集、条目、草稿、策略、依赖、上架；同一概念不得出现多个字段名。
- 提示顺序：结果 → 原因 → 当前状态 → 下一步命令。
- 禁止：乱码或 `????`、模糊的“参数错误”、把内部 API 名直接暴露给普通用户。
- 人类输出可以本地化；JSON key、error code 和事件名必须稳定且使用英文标识。

## Visual language

CLI 不定义网页视觉系统，但终端呈现必须一致：

- 颜色只作增强，关闭颜色后仍能理解。
- 成功、警告、失败不能只靠颜色区分，必须带文本或符号。
- 表格用于小规模摘要；长列表使用逐行输出或 NDJSON。
- 进度输出不得破坏 `--json` / `--json-lines` 的可解析性。

## Components

CLI 的“组件”是可复用交互与契约：

- 环境选择与写保护
- TTY 确认和 `--yes`
- cwd/项目发现
- manifest/state 读取、校验和原子写入
- owner、同步和冲突门禁
- 人类输出、JSON 结果、NDJSON 进度、统一错误
- 文件扫描、ignore、压缩、SHA1 和上传阶段

这些能力必须集中实现，不能由各命令自行拼装不同语义。

## Accessibility

- 键盘/焦点：所有交互完全可用键盘完成，支持取消并保持状态可解释。
- 可读性：不依赖颜色；重要 ID、路径和命令可复制。
- 屏幕阅读器：交互提示顺序稳定，避免持续重绘整屏。
- 感知差异：支持 `NO_COLOR`、非 Unicode 回退和关闭动画/进度 spinner。

## Responsive behavior

CLI 的响应式目标是不同终端宽度和执行环境：

- 窄终端使用逐项布局，不截断关键 ID、路径和错误原因。
- 非 TTY 不显示 spinner、ANSI 控制序列或交互提问。
- Windows、macOS、Linux 的路径、shell 引号和换行行为必须有明确兼容策略。

## Implementation constraints

- Node.js 版本和支持平台由包元数据统一声明。
- manifest/state 必须有 schemaVersion 和可测试的迁移策略。
- 平台类型、字段和能力优先运行时查询；无法查询时明确失败，不静默使用过期常量。
- 所有写服务入口都必须执行环境、owner、同步和业务门禁，不能只依赖命令层。
- JSON/NDJSON 是公共接口，需要版本化和回归测试。
- 凭据不得进入仓库、项目目录、测试脚本或文档；使用环境变量或安全凭据存储。
- 单元、契约、真实环境场景和人工验收必须分层记录，不能用一个动态数字代表全部质量。
- manifest、batch config、batch report 和 JSON/NDJSON envelope 都必须有机器可验证 schema；技术文档只引用 schema，不复制另一份字段定义。

## Verification contract

产品验收分四层，互不替代：

| 层 | 证明什么 | 不证明什么 |
|---|---|---|
| 单元/静态检查 | 纯逻辑、类型、门禁和回归 | 真实平台可达性 |
| 契约测试 | CLI payload 符合已确认的平台/Console 契约 | Console UI 当前完整行为 |
| dev/test 场景 | 指定版本、账号、环境下的真实业务链路 | production、所有类型和长期稳定性 |
| 人工跨端验收 | Console 与 CLI 的业务结果及体验差异 | 自动持续回归 |

运行结果必须记录：commit、CLI 版本、环境、账号角色、场景 ID、通过/失败/跳过、产物和时间。跳过不得计为通过。动态测试数字不得写进产品设计正文。

## Open questions

- [x] `artifactMode` 适配契约已收口：只接受平台显式 capability 或 manifest/template 明示值；展示名 fallback 已删除。平台后续若统一为单一字段，仅缩减 adapter，不改变产品契约。
- [ ] 已发布版本的 `videoCover` 是否属于平台正式可维护字段？负责人：API/Console；影响：`version edit --video-cover` 的分类。
- [ ] 合集最大总条目数是否也是 100，还是仅 Console 单次选择上限为 100？负责人：API/产品；影响：分批和最终门禁。
- [ ] `release --build-cmd` 长期是否改为 argv/脚本名协议以避免 shell 差异？负责人：CLI；影响：跨平台和安全。
- [ ] production 上线前需要哪些账号、资源类型和人工验收矩阵？负责人：QA/产品；影响：发布门禁。
