# Dev 全流程测试计划

最后更新：2026-09-11。
适用范围：一期单资源 CLI 的 dev 环境；普通单文件资源、主题 `RT001`、插件 `RT002`。不覆盖 prod、合集、支付、session、studio 或多文件资源。

本计划是今后每次 dev 验收的唯一入口约定。产品规则仍以 `docs/一期/产品方案/脚手架设计/` 和 `docs/一期/产品方案/业务梳理/字段级校验对照表.md` 为准。

## 1. 何时跑什么

| 变更类型 | 必做验证 | 何时必须补跑全流程 |
|---|---|---|
| 文档、注释、纯展示文案 | `git diff --check`；若打包使用文档变化，另跑 build / 发布包验证 | 不必 |
| 单个命令的参数、输出或门禁 | 相关 Vitest 用例 + 对应一条 dev 脚本 | 同时影响身份选择、工作稿、平台写入、模板或共享工具时 |
| 属性、可选配置、依赖、策略、版本提交 | 相关 Vitest + 字段/资源池/可选配置脚本 | 每次都必须：这些字段会共同进入同一个版本提交体 |
| init/create/bind、身份状态、产物路径、目录压缩、资源选择 | 相关 Vitest + 场景脚本 + TTY 脚本（涉及选择时） | 每次都必须：它们会改变后续所有命令定位资源的方式 |
| API DTO、认证、环境、远端门禁、恢复事务、公共 form 工具 | 本地全量验证 + dev 全流程 | 每次都必须 |
| 合并多项功能、准备发布、用户要求“全流程测试” | 本地全量验证 + dev 全流程 | 即本行 |

“单独命令改动”只有在不改变共享类型、状态、提交体、请求封装、认证/环境和选择逻辑时，才允许只做定向验收；不确定时一律按全流程执行。

## 2. 全流程前置条件

1. 仅用 `--env dev` 与 `test/.freelog-test-credentials.local.json` 的 `primary` 账号；不得打印或提交凭据、cookie、token、资源池 ID。
2. 必须存在被忽略的 `test/.freelog-test-resource-pool.local.json`。它只提供可依赖的既有资源，脚本不得修改、bind、上架或下架池内资源。
3. 必须存在被忽略的 `test/.freelog-test-optional-config.local.json`，为后台当前支持可选配置的最终叶子类型显式指定仓内文件或目录。先用 `discover-optional-config` 和 `type info` 核实后台能力；不得根据“主题/插件/图片”等名称猜测。
4. 根开发依赖 `node-pty` 必须可用；探针会在 Windows 走 ConPTY、在 macOS/Linux 走系统 PTY，并实际验证 Inquirer 下移选择。
5. 运行前确认工作区没有仍在执行的旧验收脚本。所有临时工程只位于系统临时目录；测试新建资源按各脚本规则下架或保留未发布审计壳。

## 3. 标准执行顺序

在仓库根目录执行。全流程**不得**传 `--skip-build`，以保证验收的是刚构建且包含使用文档的发布产物。

```powershell
pnpm --filter @freelog-cli/cli2 test
pnpm --filter @freelog-cli/cli2 typecheck
pnpm --filter @freelog-cli/cli2 build
pnpm --filter @freelog-cli/cli2 verify:package
git diff --check
node test/run-final-acceptance.mjs --env dev
```

最后一条会顺序执行下表的所有真网脚本。其退出语义是：

| 退出码 | 结论 | 处理 |
|---|---|---|
| `0` | `PASS` | 本次已覆盖的功能全部真实通过。 |
| `1` | `FAIL` | CLI 行为、脚本断言或平台响应与设计不一致；停止发布，定位并修复后从头重跑。 |
| `3` | `BLOCKED` | 前置 fixture、TTY、可测试的资源池目标或后端契约不足；不能算通过，也不是自动的 CLI 回归。记录事实、影响范围和补测条件。 |

脚本退出后读取系统临时目录的 `freelog-runtime-cli-verification/final-acceptance.txt` 以及各独立报告。报告只作本次证据，不能替代仓库内设计或测试计划。

## 4. 覆盖矩阵

