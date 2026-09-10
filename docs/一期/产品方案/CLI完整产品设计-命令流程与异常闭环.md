# CLI 完整产品设计草案：命令、流程与异常闭环

版本：独立草案 v1，2026-09-10；状态：待用户审阅和确认。

**本文是一份完整方案草案，尚未获得用户确认，不是已批准的目标规格，不覆盖现行脚手架设计，也不构成修改正式文档或代码的授权。** 它提出具体取舍、完整命令契约、状态转换、失败出口和验收条件供逐项讨论；新增与变化的能力集中列在 §16。下文“目标”“必须”“替换”“待实现”等均表示草案内部的拟议规则，并不表示用户已经同意。不能把下文命令全部当成已可用功能。

本文以[综合评审](./综合设计与场景健壮性评审-2026-09-09.md)为问题输入，以用户已确定的“同目录多资源、一个当前稿、平台管理历史”为约束。与现行 ARCHITECTURE / PHASE / 场景的差异和拟议调整列在 §16，等待用户裁定；现行文档不因本草案被废止或降为历史参考。平台字段限值以[字段级校验对照表](./业务梳理/字段级校验对照表.md)为证据基础；其历史测试勾选不等于本草案已验收。

“完整”的验收定义：本期范围内每个操作都有目标选择、前置条件、成功状态、失败状态和恢复入口；范围外明确拒绝。**不承诺仅凭文档证明现实世界零漏洞**；未验证的平台能力须安全停止，不得靠推测继续写入。

## 0. 修改前影响分析与阅读导航

### 0.1 本次设计影响

| 影响面 | 保留与变化 | 实施时必须同步 |
|---|---|---|
| 全部资源命令 | 统一选择、环境、权限、确认、错误和恢复顺序；不再各命令自行猜目标 | 命令根钩子、公共参数、resolver、领域入口及 CLI 级测试 |
| init / create / bind | 普通多素材直接 create/bind；新增路径不抢占旧未绑定状态 | ARCHITECTURE 03/04/08、创建 Step1、使用 01/02/03/09/10 |
| 本地状态 | 保留身份 + 当前稿；补完整标识与待复核项；采用可识别的 v2 写格式 | ARCHITECTURE 02/05/08、schema、读写器、索引、兼容与恢复测试 |
| 文件和版本 | 唯一工程根、候选占用预检、分析后原子回写、独立更新稿 prepare | ARCHITECTURE 05/06、创建 Step2、更新版本、文件/表单测试 |
| 异常和并发 | 本地事务先恢复；增加一条工程级未决远端操作标记及核验入口 | 锁/事务、平台调用适配、所有远端写入、故障注入 |
| 普通 / 主题 / 插件 | 共用资源管理；仅模板初始化与目录压缩不同 | 三种产物的创建、接入、首次发版、更新和恢复场景 |
| 人工 / AI | 本地清单、可搜索选择、完整 JSON、非交互明确参数 | COMMANDS、帮助、使用手册、TTY / argv / JSON 测试 |
| 平台 | 不要求新建平台接口；不能确认结果的写请求不自动重试 | tools-lib DTO/解包、dev/test 契约与安装包验收 |

本轮仅保留本独立草案及交接中的待审阅记录；此前对脚手架设计入口的修改已撤回，不改业务代码。§16 仅列出方案若获确认后的潜在影响范围。用户确认前，不同步或改写现行专题、场景、使用手册，不开始实现。

### 0.2 从目标找章节

| 想完成什么 | 章节 |
|---|---|
| 明白资源、文件和版本分别由谁管理 | §1–2 |
| 在同目录多资源中选对目标 | §3 |
| 登录、找类型、初始化、创建或绑定 | §4–5 |
| 首版、换文件发新版、继续编辑或重拉草稿 | §6–8 |
| 属性、配置、依赖及策略 | §8–9 |
| 标题、封面、同步、上下架 | §10 |
| 中断、超时、损坏、换机器、恢复 | §11–12 |
| 找全部命令与可组合实例 | §13–14 |
| 判断是否真的覆盖场景、能否发布 | §15–16 |

## 1. 产品边界与不可破坏的规则

1. 一个工程就是本次确定的目录，可以有很多视频、图片、主题目录、插件目录；每个独立资源各有自己的编号状态。**不要求每个文件单独建文件夹，也不把一个文件夹自动打包成一个普通资源。**
2. 常规命令一次只操作一份资源。工程级例外只有 `resource list`、不带选择器的 `resource sync`、`resource recover`；它们不批量发行资源。
3. `N.json` 记录资源身份、标题缓存和下一次上传的默认路径；`N.version.json` 记录唯一当前工作稿。N 不是版本号，不是永久资源标识。
4. 已发行版本和历史文件事实只在平台。确认发版成功后清除当前稿；想基于任一历史版本继续，重新 pull。**不保存历史本地回执、不复制每一版大文件、不增加历史版本绑定文件功能。**
5. `--resource` 决定“哪份资源”；`--artifact` 决定“这次用哪个文件/目录”。两者不可混用，操作中不能因路径或标题已更新而重新选择目标。
6. 每个规范产物路径在同工程只能属于一个身份；目录锚点不能包含另一资源的文件/目录锚点，避免一次打包带入另一资源。资源键为 `(env, resourceId)`，完整标识键为 `(env, resourceName)`；标题允许重复。文件内容相同不等于本地路径冲突，平台是否允许同内容发行另按明确响应处理。
7. 初次接入或修改锚点时必须存在且形态合法；之后素材被删除不使身份自动失效。查看、管理、pull 不要求素材存在，上传才要求。
8. 无线上版本只能 `create-version` 发 `1.0.0`；有版本只能 `update-version` 发更大的号。已发版只允许改描述；改内容、属性、配置或依赖必须发新号。
9. 主题/插件是正常资源：模板只介入初始化，目录压缩只介入上传准备。显式文件（含 zip）直接上传，不再套一层压缩。
10. 参数错误、歧义、阶段确认前取消、可预先判定的缺失/冲突，不能造成该阶段业务状态变化或线上写入。已经确认并完成的准备阶段不会因随后取消发行而回滚；已确认 reset、外部上传/签约和结果未知按 §11 单独说明。
11. 所有本地变更使用共同锁、原子文件写入、多文件事务；任何平台写入前都核对目标环境、账号、主体、owner、冻结和操作权限。CLI 检查不替代平台鉴权。
12. 不做合集、RSS、批量发行、支付、上抛、授权排除、合约管理、session/studio、自动构建、自动安装项目依赖。遇到范围外能力明确提示平台侧处理，不静默删字段伪装支持。

## 2. 状态模型与生命周期

### 2.1 主数据与辅助文件

| 对象 | 内容 | 生命周期 |
|---|---|---|
| `.freelog/N.json` | `schemaVersion:2`、`subject:resource`、`typeCode`、`filePath`；绑定后加 `resourceId`、短 `name`、完整 `resourceName`、`title`、非 prod 的 `env` | 直到用户明确换绑/移除；不存 latest、策略、上架状态 |
| `.freelog/N.version.json` | `schemaVersion:2`、`draftKind`、身份快照、`fromVersion`、文件分析引用、表单、`reviewItems` | 当前稿；发布确认成功或明确 discard 后删除 |
| `.freelog/index.json` | 规范路径 → N，派生加速索引 | 可删除、可从主本重建；不能决定资源身份 |
| `.freelog/auth` | 账号/环境元数据和系统凭据库引用 | 不含密码、token、Cookie；不纳入资源恢复删除范围 |
| `.freelog/.lock` / `.txn.json` | 本地互斥和原子状态恢复 | 瞬态，不进 Git |
| `.freelog/.pending-operation.json` | 至多一条未完成的远端变更及本地收尾计划 | 请求发送前落盘，核验和本地收尾完成后清除；不是版本历史 |

素材不进入 `.freelog/`。身份和当前稿可按团队约定纳入 Git，但其中描述/依赖可能敏感；auth、锁、事务、未决标记、临时上传副本必须忽略。不能用 Git 覆盖正在执行的工作区状态。

未绑定身份不写资源 ID、名称、标题或环境；它是本地立项，类型在 create 时按当前环境重新验证。已绑定身份缺 env 表示 prod，**不代表“跟随这次 --env”**。

### 2.2 当前稿的精确含义

```text
schemaVersion: 2
draftKind: initial | update
resourceId, resourceTypeCode       与同编号身份一致
resourceEnv                       必填 prod/test/dev，与同编号身份的有效环境一致
fromVersion                       update 必填，initial 禁止
fileSha1, filename, analyzedSha1   未准备为 null；提交前须对应本次真实上传
description
inputAttrs                        系统附加值，[{ key, value }]
customPropertyDescriptors         自定义 + 可选配置
dependencies                      [{ resourceId, versionRange }]
reviewItems                       待人工解决的旧值/冲突项
baseUpcastResources: []
authExcludedItems: []
```

不把默认路径再复制进工作稿。稿上的 filename/SHA 是上次准备或 pull 的文件引用，`N.json.filePath` 是下次上传输入，两者可暂时不同；查看时必须分别标注，不能宣称“本地文件与线上相同”。

pull 只带回线上表单与来源文件引用，**不是下载或绑定历史文件**，`analyzedSha1` 置 null，提交前重新分析本地输入。系统 raw 属性不写稿；每次需要编辑系统附加值时按当前 SHA/类型取得定义，不信任用户手工伪造的分析标记。

`reviewItems` 每项包含稳定 `reviewId`、种类（附加/自定义/配置）、原因、完整旧条目、可选目标 key 和新约束摘要。它不进入版本 POST。冲突条目从有效表单移入此区但不丢失原值；缺必填的新属性由校验报告指出，不凭空制造旧值。

### 2.3 生命周期转换

| 起点 | 动作 | 终点 | 禁止的自动动作 |
|---|---|---|---|
| 没有身份 | init | 未绑定身份 U | 不建线上壳、不发版 |
| 没有身份 / U | create | 已绑定、无版本 B0 | 不上传、不拉稿、不上架 |
| 没有身份 / U | bind | B0 或已有版本 B+（按线上查询） | 不拉稿、不下载文件 |
| B0，无稿 | create-version --prepare | 首版稿 D0 | 不 POST 版本 |
| B0，无稿 / D0 | create-version | B+，无稿 | 不能变成 update-version |
| B+，无稿 / 有稿 | draft pull | 更新稿 D+ | 有稿不经确认不覆盖 |
| D+ | draft prepare / 表单修改 | D+（可能待复核） | 不分配新版本号、不提交 |
| B+，无稿 / D+ | update-version | B+，无稿 | 不改历史版本；不覆盖来源冲突稿 |
| D0 / D+ | draft discard | 原身份，无稿 | 不删素材、不删线上版本、不解约 |
| 任一绑定身份 | 管理 / 查看 / 同步 | 绑定关系不变 | 不暗中发版或重绑 |
| 合法已绑定身份 | bind 另一资源 + 显式换绑确认 | 同编号新身份，无稿 | 不保留与新身份不符的旧稿 |

B0/B+ 是读取平台得到的事实，不缓存为本地权威状态。目录内容变化、平台另一机器发版等不会自行修改本地稿；下次操作按当前事实校验。

### 2.4 格式兼容与编号

新写入采用 v2，使旧 CLI 明确拒绝而不是误读新增含义。新 CLI 支持读取**完整合法的已知 v1**：内存补出空 `reviewItems`，已知 `orphanedInputAttrs` 无损转为附加待复核项；缺完整标识仍显示短名，绝不猜用户名。

