# Dev 全流程测试计划
最后更新：2026-10-17（质量闭环、逐项JSON和测试依据纠正，专项未全部完成）。
覆盖目标：一期 CLI 的 dev 环境；普通单文件资源、主题 `RT001`、插件 `RT002`，以及合集首次发行和发行后管理的已实现命令。不覆盖 prod、支付、session、studio 或多文件资源；合集目录、表单、发布与上架同时遵循合集功能拓扑门禁。覆盖目标不代表当前生产者或真实证据已经齐备。

本计划是今后每次 dev 验收的唯一入口约定。产品规则仍以 `docs/一期/产品方案/脚手架设计/` 和 `docs/一期/产品方案/业务梳理/字段级校验对照表.md` 为准。

补齐七项必需义务的有限工作包见[验收覆盖差集](验收覆盖差集-2026-10-19.md)：区分专用叶子、旧过程与未验分支，不用本文的历史脚本数代替覆盖。该清单不是另一套当前状态；实际候选、进程与缺口看活动交接。

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
2. 必须存在 `test/.freelog-test-resource-pool.local.json`；它是当前已跟踪的资源元数据，不是凭据。常规脚本只将其作为依赖资源池，不得修改、bind、上架或下架池内资源；仅 `verify-existing-resource-policy.mjs --allow-existing-resource-write` 是人工明确授权的既有资源策略专项，会新增可追溯的验收策略，绝不纳入自动全流程。凭据与可选配置素材仍为被忽略的私有输入，不打印或提交。
3. 必须存在被忽略的 `test/.freelog-test-optional-config.local.json`，为后台当前支持可选配置的最终叶子类型显式指定仓内文件或目录。先用 `discover-optional-config` 和 `type info` 核实后台能力；不得根据“主题/插件/图片”等名称猜测。
4. 根开发依赖 `node-pty` 必须可用；探针会在 Windows 走 ConPTY、在 macOS/Linux 走系统 PTY，并实际验证 Inquirer 下移选择。
5. 运行前确认工作区没有仍在执行的旧验收脚本。所有临时工程只位于系统临时目录；测试新建资源按各脚本规则下架或保留未发布审计壳。

## 3. 标准执行顺序

在仓库根目录执行。标准验收固定候选 tarball，不用全局安装包或仓内 dist 替代；候选模式禁止 `--skip-build` 参数与重建/回退，子脚本由聚合器统一注入实际安装 bin。

```powershell
pnpm release:prepare
pnpm test:dev --candidate <输出的candidate.json路径>
pnpm release:check --candidate <同一路径>
```

prepare 包含本地质量检查，不改版本、不发布。schema 2候选自动区分development/release并绑定真实commit/tree及内容；脏树可准备development候选做同包取证，但releaseEvidence/releaseApproved不得成为true，发布须在固定源码提交上重新prepare。test:dev按源码目录去重执行注册生产者，原14条仅保留过程记录，未实现项独立列出；release:check另行只读判断发布条件。验收退出语义是：

| 退出码 | 结论 | 处理 |
|---|---|---|
| `0` | `PASS` | 当前目标通过；完整发布必须再由独立 release:check 核对必需清单、候选和证据。 |
| `1` | `FAIL` | CLI 行为、脚本断言或平台响应与设计不一致；停止发布，定位并修复后从头重跑。 |
| `3` | `BLOCKED` | 前置 fixture、TTY、可测试的资源池目标或后端契约不足；不能算通过，也不是自动的 CLI 回归。记录事实、影响范围和补测条件。 |

候选报告为其目录的 `acceptance.json`，逐脚本与产品项证据在 `evidence/<runId>/`。无候选的开发运行报告仍存临时目录，标记 `releaseEvidence=false`，不能批准发布。报告不替代设计，旧固定 final-acceptance.txt 不是当前入口。

最近一次执行：2026-10-15，重新构建后的聚合回归 14/14 条脚本 exit 0；证据按轮次保存在 `freelog-runtime-cli-verification/acceptance-runs/2026-10-15T06-21-05-242Z/`。系统属性专项另行独立运行一次，两次主题/PNG/JPEG 发行更新链各有 143 项显式断言通过。合集一条后端坏模板、普通模板不足跨页样本、独立 PTY 探针回收问题及其余覆盖边界，见[当次完整报告](./DEV-系统属性真实验收-2026-10-15.md)；脚本级 PASS 不抹去这些限制。

## 4. 覆盖矩阵