| 产品能力 | 真网证据 | 必须看到的结果 |
|---|---|---|
| 环境、认证、未登录与坏凭据 | `verify-commands`、场景脚本 | dev 可写；未登录/坏凭据被拒；prod 从不调用。 |
| init / create / 首版 | `run-all-scenarios`、`verify-scenarios` | 本地身份、锚点、prepare、分析、`1.0.0` 提交、线上读回。 |
| 普通文件与主题/插件目录产物 | `run-all-scenarios`、`verify-commands`、`verify-theme-image-full-lifecycle` | 普通文件直传；主题目录临时稳定 zip；预制 zip 不二次压缩。 |
| 主题与照片的完整发行/更新 | `verify-theme-image-full-lifecycle` | **每一种资源自身**均从正确入口开始，完成属性、可选配置、依赖、首版读回、拉稿修改、更新版读回和下架；不得把不同资源的局部证据拼成“完整链”。 |
| 工作稿与更新版本 | [版本更新专项矩阵](#41-版本更新专项矩阵必须逐项验收) | 不能只验证“成功发出一个新号”；必须逐项覆盖底稿、版本号、产物、字段、成功收尾和失败保留。 |
| 属性 | `verify-field-rules`、`verify-optional-config` | 边界、add/set/rm、首版与更新版提交和回读。 |
| 可选配置 | `discover-optional-config`、`verify-optional-config`、`verify-field-rules` | 后台嵌套能力正确识别；不支持类型拒绝；支持类型的文本/下拉 add/set/rm、首版/更新版回读。 |
| 依赖与签约 | `run-resource-pool-scenarios`、`verify-optional-config`、`verify-paid-dep` | 显式策略写稿、范围校验、提交读回；未授权付费签约须有真实未授权候选，否则 `BLOCKED`。浏览器支付不阻止依赖声明。 |
| 资源管理 | [资源管理专项矩阵](#42-资源管理专项矩阵必须逐项验收) | 不以“能上架一次”替代 listing、策略、选择、bind、同步、恢复与管理门禁的验收。 |
| 本地事务与未知版本提交恢复 | Vitest 为主；可控网络中断出现时补 dev | 不重发、保留未决、仅 SHA/版本精确匹配才收尾。 |
| 发布包与内置使用文档 | build、`verify:package` | 打包后 CLI 可执行且 help 指向包内文档。 |

### 4.1 版本更新专项矩阵（必须逐项验收）

`update-version` 是独立于 `create-version` 的完整生命周期。全流程不能把“首版成功”或“任意一个更新号成功”当成版本更新验收完成。

| 更新环节 | 必须验证的事实 | 当前真网证据 | 状态 |
|---|---|---|---|
| 入口边界 | 无 `latestVersion` 时 `update-version` 拒绝并指向 `create-version`；已有版本时 `create-version` 拒绝并指向 `update-version` | 单测为主 | **缺 dev 专项** |
| 拉取底稿 | latest 拉取；指定已发号拉取；指定不存在号失败且不写稿；`version show --local` 能读到来源与字段 | `verify-commands`、`verify-scenarios` | 已接入 |
| 底稿一致性 | `fromVersion` 与 latest 不一致时非交互拒绝；`--reuse-version` 明确续用旧底；覆盖拉取不混旧字段 | `verify-commands`、`verify-scenarios` | 已接入 |
| 有损操作 | `update-version --reset` 的成功重拉、取消、产物预检失败时均保留旧更新稿；`draft discard` 仅删当前稿 | 当前只对首版 `create-version --reset` 有真网证据 | **缺更新版真网** |
| 新号选择 | 精确 `--version` 合法且严格大于 latest；≤ latest 与非法 semver 拒绝；`--version` 与 `--bump` 冲突拒绝 | `verify-commands`、`verify-field-rules`、`verify-scenarios` | 已接入 |
| bump | `patch`、`minor`、`major` 都从 latest 正确生成；`--yes --bump` 缺方向拒绝，绝不默认 patch | patch / minor 已真网；major 与缺方向仅本地 | **缺部分 dev** |
| 普通产物更新 | 不传 `--artifact` 用已锚定文件；传新普通文件后上传、分析、线上 `filename` 与本地锚点一致；普通类型传目录拒绝 | `verify-scenarios`、`verify-commands` | 已接入 |
| 主题与插件产物更新 | 主题目录更新临时 zip；主题预制 zip 直传；**插件目录和插件预制 zip都要更新版本**，不二次压缩 | 主题目录更新已由 `verify-theme-image-full-lifecycle` 真网覆盖；插件只验首版预制 zip | **缺插件更新真网** |
| 更新字段继承与编辑 | pull 后 description、属性、可选配置、依赖都能读回；同一更新稿可 attr/option/dep add/set/rm；提交新号读回完整提交体 | `verify-commands`、`verify-optional-config`、`verify-theme-image-full-lifecycle` | 已接入 |
| 文件分析变化 | 换产物后旧附加属性进入 review / orphan；未处理时拒绝提交，处理后才可提交 | 本地场景/单测为主 | **缺 dev 专项** |
| 成功收尾 | 成功 POST 后只删除当前 `N.version.json` 与匹配 pending marker；线上 latest 与指定号都可读；`N.json` 只更新成功确认的锚点 | `run-all-scenarios`、`verify-commands`、`verify-optional-config`、`verify-theme-image-full-lifecycle` | 已接入 |
| 明确失败与未知结果 | 字段/平台 4xx 失败留稿；网络结果未知留稿与 pending，`resource recover` 仅精确 SHA/版本匹配时收尾 | 单测为主 | **缺可控 dev 专项** |
| 已发号描述 | `version description --version` 改已有号但不创建新版本；指定号读回 | `verify-scenarios` | 已接入 |

`verify-theme-image-full-lifecycle.mjs` 专门覆盖两条不可互相替代的真网链：主题必须从 `init theme ... --template` 取得线上模板、以 `dist` 目录发行临时 zip；照片必须以普通单文件 `sample-image.png` 建立身份并以新图片作为更新版产物。两条链各自在同一资源上完成属性、文本/下拉可选配置、显式策略依赖、首版提交与读回、`draft pull`、字段/产物变更、更新版提交与读回及下架。模板包中保留的项目名和版本占位符不渲染；测试只验证 CLI 已生成工程能够关联用户已构建的 `dist` 发行物。

**当前结论：**现有 `run-final-acceptance.mjs` 已覆盖更新版本的重要主链，但尚不符合本节的“版本更新全覆盖”标准。必须新增 `test/verify-version-update.mjs`，覆盖所有标为“缺”的可控项，并将它加入 `run-final-acceptance.mjs` 后，才可把该入口称为完整 dev 全流程验收。

### 4.2 资源管理专项矩阵（必须逐项验收）

资源管理指已创建或 bind 的资源在版本提交之外的管理行为。所有写命令都必须以精确 `resourceId` 复查当前 owner 与冻结状态；标题只是展示缓存，不能当资源选择条件。

| 管理环节 | 必须验证的事实 | 当前真网证据 | 状态 |
|---|---|---|---|
| `status` | 单资源文本、`--json` 为可解析 JSON；无登录不触发线上写；线上 ID、最新版本、状态与本地身份对应 | 文本与不崩溃已测 | **缺 JSON 真断言** |
| 资源路由 | 零/一/多状态；`id:`、完整 `name:`、`artifact:`、`file:N.json`；多状态非交互拒绝、TTY 选择；禁止 `title:` | TTY 第二项、部分 id/artifact | **缺全部 selector 真网** |
| `resource list` | 健康、工作稿、未决记录与坏/遗留状态均可只读诊断，不被普通命令的阻断逻辑掩盖 | 单测为主 | **缺 dev 专项** |
| `resource sync` | 单资源与全工程批量同步；只按 ID 更新 `title` 缓存，不改不可变身份；远端不存在/环境不符分别报告 | 精确和批量标题同步 | **缺异常分支 dev** |
| `resource recover` | prepared 仅清 marker 留稿；sending/旧记录只在远端版本号 + SHA 精确匹配时清稿；不重发；非本人/冻结只能只读核验 | 单测为主 | **缺可控 dev 专项** |
| bind | 按 ID 与完整 `username/resourceName` 接入；重复 bind 幂等；有绑定时 `--force --yes` 才换绑；普通文件、主题/插件目录/zip 锚点规则一致 | ID、重复、force、后续发版已测 | **缺名称接入与主题/插件 bind dev** |
| listing 更新 | title、intro、tags 的单改/组合改、显式清空；封面本地图片上传与远端 URL 回读；无字段、非法标签/封面、非本人/冻结零写 | title/intro/tags 主链已测 | **缺封面、清空和门禁 dev** |
| 策略读取与模板 | `policy list`；模板所有页；免费模板应用、读回；本地文件 apply；模板适用性和事件 DSL 错误可区分 | 免费模板主链已测；事件 DSL BLOCKED | **缺分页和本地策略真网** |
| 策略开关 | 指定 ID on/off 读回；已上架时不允许关掉最后一条启用策略；无效 ID/非本人/冻结零写 | 一条策略 on/off 已测 | **缺最后策略门禁与异常 dev** |
| 上下架 | `validate --for online` 与 `online` 共用 ID/owner/freeze 与“有版本 + 启用策略”门禁；online、重复 online、offline、重复 offline 的平台状态回读 | 正向 online/offline 与部分幂等历史证据 | **缺完整当前专项** |
| 管理与多资源 | 每个管理写命令均只影响被选中的 `N.json`；`resource sync` 是唯一允许无 selector 批量的例外 | 多资源 bind / sync 已测 | **缺 listing、策略、上下架的多资源隔离 dev** |

**当前结论：**现有聚合器有资源管理主链证据，但尚不符合本节“资源管理全覆盖”标准。必须新增 `test/verify-resource-management.mjs`，覆盖所有标为“缺”的可控项，并把它加入 `run-final-acceptance.mjs`；在此之前不得以聚合器的 `PASS` 表述资源管理已完整验收。

## 5. 全命令与参数组合验收契约

本节以 `docs/一期/产品方案/脚手架设计/COMMANDS.md` 和实际 Commander 注册树为清单真源。验收目标不是盲目执行数学上的全部笛卡尔积，而是覆盖每个行为不同的参数等价类、每个声明冲突、每个有状态组合及每个资源路由形式；任何被证明与其他参数独立的组合可由同一条参数化测试覆盖。没有独立性证明，就不得用“已测过相近命令”代替。

### 5.1 所有共享参数的强制组合

| 参数 / 组合轴 | 每个适用命令都必须覆盖的等价类 | 当前事实 |
|---|---|---|
| `--env` | `dev` 正向；省略（默认 prod）拒绝平台调用；`prod` 明确拒绝；`test` 与非法值按环境契约；已绑定状态与错误环境不混用 | 有零散覆盖；**缺全命令参数化** |
| `--cwd` | 省略当前目录、显式有效工程、相对路径、无效/不存在目录；认证选择器与本地状态都以最终 cwd 为准 | 有零散覆盖；**缺全命令参数化** |
| `--yes` | 写命令的确认成功；有损操作未传时 TTY 默认取消；非 TTY 未传拒绝；`--yes` 不绕过字段、门禁、文件或参数校验 | 首版/reset/TTY 部分已测；**缺全命令参数化** |
| `--resource` | `id:`、完整 `name:`、`artifact:`、`file:N.json` 四种精确选择；零/一/多身份；多身份非交互缺 selector 拒绝；`resource sync` 无 selector 是唯一批量例外；禁止 `title:` | 部分 TTY/id/artifact 已测；**缺全命令参数化** |
| `--json` | 适用的只读/写命令都须输出可解析且稳定的 JSON；错误也有稳定 JSON 错误结构，不能夹杂人类文本 | **部分实现：`CliError` 已输出稳定 `{ code, message }`，但成功分支仍由各命令直接打印人类文本；在成功输出统一结构前不得验收通过** |

以下命令专属参数在每条记录的“组合”列中列出。每个命令还须覆盖：必填参数缺失、未知参数、参数格式非法、与共享参数组合后的资源/环境隔离。交互分支用 `node-pty`，非交互分支必须以普通 stdin/`--yes` 重跑。

### 5.2 命令清单：账号、工程、类型与本地状态

| 命令 | 参数组合与必须断言 | 当前真网状态 |
|---|---|---|
| 顶层 `--help` / `--cli-version` | help 含发布包内绝对使用文档路径；版本旗标；未知顶层命令拒绝 | 发布包 smoke 部分；**缺 dev 命令契约脚本** |
| `login` | 工作区 / `--global`；交互与 `--login-name --password-stdin --yes`；缺一项、坏凭据、重复登录、`--cwd` 隔离 | 成功、坏凭据部分；**缺 global/cwd/重复** |
| `logout` | 工作区 / `--global`；已有/没有 selector；不调平台注销；不删资源状态；之后认证命令行为 | 部分；**缺 global 与无 selector** |
| `init [dir]` | 默认 / 显式 dir；层级、搜索、直接 type code；`--type` 最终叶子/非叶子/停用/不存在；`--artifact` 普通文件/不存在/目录/越界；弃用 `--resource-type` 的兼容或明确拒绝 | 普通主链部分；**缺完整参数集合** |
| `init theme` / `init widget` | 默认/显式 dir；`--template` 默认、有效、无效；已存在目录；类型固定；模板原样复制；默认 `dist` 锚点 | 首版/模板部分；**缺 widget 与冲突组合** |
| `template list` | 无参数、环境/认证边界、固定版本与未知模板后续 init 拒绝 | 单测为主；**缺 dev 专项** |
| `type list` | 全部启用最终叶子、空结果、环境/认证 | 部分；**缺命令契约** |
| `type search [keyword]` | 空关键词、名称/编号关键词、无结果、分页或平台错误 | 单测为主；**缺 dev 专项** |
| `type pick [--type]` | 无 `--type` 列表、有效最终叶子详情、非叶子/停用/不存在拒绝 | 未在正式验收矩阵中；**缺 dev 专项** |
| `type info <code>` | 有效最终叶子；非叶子/停用/不存在；嵌套 `resourceConfig.supportOptionalConfig` 的显示 | 支持能力已测；**缺异常 dev** |
| `resource list` | 健康、多个身份、工作稿、pending、损坏/遗留索引；必须只读且不被 pending 阻断 | 单测为主；**缺 dev 专项** |
| `resource sync [--resource]` | 无 selector 批量、四种 selector、环境不符、远端缺失、标题重复/变化；只改 title 缓存 | 批量/id 部分；**缺完整组合** |
| `resource recover [--apply --yes]` | 无 marker、prepared 查看/清 marker留稿、sending/旧 marker 的匹配/不匹配、非本人/冻结只读、`--apply` 无 `--yes` | 单测为主；**缺可控 dev 专项** |
| `status [--resource]` | 四种 selector、零/一/多身份、未登录、本地/线上不一致、`--json` | 文本部分；**缺完整组合与 JSON** |
| `bind <id\|username/name>` | ID 与完整名称；文件/主题目录/插件目录/zip 产物；重复、force 换绑、无 `--force` 拒绝、目标不存在/非本人/合集/冻结 | ID/force/后续发版部分；**缺名称和形态组合** |
| `version set --artifact` | 普通文件、主题/插件目录、zip、路径不存在/越界、四种 selector；只改当前 `N.json.filePath`，不上传/不改稿 | 历史/单测为主；**缺 dev 专项** |
| `create` | title/type/name/artifact 的交互与 `--yes` 必填组合；普通/主题/插件；已有本地/线上壳、唯一未绑定接续、多未绑定歧义、所有产物路径形态 | 主链部分；**缺完整组合** |

### 5.3 命令清单：版本查看、工作稿和表单

字段长度、字符集、重复、上限和提交 DTO 的每个值域仍以字段级对照表为真源；这里补的是命令、参数和生命周期组合。

| 命令 | 参数组合与必须断言 | 当前真网状态 |
|---|---|---|
| `version show [--version] [--local]` | latest、指定存在/不存在号、本地稿；`--local + --version` 冲突；无稿 local 拒绝；四种 selector | 部分；**缺完整组合** |
| `version draft pull [--version] [--yes]` | latest/指定存在/不存在；无稿、有同底稿、有异底稿、首版稿；TTY 覆盖确认/取消与非 TTY `--yes`；覆盖后字段不混合 | 重要分支已测；**缺完整命令组合** |
| `version draft discard [--yes]` | 无稿幂等、有稿 TTY 取消/确认、非 TTY 拒绝/`--yes`、仅影响选择资源 | 部分；**缺多资源与更新稿** |
| `version draft description` | update 稿改描述、首版稿/无稿拒绝、空描述、确认与读回 | 主链部分；**缺空值和多资源** |
| `version attr add/set/rm/list` | 一行式与 TTY；自定义/系统附加；所有字段边界、重复、键不可改、空值、条目上限、无稿、跨资源隔离 | 字段主链部分；**缺全参数化组合** |
| `version attr review` / `review discard <key>` | 无 orphan、有多个 orphan、存在/不存在 key、确认/取消、清完后允许提交 | 单测为主；**缺 dev 专项** |
| `version option add/set/rm/list` | 文本/下拉、所有字段边界、默认值规则、类型支持/不支持/能力变化、遗留项删除、无稿、跨资源隔离 | 正向主链与负门已测；**缺全参数化组合** |
| `version dep add <target> [--range --policy-id]` | id/name 目标、默认/明确/非法/不命中 range、自己依赖、普通/非普通/不存在、未授权策略选择、已授权、签约、支付不阻塞、环检测、无稿 | 主链/范围部分；**缺完整目标与签约组合** |
| `version dep range <id> [--range --policy-id]` / `rm` / `list` | 目标不存在、默认/明确 range、重新签约、环、删后重加、空稿、多资源 | 部分；**缺全参数化组合** |
| `create-version [--prepare] [--reset] [--artifact]` | 无 latest、已有 latest 拒绝；prepare/提交；reset 成功/取消/预检失败留稿；普通/主题/插件三种产物；无/有首版稿；禁止 update 专属参数 | 主链部分；**缺完整组合** |
| `update-version [--reuse-version --version\|--bump --reset --artifact]` | 逐项按 [版本更新专项矩阵](#41-版本更新专项矩阵必须逐项验收)；同时覆盖显式冲突和所有产物形态 | 主链部分；**缺专项脚本** |
| `version description --version <ver> [--description]` | 指定存在/不存在号、空/边界描述、非本人/冻结、不得创建新号或改稿 | 指定号主链；**缺异常/边界 dev** |

### 5.4 命令清单：listing、策略与上下架

| 命令 | 参数组合与必须断言 | 当前真网状态 |
|---|---|---|
| `update [--title --intro --cover --tags]` | 四个字段所有 15 种非空子集；title/intro/tags 显式清空；cover 单独/与其他组合；无 flag；非法图片、越界路径、非法标签、非本人/冻结；只改所选资源 | 主链部分；**缺参数组合专项** |
| `policy list` | 当前叶子到根的完整类型链（不只叶子）；空/有策略；第 1/中间/末页各 50 条；TTY 上一页/下一页/退出；非 TTY 只首页和剩余条数提示；已上架/下架资源、四种 selector | 有策略主链；**缺完整组合** |
| `policy template list [--page --page-size]` | 默认、首/中/末页、1/100 边界、0/负/超界/非数字、所有模板返回；后端类型筛选恢复后补类型适用性 | 默认主链；**缺分页参数 dev** |
| `policy template apply [templateId] [--name]` | TTY 选页/取消；非 TTY/`--yes` 缺 ID；有效 ID、无效 ID、重名/空名、免费与事件模板；读回启用状态 | 免费主链；事件 DSL BLOCKED；**缺完整组合** |
| `policy apply --from-file <path> [--name]` | 文本/JSON、文件内名/覆盖名、缺文件/坏 JSON/坏 DSL、免费/交易事件、读回启用 | 未在当前聚合器完整验收；**缺 dev 专项** |
| `policy set --id <id> --on\|--off` | on/off、二者同给/都不给、无效 ID、重复 on/off、上架时最后启用策略门禁、读回 | 单策略开关；**缺完整组合** |
| `validate --for online` | 正向；无版本、零启用策略、非本人、冻结、多资源 selector；只读不改状态 | 正向部分；**缺失败组合 dev** |
| `online` | 正向、无版本、零启用策略、非本人、冻结、重复 online、四种 selector；只改线上状态 | 正向部分；**缺完整组合** |
| `offline` | 已上架、已下架幂等、未发布壳、非本人、冻结、四种 selector；只改线上状态 | 部分；**缺完整组合** |

### 5.5 达标实现与执行门槛

必须新增一个数据驱动的 `test/verify-command-contracts.mjs`，以本节 5.2–5.4 为 case manifest；每个 case 必须写出命令、参数、前置状态、预期本地变化、预期远端变化和期望结果（PASS / BLOCKED）。`run-final-acceptance.mjs` 必须接入它。

该脚本的第一个 case 是**命令清单一致性**：从 `packages/cli/src/commands/index.ts` 和各子命令实际注册树提取叶子命令，与 `COMMANDS.md` 的批准清单逐个比对。当前已发现 `type pick [--type]` 已注册、但 `COMMANDS.md` 未列出；在设计决定“补进公开命令参考”或“删除该入口”之前，这一一致性 case 必须失败，不能靠测试遗漏掩盖。之后新增、删除、改名任意命令，必须先更新设计与该 manifest。

`--json` 的验收拆为两条：现有错误 JSON 要对每个稳定错误等价类做解析和 `code` 断言；成功 JSON 必须在产品实现统一返回结构后，才对每个只读/写命令断言单个 JSON 文档、无混入文本、字段版本化且不泄漏凭据。现状只能验收前者，不能把成功文本输出误称为 JSON 支持。

在 `verify-command-contracts.mjs`、`verify-version-update.mjs`、`verify-resource-management.mjs` 全部接入前，当前聚合器仅是“已接入脚本回归”，不是完整 dev 全流程验收。尤其成功 `--json` 契约和命令清单不一致未修复前，任何“所有命令和参数都覆盖”的结论都不成立。

## 6. 当前已知 BLOCKED 基线

这些是外部条件，不可在结果中降级为通过：

1. 事件策略模板的 `reCompile` DSL 仍可能被资源写接口拒绝；等待后端统一编译契约。
2. 资源池可能没有 primary 尚未授权且仍启用的付费策略；此时无法真实重演“未授权 → 显式策略签约”，`verify-paid-dep` 必须返回 `BLOCKED`。不要撤销既有合约制造条件。
3. 版本 POST 的“网络中断后结果未知”已有本地 recover 覆盖；若无可控中断环境，dev 真网证据保持缺口。

当后端或资源池条件变化时，先移除对应阻塞事实，再从第 3 节全量重跑；不能只补跑单条并改写历史结论。

## 7. 定向验收映射

| 改动位置 / 领域 | 最小定向验证 |
|---|---|
| `domain/version/form/attr.ts`、字段解析 | `form.test.ts` + `verify-field-rules.mjs` |
| `domain/version/form/option.ts`、类型能力映射 | `type-template.test.ts`、`form.test.ts` + `verify-optional-config.mjs`；主题/照片生命周期受影响时再跑 `verify-theme-image-full-lifecycle.mjs` |
| `domain/version/form/dep.ts` | `remaining.test.ts` + `run-resource-pool-scenarios.mjs`；改签约分支另跑 `verify-paid-dep.mjs` |
| `submit.ts`、`createVersion.ts`、`updateVersion.ts` | 相关 domain/scenes 测试 + `run-all-scenarios.mjs` + `verify-optional-config.mjs`；`verify-version-update.mjs` 接入后必须运行它 |
| `typePick.ts`、模板 API | `type-template.test.ts` + `verify-commands.mjs` |
| `init`、`create`、`bind`、状态解析 | init / identity / resolve 测试 + `verify-scenarios.mjs`；涉多资源或 TTY 则加 `verify-multi-resource-tty.mjs` |
| `pendingOperation.ts`、`recover.ts` | `pending-operation.test.ts` + 受影响版本提交流程；有可控中断时补 dev 恢复验证 |
| 主题/插件产物、压缩 | `zip-path.test.ts`、主题场景测试 + `run-all-scenarios.mjs` 或 `verify-commands.mjs`；若改动会触及主题发行或更新，再跑 `verify-theme-image-full-lifecycle.mjs` |
| `status`、`resource`、`bind`、listing、policy、online/offline | 相关 domain 测试 + `verify-resource-management.mjs` 接入后必须运行；多资源影响另加 `verify-multi-resource-tty.mjs` |
| 使用文档、help、发布包 | build + `verify:package`；无需 dev 写平台 |

定向验证通过只说明该改动面没有回归；它不覆盖第 4 节之外的共享行为。

## 8. 每次报告格式

每次验收均记录：执行的 git 状态/改动范围、命令、通过数量、`FAIL` 和 `BLOCKED` 的原始原因、dev 资源收尾状态，以及本次未覆盖项。报告必须明确写“全流程 PASS”“全流程 BLOCKED”或“全流程 FAIL”，不得仅说“脚本跑完”。