首次修改该状态组时，先打印格式升级提示，以事务保存受影响的 v2 身份/稿；完整标识仅可从 create/bind/当前环境详情补齐。新 create/bind 必须写 resourceName，已知 v1 升级允许暂缺这项展示/匹配元数据，不为离线编辑强制联网。新稿必须保存 resourceEnv；已知 v1 稿按其合法配对身份补有效环境，不声称能够识别人手将整组跨环境篡改的历史。

已知 v1 未绑定身份也可规范升级。未知字段、未知版本、缺必要锚点或身份快照不全，不自动迁移；按 §12 备份并重建。升级不是全目录静默批处理，不在纯读取时改写，不降级写回 v1。旧记录缺完整名称且出现同环境同短名的候选冲突时，先按 ID sync 补齐再判唯一；不能借元数据缺失放过新增冲突。

升级只写本命令本来需要改的文件；允许已知 v1 稿暂时与 v2 身份配对，读取时按共同模型核验。sync 仅升级/更新身份，不为升级重写稿；set 也不借机改稿。确需同时改变身份和稿时才用成组事务。

编号分配为现存最大 N + 1；删除最高编号或重建工程后可以复用。`file:N.json` 只保证当前工程当前地址；长期脚本用 ID。无永久编号注册表。

## 3. 所有命令的共同执行契约

### 3.1 工程与参数

- 工程根：`--cwd` 相对启动目录解析为绝对目录；未给时就是进程当前目录。资源身份只从该根的 `.freelog` 读取，不向父目录寻找资源身份。账号向上查找是另一条规则。
- `init [dir]` 的 dir 相对工程根，最终目标目录才是产物路径基准；不论 `--cwd`、`--resource` 出现在命令前后，都得到相同值。
- 所有产物相对最终工程根解析，绝不先试启动目录同名文件。允许工程内绝对输入并规范成相对路径；拒绝工程外、根本身、`.freelog`、路径逃逸。选择器 `artifact:` 也使用这一规范化。
- 跨平台按真实文件系统身份检查大小写/软链接别名；不得用字符串不同规避占用。软链接解析后逃出工程或指向状态目录则拒绝；目录遍历中的链接也要检查。缺失路径仍可按已记录规范值匹配身份。硬链接视作不同路径输入，可分别接入；不承诺编辑其中一个不会改变另一个，上传仍以稳定副本为准。
- 普通单资源命令不支持通配资源选择、逗号资源列表或任意目录自动扫描发行。短参数重复且取值不同直接报参数冲突，不静默“最后一个胜出”。

### 3.2 公共资源选择器

| 写法 | 精确规则 |
|---|---|
| `--resource id:<ID>` | 匹配 ID；涉及线上按当前 env 匹配，其他环境同 ID 不能替代 |
| `--resource name:<username/name>` | 比较完整标识，绝不能只比较斜杠后段 |
| `--resource name:<短标识>` | 候选中恰好一个才成立；跨账号/环境歧义则提示完整标识或 ID |
| `--resource title:<标题>` | 匹配本地缓存标题；可重复、可过期，唯一才成立 |
| `--resource artifact:<路径>` | 匹配记录的规范默认路径；文件暂时不存在仍可匹配 |
| `--resource file:N.json` | 只允许当前 `.freelog` 的合法编号身份文件；不接受任意 JSON 路径 |

不带前缀的旧兼容输入仅在各匹配方式的结果并集恰好一份时成立；多种解释命中不同资源时报歧义。新帮助只教前缀形式。包含空格的参数整体引用，例如 `--resource 'title:我的 视频'`；JSON 直接输出参数值/argv 数组，不要求脚本解析 shell 示例。

| 候选情况 | TTY，无 --yes / --json | 非 TTY、--yes 或 --json |
|---|---|---|
| 零份 | 单资源动作失败，提示 create/bind；不新建空状态目录 | 同左；给结构化恢复动作 |
| 一份，未给选择器 | 自动选择，不额外问“选哪份” | 同左 |
| 多份，未给选择器 | 可搜索/分页列表，用户选一份或退出 | 非零退出，给完整候选，不选第一份 |
| 显式零匹配 | 失败，显示查询值与候选；旧标题提示 sync | 同左 |
| 显式多匹配 | 失败，列冲突项和精确替代选择器；不再弹选择菜单 | 同左 |

列表至少包含 N、title、完整标识/短名、ID、env、类型、默认路径、文件存在性、稿种类/待复核/损坏信息。跨环境状态在清单可见但远端操作不可误选；没有当前环境候选时明确“有其他环境状态”，不报成“目录完全为空”。

候选范围必须一致：明确只操作本地的命令在全部本地身份中匹配；明确远端单资源命令在当前环境的已绑定身份及未绑定候选中匹配，随后校验绑定门禁。`status` 为本地优先聚合，先在全部身份中选择，再将环境/登录问题显示在线上段。显式 file/artifact 指到异环境记录时报环境错配，不改选其它身份。跨环境出现同 ID 的本地匹配歧义时，可用 file 精确查看，不能默认一份。

选择完成形成固定 `ResourceContext`：工程真实路径、N、身份内容摘要、环境、ID、完整标识、类型、产物。跨交互重新拿锁时比较摘要；有变化报 `TARGET_CHANGED`，让用户重看，不能仅重新读同编号继续。

### 3.3 顺序与门禁

```text
参数语法 → 工程根 → 短锁/可信本地事务恢复 → 读取与分类诊断
→ 资源选择/生命周期路由 → 环境与账号 → 业务及候选状态预检
→ 影响摘要/确认 → 重取锁并复验上下文 → 执行
→ 本地原子收尾 → 输出结果及下一步
```

普通只读/本地编辑不为“选资源”强制登录。实际网络调用前校验当前环境和凭据；已绑定资源必须同环境。远端写入须查询并精确核对 ID、普通资源主体、当前 owner 和操作权限，冻结/平台明确禁改则拒绝；字段缺失或响应不可解析不猜“允许”。

损坏身份、重复身份/路径、孤儿稿、坏事务会阻止普通业务写入，不能靠指定另一份绕过；诊断清单和精确恢复仍可用。只读正常资源可带诊断警告继续，但不能使用无可信快照的事务半状态；未知事务仅允许资源诊断及恢复入口。login/logout 的独立账号流程不依赖资源可解析性，仍可使用，但只操作已核对的账号文件，不修改事务目标。业务待复核稿不是文件损坏，不阻止其它资源工作。

### 3.4 确认与取消

真实变更（本地或远端）统一显示：环境、资源 ID/名称、文件或版本、修改字段、是否放弃旧稿、是否可能签约。TTY 缺必需输入时可逐项问，最后确认；默认否。非交互缺参数失败，真实变更需要 `--yes`。只读、幂等无变更不要求确认。

`--yes` 只代替确认，不代选资源、类型、策略，不补版本号、不忽略冲突。`--json` 禁用问答但不是同意写入。完整流程以独立命令组合为主，不再承诺隐式循环“发版会话菜单”。

上传准备与版本发行是两个可独立完成的阶段：TTY 在上传前确认环境、目标、输入和准备范围；分析后若将真正发版，再展示准确目标版本与最终表单确认。第二次取消保留已准备稿/新默认路径并说明“已准备、未发行”。非交互 --yes 可确认两阶段，但遇复核项/缺字段必须停止；不能把 --yes 当作同意分析后丢弃旧值。

用户主动退出/取消返回 130，输出 `CANCELLED`；真正无变更成功为 0 + `noop`；参数/前置失败为 1；结果未知/本地收尾未完成为 2；批量部分失败为 3。不能把取消、失败和成功混为一类。

### 3.5 JSON 与可恢复错误

所有业务命令在 --json 模式下成功、失败都遵守同一输出包，stdout 只有一个 JSON；进度、预览和警告去 stderr。未给 --json 仍输出面向人的文本。帮助/CLI 自身版本旗标不是业务包，拒绝与 --json 混用并提示去掉该参数；`version show` 等业务版本查询仍正常支持 JSON。

```json
{
  "schemaVersion": 1,
  "command": "status",
  "outcome": "success",
  "target": { "env": "dev", "n": 2, "resourceId": "example-id" },
  "data": {},
  "warnings": [],
  "error": null,
  "nextActions": []
}
```

outcome 为 `success/noop/cancelled/error/unknown/partial`；error 含稳定 `code`、中文 `message`、可脱敏 details；nextActions 是动作说明与精确 argv，不在 code 中解析中文。批量结果在 data.items 逐项标成功、跳过、失败。损坏本地内容仅输出文件与解析问题，不原样泄漏 auth 或凭据。

目标稳定错误族如下；实现可保留已有更细 code，但同一条件跨命令必须同类输出，不能通过文案猜恢复方式。

| 条件 | 错误族 / outcome | 恢复动作 |
|---|---|---|
| 无状态 / 没选多资源 | RESOURCE_REQUIRED / error | create/bind 或列候选选择 |
| 显式无匹配 / 歧义 | RESOURCE_NOT_FOUND / RESOURCE_AMBIGUOUS | list 后换精确选择器 |
| 错环境 / 缺账号 / 无权限 | ENV_MISMATCH / AUTH_REQUIRED / RESOURCE_FORBIDDEN | 明确 env、login、切换 owner 或平台处理 |
| 目标中途变化 | TARGET_CHANGED | 重读摘要，重新确认 |
| 路径无效 / 丢失 / 占用 | ARTIFACT_INVALID / ARTIFACT_MISSING / ARTIFACT_OCCUPIED | 修路径、提供现存产物或另选文件 |
| 初/新版路由错误 | GATE_USE_CREATE / GATE_USE_UPDATE | 选择正确发行命令 |
| 无稿 / 来源冲突 | DRAFT_REQUIRED / DRAFT_SOURCE_CONFLICT | prepare/pull 或明确 reuse-version |
| 待复核 / 表单非法 | DRAFT_REVIEW_REQUIRED / DRAFT_INVALID | list --pending、点名修复后再交 |
| 版本不存在 / 新号冲突 | VERSION_NOT_FOUND / VERSION_CONFLICT | 精确 show、重新选择来源/新号 |
| 文件分析超时 | FILE_ANALYZE_TIMEOUT | 保留原工作，稍后重新 prepare |
| 平台业务拒绝 | PLATFORM_REJECTED / error | 按具体字段/业务原因处理，不伪造成功 |
| 响应不能解释 | PLATFORM_CONTRACT_INVALID | 只读失败；若已经发送变更则 unknown |
| 工程占用 / 状态冲突 | PROJECT_BUSY / LOCAL_STATE_CONFLICT | 等写者结束或 list/recover |
| 远端结果未知 / 成功后本地收尾失败 | OPERATION_PENDING / unknown | recover，不重发、不 bump |
| 逐项失败 | PARTIAL_FAILURE / partial | 查看 items，仅重试可重试项 |

普通业务失败为 exit 1；unknown=2、partial=3、cancelled=130，前述 exit 契约不随错误文案改变。

## 4. 账号、发现与初始化

### 4.1 登录与环境

环境优先级：`--env` → `FREELOG_ENV` → prod；prod 当前不开放平台调用，不能自动落到 dev/test。本地 list、查看稿、诊断不需要平台环境可用。脚本始终显式 env。

`login [--global]`：TTY 输入账号及隐藏密码；非交互用 `--login-name <账号> --password-stdin --yes`。秘密只进系统凭据库；登录超时、失败或凭据库不可用，不落选择器。密码不能出现在参数、日志、设计示例或工程文件里。