| 产品能力 | 真网证据 | 必须看到的结果 |
|---|---|---|
| 环境、认证、未登录与坏凭据 | `verify-commands`、场景脚本 | dev 可写；未登录/坏凭据被拒；prod 从不调用。 |
| init / create / 首版 | `run-all-scenarios`、`verify-scenarios` | 本地身份、锚点、prepare、分析、`1.0.0` 提交、线上读回。 |
| 普通文件与主题/插件目录产物 | `run-all-scenarios`、`verify-commands`、`verify-theme-image-full-lifecycle` | 普通文件直传；主题目录临时稳定 zip；预制 zip 不二次压缩。 |
| 主题、PNG/JPEG 照片的完整发行/更新 | `verify-theme-image-full-lifecycle` | **每一种资源自身**均从正确入口开始，完成属性、可选配置、依赖、首版读回、拉稿修改、更新版读回和下架；主题附加值恢复、空默认配置、系统重名/非法稿拒绝及两类图片 MIME 均须精确断言，不得拼接局部证据。 |
| 工作稿与更新版本 | [版本更新专项矩阵](#41-版本更新专项矩阵必须逐项验收) | 不能只验证“成功发出一个新号”；必须逐项覆盖底稿、版本号、产物、字段、成功收尾和失败保留。 |
| 属性 | `verify-field-rules`、`verify-optional-config`、`verify-theme-image-full-lifecycle` | 边界、add/set/rm、系统附加发现/显式清空/拉稿恢复、raw/未知键/系统名称冲突拒绝、人工 JSON 提交门禁、首版与更新版 JSON 精确回读。 |
| 可选配置 | `discover-optional-config`、`verify-optional-config`、`verify-field-rules` | 后台嵌套能力正确识别；不支持类型拒绝；支持类型的文本/下拉 add/set/rm、首版/更新版回读。 |
| 依赖声明 | `verify-dependency-declarations`、`run-resource-pool-scenarios`、`verify-optional-config`、`verify-paid-declaration` | 图片等普通资源、主题和视频都核验：无合同也可 add/range、首版/更新版提交并读回；不传策略、不签约、不付款，前后双方合同仍为 0。目标事实、范围、基础上抛和循环门禁仍保留。 |
| 合集直接依赖声明 | `verify-collection-dependency-declarations` | 合集直接依赖不查询合同、不签约、不付款；免费/付费目标均可声明、publish 并读回，前后双方合同仍为 0。不把直接依赖当单品；单品上游授权仍需 exact contractId，缺失时走网页提示。 |
| 资源管理 | [资源管理专项矩阵](#42-资源管理专项矩阵必须逐项验收) | 不以“能上架一次”替代 listing、策略、选择、bind、同步、恢复与管理门禁的验收。 |
| 合集自身策略 | `verify-collection-policy` | 新建 `subjectType=4` 审计壳，验证适用模板目录、至少两条多参数模板的编译/创建/读回与 off/on；单条服务端坏模板要记录但不替代成功样本；不把它误作合集目录/发布/上架全流程。 |
| 策略模板 TTY 浏览 | `verify-policy-template-tty` | 在本人已有图片资源上以真实 node-pty 选择模板并取消，确认策略列表不变；目录不足 21 条时只能证明首页，跨页须结合 21 条模板命令测试并保留真实 dev 样本缺口。 |
| 本地事务与未知版本提交恢复 | Vitest 为主；可控网络中断出现时补 dev | 不重发、保留未决、仅 SHA/版本精确匹配才收尾。 |
| 合集未决发布与完整目录 | `collection-publish-recovery` / `collection-catalogue`受控回归；新固定候选补dev | 目录全分页/嵌套身份；已有intent零PUT；resume默认只读，显式apply+yes须完整表单/授权映射/要求merge的目录精确匹配；当前变稿/坏JSON/新稿保留。旧v1不能证明成功。未完成真实中断验收前不关闭合集父gap。 |
| 发布包与内置使用文档 | build、`verify:package` | 打包后 CLI 可执行且 help 指向包内文档。 |

### 4.1 版本更新专项矩阵（必须逐项验收）

`update-version` 是独立于 `create-version` 的完整生命周期。全流程不能把“首版成功”或“任意一个更新号成功”当成版本更新验收完成。

| 更新环节 | 必须验证的事实 | 当前真网证据 | 状态 |
|---|---|---|---|
| 入口边界 | 无 `latestVersion` 时 `update-version` 拒绝并指向 `create-version`；已有版本时 `create-version` 拒绝并指向 `update-version` | 单测为主 | **缺 dev 专项** |
| 拉取底稿 | latest 拉取；指定已发号拉取；指定不存在号失败且不写稿；`version show --local` 能读到来源与字段 | `verify-commands`、`verify-scenarios` | 已接入 |
| 底稿一致性 | `fromVersion` 与 latest 不一致时非交互拒绝；`--reuse-version` 明确续用旧底；覆盖拉取不混旧字段 | `verify-commands`、`verify-scenarios` | 已接入 |
| 有损操作 | `update-version --reset` 取消或产物预检失败保留旧稿；确认丢弃后成功重拉新稿，不混旧字段，后续失败也不恢复已放弃旧稿；`draft discard` 仅删当前稿 | 当前只对首版 `create-version --reset` 有真网证据 | **缺更新版真网** |
| 新号选择 | 精确 `--version` 合法且严格大于 latest；≤ latest 与非法 semver 拒绝；`--version` 与 `--bump` 冲突拒绝 | `verify-commands`、`verify-field-rules`、`verify-scenarios` | 已接入 |
| bump | `patch`、`minor`、`major` 都从 latest 正确生成；`--yes --bump` 缺方向拒绝，绝不默认 patch | patch / minor 已真网；major 与缺方向仅本地 | **缺部分 dev** |
| 普通产物更新 | 不传 `--artifact` 用已锚定文件；传新普通文件后上传、分析、线上 `filename` 与本地锚点一致；普通类型传目录拒绝 | `verify-scenarios`、`verify-commands` | 已接入 |
| 主题与插件产物更新 | 主题目录更新临时 zip；主题预制 zip 直传；**插件目录和插件预制 zip都要更新版本**，不二次压缩 | 主题目录更新已由 `verify-theme-image-full-lifecycle` 真网覆盖；插件只验首版预制 zip | **缺插件更新真网** |
| 更新字段继承与编辑 | pull 后 description、属性、可选配置、依赖都能读回；同一更新稿可 attr/option/dep add/set/rm；提交新号读回完整提交体 | `verify-commands`、`verify-optional-config`、`verify-theme-image-full-lifecycle` | 已接入 |
| 文件分析变化 | 换产物后旧附加属性进入 review / orphan；未处理时拒绝提交，处理后才可提交 | 本地场景/单测为主 | **缺 dev 专项** |
| 成功收尾 | 成功 POST 后只删除当前 `N.version.json` 与匹配 pending marker；线上 latest 与指定号都可读；`N.json` 只更新成功确认的锚点 | `run-all-scenarios`、`verify-commands`、`verify-optional-config`、`verify-theme-image-full-lifecycle` | 已接入 |
| 明确失败与未知结果 | 字段/平台 4xx 失败留稿；网络结果未知留稿与 pending，`resource recover` 仅精确 SHA/版本匹配时收尾 | 单测为主 | **缺可控 dev 专项** |
| 已发号描述 | `version description --version` 改已有号但不创建新版本；指定号读回 | `verify-scenarios` | 已接入 |

`verify-theme-image-full-lifecycle.mjs` 默认覆盖三条不可互相替代的真网链，可用 `--only theme|image|jpeg` 定位问题：主题从 `init theme ... --template` 取得线上模板，以 `dist` 目录发行临时 zip；PNG 使用新生成的标准 RGB 文件；JPEG 从真实编码的文本 fixture 解码后插入标准 COM 段生成新 SHA，不伪装 PNG、不在文件尾追加非标准字节。三条链各自在同一资源上完成属性、空默认文本/下拉配置、依赖、首版 JSON 读回、拉稿修改、更新版 JSON 读回、策略与上下架；图片两版均验证准确 MIME，主题两版同时验证系统 descriptor、`versionProperty` 与本地拉稿的附加值一致。

该脚本还在真实 CLI 入口验证未知附加键、raw 及系统键/名称冲突的拒绝与原稿保留；手改非法稿必须阻止真正的版本提交，不产生误导 pending 或线上版本。失败现场保留供复查，成功只清理经路径核验的脚本临时工程；资源 ID 和完整版本快照仅留系统临时报告。模板项目名/版本占位符不渲染，复制预构建测试产物不代表模板项目本身的安装/构建或运行时兼容性已验收。专项证据见 [2026-10-15 系统属性真实验收](./DEV-系统属性真实验收-2026-10-15.md)。

**当前结论：**现有 `run-final-acceptance.mjs` 已覆盖更新版本的重要主链，但尚不符合本节的“版本更新全覆盖”标准。必须新增 `test/verify-version-update.mjs`，覆盖所有标为“缺”的可控项，并将它加入 `run-final-acceptance.mjs` 后，才可把该入口称为完整 dev 全流程验收。

### 4.2 资源管理专项矩阵（必须逐项验收）

资源管理指已创建或 bind 的资源在版本提交之外的管理行为。所有写命令都必须以精确 `resourceId` 复查当前 owner 与冻结状态；标题只是展示缓存，不能当资源选择条件。

| 管理环节 | 必须验证的事实 | 当前真网证据 | 状态 |
|---|---|---|---|
| `status` | 按ARCH02 §1.1精确核对三段文本、成功信封/ID/latest、空字符串无版本；本地/环境/认证失败零GET，任何结果零写/不清marker。成功JSON和完整上下架显示尚未定稿，不能从共享flag反推支持 | 历史文本部分；本轮补受控坏响应与安装包精确文本，旧PASS不覆盖新契约 | **完整参数矩阵与成功JSON契约/真断言仍缺** |
| 资源路由 | 零/一/多状态；`id:`、完整 `name:`、`artifact:`、`file:N.json`；多状态非交互拒绝、TTY 选择；禁止 `title:` | TTY 第二项、部分 id/artifact | **缺全部 selector 真网** |
| `resource list` | 健康、工作稿、未决记录与坏/遗留状态均可只读诊断，不被普通命令的阻断逻辑掩盖 | 单测为主 | **缺 dev 专项** |
| `resource sync` | 单资源与全工程批量同步；只按 ID 更新 `title` 缓存，不改不可变身份；远端不存在/环境不符分别报告 | 精确和批量标题同步 | **缺异常分支 dev** |
| `resource recover` | prepared 仅清 marker 留稿；sending/旧记录只在精确本人身份、远端版本号 + SHA 匹配时允许本地收尾，不重发；非本人拒绝并保留；冻结不阻只读核验及已证明成功的本地收尾 | 单测为主 | **缺可控 dev 专项** |
| bind | 按 ID 与完整 `username/resourceName` 接入；重复 bind 幂等；有绑定时 `--force --yes` 才换绑；普通文件、主题/插件目录/zip 锚点规则一致 | ID、重复、force、后续发版已测 | **缺名称接入与主题/插件 bind dev** |
| listing 更新 | title、intro、tags的单改/组合改；仅intro/tags可显式清空，空title拒绝；封面本地图片上传与远端URL读回，当前不支持清空封面；无字段、非法标签/封面、非本人/冻结零写 | title/intro/tags 主链已测 | **缺封面、清空和门禁 dev** |
| 策略读取与模板 | `policy list`；模板所有页；多参数模板应用、读回；模板适用性和事件 DSL 错误可区分 | 2026-09-21：单资源 8/7 参数、合集 7/4 参数均已真网创建并读回；合集另有一条 4 参数模板在后端编译失败 | **缺 TTY 分页与异常组合 dev** |
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
| `resource recover [--apply --yes]` | 无marker、prepared查看/清marker留稿、sending/旧marker匹配/不匹配、非本人拒绝保留、冻结仍可核验/按证明本地收尾、`--apply`无`--yes` | 单测为主；**缺可控 dev 专项** |
| `status [--resource]` | 四种 selector、零/一/多身份、未登录、空/错ID/畸形latest、pending只读；`--json`成功契约仍待定，不删除后续义务 | 文本部分；**缺完整组合与成功JSON定稿/真断言** |
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
| `version dep add <target> [--range]` | id/name 目标、默认/明确/非法/不命中 range、自己依赖、普通/非普通/不存在、无合同声明、付费目标声明、环检测、无稿；旧 `--policy-id` 必须拒绝 | 主链/范围部分；**缺完整目标与声明组合** |
| `version dep range <id> [--range]` / `rm` / `list` | 目标不存在、默认/明确 range、无合同改范围、环、删后重加、空稿、多资源；旧签约参数必须拒绝 | 部分；**缺全参数化组合** |
| `create-version [--prepare] [--reset] [--artifact]` | 无 latest、已有 latest 拒绝；prepare/提交；reset 成功/取消/预检失败留稿；普通/主题/插件三种产物；无/有首版稿；禁止 update 专属参数 | 主链部分；**缺完整组合** |
| `update-version [--reuse-version --version\|--bump --reset --artifact]` | 逐项按 [版本更新专项矩阵](#41-版本更新专项矩阵必须逐项验收)；同时覆盖显式冲突和所有产物形态 | 主链部分；**缺专项脚本** |
| `version description --version <ver> [--description]` | 指定存在/不存在号、空/边界描述、非本人/冻结、不得创建新号或改稿 | 指定号主链；**缺异常/边界 dev** |

### 5.4 命令清单：listing、策略与上下架

| 命令 | 参数组合与必须断言 | 当前真网状态 |
|---|---|---|
| `update [--title --intro --cover --tags]` | 四字段所有15种非空子集；intro/tags显式清空、空title拒绝、封面不清空；cover单独/组合；无flag；非法图片、越界、非法标签、非本人/冻结；只改所选资源 | 主链部分；**缺参数组合专项** |
| `policy list` | 当前叶子到根的完整类型链（不只叶子）；空/有策略；一次展示全部策略、不分页；已上架/下架资源、四种 selector | 有策略主链；**缺完整组合** |
| `policy template list [--json]` | 服务端一次完整返回；TTY 固定20条的首/中/末页、模板直接选择/退出；非 TTY 首页提示；`--json` 全量可读目录、稳定信封且无 DSL；当前请求严格 `{}` | dev 已证实全量 JSON 与真实 TTY 首页选择/取消；当前仅 10 条，真实跨页仍缺样本，命令测试以 21 条覆盖 |
| `policy template info <id> [--json]` | 有效/无效 ID；完整说明、参数编号、默认值/option value、指纹；JSON 单项信封 | dev 已读真实指纹和参数；全部错误分支仍靠本地回归 |
| `policy template apply <templateId>` [`--name --template-fingerprint --param --yes`] | TTY 直达编辑；脚本模式缺 ID/指纹/名称/任一 slot、重复/未知 slot、select label、数值/日期非法、表单变化；compile/translation、重名/同正文、写后读回 | dev 单资源/合集各有两条多参数创建读回和 off/on；datetime 与结果未知的真网注入仍缺样本。结算账户预检不属于本期 CLI 模板流程 |
| `policy set --id <id> --on\|--off` | on/off、二者同给/都不给、无效 ID、重复 on/off、上架时最后启用策略门禁、读回 | 单策略开关；**缺完整组合** |
| `validate --for online` | 正向；无版本、零启用策略、非本人、冻结、多资源 selector；只读不改状态 | 正向部分；**缺失败组合 dev** |
| `online` | 正向、无版本、零启用策略、非本人、冻结、重复 online、四种 selector；只改线上状态 | 正向部分；**缺完整组合** |
| `offline` | 已上架、已下架幂等、未发布壳、非本人、冻结、四种 selector；只改线上状态 | 部分；**缺完整组合** |

### 5.5 达标实现与执行门槛

必须新增一个数据驱动的 `test/verify-command-contracts.mjs`，以本节 5.2–5.4 为 case manifest；每个 case 必须写出命令、参数、前置状态、预期本地变化、预期远端变化和期望结果（PASS / BLOCKED）。`run-final-acceptance.mjs` 必须接入它。

命令表面一致性已新增本地 `command-contracts.test.ts`：只读构造 Commander 树，锁定命令、位置参数和旗标快照；`type pick [--type]` 已补入正式 COMMANDS。该检查不执行平台，也不代替全部参数/状态组合的真实专项。之后新增、删除、改名命令或旗标必须更新正式设计及批准快照，并补业务用例，不能只更新快照变绿。

`--json` 的验收拆为两条：现有错误 JSON 要对每个稳定错误等价类做解析和 `code` 断言；成功 JSON 必须在产品实现统一返回结构后，才对每个只读/写命令断言单个 JSON 文档、无混入文本、字段版本化且不泄漏凭据。现状只能验收前者，不能把成功文本输出误称为 JSON 支持。

在 `verify-command-contracts.mjs`、`verify-version-update.mjs`、`verify-resource-management.mjs` 全部接入前，当前聚合器仅是“已接入脚本回归”，不是完整 dev 全流程验收。尤其成功 `--json` 契约和命令清单不一致未修复前，任何“所有命令和参数都覆盖”的结论都不成立。

## 6. 当前已知 BLOCKED 基线

这些是外部条件，不可在结果中降级为通过：

1. 事件策略模板的 `reCompile` DSL 仍可能被资源写接口拒绝；等待后端统一编译契约。
2. 付费依赖声明不再要求可签策略或未签合同样本；验收只要求目标可作为依赖声明并读回，且前后双方合同为 0。支付、授权生效与运行时消费不纳入 CLI dev 验收。
3. 版本 POST 的“网络中断后结果未知”已有本地 recover 覆盖；若无可控中断环境，dev 真网证据保持缺口。

当后端或资源池条件变化时，先移除对应阻塞事实，再从第 3 节全量重跑；不能只补跑单条并改写历史结论。

## 7. 定向验收映射

| 改动位置 / 领域 | 最小定向验证 |
|---|---|
| `domain/version/form/attr.ts`、字段解析 | `form.test.ts` + `verify-field-rules.mjs` |
| `domain/version/form/option.ts`、类型能力映射 | `type-template.test.ts`、`form.test.ts` + `verify-optional-config.mjs`；主题/照片生命周期受影响时再跑 `verify-theme-image-full-lifecycle.mjs` |
| `domain/version/form/dep.ts` | `remaining.test.ts` + `run-resource-pool-scenarios.mjs`；改依赖声明或付费分支另跑 `verify-dependency-declarations.mjs` 与 `verify-paid-declaration.mjs` |
| `domain/collection/dependencies.ts` / `publish.ts` / 单品上游授权 | collection 依赖/发布/单品回归 + `verify-collection-dependency-declarations.mjs`；直接依赖不签约不查合同，单品上游缺 exact contractId 时提示网页处理且不猜映射 |
| `submit.ts`、`createVersion.ts`、`updateVersion.ts` | 相关 domain/scenes 测试 + `run-all-scenarios.mjs` + `verify-optional-config.mjs`；`verify-version-update.mjs` 接入后必须运行它 |
| `typePick.ts`、模板 API | `type-template.test.ts` + `verify-commands.mjs` |
| `init`、`create`、`bind`、状态解析 | init / identity / resolve 测试 + `verify-scenarios.mjs`；涉多资源或 TTY 则加 `verify-multi-resource-tty.mjs` |
| `pendingOperation.ts`、`recover.ts` | `pending-operation.test.ts` + 受影响版本提交流程；有可控中断时补 dev 恢复验证 |
| 主题/插件产物、压缩 | `zip-path.test.ts`、主题场景测试 + `run-all-scenarios.mjs` 或 `verify-commands.mjs`；若改动会触及主题发行或更新，再跑 `verify-theme-image-full-lifecycle.mjs` |
| `status`、`resource`、`bind`、listing、policy、online/offline | 相关 domain 测试 + `verify-resource-management.mjs` 接入后必须运行；多资源影响另加 `verify-multi-resource-tty.mjs` |
| 使用文档、help、发布包 | build + `verify:package`；无需 dev 写平台 |

定向验证通过只说明该改动面没有回归；它不覆盖第 4 节之外的共享行为。

### 7.1 标题同步JSON切片（实现与取证中）

正式预期见ARCH08 §4.2。新增`verify-resource-sync-json.mjs`，只用固定安装包、dev primary和自建隔离资源壳；它不发行版本、不操作资源池、不签约或支付、不改线上标题。前置通过CLI创建两份新单资源并经SDK独立读回；故障目标只在本次自建fixture中换为已先只读确认未返回资源详情的随机ID，不给用户提供手改身份的使用路径。资格仅认可HTTP404，或本次实际观察到的成功信封`ret:0/errCode:0/data:null`；401/403/5xx、其它业务失败或畸形响应不得推断目标缺失，保留观察并BLOCKED，不换样本。2026-10-16 22:18 UTC的真实tools-lib查询已观察到后一形状，未猜测错误码。

| 业务ID | 动作 | 必须精确证明 |
|---|---|---|
| `RESOURCE.SYNC.JSON.ALL_SUCCESS` | 两份缓存均设为与线上不同的旧标题，再执行sync JSON | 一个完整批次、exit0、stderr空；SDK独立标题与stdout及缓存一致，仅title变化，其余文件/线上字段不变。 |
| `RESOURCE.SYNC.JSON.PARTIAL_FAILURE` | 一份真实目标、一份受控不可见目标 | 完整批次exit1；成功项提交、失败项原字节不变，不把业务预期exit1当脚本崩溃。 |
| `RESOURCE.SYNC.JSON.ALL_FAILURE` | 两份受控不可见目标 | 完整批次exit1、成功数0，本地目录字节不变，不提交空事务或猜测成功。 |

三个叶子按序保留原始argv、进程、stdout/stderr、SDK响应事实和前后快照；预期由源码固定的evaluator重算，不填true替代。前置的login/init/create两次也核对固定命令、顺序、成功进程与create stdout返回的两个ID；不能用help或旧缓存替换真正建壳步骤。setup失败或中断时未执行项NOT_TESTED，失败保留现场，成功先记录证据再清自建临时工程，远端壳保留。故障资格与命令错误映射分开，HTTP404对应REQUEST_FAILED，成功但data:null对应RESPONSE_INVALID；不能换目标把失败变成功。线上不变断言只涵盖resourceId/userId/resourceTitle/status四项，不声称整个远端对象未变。

受控单测另覆盖四种选择器、零目标/未绑定/环境/冲突/孤儿稿的零请求门禁、N数值顺序、标题与ID/信封边界、恶意异常/toJSON、事务失败与前滚恢复、不改工作稿及人类文案。真实三样本不替代这些分支，也不消除`RESOURCE.MANAGEMENT_MATRIX`或`COMMAND.PARAMETER_CONTRACT`总gap。

### 7.2 Console双向已发布版本切片

本切片实现真实浏览器生产者，不消除两个INTEROP总gap。先复用同一候选、同一run已通过的主题/PNG生命周期原始观察，核对其CLI命令/安装bin和1.0.0、1.1.0完整表单；不得拿资源池或上次候选补前置。首次与更新版分别进入Console已发布版本页，不能用会优先载入并自动保存网页草稿的versionCreator页充当只读基线。

新增两个方向、两种类型的叶子：`INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED` / `PNG_PUBLISHED`、`INTEROP.CONSOLE_TO_CLI.THEME_PUBLISHED` / `PNG_PUBLISHED`。共同生产者为`verify-console-roundtrip.mjs`。前向逐字段核对两个已发布版本的系统附加值、自定义值/说明、空文本配置、下拉候选/默认值/说明、依赖ID与版本范围、描述，再通过实际网页编辑1.1.0的描述和文本配置，独立SDK读回确认只有指定字段变化。反向在独立临时目录login/bind，从网页保存后的已发布1.1.0拉稿，核对继承完整表单，再由CLI明确发布1.2.0，精确读回网页修改与其它字段均保留，检查身份、稿和pending收尾。

网页操作仅由真实浏览器工具执行，不用HTTP请求假装点击，也不读取token或应用私有store。生产者在本轮evidenceDir写带随机nonce的具体操作请求；收到同目录匹配nonce/run/bin/资源/版本/阶段的真实浏览器观察才继续。观察记录实际URL、时间、完整页面快照以及由可见字段/输入框读取的值，不写“看过了=true”代替数据。本地报告按源码重新核对观察、CLI输出、SDK投影及前后字节；这防误配和假汇总，不声称能对抗伪造整份原始浏览器记录。无人操作、登录/权限不足或观察缺失时明确BLOCKED/NOT_TESTED，不自行换资源、跳过网页、沿用旧capture或标PASS。

采集协议升为schema2，旧手组schema1不能通过，也不回填旧文件。源码固定的纯JS只读recorder在`cua_repl`里运行；只接收request和tab，不接收预期字段、派生字段或时间覆盖。每帧直接调用完整AX观察；可选配置/空描述帧另读取真实textbox的tag、placeholder、disabled、contenteditable、value及textContent。main、作者tooltip、文本/下拉弹窗和主题附加字段tooltip分别保留原返回和自动起止时钟；空描述须有实际空编辑框值，不靠缺文字补空。仅当前主题/PNG叶子支持这些固定profile，不建通用DOM或任意selector引擎。

evaluator从原始帧推导现有字段，逐一核对当前URL/版本、弹窗标题和禁用的键/名称、实际控件种类与读取方式；main正文的描述不能标作contenteditable。属性分类、配置方式标签映射、下拉默认首项和当前图片类型无附加项属于显式有限推导，须保留AX/输入控件或已确认类型profile依据；不把API隐藏值复制为页面值。原始JSON须完整原样归档，缺帧、重复、错modal、错误控件、过期/乱序、前后页面漂移、不可识别UI均拒绝后继写入。采集器自动时钟只证明这段实际调用的时间，不认证操作者；受控fake-tab/假时钟正控不是真实浏览器验收。

整轮两个类型共用20分钟预算；每个浏览器请求最多5分钟且不能超过总截止时间，SDK只读/登录最多30秒，单个CLI进程最多60秒且均受剩余预算约束。预算耗尽先落盘BLOCKED，不再发后继写入；未知写入不重试，保留本地和远端现场。测试以假时钟验证边界，不修改整个聚合器的30分钟进程上限来迁就失控等待。

SDK限时不仅停止await，还必须取消底层请求；Axios的idle timeout不能代替绝对截止时间。该隔离producer的SDK读串行执行，每次暂设本次AbortSignal/timeout并在finally主动abort、恢复公共实例原值。本机持续慢流回归需确认真实transport取消和连接关闭，不把替身收到timeout赋值当成取消证明；该回归不访问dev账号或外网。

账号与资源的读DTO必须分别投影：`User.currentUserInfo.data`实际字段是`userId/username`，不是`userName`；资源所有者为`Resource.info.data.userId`，授权标识为`resourceName`。同run资源身份、正整数userId与当前账号精确相等，username与已确认resourceName的owner段相等才允许网页操作。保留各接口实际字段名，不用大小写别名兼容来掩盖错误映射；缺字段仍FAIL并记录实际投影。Console实际读取与脱敏真网投影共同作依据。

owner的ID资格由源码根据实际正安全整数计算，不能让原始观察的同名元数据覆盖派生结论；即使重写raw与摘要也必须拒绝。选中的标识及ret/errCode若畸形为对象/数组，只保存invalidType，不能将嵌套HTTP诊断或凭据对象带进失败证据。合法username/ID仍原样比较，不放宽为别名或字符串数字。

只有正常完成全部类型后写出的本run完成信封及与cases一致的exit0/1/3，才能让聚合器保留各独立类型的原始结果；缺信封、异常退出、signal/timeout或矛盾状态仍拒绝。过程结果与业务case分开，不能因一类型失败抹掉另一类型事实，也不能把业务失败改成进程exit0。原始PASS仍按协议逐项重核。

独立SDK前后投影包括资源ID、版本、fileSha1/filename、description、完整自定义/可选描述符、系统附加值、dependencies及versionProperty；不把响应时间等可变元数据当业务字段。网页观察只证明其实际展示的字段，不能填入看不到的完整versionProperty或原始HTML；描述取可见文本，保存后的平台HTML由SDK另做精确比较。当前依赖卡片没有ID链接，实际显示的是可变标题、作者、范围，需逐项读取这些值；SDK按依赖ID独立查得resourceTitle和resourceName作预期，不能把标题当唯一身份，也不能把API的隐藏ID/完整resourceName伪装成网页观察。网页描述采用当前Console BraftEditor生成的明确HTML预期，不用任意HTML/文本归一化掩盖差异。其它原始值与候选顺序精确比较。下拉默认必须首项是正式规格，CLI与Console一致，不能制造非首项默认再误报平台缺陷；空文本默认值必须真的读取输入框空值，不能仅因页面无文字就推断。

生命周期前置在成功清理工作区前，仅将本次更新产物的文件/目录副本保存在本run evidenceDir，并记录相对路径及完整文件manifest摘要；不复制auth、身份、稿或其它工程文件。反向新目录只复制该副本并核对摘要，不下载/猜造另一份产物。`--reuse-version`仅选择拉稿来源，不免上传；1.2.0仍正常上传和分析。PNG SHA须与副本文件一致，主题为同目录重新临时打zip，允许容器SHA/临时文件名变化但仍验证本地内容、ZIP形态、MIME和表单值，不能承诺复用旧SHA。

当前实际Console源码(db7181ff)的description保存会补inputAttrs空数组，尚需真网核对后端是否清空；只记录风险，不按源码猜成已发生。已发布配置编辑会重发全customPropertyDescriptors，因此必须检验未编辑字段。任一阶段不符保留FAIL与工程/线上现场，该类型后继写入BLOCKED；其它独立类型仍保留自己的结果。禁止支付、签约、节点、prod、删除资源或编辑池内资源。新版本页全流程、插件、其它类型和真正Console新建资源仍是后续必需范围，不被本切片替代。

固定profile须先在保留位置的原始节点上确认属性→可选配置→依赖声明→描述→相关视图均唯一且有序，再核对完整成员、配置卡片顺序及其类型标签。主题只覆盖本切片的大小/MIME、两个附加项和作者；PNG只覆盖宽度/高度/MIME/大小和作者。多余属性不能按图片类型静默丢掉。非空描述只支持当前纯文本段落，任何link/image等未覆盖节点拒绝，不丢弃后再拼接文本。空描述只认可实际DIV contenteditable，其text及存在的value都须为空；实际工具返回value空串不伪装为null。每帧前后都核对未变的表单区块；未知UI停止后继写入。

### 7.3 单资源资料与上下架写入闭环

管理矩阵盘点发现`update`未做设计中的交互/确认/读回，`online/offline`未做确认/幂等/读回。先按管理02/05完善精确约束，再以实际命令与领域回归锁定；不能仅让mock直接返回成功或用HTTP200代替业务状态。SDK Node适配器本来就抛业务错误，不把所有API错误归因为被CLI吞掉。

范围是单资源三条写命令与readonly validate消费者，合集仅回归；不修Console options_问题、不动策略/版本/依赖规则、不改七gap。验收覆盖：

- listing无flag非交互/--yes拒绝，TTY逐项回车全保留零写；有flag仅改明确字段；空简介/标签清空；名称/长度/重复/封面边界与RSS三个字段门禁。
- 全输入校验和确认在上传/PUT之前；取消、非法tags加有效cover、缺yes、错owner/环境/冻结/损坏详情都零写；锁保护确认期间本地身份。
- 成功只一次PUT、整份listing+标识/status精确读回；错误ID/owner、未改字段被改、缺值、写失败/读失败均不缓存假标题，不重发。成功后本地只变选中标题，缓存失败另有安全说明。
- 上下架前置、已上架仍核验版本/策略、status0/4下架幂等、冻结/未知状态拒绝；TTY确认/取消、真实runCli透传yes、人类及JSON输出；写后错误/缺身份/非目标状态非成功。
- 用纯假凭据故障样本核对JSON不混人类输出、未知msg/cause/私有字段不泄漏。已有合集及CLI其它消费者回归。

本地回归只证明相应受控路径。固定新候选须再以primary、新隔离资源做资料整份修改→单字段/清空→封面→validate→上架→重复上架→下架→重复下架的精确SDK读回与本地字节检查；上架用已明确成功模板创建自己的策略，不签约/支付。完整参数/选择/恢复/跨端/平台仍须各自生产者，缺项仍阻止发布。

### 7.4 已发布主题/图片的资料与上下架候选验收

本轮先落实7.3的新代码真网证据，不缩小完整管理矩阵。登记`RESOURCE.MANAGEMENT.THEME_LISTING_SHELF`与`RESOURCE.MANAGEMENT.PNG_LISTING_SHELF`两叶子，分别由`verify-theme-resource-management.mjs`和`verify-image-resource-management.mjs`生产；共用`verify-resource-management.mjs`的执行器。两个独立进程避免一类型失败覆盖另一类型事实，不放宽Console专属完成信封或旧脚本退出契约。

前置只能是同候选、同run生命周期已PASS的相应新资源及保留产物，重读原始报告/sidecar、重算生命周期断言并核对安装bin字节。任何前置缺失，在读账号、建目录或请求平台前BLOCKED；不替换资源、不使用池或上次成功资源补测。用新临时工程登录，再按资源ID绑定及重复绑定；本轮只测单目标`--resource file:1.json`，多资源选择另行补齐。真实argv还必须通过批准命令注册树的只读parseOptions核验，不能仅让evaluator和fixture镜像同一个假旗标；`--help`可能绕过未知旗标校验，不能代替此检查。

| 顺序 | 动作 | 精确预期与禁止副作用 |
|---|---|---|
| 1 | SDK读取当前用户、资源完整公开管理投影及1.0.0/1.1.0业务投影；login/bind/重复bind | owner、授权标识、类型、未冻结及版本/启用策略先独立核实；bind不拉稿、不上传，重复bind本地字节不变。 |
| 2 | 无字段、有效封面+重复标签、有效简介但缺yes | 三条安装包命令分别拒绝UPDATE_NO_FLAGS、UPDATE_TAG_DUPLICATE、FORM_NEED_YES；stdout为单个精确JSON错误、stderr空；本地/公开管理字段/两版本不变。请求次数和零上传由本地故障回归证明，真网快照不冒充传输抓包。 |
| 3 | 标题/简介/标签整份修改、相同值重复、只改简介、明确清空简介/标签、上传封面 | 每步成功JSON精确到resourceId/changed/整份listing；未指定字段、状态、策略、资源身份、旧版本不变；只有实际改标题时允许1.json的title及其字节变化。封面动态URL须与独立SDK读回一致且为非空HTTPS，不能把任意其它变化当成功。 |
| 4 | validate、online、重复online、offline、重复offline | validate只读、精确输出；online变1、重复changed=false；offline变4、重复changed=false。本地所有字节、资料/策略及两已发布版本不变；真实幂等请求次数仍靠本地回归。 |
| 5 | `status --resource file:1.json --env dev`，不加`--json` | 按ARCH02 §1.1逐字核对三行及末尾换行：本地编号/短名/类型/产物、无工作稿、线上精确resourceId及latestVersion=1.1.0。完整stdout与stderr空串同时核验；前后本地字节、公开资料/策略、两已发布版本不变。不把成功JSON、上下架字段或完整status矩阵当成已支持。 |

每一步保留argv、进程结果、完整stdout/stderr、全工程文件摘要（身份另含原始文本）、SDK前后公开字段与完整版本业务投影；源码固定动作顺序和预期，协议重读原始文件/产物，拒绝跨run、错bin、删步、伪布尔、结果串错或快照篡改。两类共用每进程15分钟预算，CLI最多60秒、SDK最多30秒并取消底层请求；失败立即停止该链，保留工程及线上资源，不重试未知写入。只有成功且证据已写入才logout本工程选择器并清理自建临时目录。

每步三类before快照采集完成后，必须先与已确认前缀所推导的当前预期比较，再执行本步CLI；已观察到漂移时保留entry并停止当前动作，不等写后才报失败。比较后仍可能出现平台并发变化，不宣称原子性。清理前重新核对整份工程快照和工程auth存在；缺失/漂移即零logout、零删除，禁止让logout回退祖先或全局选择器。私有账号文件不存在/无法解析属于固定BLOCKED前置，未知运行异常仍FAIL，不输出解析片段。

完整管理余项仍包括：四种选择器与多目标/TTY、status其余等价类及show/list、bind换绑/产物/owner/工作稿保护、策略添加及开关/最后启用策略、无版本/零策略/冻结等拒绝、prepared/sending恢复与真正可控中断、插件及其它资源差异。上述两叶子不能消除`RESOURCE.MANAGEMENT_MATRIX`，也不替代跨端/跨平台、支付或签约；当前七总gap保留。

### 7.5 恢复与TTY补充（2026-10-18）

`resource recover`按ARCH02 §2.1.1同时核对响应resourceId/version/SHA。受控回归先证明错误ID、错误版本、缺失/畸形标识即使SHA相同也不能收尾；只读不确认、apply拒绝，两文件字节不变。正确详情保留只读/缺yes/显式收尾及旧v1、冻结资源成功正控；不同SHA、空详情与查询失败仍保留现场；prepared零API只清marker。此切片不以模拟接口声称真网未知POST已覆盖，也不消除恢复总gap。

用户已确认本地漂移收尾：精确远端成功后，只删已完成marker；当前稿改变或旧v1/v2无法证明未变则保留原字节并提示。新增v3原始稿摘要与payload同次读盘绑定；异步类型/属性校验期间改稿须零POST/零新marker；发送后及recover查询期间变化的SHA、属性/配置/依赖/说明/来源、空白或无效JSON均不得误删。未变v3、无稿、旧v1/v2、prepared、未确认、缺yes及冻结正反控分开；事务预期摘要冲突不创建新日志或删除另一份marker/稿。新根及候选须重做，模拟故障不声称真实未知网络已验。

还须分别证明操作与主体不能被换：本次prepared原始摘要约束sending转换及读回；prepared/sending被另一operation/version、稿摘要或legacy记录替换时零POST并保留replacement。选中A后磁盘N与稿变为自洽B（ID/类型/环境），或异步期间只改N而稿摘要相同，也必须拒绝；POST后及recover最后GET后身份变化不得误删另一主体稿/marker。真实help应说明只清本次marker、仅未变摘要才删稿，正常首版/更新输出及保留提示分别验证。

真实多资源TTY的`update --title`必须经过“选择资源→资料预览→确认写入→成功读回”的完整交互，不能仅选择后等待退出，也不加--yes跳过本次应验证的确认。测试驱动明确等待确认并发送肯定键、等待成功文案；缺确认/成功阶段、异常退出或超时均不通过。实际脚本步骤用受控装置回归，实际Inquirer/node-pty另验证；装置通过不冒充实际dev脚本通过。Windows异常进程退出须保留实际退出码与原始日志，不仅凭缺少确认就判定其native退出根因。

### 7.6 bind前置校验补充（2026-10-18）

按ARCH04/ARCH08以实际领域函数验证GET前门禁：损坏身份、重复ID/标识/路径、孤儿稿、身份错配稿、错误显式选择器、存活锁、事务冲突和未决远端操作分别为零`Resource.info`；本地完整字节不变，已有可恢复事务只按既有日志前滚，不冒充零写。正常GET必须已持锁，同调用链可重入，其它调用链在请求前被拒；GET期间外部手改坏状态时保留改变后的现场且不提交身份。网络异常释放本次锁，重试不自动发生；已有接续/多份新增/幂等/force、主题插件目录及合集分流继续回归。仅受控装置通过不称候选真网PASS，完整bind矩阵仍属父gap。

### 7.7 合集完整字段首次发布与更新（2026-10-19）

定向调度入口为`pnpm test:dev --candidate <development候选> --scope collection-lifecycle`；只读清单可用同scope加`--plan`而不带候选。源码固定调度现有主题/PNG/JPEG生命周期原子生产者，再调度合集生产者；其它生产者不运行，不探测无关TTY。完整目录/manifest不缩小，未选项NOT_TESTED，scope报告按run另存、不覆盖标准acceptance.json；历史41/42项run不改写。专项结果不能作完整发布验收，真实前置仍由合集producer重读同run原始文件核验。

固定叶子`COLLECTION.LIFECYCLE.FIRST_UPDATE`及`verify-collection-lifecycle.mjs`按合集测试§8.3执行：同候选同run主题/PNG生命周期原始证据重新核验后，才用这两个本run本人资源做线上单品。新建支持配置的合集，首发及更新同时包含系统附加值、自定义属性、文本/下拉配置、依赖范围、说明和六项展示，并验证两个单品的增加、重命名与移动；每次完整读回真实信封、表单描述符、授权映射及按totalItem读完的发布/草稿目录。

安装bin/run/预算、固定argv及完整进程输出、本地稿/身份字节、发布后清理分别有证据；不使用写DTO冒充读值，不伪造成功信封。来源只临时上架，成功后恢复原下架；失败即保留，不重发未知请求或继续清理。合集本身不隐式上架，后台无支持类型/来源时BLOCKED，不省略非必填字段。正常链不替代T-42/43故障恢复、其它管理命令、浏览器或平台矩阵，七项父gap仍保留。

### 7.8 合集安装包受控故障恢复（2026-10-20）

`COLLECTION.RECOVERY.INSTALLED_MATRIX`对应正式合集测试§8.4及C09.F01～F12。固定`collection-recovery`诊断scope只运行一个producer，实际执行21场景×4个安装包子进程；预先证明隔离装置后，才使用合成身份、本机平台完整表单/非空授权排除与两单品目录。SDK经过真实安装包，网络只能到本机服务；不访问真实账号、原生凭据库或dev/prod资源。

分别覆盖发送前prepared/sending、未提交/已提交断连、明确拒绝、重复发布拒绝、只读检查、显式收尾、变稿/坏稿/后来新稿、错误读回及无关事务。核对必要GET集合、至多一次PUT及完整body、精确退出/错误JSON、原始阶段文件与本地应变/不应变字节；报告绑定同run/bin/候选，不能只靠两个记录流相等或汇总布尔判成功。原始缺失/篡改、错绑定、误删变稿、意外崩溃、越界IO必须拒绝。该专项不是平台真实中断、TTY、Console或全部管理验收；其它必需项继续NOT_TESTED，七父gap保留。

默认resume的事务零写必须经过完整CLI全局hook验证，独立子命令或领域只读测试不足；apply缺yes也不得先由全局短锁前滚。源码局部修复不能覆盖旧包的真实FAIL，修后安装包证据另取且不得重发原未知请求。本机scope不检查/读取真实私有dev输入，真实账号scope仍保留其前置。

### 7.9 C03显式单品安装包本机矩阵（2026-10-21）

固定`collection-items`诊断scope运行`verify-collection-items.mjs`的33场景，叶子为`COLLECTION.ITEMS.INSTALLED_MATRIX`，按正式合集测试§8.10。真实安装包入口/SDK，隔离合成身份和只到本机的白名单；不接触私有dev文件/原生凭据库。场景含来源、判重、合同128/缺失/角色、100/101实际ID、添加结果分组/坏回读/提交后断连，以及只读授权乱序/101分页/坏响应/冻结；失败完整保留本地与线上前态，未知POST至多一次，不发布、不签约、不支付。固定argv/完整进程结果、有序请求及送达响应、草稿/发布目录前后和完整本地原字节逐项重算；原始文件缺失、变更、错bin/run/时间或自报PASS均不能放行。装置控制和synthetic fixture只验校验器，不是业务批准；安装包执行另记活动交接。交互来源、搜索/过滤、真实TTY/真网/Console仍未由该叶子证明，七父gap保持。

## 8. 每次报告格式

C07按正式§8.18登记`COLLECTION.PUBLISH.PREVIEW_TTY`，固定9场景＋原生探针由`collection-publish-preview`范围执行。完整字段/授权、真实确认取消、TTY yes实际stderr、非TTY yes无预览、纯目录、改key/顺序、101目录及C1/方向转义分别证明。采集物理终端与实际stream.write原字节，独立预期不导入生产formatter；完整预览须在问句和intent前可见，不能仅搜标题。实际pid/时间/run/bin/raw及全状态核验，信号/截断/错误通道都拒绝，不代替C08模式/真实dev/其它平台。

C08按正式§8.17登记`COLLECTION.PUBLISH.PREFLIGHT_INSTALLED`，固定48个非TTY安装包场景（24显式、8默认、15写前变化、缺确认）。独立模型在第二次规则GET前注入变化并记录位置/前后态；旧快照不可变，发布变化通过新快照呈现。另采实际intent持久化事件，失败零intent/PUT，成功prepared→sending及源稿/完整请求摘要一致，读回/收尾精确。固定`collection-publish-preflight`范围不探测私有输入；原始与源码语义绑定后才可局部PASS，不证明C07实际TTY/平台并发/父矩阵。

C05按正式测试§8.16登记`COLLECTION.RULES.INSTALLED_MATRIX`，34个固定非TTY场景由`verify-collection-rules.mjs`运行，诊断范围`collection-rules`。包含读取初态/坏DTO、完结与自动独立保留、四条件映射/叶子资格、第二页目录差异、写信封与断连/读回故障、未确认及冻结/RSS、五种自动模式手工目录拒绝。逐项保留真实进程、完整本地/home、SDK与模型前后态并源码重核；仅本机装置，不证明实际自动匹配/终端取消/T30发布模式，父gap不变。

按正式§8.12登记`COLLECTION.ITEMS.SELECTION_TTY`，12场景覆盖取消/提交/确认否、翻页/筛选/隐藏选择移除、Ctrl+C/禁选、晚到冻结/归属变化、100上限与TTY下JSON缺参。固定`collection-selection`范围同时运行正式§8.14的`COLLECTION.IDENTITY.INSTALLED_MATRIX`：C01身份33场景覆盖类型三交互入口、创建/取消/未知与本地收尾、bind、目标选择及未登录拒绝。两生产者各自核原生探针、真实进程/按键、完整SDK请求响应、本地字节和模型前后态，raw逐项绑定摘要/时间/pid/bin/run；本机工作区联调只能是CONTROL_ONLY，不能登记候选PASS。实际安装包/执行状态看交接，七父gap不缩小，不用本机装置代替真实dev或Console。

C02按正式§8.13登记`COLLECTION.EDIT.INSTALLED_MATRIX`，生产者`verify-collection-edit.mjs`固定30场景。覆盖四编辑/六sort、跨页完整集合、错误写信封、部分删除/额外变更、确认后变化、未知写不重发及入口错误；每项保存实际进程/请求响应和完整本地/目录前后。`collection-edit`集成scope在同run运行该生产者及C03真实选择，复用已隔离传输，不访问真实账号或修改平台。原始证据通过独立源码语义重算才可局部PASS，整体缺口和支持平台义务继续保留。

C03交互来源按正式测试§8.11单独验收：缺来源非TTY/JSON在完整入口事务前拒绝；50分页/搜索/层级筛选/多选100、禁选/取消/安全展示及选后目标/来源变化分别验证。局部注入测试与命令快照不替代安装包node-pty证据，不能用已通过的显式33场景叶子声明这些交互已验；尚无真实生产者时仍为NOT_TESTED。

每次验收记录源码内容指纹、候选包/安装 bin、manifest、平台/Node、起止时间、用例结果与证据、资源和进程收尾。明确区分 PASS、FAIL、BLOCKED、NOT_TESTED；只有完整必需清单有有效证据时才能称完整通过，不得把脚本级 PASS 数量当功能覆盖率。旧聚合器存在字段漏记与模板失败可被替换的缺陷，其历史脚本级结果不作为新候选的发布认证，具体规则见[研发交付契约](../docs/研发交付规范/README.md)。