从工程向上查最近 `.freelog/auth`，存在即为最终选择器，损坏/环境不符不回退；没有才使用用户级全局选择器。已找到账号与请求 env 不同则提示 logout/login，不自动切账号。owner 不同不阻止本地查看，但线上写操作拒绝。

`logout [--global]` 仅移除明确作用域的账号选择器和确认孤立的凭据，不删资源/稿。没有本工程选择器却继承父级时，不擅自删除父级；显示来源并让用户在该作用域退出。退出本地后若仍有全局可回退，明确提示“仍存在全局账号”，不要声称已完全离线。

### 4.2 资源与类型发现

- `resource list [--resource <selector>]`：纯本地清单，默认全部环境、含未绑定/损坏项；零份成功返回空数组，坏项标注并返回 partial。过滤时仍报告工程级冲突。它不登录、不同步标题、不创建 `.freelog`、不修状态。
- `type list/search [关键词]/info <code>/pick [--type <code>]`：查询当前环境，按现行登录边界需要登录；只选启用、支持普通资源主体的最终叶子。pick 未给 code 在 TTY 提供树/搜索，在非交互列候选但不替 create 选择。
- 搜索使用已取得的类型树按 code、名称、名称链做本地子串匹配；不把关键词当名称链精确条件发送。树缺最终叶子字段时取详情复验，不因简单列表缺字段就静默丢弃全部结果。空结果明确显示 0 条，JSON 为 `items:[]`；平台响应形状不认识应报契约错误，不当空列表。
- `template list` 展示受控模板 ID、主体类型、固定包版本；不要求资源状态。模板选择和策略模板不是一个命令组。

list 若观察到存活写锁或事务，只展示诊断快照并标 `snapshotConsistent:false`，不把中间态作为可靠选择清单；AI 等写者完成或 recover 后重新 list。没有锁也需校验读取前后状态清单/摘要一致，否则有限重读后报 busy，不能静默拼接两个时刻的状态。

### 4.3 通用 init

`init [dir] --type <code> --artifact <path>` 只创建**第一份**未绑定身份。dir 可省略，表示 `--cwd` / 当前目录；artifact 必须明确（TTY 可问），不从唯一文件推测。

已有素材和源码不阻止通用 init。目标没有编号状态时允许已有 `.freelog/auth`，有已有身份则提示直接 create/bind 追加或按 ID 管理，不重复初始化。普通文件必须存在；主题/插件可给存在文件或目录。身份创建允许空构建目录，但发布必须有内容。

普通类型从平台最终叶子验证；主题/插件明确固定类型也需在后续 create 发平台请求前复验类型可用。init 本身不上云创建资源、不产生工作稿。

### 4.4 模板 init

`init theme <dir> --template <id>` / `init widget <dir> --template <id>` 建新工程，固定 RT001/RT002，创建 `dist/` 锚点。目录省略仅 TTY 可问；非交互必须给 dir、template、yes。

模板目标须不存在或完全为空（允许仅有本次登录选择器的受控目标）；不能覆盖已有代码/素材/资源状态。模板下载到外部 staging，检查解包越界、软链接、清单、模板主体和文件冲突，成功后受锁提交；失败保留原目录，仅清本次 staging。CLI 不执行模板脚本、不安装依赖、不构建。

dist 可先为空；提示用户自行构建，首版上传再检查。已有源码/已有 zip 不走模板 init，直接通用 init 或 create/bind。

## 5. 创建、绑定与已有状态冲突

### 5.1 create/bind 专属路由（按顺序判定）

| 条件 | 动作 |
|---|---|
| 显式 --resource | 必须恰好命中；create 只接续 U，不能重建已绑定资源；bind 仅处理指定记录 |
| bind 未给选择器，目标 `(env,id)` 已存在 | 使用该记录幂等接入；给新 artifact 则预检后只改该记录路径，保留稿 |
| 未给选择器，artifact 命中一份未绑定记录 | 接续该份；显式类型不同则拒绝，不自动改类型 |
| 未给选择器，artifact 是新的未占用路径 | 新增 N，即使还有一个或多个 U 也不抢占它们 |
| artifact 命中已绑定的另一个资源 | create 拒绝；bind 拒绝，要求显式目标及换绑选项 |
| 没 artifact，恰好一个 U | 沿用该份路径和类型，重新检查存在性 |
| 没 artifact，零个 / 多个 U | TTY 选“新增并输入路径 / 接续 U / 退出”；非交互给两条操作指引并停止 |

显式选择不会因 artifact 指向 B 而转操作 B；它表示给选中的 A 换默认文件，若 B 已占用则拒绝。所有身份写入先构造变更后的**完整候选集合**，验证资源键、完整标识、规范路径及别名唯一，再发远端写或落盘；持锁前后都验证。

### 5.2 create

`create --title <标题> --name <短名> [--type <code>] [--artifact <path>] [--resource <selector>]`。

1. 按 §5.1 决定新增/接续，取得真实锚点。无可继承类型时必须提供或选择最终叶子；已有类型不允许本命令替换。
2. 标题 trim 后 1–100 字；短名按平台既有规范化函数处理，最长 60，规范化结果与原输入不同则在预览明确显示；与当前账号组成完整 resourceName。非交互要求明确 name，不从标题猜。
3. 先校验本地候选冲突，再按完整名称查询线上。已存在即停止：本人资源提示 bind；他人/不可用名称提示改名。不把查找超时或权限错误当“不存在”。
4. 确认后保存未决标记，再 POST 建壳；已确定 resourceId 后在同一事务写身份、更新索引、清未决标记。不创建版本稿、不上传。
5. 平台成功而本地失败：输出资源 ID/完整标识与 recover 路径；再次 create 不能自动重建。结果未知见 §11。

### 5.3 bind

`bind <ID或username/name> [--artifact <path>] [--resource <selector>] [--force]`。目标位置参数是**线上资源**，--resource 是**本地状态**，不能互相替代。

可先查详情取得远端类型；任何写入前核对同环境、本人、普通资源主体、类型与合法锚点。支持绑定冻结资源用于只读诊断，但后续受限写操作仍拒绝。bind 不改远端、不要求该资源已经有版本。

| 当前本地记录 | 结果 |
|---|---|
| 不存在 / 未绑定且类型一致 | 写入资源 ID、完整名称、标题、环境和路径；未绑定不应有稿 |
| 已绑定同一资源，路径未变 | noop，保留稿；标题刷新可显式 sync |
| 已绑定同一资源，显式新路径 | 正常路径变更确认；保留稿并提示“稿仍引用旧准备结果” |
| 已绑定另一资源 | 必须显式 --resource、--force；TTY 额外确认旧/新 ID 与丢稿，非交互还须 --yes |
| 目标远端资源已占用另一份本地状态 | 拒绝重复绑定；--force 也不能覆盖另一份记录 |

换绑新类型可以不同，但必须用新类型重新验证锚点；新身份与删除旧稿、更新索引同一事务。不存在/错误新路径、取消、新资源不合格时旧身份和旧稿完全保留。坏旧 JSON 不借 force 猜修，走 §12。

## 6. 文件路径与上传准备

### 6.1 哪些动作需要文件

“必须有明确的最终产物”不等于每次都必须重新输入 --artifact。五个入口的完整取值规则如下，不能把已有多资源工程又退回到“每个文件建一个文件夹”：

| 入口 | --artifact 可否省略 | 最终输入来源 |
|---|---|---|
| 通用 init | 非交互不可省略；TTY 可询问 | 用户明确指定；模板 init 另有固定 dist |
| create | 接续已选 U 可省略；新增必须给出/询问 | §5.1 路由后的锚点，不从工程文件数量猜 |
| bind | 同 ID 已绑定或接续 U 可省略；新增必须给出/询问 | 对应已选记录锚点，新类型仍须复验 |
| create-version | 可省略 | 公共选择先选资源，再用该 N.filePath |
| update-version | 可省略 | 同上；显式新 artifact 只改已选资源的上传输入 |

| 动作 | 要求 |
|---|---|
| 通用 init、新增 create/bind、换绑、新路径 version set | 锚点存在、形态正确、工程内且不占用；主题/插件目录可空 |
| create-version、update-version、draft prepare | 当前输入存在、可读、非空；普通资源为文件，主题/插件为文件或至少一个有效文件的目录 |
| status、resource list/sync、version show、draft pull/discard、线上管理 | 不要求素材存在；读取的是身份/稿/平台，不借用旧 SHA 上传 |
| 自定义/配置/描述编辑 | 不要求素材存在；系统附加编辑须有可信当前分析定义；必要时联网 |

目录内只有空目录不算有内容。禁止将工程根、`.freelog`、内部状态文件或包含它们的目录当产物。目录枚举不暗中排除正常构建文件；遇到不支持链接/文件形态显式失败。

`version set --artifact <path>` 仅改默认路径，不上传、不改稿 SHA、不创建稿、不改线上版本。路径改变不转移其它资源的归属。

### 6.2 稳定输入与规模边界

所有大小/类型/上传方式限制先从当前类型能力与平台契约获取。缺少关键能力、当前 SDK 不支持所需上传方式时，提前报 `UPLOAD_CAPABILITY_UNSUPPORTED`，不假装能发任意大视频。不得用随意新增的业务尺寸限制代替平台规则。

上传实现须采用流式读取/哈希与有界缓冲，不整文件两次读入内存。本次上传以受控临时稳定副本（或同等内容一致性保证）为基础：源复制前后校验身份/大小/mtime，目录记录排序清单及各文件变化；变化则拒绝并提示停止构建后重试。SHA、秒传查询、上传和分析必须基于同一字节序列；平台返回的文件引用须核对该 SHA。

主题/插件目录从稳定输入生成临时 zip，只打一次；显式 zip/其他文件不压。打包使用固定条目排序和确定性元数据规则，使未变构建结果不会仅因临时文件时间而改变包内容。临时存储空间不足、不可读、打包失败、网络失败、取消均清理本次临时物，不删除源码/产物。发布 filename 使用来源文件名或构建目录逻辑名（如 `dist.zip`），不使用随机临时路径名称。

本地锁等待默认 5 秒；普通元数据请求默认 15 秒，分析总时限 120 秒；上传无进度超时 60 秒、总时限默认 30 分钟。超时配置属于实现配置，不能无上限等待；只读 GET 可有限重试，非幂等写请求禁止通用自动重试。大型目录/视频须经 §15 压测验证后才能宣称支持。

### 6.3 准备与回写的统一时机

预检 → 确认准备动作 → 稳定文件 → 上传/秒传 → 分析及属性定义 → 合并兼容值/生成待复核项 → 原子保存稿与新默认路径。

| 阶段结果 | 默认路径 | 当前稿 |
|---|---|---|
| 参数/路径/占用/源版本等预检失败 | 不变 | 不变 |
| 普通准备上传或分析失败 | 不变 | 旧稿保留；原本无稿则仍无稿 |
| 分析完成但有待复核字段 | 原子更新为新路径 | 保存完整新分析稿和旧值复核项；不提交 |
| 分析和校验通过 | 原子更新为新路径 | 可编辑/提交的新稿 |
| 后续平台提交明确失败 | 保留新路径 | 保留新稿 |
| 平台确认成功且本地收尾成功 | 保留新路径 | 删除 |
| 平台结果未知 / 本地收尾失败 | 保留已确定状态 | 不猜删稿，保留未决记录 |

准备命令产生待复核项时返回 success，但 data 明确 `readyToSubmit:false` 和 nextActions；提交命令遇同情况返回失败且不 POST 版本。已确认 reset 对旧稿的处理是 §7.4 的例外，必须显示已放弃内容。

## 7. 首版、更新版与草稿命令

### 7.1 首次发行

`create-version --prepare`：必须已绑定且平台无 latest。已有 initial 稿则保留表单、重新准备；已有 update 稿不兼容，必须先处理或明确 reset。该动作可上传文件，但绝不 POST 版本。

`create-version`：TTY 确认、非交互 --yes。无稿从空首版稿在内存准备，有稿沿用；始终从当前磁盘重新准备，不信任旧 SHA。准备后完整表单/依赖校验，再查询平台确认仍无版本，固定提交 1.0.0。禁止 --version、--bump、--reuse-version。平台已有版提示 update-version，不自动改命令。

首版说明本期沿既有规则为空；需要修改已发首版说明可用 `version description --version 1.0.0`。不借首版稿描述入口改变现有产品边界。

### 7.2 拉取、查看和独立准备

- `version show` 查线上 latest；无版本失败并提示 create-version。`--version <号>` 精确 GET，返回必须含该资源和该版本事实；不存在/不可见明确失败。不能以空对象成功退出。
- `version show --local` 只看当前稿；无稿失败。与 --version 互斥。显示来源、SHA、默认输入、待复核项和是否仍需分析，不宣称在线事实。
- `version draft pull [--version <号>]`：必须平台已有该版本；默认查询当时 latest。先完整取得并校验来源，显示将替换的旧稿摘要，确认后一次原子替换。来源不存在/响应错误/取消时旧稿不变；不改 N.filePath，不上传、不签约、不要求本地原文件存在。
- 回显保留支持的自定义/配置/依赖/更新描述；上抛和排除不带入，若来源非空必须预览“新稿不继承这些声明”，明确确认后再建立空数组，不能在用户不知情时移除。其它未知业务字段不能静默丢弃，应拒绝并指向平台侧操作。
- **新增** `version draft prepare [--artifact <path>]`：仅已有 update 稿可用；按 §6 上传分析并保存，不产生目标版本号，不发版。无稿提示 pull；initial 稿提示 create-version --prepare。不新增 update-version --prepare。
- `version draft description --description <text>`：仅 update 稿，改本地描述，可显式空值清除；不调用线上版本 PUT。
- `version draft discard`：精确删除选中当前稿；有稿先预览确认，无稿 noop。损坏稿的安全 discard 例外见 §12。

### 7.3 更新版本

`update-version (--version <新号> | --bump patch|minor|major) [--reuse-version <源号>] [--artifact <path>]`。

1. 必须已有线上版本。新号按 semver 校验，严格大于读取到的 latest；--version 与 --bump 二选一，TTY 可询问缺项，非交互必须给齐。
2. 回显源默认是本次读取的 latest，也可显式 reuse-version。无稿时先在内存取得该源；已有稿须为 update 且 fromVersion 与本次认可的源一致。冲突时两种模式都不自动覆盖，提示显式 reuse-version 或先 pull。
3. 同一命令在第一次确认时把源号和目标号固定。不能在 POST 前发现 latest 变化后偷偷再 bump。再次核验目标号仍大于最新值且默认来源未改变；否则保留稿报并发冲突，用户重新选择。显式旧源允许继续，但目标仍须大于最新。
4. 从本地输入重新准备，保留兼容表单；发现必填/复核问题先停，用户用 prepare/表单命令解决。无稿单步更新失败时，准备成功则保留新稿便于继续，准备未成功则不写空稿。
5. 完整校验及确认完成后，以固定 resourceId、目标号和请求体提交；成功清稿，失败/未知见 §11。复用旧源只复制表单，不复用旧文件代替本次真实上传。

### 7.4 reset 的有损边界

create-version / update-version 的 --reset 不是忽略错误的 --force。确认丢稿前必须完成：路由、目标身份/环境、owner/冻结、文件范围/形态/可读性/非空/大小/占用、源版本存在、新版本号、已知类型能力等可确定校验。

有旧稿时显示全部丢失摘要，默认否。确认后明确放弃旧稿，以空首版或已取得的更新源建立合法基线稿；后续上传/网络失败保留这个新基线或新准备稿，**不承诺恢复旧稿**。错误必须显示 `oldDraftDiscarded:true`，不能仅说“失败，稿已保留”让用户误认为是旧稿。

reset 不跳过未决远端操作，不恢复坏事务，不改身份类型。用户只想重拉表单应使用 pull，不要求为了恢复而提交新版本。

## 8. 表单、附加属性与依赖

### 8.1 共用表单门禁

所有修改都有现存合法工作稿；无稿时查已知生命周期并提示“首版 prepare / 已发版 pull”，**不由 attr/option/dep 偷建 initial 稿**。只读 list 无稿也给明确无稿错误。

每次写入校验本次编辑涉及的结构和约束；允许其它已标注 reviewItems 暂存。自定义/描述/删除声明等纯本地编辑可以离线进行，只验证当时可知的结构和表单约束，显示“待在线全量校验”，不得标为可发行。新增/修改可选配置、系统附加和依赖需要相应在线类型/分析/业务事实，离线则明确停止；只读 pending 和本地 list 不因此联网。

提交前对全稿重验结构、业务限值、类型能力、系统字段冲突及依赖，不因“由 CLI 写过”或“schema 能 parse”跳过。未知可编辑字段不原样透传平台。owner/冻结影响平台写权限，不影响用户离线整理或放弃自己的本地稿；线上准备/签约/提交仍必须通过当前权限门禁。这明确替换旧场景 S33/S55 中“连离线稿编辑也一律禁止”的扩大解释。

| 项 | 规则 |
|---|---|
| 自定义 | readonlyText，最多 30；name 非空 ≤50，remark ≤50，value 可空 ≤140 |
| key | `^[A-Za-z][A-Za-z0-9_]{0,29}$`，写后不可改；换 key 先删后加 |
| 名称 / key 唯一 | 在系统 raw、系统附加、自定义、可选配置的联合命名空间检查；冲突不静默覆盖 |
| 可选配置 | 当前类型 supportOptionalConfig 必须等于 2；最多 30；名称/key/说明规则同上 |
| 文本配置 | editableText，默认值可空 ≤140，candidateItems 为空 |
| 下拉配置 | select，1–30 个非空不重复选项，每项 ≤140；默认固定首项，不另给 default |
| 描述 | 使用平台已确认的版本描述契约；不凭空套用资源简介 200 字限值，平台不支持的值报明字段 |

CLI 字数统一按 Unicode code point 计数（与字节数、UTF-16 长度、视觉字形簇不同）；trim 不改变值字段中有意保留的空格，标题/名称等标识性字段按各自规则 trim。实现集中常量并用中英文、emoji 边界验证；平台若有更严格实际限制，提交明确报对应字段并留稿，待核验后同步字段准绳，不能截断用户内容。

### 8.2 编辑命令与三值语义

`version attr add [一行式]`、`set [一行式]`、`rm <key>`、`list`。一行式整体为一个 argv，例如 `"名称=作者 键=author 值=张三"`；字段未出现不改，显式 `值=` 清空，未知/重复字段拒绝。

目标一行式语法：字段名只能来自该命令白名单，字段之间以空白分隔；不含空白的简单值可裸写，含空格、引号、等号、字段样式或换行的值使用 JSON 双引号字符串（支持 JSON 转义）。例如整个 argv 为 `'名称="作品作者" 键=author 值="张三 李四"'`。可选配置的简单选项仍支持 `选项=中文|English`；含竖线或特殊字符使用 JSON 字符串数组 `选项=["a|b","c"]`，不能用模糊拆分猜值。add/set 各自完整列出白名单、必须字段与互斥字段，解析失败零写入。Shell 如何传单个 argv 与一行式内部解析分开测试，至少覆盖 zsh/bash 和 PowerShell。

attr set 对系统附加只允许改 value，不能改 key/name；系统 raw 只读不可删除。option add/set/rm/list 只处理可选配置；改方式时提交新方式必需字段、清除旧方式专属字段；删掉原第一项后新第一项成为默认。

待复核统一扩展现有属性入口，避免再建第二套编辑系统：

| 目标命令 | 语义 |
|---|---|
| `version attr list --pending` | 显示所有 reviewItems，含配置/自定义的来源类型和完整旧值 |
| `version attr set "键=<key> 值=<新值>" --review <reviewId>` | 仅用于仍存在且可编辑的系统附加项；按新定义校验后写有效值并移除该复核项 |
| `version attr rm --review <reviewId>` | 明确放弃这一旧值，不删除系统定义；与位置参数 key 互斥 |
| 普通 attr/option add、set、rm | 修复仍在有效表单的冲突；若旧项已转待复核，先明确 discard review，再按正常命令重建 |

不提供“一键丢掉全部待复核值”。--yes 只确认点名项；不存在 reviewId 失败，不删除相同 key 的另一个对象。

### 8.3 换文件后的附加值兼容

取 `insertMode=2` 的定义并按 key 查询 valueConfig。raw 只显示。date/dataTime 校验有效日期与平台区间；text/textArea 校验长度；integer/decimal 校验范围和精度；configEnum 必须落入 allowedElements；nullable 才允许空值。未知 format 或缺 valueConfig 只读，不能猜文本编辑。

同 key 且旧值仍符合新约束则保留；key 消失、格式改变无法证明兼容、枚举删值、范围收窄、与新系统字段冲突等转入 reviewItems。自定义/配置与系统项撞名/撞 key、类型已不支持配置时同样保留旧条目待用户决定，**不按旧文档静默丢弃**。

处理待复核项必须允许进入编辑器；不能“有 orphan 就禁止全部编辑”形成死循环。待复核清空后仍需检查新必填项、完整字段及真实分析 SHA，才能提交。

### 8.4 依赖操作

`version dep add <ID或username/name> [--range <范围>] [--policy-id <id>]`；`range <ID> --range <范围> [--policy-id <id>]`；`rm <ID>`；`list`。这里的位置参数指依赖，--resource 始终指**正在编辑的本资源**。

新增流程：定位对方 → 排除自身/非普通资源/无版本/冻结/下架/基础上抛 → 取完整已发版本集合 → semver 范围可解析且命中 → 以本资源 ID 检查“已有 + 候选”完整依赖树循环 → 查询授权 → 必要时明确选择策略签约 → 原子写稿。

新增默认范围可明确采用 `^latest`；显式空值不等于省略。已有相同依赖不重复添加，提示使用 range；range 重跑可用性、范围、循环及授权检查。rm 仅删除声明，不解约、不退款。平台版本分页须完整取完，不能因只读第一页误判范围无匹配。

授权规则不变：只看 batchAuth 的 isAuth；true 不签；false 才列对方全部启用策略（不按免费/付费过滤）。非交互必须显式 policy-id；TTY 即使一条也须选择/确认，签约前展示对方、范围、策略和可能的付费义务。授权查询网络失败/不可解析不等于 false，停止而不是直接签。

batchSign 使用本资源作为 licensee、对方作为 subject，每个 subject 带 subjectType=1。明确签约成功后直接写稿，不按 authStatus 或再次 isAuth 阻断；付费义务在平台侧处理，CLI 不支付。签约成功但落稿失败/结果未知由 §11 核验，不盲目再签。

pull 不签约、不以授权未完成删树。提交前重新检查对方存在/可用/无基础上抛、范围可解析且能命中、非自身、无循环；不查询授权完成度作为提交门禁，不自动补签，不自动删除失效依赖。手工稿和回显稿同样检查。上抛/排除数组非空视为不支持，不能提交时悄悄吞掉。

## 9. 资源自身策略

策略属于线上资源，不进当前版本稿；发版与上架不是一回事。

- `policy list` 看本资源策略及启停，无策略成功显示空态。
- `policy template list [--page N --page-size N]` 按本资源类型取全部适用模板，再本地分页（默认 20，page-size 1–100）。非空响应但字段不认识报平台契约错误，不能把全部解析丢失当“共 0 条”。真空结果提示从文件添加或到平台管理。
- `policy template apply [templateId] [--name <名>]`：TTY 选择任意适用模板；非交互必须 id、yes；name 未给可明确使用模板名。模板不适用/不存在拒绝，不能选列表第一条替代。
- `policy apply --from-file <path> [--name <名>]`：读取工程根相对路径（允许显式外部策略输入但只读，不作为资源锚点），按扩展名解析文本或 JSON。JSON 字段白名单为 policyName/policyText；CLI name 优先，文本无名字时须输入 name。策略语义由平台校验，不擅自把 JSON 对象串当策略文本。
- `policy set --id <ID> --on|--off`：二选一、必须属于当前资源；当前状态已一致为 noop。上架资源不允许关闭最后一条启用策略，先 offline。

策略名 trim 后 1–30 字，文本非空；相同名字或相同规范文本不重复添加。新增默认启用，修改只改本次目标，不全量覆盖未知新策略；写前重读并保留其它策略。模板中的交易事件可以保留，但操作只添加策略、不支付、不上架。

追加结果未知时按名称/文本摘要查询，只有精确唯一匹配才认定已应用；无法排除并发或重复时转人工核验，不能重试追加。

## 10. 资源管理、同步与上下架

### 10.1 status

status 是**单资源**聚合查看，不列整个工作区。显示身份/默认路径存在性、当前稿、待复核、未决操作、平台标题/版本/策略/上架状态及各段来源。

未绑定身份成功显示“未建壳，线上未查询”；已绑定但缺登录/环境不符/网络失败保留可读本地段，返回 partial 并明确线上未获取，不能把缓存说成当前平台事实。无版本是资源的一种正常状态，status 成功；而显式 version show 期待版本，按 §7.2 失败。

### 10.2 listing 与已发版描述

`update [--title <值>] [--intro <值>] [--tags <列表>] [--cover <文件>]` 只改 listing。TTY 无字段时询问待改字段；非交互无字段失败，不发空 PUT。有参数但值都相同返回 noop。

| 字段 | 省略 | 显式值 | 显式空值 |
|---|---|---|---|
| title | 不改 | trim 后 1–100 字 | 拒绝 |
| intro | 不改 | trim 后 ≤200 字 | 清为 `""` |
| tags | 不改 | 完整替换，最多20项，每项非空且≤20字；`a,,b`拒绝 | 清为 `[]` |
| cover | 不改 | 存在的 JPG/PNG/静态 GIF，≤5 MiB；建议≥800px但非硬门禁 | 本期不支持清空，明确拒绝 |

封面按文件内容和尺寸/动画帧验证，不只看后缀；用户确认后上传图片取得 URL，再 PUT coverImages；不能直接把本地路径发给平台。不传 status。远端成功后在同一固定身份上下文回写 title；其它 listing 不本地缓存。失败、超时和回写失败按 §11。

`version description [--version <已发号>] --description <文本>` 精确修改线上已发版本说明；省略号时先解析并固定当时 latest，预览后 PUT。显式空值允许清除。无版本、指定不存在、缺 description 拒绝；不更新本地稿、不发新号。

### 10.3 标题与完整标识同步

`resource sync` 不带选择器时按资源 ID 同步当前环境所有已绑定身份；未绑定和其它环境逐项标 skipped。`--resource` 定向时严格走公共选择，显式歧义仍失败。

同步 title 及可信 resourceName，不改 resourceId、类型、环境、默认路径或稿；远端 ID/类型与本地不符报错，不借 sync 自动换绑。已删除/不可访问资源保留原记录并标失败，绝不删身份。

默认至多 4 个并发 GET、单请求 15 秒、每项独立结果；成功项可提交，失败项保留，整批返回 partial。取得详情后持锁重验每份身份摘要再事务回写，选中身份被替换则该项失败。候选状态唯一性失败则不提交该批候选，不能制造新冲突。无目标为 noop。

旧标题匹配失败时用 ID、完整标识、artifact 或 file 选择并 sync；不先联网模糊猜标题。旧 v1 缺 resourceName 时提示用 ID 同步，完整 name 错前缀不能降级匹配短名。

### 10.4 预检、上架、下架

`validate --for online` 只读查询：本人/主体正确/未冻结/有已发版本/至少一条启用策略；返回分项检查和明确下一步，失败非零。不自动发版、加策略或上架。

`online` 重新做相同门禁后确认并 PUT status=1；已经上架且状态有效为 noop。`offline` 确认后 PUT status=4，已下架 noop。均不删除版本/文件/策略/稿，不因本地素材缺失拒绝线上管理。冻结/未知状态以平台允许能力为准，无法确认则停止，不用 offline 强解冻。

## 11. 并发、远端结果与幂等恢复

### 11.1 本地锁与事务

所有身份/稿/索引/未决标记写入共用工程独占锁，原子创建，包含进程和启动信息。锁存活时短等后报占用；只有证据证明持有者已退出才清残留锁。PID 复用、网络文件系统锁语义不可靠、跨机不能确定时不猜自动解锁。

已有 `.txn.json`：**先恢复，再普通校验和选择**。日志仅允许当前 `.freelog` 内白名单相对文件名：合法 N.json、N.version.json、index.json、.pending-operation.json；不得回写 auth、.lock、.txn.json 自身。禁止绝对路径、重复目标、目录、软链接逃逸，整体校验全部条目的 before/after/checksum 后才回放。可识别的半完成事务前滚；磁盘不等于 before/after、未知版本、旧绝对路径日志不安全则停。移动工程不能回放到原地址。

状态使用同目录临时文件 + flush + 原子 rename，事务日志先于主文件，收尾持久化后才清日志。纯读取不改用户表单，但普通命令启动时完成可信事务是维护例外，需说明恢复了什么；resource list 诊断模式不执行回放。

长问答不一直持锁；确认后重新验证上下文。实际上传、准备、发版、本地收尾一期可持工程锁串行，以正确性优先；用户取消允许清理。另一机器/Console 仍可能并发，客户端重读不等于远端 CAS 保证；存在丢失更新风险而接口不支持条件写时，要明确冲突并人工确认，不能宣称分布式原子。

### 11.2 为什么需要一条未决记录

POST 已成功但响应丢失，与 POST 根本没生效，客户端看到的都可能是超时。只留当前稿无法在重启后知道上次目标号，直接再 bump 可能重复发行。因此本设计选择工程级**单条瞬态未决标记**，不增加每版本文件。

记录含 operationId、操作种类、env、账号 ID、目标 ID/完整标识、N/身份摘要、固定目标号或策略/依赖目标、规范请求摘要、最小必要非秘密请求字段、本地 before/after 摘要、阶段和时间。禁止存 token/密码；请求字段可能含作品信息，文件权限仅当前用户可读，不提交 Git。

| 阶段 | 动作 |
|---|---|
| 预检/确认完成，尚未请求 | 原子写 `prepared`；写失败就不发送 |
| 即将发送 | 持久化 `sending` 后调用；此后崩溃一律视为可能已生效 |
| 收到明确拒绝 | 保留工作稿，清未决标记，报告平台字段；不是所有 HTTP 失败都能证明未生效 |
| 收到明确成功 | 标记 confirmed，持锁执行本地收尾事务，完成后清标记 |
| 超时/断线/未知响应/进程重启 | 保留标记和稿，返回 unknown；不能自动重发或计算下一个号 |

覆盖建壳、发版、listing、已发版描述、策略追加/启停、上下架、依赖签约；上传按内容寻址可重复准备，不作为资源发布成功。未决时阻止工程内新的业务写命令，允许 list/status/show、登录、核验；sync 是写缓存，待核验后执行。保守工程级阻断避免未决记录相互覆盖；不要求建立多操作队列。

### 11.3 新增 resource recover

`resource recover` 默认只诊断当前工程事务/未决标记并执行必要只读核验，不重新发送原请求、不修改素材。没有问题返回 noop。`resource recover --apply --yes`（TTY 可确认）仅应用**已能证明的**恢复计划并收尾本地状态；无 --apply 不落恢复变更。工程级命令不接受 --resource，准确目标来自日志。

| 未决类型 | 核验依据与恢复 |
|---|---|
| 首版/更新版 | 按记录的 env、资源 ID、固定目标号精确 GET，比较文件 SHA/文件名及规范表单；一致则本地清该稿，绝不删除另一个后来改过的稿 |
| 建壳 | 按完整名称查到唯一且 owner/类型/标题匹配的资源，取得 ID；本地候选仍合法才完成接入，不再 POST |
| listing / 描述 / 上下架 / 策略开关 | 查询准确对象/版本并比较本次明确修改字段；目标状态已满足则仅做本地收尾，不再写线上 |
| 新增策略 | 精确名称、规范文本与资源 ID 唯一匹配后认定已完成；多条/不一致转冲突 |
| 依赖签约 | 明确成功响应已持久化可收尾写稿；仅 isAuth=false 不能说明签约失败（可能待执行），仅 true 也不能证明本次策略签约完成；无确证则平台侧人工核验 |
| 本地状态摘要已变化 | 不覆盖新状态、不自动删新稿，保留标记，输出旧目标与当前差异，走人工恢复 |

查到同版本但内容不同为冲突，不是本次成功。一次 404、暂未查到策略、查授权 false，都不是“确定没生效”；保持 unknown，稍后核验或平台侧确认。prepared 且从未进入 sending 的完整标记，可证明未发送，允许 apply 清除并保留稿。

平台无法提供可证明结果时，用户在 Console/平台支持处核实准确操作；CLI 不提供 `--force` 无条件重发/解锁。人工可以按 §12 备份未决标记及相关组，在确认线上事实后手工移除并 bind/pull 重建；提示这是用户承担判断的恢复边界，不能宣称自动幂等。支付、合约管理仍在平台侧，不为恢复增加 CLI 合约列表。

### 11.4 中断的分类

| 中断点 | 必须留下的事实 | 下一步 |
|---|---|---|
| 确认前 | 原状态完全不变 | 修参数或重试 |
| 上传中 / 分析中 | 普通准备保留原稿，临时物清理；可能有可复用远端文件 | 重新 prepare |
| 分析已写新稿，POST 尚未准备 | 新路径/新稿一致 | 编辑或继续提交 |
| sending 之后 | 固定目标 + 未决标记 + 稿 | recover，禁止自动 bump |
| 远端成功，本地事务中断 | confirmed / 可验证目标 + 本地事务 | 先事务恢复再核验收尾 |
| Ctrl-C | 未发送时取消；已可能发送时 unknown | 不把“终端取消”当远端回滚 |

## 12. 损坏、丢文件与人工恢复

### 12.1 损坏不是缺文件

| 状态 | 可做什么 | 修复路径 |
|---|---|---|
| 合法身份，素材缺失 | list/status、线上管理、pull、查看/编辑允许的稿 | 放回原路径或 version set 新文件；准备/发版前检查 |
| 合法稿有 reviewItems | 查看/逐项修正/丢弃 | attr list --pending → set/rm --review → 再校验 |
| 只有索引坏/过期 | 诊断可读，写前从所有合法身份重建 | 不由旧索引覆盖身份 |
| 合法身份的坏稿 | 其它正常组可只读；普通业务写停止 | 精确 `draft discard --resource file:N.json --yes`，见下方例外，再 prepare/pull |
| 坏身份/重复路径/孤儿稿 | 清单逐项显示；不写业务 | 备份并移除精确状态组，按已知 ID bind 重建 |
| 可验证事务半状态 | 普通校验之前恢复 | recover 诊断/应用或普通入口可信自动恢复 |
| 未知/越界/冲突事务、未决结果 | 仅诊断及安全查询 | 不盲删锁/日志；平台核验及手工恢复 |

坏稿 discard 特例：仅显式 file:N.json、该身份合法、无未决/冲突事务时允许；不依赖成功 parse 坏稿，显示文件名、大小、摘要并确认只删除这一稿。其它坏状态不得被顺带删掉。pull 不充当坏稿隐式修复，先明确 discard。

### 12.2 手工恢复的完整步骤

1. 停止对该工程的写进程；先 `resource list --json` / `resource recover` 记录错误、ID、环境、待提交内容。无法取得可信 ID 时从备份或 Console 查，不猜标题对应关系。
2. 将准确的 N.json、N.version.json（存在才备份）复制到工程外自选备份目录；有事务/未决标记一起保全供诊断，但不能在未知日志仍会回放时直接删除业务文件。
3. 只有确认没有未完成事务/远端结果问题，才移除损坏的那一组或用户明确放弃的组；不删素材、不删 auth、不删其它 N。孤儿稿只移除已核对的孤儿文件。
4. 以当前 env 和真实产物执行 bind；已有版本再 pull，未有版本再 prepare。编号可能变化，以 ID 继续，不复用旧脚本 file:N。
5. 原稿可人工参考重新编辑，不能直接复制身份不匹配的旧稿覆盖新稿；平台版本历史不受本地移除影响。

用户明确放弃全部本地资源状态也可重建，但先提示未提交表单与未决核验信息会丢失；默认只处理资源组与派生索引，不扩大成删除整个源码或账号目录。未知操作仍需先核实线上事实。

换机器：复制素材/可信身份和可选当前稿，在新机器重新 login；不复制 auth、锁、txn、未决标记当成可直接运行状态。若旧机器存在未决操作，先在原工程核实；复制目录不能使同一操作安全重发。

## 13. 完整命令覆盖表

以下均为**目标命令面**。R 表示支持公共 --resource 且按零/一/多规则；W 表示真实变更须 §3.4 确认。--cwd/--env/--json 按公共契约，明显不适用的参数应报错，不静默忽略。

| 命令与关键参数 | 作用域/前置 | 本地变化 | 远端动作 | 规则 |
|---|---|---|---|---|
| --help / 任一子命令 --help；-V / --cli-version | 无资源 | 无 | 无 | §3.5，不额外增加顶层 --version |
| login [--global] | 账号 W | 凭据引用 | 登录 | §4.1 |
| logout [--global] | 账号 W | 清明确账号选择 | 无资源写 | §4.1 |
| template list | 无资源 | 无 | 必要时读取模板清单 | §4.2 |
| type list | 无资源、登录 | 无 | 类型树 GET | §4.2 |
| type search [keyword] | 同上 | 无 | 类型树/详情 GET | §4.2 |
| type info <code> | 同上 | 无 | 详情 GET | §4.2 |
| type pick [--type code] | 同上 | 无 | 详情/选择 | §4.2 |
| init [dir] --type code --artifact path | 首份 W | 新 U | 类型只读 | §4.3 |
| init theme <dir> --template id | 新模板工程 W | 模板、dist、U | 下载固定包 | §4.4 |
| init widget <dir> --template id | 同上 W | 同上 | 同上 | §4.4 |
| create --title --name [--type --artifact --resource] | 新增/接续 W | 新/原 N、索引 | 建壳 | §5 |
| bind <远端目标> [--artifact --resource --force] | 新增/接续/换绑 W | N、索引；换绑删稿 | 只读详情 | §5 |
| resource list [--resource] | 工程/显式筛选 | 无 | 无 | §4.2 |
| resource sync [--resource] | 批量/精确 W | 标题/完整标识 | 详情 GET | §10.3 |
| resource recover [--apply] | 工程；apply 为 W | 经证明的恢复收尾 | 仅核验 GET | §11–12 |
| status | R，U 也可看 | 无业务写 | 有绑定才 GET | §10.1 |
| version set --artifact path | R W | 默认路径 | 无 | §6 |
| version show [--version ver] | R，已绑定 | 无 | 版本 GET | §7.2 |
| version show --local | R，有稿 | 无 | 无 | §7.2 |
| version draft pull [--version ver] | R W，有线上版 | 替换更新稿 | 版本 GET | §7.2 |
| version draft prepare [--artifact path] | R W，update 稿 | 稿 + 默认路径 | 上传、分析 | §6–7 |
| version draft discard | R W，有稿；无稿 noop | 删该稿 | 无 | §7/12 |
| version draft description --description text | R W，update 稿 | 改稿描述 | 无 | §7.2 |
| version attr add [line] | R W，有稿 | 加自定义 | 必要定义 GET | §8 |
| version attr set [line] [--review id] | R W，有稿 | 改自定义/附加值 | 必要分析/定义 GET | §8 |
| version attr rm [key] [--review id] | R W，有稿 | 删自定义/点名旧值 | 无 | §8 |
| version attr list [--pending] | R，有稿 | 无 | 默认仅本地；在线系统定义只在编辑/准备取得 | §8 |
| version option add [line] | R W，有稿且类型允许 | 加配置 | 类型 GET | §8 |
| version option set [line] | R W，同上 | 改配置 | 类型 GET | §8 |
| version option rm <key> | R W，有稿；不要求类型仍允许 | 删配置 | 无 | §8 |
| version option list | R，有稿 | 无 | 无 | §8 |
| version dep add <目标> [--range --policy-id] | R W，有稿 | 加声明 | 查询、环检查、可签约 | §8.4 |
| version dep range <ID> --range [--policy-id] | R W，有稿 | 改范围 | 同上 | §8.4 |
| version dep rm <ID> | R W，有稿 | 删声明 | 不解约 | §8.4 |
| version dep list | R，有稿 | 无 | 不自动查合约/签约 | §8.4 |
| create-version [--prepare --artifact --reset] | R W，无线上版 | 准备稿；提交成功删稿 | 准备上传；非 prepare 才发 1.0.0 | §7.1/7.4 |
| update-version (--version ver 或 --bump kind) [--reuse-version --artifact --reset] | R W，有线上版 | 准备稿；成功删稿 | 上传、发固定新号 | §7.3/7.4 |
| version description [--version ver] --description text | R W，有线上版 | 不改稿 | 精确版本描述 PUT | §10.2 |
| update [--title --intro --tags --cover] | R W，已绑定 | 成功回写 title | 封面上传、listing PUT | §10.2 |
| policy list | R，已绑定 | 无 | 详情 GET | §9 |
| policy template list [--page --page-size] | R，已绑定 | 无 | 模板 GET | §9 |
| policy template apply [templateId] [--name] | R W，已绑定 | 无业务缓存 | 追加启用策略 | §9 |
| policy apply --from-file path [--name] | R W，已绑定 | 无业务缓存 | 同上 | §9 |
| policy set --id id (--on 或 --off) | R W，已绑定 | 无业务缓存 | 改策略状态 | §9 |
| validate --for online | R，已绑定 | 无 | 只读预检 | §10.4 |
| online | R W，已绑定 | 无业务缓存 | 状态 PUT | §10.4 |
| offline | R W，已绑定 | 无业务缓存 | 状态 PUT | §10.4 |

远端资源写入均有 §11 瞬态记录，即使表中“无业务缓存”也不代表完全不写辅助日志。`version`、`policy` 等纯分组不带子命令只显示帮助，不自动执行某个业务动作。

## 14. 可组合的完整用户流程

以下是目标设计示例；新增命令未实现前不能直接用于当前包验收。为方便复制，示例均给出 env/工程/资源；`media/` 中素材已存在，账号先用交互 login。资源 ID/模板 ID/策略 ID用实际查询值替换。不会把不同资源的发行串成一个隐式原子批次。

### 14.1 同目录视频与图片分别发行（最基础场景）

```sh
freelog-cli login --cwd ./media --env dev
freelog-cli create --cwd ./media --env dev --type RT006003 --title '旅行视频' --name trip-video --artifact trip.mp4 --yes
freelog-cli create --cwd ./media --env dev --type RT005001 --title '旅行照片' --name trip-photo --artifact photo.png --yes
freelog-cli resource list --cwd ./media --json
freelog-cli create-version --cwd ./media --env dev --resource name:trip-video --yes
freelog-cli create-version --cwd ./media --env dev --resource artifact:photo.png --yes
freelog-cli status --cwd ./media --env dev --resource name:trip-photo
```

两个文件两份 N；不需要 init 两次，不需要拆目录。类型 code 必须经当前环境 info 确认，示例不保证平台永远启用这些 code。同样可混入第三个主题 dist 或插件 zip。

### 14.2 首版先准备，再编辑，再发行与上架

```sh
freelog-cli create-version --prepare --resource name:trip-video --cwd ./media --env dev --yes
freelog-cli version attr add '名称=作者 键=author 值=张三' --resource name:trip-video --cwd ./media --env dev --yes
freelog-cli version show --local --resource name:trip-video --cwd ./media
freelog-cli create-version --resource name:trip-video --cwd ./media --env dev --yes
freelog-cli policy template list --resource name:trip-video --cwd ./media --env dev
freelog-cli policy template apply <模板ID> --name '公开策略' --resource name:trip-video --cwd ./media --env dev --yes
freelog-cli validate --for online --resource name:trip-video --cwd ./media --env dev
freelog-cli online --resource name:trip-video --cwd ./media --env dev --yes
```

版本成功不意味着已上架；模板列表为空可使用 policy apply --from-file，不能自动套一条未知策略。

### 14.3 新版换文件 a → b，先解决字段再发

```sh
freelog-cli version draft pull --resource name:trip-video --cwd ./media --env dev --yes
freelog-cli version draft prepare --artifact trip-v2.mp4 --resource name:trip-video --cwd ./media --env dev --yes
freelog-cli version attr list --pending --resource name:trip-video --cwd ./media --env dev
freelog-cli version draft description --description '补充第二天内容' --resource name:trip-video --cwd ./media --yes
freelog-cli update-version --bump patch --resource name:trip-video --cwd ./media --env dev --yes
```

若有 pending，先按 §8.2 指定 reviewId 修正或放弃；上面的 update-version 会阻断而不会吞掉值。准备成功 N.filePath 已指向 trip-v2.mp4，旧 artifact:trip.mp4 不再匹配，继续用稳定 ID/name。线上旧版仍保留原文件。

### 14.4 基于指定旧版本改稿

```sh
freelog-cli version draft pull --version 1.0.0 --resource name:trip-video --cwd ./media --env dev --yes
freelog-cli version attr set '键=author 值=李四' --resource name:trip-video --cwd ./media --yes
freelog-cli update-version --reuse-version 1.0.0 --bump minor --artifact trip-v3.mp4 --resource name:trip-video --cwd ./media --env dev --yes
```

新号基于当时 latest 计算，源号仍是 1.0.0；不是把线上版本回滚或把旧文件重新下载到本地。

### 14.5 接入平台已有资源、换机器或本地状态已删除

```sh
freelog-cli login --cwd ./media --env dev
freelog-cli bind <资源ID> --artifact local-video.mp4 --cwd ./media --env dev --yes
freelog-cli status --resource id:<资源ID> --cwd ./media --env dev
freelog-cli version draft pull --resource id:<资源ID> --cwd ./media --env dev --yes
```

若尚无线上版本，最后一步替换为 create-version --prepare。bind 不会把 local-video.mp4 认定为某一历史版本的原文件；用户对实际上传内容负责。

### 14.6 主题/插件模板与已有包两条起点

```sh
freelog-cli init theme ./theme-project --template <主题模板ID> --yes
freelog-cli login --cwd ./theme-project --env dev
freelog-cli create --title '我的主题' --name my-theme --cwd ./theme-project --env dev --yes
# 用户在项目中自行安装依赖、构建，得到非空 dist。
freelog-cli create-version --resource name:my-theme --cwd ./theme-project --env dev --yes
```

已有插件包：`create --type RT002 --title '我的插件' --name my-widget --artifact widget.zip --cwd ./media --env dev --yes`，随后按 name:my-widget create-version；不 init 模板、不再次压缩。新版目录改 build 可以 version set，或直接 update-version --artifact build；新目录占用检查与普通文件一致。

### 14.7 其它常见组合

| 用户意图 | 完整路线 |
|---|---|
| 只改网页标题/简介，暂不上架 | status → update --title/--intro → status；不发新号 |
| 网页改名后 CLI 标题过期 | resource list → resource sync（批量或 ID）→ title 选择可用 |
| 标题重名 | list 找 ID/完整 name → 显式操作；不让 CLI 猜哪一个 |
| 只改已发版本说明 | version show --version → version description --version --description → show 读回 |
| 增加依赖 | 有稿 → dep add 目标/范围/策略确认 → dep list → 提交；签约不是支付 |
| 新类型不允许配置 | option add 拒绝；已带旧配置则列待复核 → 明确移除/平台侧处理 |
| 暂停资源 | offline → 需要重新启用时 validate → online；无需本地素材存在 |
| 正在编辑但要放弃 | show --local → discard → 按生命周期 prepare/pull；不必立即发行 |
| 唯一未绑定 A 之外新增 B | create --artifact B → 新 N；A 仍未绑定，可稍后 --resource artifact:A 接续 |
| 已有 N 要换绑另一资源 | bind 新ID --resource 旧ID --artifact 新文件 --force → 明确确认；旧稿同事务删除 |
| 提交超时 | 停止重跑 → recover 只读核验 → 证据明确后 recover --apply → status/show |
| 素材丢失但要继续管理 | status 标 missing → offline/update 仍可用 → set 新素材 → prepare/update-version |
| 无人值守 / AI | list --json 取得 ID/env → 明确 --resource/--env/--yes --json → 按 outcome 分流，unknown 不重试 |

## 15. 场景覆盖与验收证明

### 15.1 完整性检查方法

不是以“场景数多”证明无漏洞。将 §13 每个叶子命令与以下维度组合：零/一/多身份、U/B0/B+、无稿/initial/update/待复核/损坏、五种选择器、TTY/非TTY/yes/JSON、普通文件/主题目录/插件目录/显式 zip、同/异 env/owner、正常/缺失/占用/变更中文路径、执行各中断点。

不合法组合也必须有确定拒绝和下一步。公共机制可参数化测试覆盖，但每个叶子命令至少有真实 CLI argv 执行验证，不能只测选项已注册。平台边界另做真实发布包契约验证，不能以模拟成功证明平台一定接受。

### 15.2 必须执行的主场景矩阵

每条都同时断言：目标资源/文件正确、其它组字节不变、API 方法/URL/ID/次数正确、失败留下什么、恢复后能完成原任务。编号 D 为本文目标验收，不混用历史 S 编号的已通过记录。

| 编号 | 场景 | 预期终点/恢复 | 设计章节 |
|---|---|---|---|
| D01 | 同目录三文件连续 create / bind / 首版 | 三个独立 ID/N，各自正确发版 | §3/5/7 |
| D02 | 未绑定 A，新 artifact B；多个 U 再新增 C | 不抢 A/B，接续可显式定位 | §5.1 |
| D03 | 零/一/多状态运行每类单资源命令 | 零有指引、一静默、多选择或明确失败 | §3.2/13 |
| D04 | 五类选择器、错前缀、标题重复/过期/空格 | 精确唯一，否则候选；ID/sync 恢复 | §3.2/10.3 |
| D05 | 同短名不同账号、同 ID 不同环境 | 不误匹配；完整标识/环境正确 | §2/3 |
| D06 | 第三个目录启动 --cwd，同名素材在两处 | SHA 和上传字节只来自指定工程 | §3.1/6 |
| D07 | A 换到 B 的路径；相对/绝对/软链接别名；目录包含另一资源锚点 | 上传/本地写入前拒绝，全部保留 | §3/5/6 |
| D08 | 原文件删除但查看、pull、下架、set | 管理可用，上传才拦；新文件后可发版 | §6/12 |
| D09 | 通用 init 省 dir / 已有素材 / 已有身份 | 前两者合法，已有身份提示追加 | §4.3 |
| D10 | 模板下载失败/越界/目标非空/已有 auth | 不覆盖源码和账号；成功后 dist 锚点 | §4.4 |
| D11 | 主题目录、插件目录、各自显式 zip 的首版/新版 | 目录只压一次，文件不压；路径正确回写 | §6/7 |
| D12 | 普通目录/空文件/嵌套空目录用于 reset | 确认丢稿前拒绝，旧稿保留 | §6/7.4 |
| D13 | reset 来源不存在/新号无效/用户取消 | 零写入；可正确重试 | §7.4 |
| D14 | reset 已确认后上传失败 | 标明旧稿已放弃，新基线可续 | §7.4/11.4 |
| D15 | 首版分步 prepare/编辑/submit；已有版本再首发 | 前者成功清稿，后者提示更新 | §7.1 |
| D16 | 已发版无稿直接 attr/option/dep 写 | 不制造 initial，先 pull | §8.1 |
| D17 | a→b 分析失败 / 成功后提交失败 | 前者原状态不变；后者默认 b 且稿保留 | §6.3 |
| D18 | 旧源 pull、默认源冲突、reuse-version | 不暗盖稿，明确旧源后新号仍大于 latest | §7.3 |
| D19 | prepare 后本地素材又变 | 提交重新准备，值不兼容则可复核 | §6/8 |
| D20 | 附加 key 消失/枚举收窄/格式变/新必填 | 旧值可看可逐项解决，最终可提交 | §8.3 |
| D21 | 新系统字段撞自定义/配置；类型不再允许配置 | 不静默丢值；复核/移除可达 | §8 |
| D22 | 各字段边界、非法手工稿、重复 key/name | 保存与提交复验；错误定位具体字段 | §8.1 |
| D23 | 可选配置文本/下拉互换、选项去重和首项默认 | 类型允许时全链可走通，已发版不可改 | §8 |
| D24 | 依赖自身/下架/冻结/范围无匹配/真实环 | 签约前拒绝，不留下半条声明 | §8.4 |
| D25 | 已授权、未授权、单/多策略、签约取消 | 不重复签、不自动代选；明确成功才写稿 | §8.4 |
| D26 | 付费签约待执行、pull 有未授权依赖 | 不支付、不因完成度阻发；结果未知另核验 | §8.4/11 |
| D27 | 描述、tags/intro 清空、无参数/noop、封面缺失/动画/超大 | 三值语义准确；封面上传后只发 URL | §10.2 |
| D28 | 模板空数据/响应缺字段/模板不适用/策略重复 | 空态与契约失败区分，可从文件添加 | §9 |
| D29 | 上架无版/无策略；关闭最后策略；重复上下架 | 前置拒绝、先下架或加策略、幂等准确 | §9/10.4 |
| D30 | title PUT 与同 N 换绑并发；sync 多目标部分失败 | 不错写身份；逐项报告，可安全重跑 | §3/10/11 |
| D31 | 进程在本地事务每个写切点退出；有/无选择器重启 | 都先恢复，不再被提前校验阻断 | §11.1 |
| D32 | 日志绝对路径/越界/重复/校验冲突，工程移动 | 任一回放前拒绝，原目录不被触碰 | §11.1/12 |
| D33 | 发布已成功但超时、确认成功后清稿失败 | 固定版本核验，仅清对应稿，不再 bump | §11 |
| D34 | 查询 404/字段不符/同号他人内容 | 不误判未生效/成功，不自动重试 | §11.3 |
| D35 | 建壳/策略追加/签约结果未知 | 有独立核验出口；无确证转平台人工 | §11.3 |
| D36 | 一坏稿 + 两正常组；坏身份/孤儿稿 | 可发现、正常只读、精确恢复不误删 | §12 |
| D37 | v1 合法升级、未知 schema、缺完整名称 | 已知无损；未知保留；名字不猜匹配 | §2.4 |
| D38 | 删最高 N / 全部状态后重绑；换机器 | N 可复用但 ID 稳定；重新登录/发现 | §2.4/12 |
| D39 | 数百/上千素材清单及 sync | 可搜索分页，有界并发与逐项结果 | §4/10 |
| D40 | 大文件、磁盘不足、上传变更/超时/取消 | 有界内存，准确拒绝或同字节提交 | §6/11 |
| D41 | 所有叶子命令参数在不同层级、TTY/JSON | 目标相同，无吞参数、无 stdout 文本污染 | §3/13 |
| D42 | 类型搜索中文/code、简略响应缺字段/平台失败 | 非静默空；正确复验，不误称支持 | §4.2 |
| D43 | 本地/父级/全局账号、损坏/环境错配、logout 回落 | 不偷换账号，退出作用域透明 | §4.1 |
| D44 | 依赖/来源含上抛、合集、未知平台能力 | 明确拒绝或预览不继承，不偷偷改语义 | §1/7/8 |
| D45 | 重复 create、同 ID bind、异 ID force、bind 新路径无效 | 不重复建壳；幂等保留稿；换绑确认后原子替换 | §5 |
| D46 | B0 用 update、B+ 残留 initial 稿、B0 拷入 update 稿 | 明确路由/稿冲突；显式 pull/reset 后可继续 | §7 |
| D47 | TTY 准备后取消发行、yes 遇待复核 | 前者保留新稿但不 POST，后者停止不吞值 | §3.4/6 |
| D48 | 同 ID 跨环境拷稿、v2 resourceEnv 不同、离线编辑冻结资源 | 错稿拒绝；离线可整理，任何远端写仍守门禁 | §2/3/8 |

### 15.3 原有 S1–S68 逐项承接

以下是设计覆盖映射，不是测试通过表。保留原用户目标；相反的旧成功/失败描述明确替换，不能继续作为本文的验收断言。

| 原场景 | 本文命令路线/调整 | 对应验收 |
|---|---|---|
| S1 | 已有素材 → init 可选 → create → create-version | D01、D09、D15 |
| S2 | create-version --prepare → 分次编辑 → 提交 | D15、D19 |
| S3 | 已有壳拒绝重复 create，转 create-version | D45 |
| S4 | bind 已有未发壳 → 首版 | D45、D15 |
| S5 | 首发发现 latest，保留稿转正确流程 | D15、D46 |
| S6 | update 稿不能作首版；明确 reset，不能静默丢来源 | D46、D13 |
| S7 | 无可选表单直接首发；只填真正必需附加字段 | D15、D20 |
| S8 | 多资源首发先公共选择 | D03、D04 |
| S9 | update-version 无稿拉 latest，再真实上传发新号 | D18、D19 |
| S10 | draft pull latest；“文件落本地”指引用，不下载字节 | D18 |
| S11 | draft pull 精确旧号，存在性校验 | D18、D34 |
| S12 | pull 明确覆盖，旧稿确认前不动 | D13、D18 |
| S13 | 明确 reuse-version 保留已有旧底改动 | D18 |
| S14 | 分步表单编辑，线上不随之发行 | D16、D22、D23 |
| S15 | 无线上版本使用 update-version 被拒 | D46 |
| S16 | version description 只改已发号描述 | D27 |
| S17 | --version / --bump 互斥、目标号明确 | D18、D34 |
| S18 | 最新版抢先变化不偷偷加号，保留稿 | D18、D33、D34 |
| S19 | 底不符停止；不用脚本自动重拉覆盖 | D18 |
| S20 | 新号 ≤ latest 拒绝 | D18、D34 |
| S21 | 残留 initial 稿拒绝；显式 pull/reset 后更新，不自动盖 | D46 |
| S22 | 线上 show 不改稿 | D46、D41 |
| S23 | show --local 不联网拉稿、不改来源 | D41 |
| S24 | 远端确认成功才清稿，收尾失败进入 recover | D33 |
| S25 | 换绑删旧稿，同 ID 保留 | D45 |
| S26 | 更新可同时换文件；每次提交都重读真实磁盘，不保留旧“未给文件就不重读”断言 | D17、D19 |
| S27 | 文件丢失拦上传，管理不被误拦 | D08 |
| S28 | --resource 只选目标，默认输入仍读该 N | D03、D06 |
| S29 | attr/option 分次编辑与失效值复核 | D20–D23 |
| S30 | dep add 授权/签约明确选择，提交复核可用性 | D24–D26 |
| S31 | 已发版树不改、不补签；平台侧处理或新稿 | D26、D44 |
| S32 | 依赖变冻结/上抛，点名失败，不自动删 | D24、D44 |
| S33 | 平台写拒绝非 owner/冻结；本地离线整理不作为平台写 | D48 |
| S34 | 合集明确范围外，不走单资源发版 | D44 |
| S35 | 分析总时限 120 秒，保留稿可再 prepare | D40 |
| S36 | 模板初始化不建壳、不自动构建 | D10、D11 |
| S37 | 目录压一次、已有文件不压 | D11 |
| S38 | 无/空 dist 拒绝发版 | D12 |
| S39 | version set build 需目录已存在（可空）；未建目录先由用户创建/构建 | D08、D12 |
| S40 | 显式 zip 原样上传 | D11 |
| S41 | template list → 固定受控模板 init | D10 |
| S42 | 新构建目录重新准备并更新版本 | D11、D19 |
| S43 | 登录和系统凭据库，失败不落假账号 | D43 |
| S44 | 换账号/环境/失效凭据，不偷换来源 | D05、D43 |
| S45 | 先有普通素材，再类型树立项；空工程可查类型但不立无锚点身份 | D09、D42 |
| S46 | 名称/code 搜索或精确 info，不静默空 | D42 |
| S47 | 通用 init 保留已有素材；模板非空拒绝；staging 失败清本次物 | D09、D10 |
| S48 | 中断恢复、换文件和附加值迁移复核 | D19–D21、D31 |
| S49 | 合法 v1 有限读取/确认升级；未知损坏保留；换机不拷秘密 | D36–D38 |
| S50 | bind 已发行资源 → 查看/管理/pull，不重建壳 | D45、D18 |
| S51 | 线上查看不覆盖未交稿 | D41、D46 |
| S52 | update 只改明确 listing，三值/封面处理 | D27 |
| S53 | 全部适用策略均可，不再把付费模板判不支持；CLI 不支付 | D28、D26 |
| S54 | validate → online/offline，幂等且不删资源 | D29 |
| S55 | 远端写受 owner/env/冻结门禁；本地可诊断/整理 | D05、D48 |
| S56 | 已有主题工程直接 create/bind，不能模板覆盖 | D10、D11、D45 |
| S57 | bind 主题/插件未发壳 → 首版 | D11、D45 |
| S58 | bind 已发主题/插件 → pull → 新构建更新 | D11、D18 |
| S59 | 已有普通素材不清目录，可直接 create | D01、D09 |
| S60 | 普通未发壳 bind，不重复建壳 | D45、D15 |
| S61 | 普通单资源命令零状态报指引；resource list 空列表是明确例外 | D03 |
| S62 | 单份自动选择 | D03 |
| S63 | 多份五种选择器或 TTY 选择/退出 | D03、D04、D41 |
| S64 | 标题重名精确区分，真冲突先诊断恢复 | D04、D07、D36 |
| S65 | sync 当前 env 全部/精确、部分失败保留旧值 | D30 |
| S66 | 新路径新增、同路径 U 接续；没有 artifact 才按未绑定数量选择 | D02、D45 |
| S67 | discard/pull/reset 的有损确认和预检 | D12–D14、D47 |
| S68 | 活锁拒绝业务写、可信事务先恢复，未决远端先核验 | D30–D35 |

### 15.4 证据与发布门槛

四层证据分别标记，不互相替代：领域/文件确定性测试；实际 CLI argv + TTY/JSON；dev/test 平台契约（使用专用可变测试资源）；独立安装目标发布包全链。真网写测试需单独授权和隔离数据，不直接运行含创建/签约/上下架的历史脚本。

测试脚本必须断言内容与读回事实，不能只看 exit 0；负例须断言错误码与零副作用，不能任意失败都算通过；无凭据测试隔离账号来源但不打印秘密。报告记录安装包版本、构建标识、环境、脱敏目标、请求路由、SHA、版本号和读回结果。

P0（错目标、错文件、数据破坏、未知结果误重发）必须全部关闭；其余范围内场景须通过或显式禁用并给恢复入口，不能带着未实现的菜单/命令宣称全链可用。验收发现新反例，先补场景与规则，再改实现和回归。

## 16. 目标与现状的差异、专题同步与实施门禁

### 16.1 本设计作出的明确取舍

| 原问题/冲突 | 目标决定 | 状态 |
|---|---|---|
| 无完整总流程 | 本文统一全命令生命周期及错误出口 | 本轮设计完成，不等于实现 |
| 唯一未绑定状态抢占新文件 | 新路径新增；显式选择或同路径才接续 | 待实现 |
| 完整 name 忽略用户名 | 保存可信 resourceName、精确匹配 | 待实现 |
| 知道有资源但无法完整发现 | resource list，本地损坏逐项诊断 | 新增，待实现 |
| 更新稿缺新文件准备入口 | version draft prepare | 新增，待实现 |
| 失效值只阻断无出口 | reviewItems + attr --pending/--review | 新增/调整，待实现 |
| 已知 v1、新字段及旧 CLI 混用 | v2 新写格式，已知合法 v1 有限无损读取/升级 | 待实现；不是任意旧状态迁移 |
| 超时后重启不知道发了哪个版本 | 单条瞬态未决记录 + resource recover；不新增版本历史 | 新增，待实现 |
| JSON 只输出错误 | 全业务命令统一成功/失败/部分/未知结果包 | 协议变更，待实现 |
| 大型发版会话和混乱确认 | 独立命令 + 必要询问 + 最终确认 | 待统一实现/文档 |
| N “永不复用” | 明确当前工程地址语义，不建永久编号库 | 待同步文档/测试 |
| 路径回写时间含糊 | 分析准备完成后，稿与路径原子保存 | 待补事务前预检/失败语义 |
| 回显/系统冲突静默删值 | 保存待复核；不支持字段明确处理或拒绝 | 待实现 |
| 未授权依赖提交拦截与不拦截互相矛盾 | 添加/改范围必要签约；pull/提交不按授权完成度阻断 | 按已确认产品边界统一 |
| 验收记录声称第二资源“必走建壳” | 不采纳无请求证据的根因；实际路由/平台响应分别验收 | 待发布包真网证据 |

### 16.2 待用户确认后可能涉及的专题调整范围

| 专题 | 必须替换/补充的内容 |
|---|---|
| ARCHITECTURE 01/07 | §3/4 的环境、账号作用域、owner 与选择先后 |
| ARCHITECTURE 02/08 | §1–3/11–12 的身份字段、v2、唯一性、编号、清单、事务先后与恢复例外 |
| ARCHITECTURE 03/04 | §4/5 的 init 可省目录、模板不覆盖、create/bind 新增接续与换绑 |
| ARCHITECTURE 05/06 | §6/7 的路径时点、独立 prepare、稳定输入、reset 和成功清稿 |
| 创建 PHASE Step1–4 | §5–10；删除“不写 N.json”“需要会话菜单才能继续”等矛盾承诺 |
| 更新版本 PHASE | §7.3/7.4；源号/目标号固定、旧稿冲突、独立准备及未决阻断 |
| 版本表单三篇 | §8；删静默丢属性、回显强制补签、签完仍未授权就失败等相反规则 |
| 管理 PHASE | §9/10；类型模板全量、空值、封面上传、幂等与恢复 |
| COMMANDS、帮助、使用 README/01–10 | §13/14；标明新命令、选择器、确认/JSON/错误；发布包只提供已实现版本对应手册 |
| 真实场景 S1–S68 与场景实现 01–08 | 保留用户意图，逐条映射 D 场景；补失败出口，不把旧测试勾选沿用为通过 |
| 开发/测试与重构清单 | 记录具体实现批次与证据，避免多处维护相反进度 |

现行专题保持原有地位。本表只是方案影响分析，不代表已批准替换，也不能作为修改这些文件的授权；是否采用本草案及逐项取舍均由用户确认。确认前两者应明确隔离，不能把草案升为优先级更高的正式规则。

### 16.3 实施与复核顺序

1. 正确性底座：共同上下文、工程路径、候选集合唯一性、事务恢复顺序、reset 前置（D01–08、D12–14、D30–32）。
2. 完整生命周期：create/bind、v2 格式、list、draft prepare、复核项与表单全量校验（D09–23、D36–38）。
3. 远端结果：未决标记/recover、发版固定号、资源与策略/签约收尾（D24–35）。
4. 统一产品面：确认/JSON、listing/类型/策略空态、同步与规模（D27–29、D39–44）。
5. 对应专题/场景/手册全部同步后，再做独立安装包验收。已有 134 项测试仅为旧回归基础，不代表 D01–D48 已通过。

只有用户确认方案后，才可按[交接文档](./交接文档.md)进行后续影响复核、正式文档同步与实施安排；本次要求完整设计，不等于批准草案，不授权修改现行脚手架设计、代码或操作平台。

### 16.4 本轮文档复核记录

2026-09-10 已从当前实际命令树枚举 43 个带 action 的公开入口，逐一核对 §13 均有对应契约；额外的 list、draft prepare、recover 等明确为新增目标能力。结构检查确认 S1–S68 每项恰有一条承接、D01–D48 每项恰有一条验收定义，Markdown 表格/代码围栏和相对文件链接检查通过。此记录只证明文档覆盖与结构核查，不证明新规则已经实现或真网通过。
