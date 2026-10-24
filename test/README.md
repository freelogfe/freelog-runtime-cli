# CLI 测试入口

先读[研发交付规范](../docs/研发交付规范/README.md)和[DEV 覆盖计划](DEV-全流程测试计划.md)。测试分为“本地自动化”“真实 dev”“跨端/跨平台”“候选包发布验收”，不能互相替代。

七项必需验收的有限差集和生产者边界见[覆盖差集](验收覆盖差集-2026-10-19.md)。先按差集补有业务差异的分支，不反复重跑成功正常链宣称全覆盖。

## 本地检查

```powershell
pnpm verify
```

包含质量工具自测、CLI 单元/场景/架构和批准命令快照、类型、构建、安装包与手册逐字节检查。不会用真实账号或发布 npm；依赖安装可能访问 npm。没有独立 lint/行覆盖率检查，不虚报。

CLI Vitest 统一 setup 为每项用例安装独立内存凭据库，并在原生 keyring 入口拒绝宿主访问。仅修改临时 cwd/home 不足以隔离系统凭据库；不得用真实凭据验证单元故障，也不得在测试中解除该原生守卫。该机制不覆盖另起的 CLI 子进程；真实账号测试必须走下面的独立 dev 流程。

## 安装包登录的隔离验证

类型与已有产物立项的局部安装包验证：`pnpm test:dev --candidate <development候选路径> --scope type-init`。固定24场景包含类型完整祖先路径、50条本地分页、树/搜索/编号选择、失败响应和已有文件/主题目录init；其中5项使用真实node-pty菜单。仅用合成账号、隔离home和本机只读接口，不读取私有测试输入，不请求真实dev或原生凭据库。模板下载、Ctrl+C、全部参数搭配及完整S03不在本片覆盖内；其它必需项仍NOT_TESTED，专项报告不能批准发布。

准备候选后，将`FREELOG_TEST_CLI_BIN`设为其精确安装入口、`FREELOG_TEST_RUN_ID`设为本次唯一标签、`FREELOG_TEST_SUITE_REPORT`设为已存在证据目录下的全新绝对JSON路径，执行`node test/verify-account-login.mjs --env dev --skip-build`。该固定十场景使用真实node-pty、隔离home和封锁网络后的合成认证/凭据替身；不是平台真实登录。完整记录失败场景，成功才清自己临时目录；不接受任意用例/接口参数。该生产者也注册在完整验收中，但其通过不消除七项总gap。

`node test/verify-native-credentials.mjs --report <全新绝对路径.jsonl>`使用相同安装入口另测当机原生后端：实际写入随机UUID服务名下的公开合成值，然后核读回、覆盖、删除与最终消失。它会操作系统凭据库，**只允许独占本次新命名空间**，不会读取或删除正式账号；不随根测试或完整验收自动执行。JSONL每阶段追加并fsync，原生操作前持久化自身服务标识，只有带finishedAt的完整尾条才是最终结果；清理失败为FAIL，保留精确服务标识，不枚举清库。它是能力诊断，不注册产品PASS，不能代替CLI生产适配器或真实账号验收。

## 固定候选包 dev 验收

```powershell
pnpm release:prepare
pnpm test:dev --candidate <上一步输出的candidate.json路径>
pnpm release:check --candidate <同一路径>
```

准备阶段不改版本、不发布；它先执行本地检查，再生成并隔离安装固定 tarball。验收只执行候选 bin，禁止退回 workspace dist、重建或换包。具体副作用：新建 dev 资源、上传、发行首版/更新、策略及上下架；遵守每个脚本的自有资源收尾规则。不改池内目标、不签约、不支付、不碰 prod。

当前完整业务覆盖仍有缺口，所以即使旧 14 脚本都退出 0，新门禁仍会拒绝发布。不是把已正常完成的步骤说成失败，而是明确区分“旧脚本结果”和“缺少的产品验收”。

查看不执行账号请求的清单：

```powershell
node test/run-final-acceptance.mjs --plan
```

## 私有输入

合集发布真实终端预览专项：`pnpm test:dev --candidate <development候选路径> --scope collection-publish-preview`。安装包原生探针＋9个固定场景，核完整预览、实际按键/取消及stdout/stderr通道；只用合成身份/本机模型，不读真实私有输入。缺node-pty保持BLOCKED，不将装置fixture或C08的非TTY结果当真实TTY通过。

合集发布写前专项：`pnpm test:dev --candidate <development候选路径> --scope collection-publish-preflight`。固定48个非TTY模式/复核场景，本机合成状态和隔离传输，不探测私有输入。会核实际intent持久化、完整PUT与前后字节；不是C07终端预览/取消、真实并发或完整发布验收。

收录规则专项为`pnpm test:dev --candidate <development候选路径> --scope collection-rules`：固定C05的34个非TTY安装包场景，合成账号/本机传输，不探测真实私有输入。覆盖边界见正式测试§8.16；不是实际自动匹配、TTY取消、发布模式或完整C05验收，未选项保留NOT_TESTED。

身份与交互选择集成为`pnpm test:dev --candidate <development候选路径> --scope collection-selection`：固定运行C01身份33场景与C03选择12场景，各生产者自带隔离env的原生node-pty探针；无需私有dev输入，缺PTY保持BLOCKED。它不是实际平台写入或其它平台/完整合集验收，报告按scope/run独立保存。仅在生产者和场景就绪后准备候选，不为交接回填循环打包。

目录编辑集成为`pnpm test:dev --candidate <development候选路径> --scope collection-edit`：固定运行C02的30场景及C03的12个真实终端场景，在同一安装包/run检查目录写入精确结果、确认竞态及共享选择入口。仅合成身份/本机传输，不读取真实dev输入；非完整发布证据，未执行项仍NOT_TESTED。

本机安装包诊断可运行`pnpm test:dev --candidate <development候选路径> --scope collection-items`（C03，33场景）或`--scope collection-recovery`（C09恢复）。两者都使用合成凭据和本机传输，不要求/读取真实私有输入、不做平台写入；不是完整dev验收。报告另存scope/run，未执行义务继续NOT_TESTED且不能发布，规则见[合集测试门禁](../docs/一期/产品方案/脚手架设计/PHASE/合集/测试/00-功能拓扑与证据驱动测试门禁.md)。

- `test/.freelog-test-credentials.local.json`：已有 `primary`，仅该账号可发行管理；密码经 stdin，不能打印。secondary 不参与写入。
- `test/.freelog-test-resource-pool.local.json`：依赖目标清单，默认只读，不将池内资源当测试源，不改其策略。资源元数据不是凭据，但完整真网报告不进 Git。
- `test/.freelog-test-optional-config.local.json`：明确后台支持可选配置的叶子 typeCode 与真实匹配 artifact。用 `discover-optional-config.mjs` 和 `type info` 核对能力，不根据资源名字猜测。
- 凭据/可选 fixture 受忽略保护。CLI 认证由当前账号实现管理；不要按历史 AES 文件说明手改或复制认证。

## 结果与证据

`test/acceptance/catalog.mjs` 定义预期目录，`protocol.mjs` 校验结果，`cli-bin.mjs` 统一被测入口。目录目前明确包含旧脚本进程项、少量结构化业务项以及尚未完成的必需专项；它不是已经穷举完成的全部参数清单。

候选目录 `acceptance.json` 记录 case ID、PASS/FAIL/BLOCKED/NOT_TESTED、源码/包/bin/manifest、时间与本轮证据目录。产品 PASS 要有实际断言值与证据文件绑定；缺失、重复、错误、过期和未接入专项均不能通过发布。日志文本不决定责任归属。

| 退出码 | 含义 |
|---|---|
| 0 | 当前执行目标通过；是否可发布还必须由 release:check 独立验证。 |
| 1 | 已执行用例失败或装置/报告错误；查看原始证据。 |
| 3 | 证据不完整、平台/素材阻塞或必需用例未测；不是 PASS。 |

旧报告保留当时事实，但只证明对应源码与当时脚本；不能移作新候选的验收。日志可能含资源标识，只保存在忽略/临时目录；不得粘贴 cookie、token、密码、认证链接。

## 定向排查

合集完整字段诊断可使用固定范围（实际执行须新development候选）：

```powershell
node test/run-final-acceptance.mjs --scope collection-lifecycle --plan
pnpm test:dev --candidate <development候选路径> --scope collection-lifecycle
```

只调度`verify-theme-image-full-lifecycle.mjs`和`verify-collection-lifecycle.mjs`，前者保留主题/PNG/JPEG三条原子链。不是任意脚本过滤器；前置失败时合集自身仍须在凭据访问/写入前拒绝。只用本run新资源，不复用旧run；其它用例完整保留为NOT_TESTED，不做与本范围无关的TTY探针或Console操作。报告另存`acceptance.collection-lifecycle.<runId>.json`，不覆盖完整acceptance.json；即使专项全部通过，完整目录仍未验，退出3而非完整PASS。定向报告不能批准发布，完整验收仍使用不带scope的命令。

`verify-collection-lifecycle.mjs`由候选聚合器在同run单资源生命周期之后执行，新增一个完整字段首次发布/更新的业务项。它复用本run自建主题/PNG作为线上单品，不使用资源池写入；实时类型不支持系统附加值或文本/下拉配置则阻断，不省略字段。每次发布保存全部表单、授权排除映射及完整目录分页并由源码重算；失败保留现场，成功后恢复来源下架并清理自建工程。合集保持下架，策略/真正上架、异常恢复及完整管理矩阵仍须另验，七总gap保留。某次固定候选通过只证明其本次输入和场景，当前证据与缺口见活动交接，不因脚本登记或旧PASS宣称新输入已验。

合集发布恢复另有固定本机故障专项：

```powershell
node test/run-final-acceptance.mjs --scope collection-recovery --plan
pnpm test:dev --candidate <development候选路径> --scope collection-recovery
```

只运行`verify-collection-recovery.mjs`，通过实际安装包及内置SDK验证21类场景，每类固定发布、重复发布、只读检查、显式收尾四步。固定合成账号、替换凭据库和受控本机HTTP服务，不读取真实账号，不向dev注入故障，不需要TTY；`--env dev`仅决定SDK目标，由隔离装置转发到本机。完整表单、非空授权排除和两单品目录须精确核对；未知结果零重发，当前变稿/坏稿/新稿不得误删。报告另存`acceptance.collection-recovery.<runId>.json`，其它目录义务保留NOT_TESTED，专项通过也不能批准发布。失败或仍有未决记录的自建现场保留；不据此声称真实平台中断、Console或跨平台通过。脚本已登记不等于当前候选已执行，最新事实见活动交接。

例如 `node test/verify-theme-image-full-lifecycle.mjs --env dev --only jpeg` 可重现单条类型链；不带候选属于开发证据，不能批准发布。重大共享/协议/状态变更或用户要求全流程时使用上面的固定候选流程。

一次测试包含属性、可选配置和依赖，要在同一资源首版和更新版分别精确读回。只看到一个字段、只发首版或只检查退出码不算完成。Console 双向回显与编辑另外验收，API JSON 不能代替浏览器。

### Console 双向已发布版本切片

`verify-console-roundtrip.mjs` 由候选聚合器在生命周期生产者之后执行，同run复用其新建主题/PNG的1.0.0、1.1.0与保留产物。它不是可对任意资源执行的修复脚本，缺前置就BLOCKED，不能拿旧候选/池内资源补位。尚不覆盖真正Console新建、网页草稿、新版本编辑器、插件或其它类型，两个INTEROP总gap保留。

执行时AI需同时操作真实浏览器。聚合器首先输出本轮 `Run evidence directory`。由于子进程stdout会被捕获，`BROWSER_REQUEST`只能在结束后的日志看见，不将其当实时通知：AI需在该目录查找 `console-roundtrip-*.request.json` 中尚无同名 `.capture.json`、未过期且run绑定正确的请求。请求指定唯一响应路径、资源/版本/阶段与截止时间；AI在实际Console完成指定查看或保存，从页面和控件取得原始观察后一次性写入对应响应。先看两个已发布版本，再改1.1.0描述、文本配置默认值及说明；SDK独立前后读回全部业务字段，任一不符停止该类型的后继写入。反向在新临时工程bind/pull网页已保存的1.1.0，保留全表单并用CLI发布1.2.0。不会调用网页草稿接口。

响应使用schema2，绑定本次`runId/nonce/cliBin/binSha256/resourceId/resourceKind/version/stage`。操作人不填写`visible/readings/observedAt/axSnapshot`，只用源码固定的只读recorder取得完整AX原返回及实际弹窗控件，自动记录每帧时钟，完整输出JSON后原样归档；evaluator再从原始帧推导字段和来源。旧schema1拒绝而非迁移，工具输出不完整就BLOCKED，不人工补快照或复制上一阶段来源。空默认值实际读输入框，依赖只读UI标题/作者/范围，不用SDK隐藏ID或fixture补页面值；认证信息、私有store和登录链接不进响应。具体profile、空值和有限推导见DEV§7.2；受控正控、实际工具正控和完整候选验收分别报告，不互相替代。

实际浏览器采集由AI完成，不让用户编写证据JSON：

1. producer在本run证据目录生成`console-browser-recorder.js`和具体request。将文件中的自含函数原文声明到`cua_repl`；函数源码摘要必须与仓库导出函数一致，不用eval或字符串代码生成。把完整request作为参数，复用已绑定tab：`let recorder = createConsoleBrowserRecorder(request, tab)`。
2. 按下面的表揭示真实UI，每次操作后确认当前AX内容已加载，再调用`await recorder.frame(kind)`。它只读，不负责点击、填写或保存；显示提示层、取消或本阶段明确授权的保存仍使用浏览器工具。每种frame一次，完成本阶段再`recorder.finish()`，不得把旧帧/旧nonce接到新请求。

| frame | 采集时的可见页面 |
|---|---|
| `main` | 指定已发布版本，配置/描述编辑器和属性提示层均关闭。 |
| `author` | 点击可见“验收作者”标签，确认提示层完整显示名称、键和说明；不点提示层的编辑。 |
| `text-option` | 文本配置编辑弹窗，禁用名称/键、说明和默认值已加载；采完取消。 |
| `select-option` | 下拉配置弹窗，全部候选及默认首项提示已加载；采完取消。 |
| `system-target` / `system-tool` | 仅主题：分别显示目标版本/打包工具属性提示层，不修改属性。 |
| `empty-description` | 仅首版空描述：打开添加描述，读取空DIV编辑器，再取消，不能保存空描述。 |

3. 完整响应可以直接输出JSON；较大时用Node内置`node:zlib`的gzip和`node:crypto`的SHA-256做纯数据传输，不能借此换浏览器驱动或读私有store。将`JSON.stringify(recorder.finish())`的UTF-8字节无损压缩，输出原始字节数、原始SHA-256及base64分段；不要输出各字段后再重建capture。接收端核对全部分段及解压后的字节数/摘要，才以`wx`一次写入request指定的capture路径。总原始响应≤5MB。截断、复制差异或过期时不继续网页写入，也不修改原始字段“修证据”；已有完整工具结果只允许重新无损传输同一字节。摘要只能证明复制完整，不能认证操作者。
4. parser在完整AX原返回上检查工具首尾元信息、唯一有序区块、属性/配置/依赖的完整成员及提示层锚点；不识别的UI拒绝。生产者先验raw，再读SDK核对完成前缀，任何一步失败均不发出后继浏览器请求。两种资源都有实际工具正控后，仍需固定新候选/新run完整执行所有阶段；只读探针不批准跨端保存或发布。

整轮20分钟、每次网页最多5分钟、SDK最多30秒、CLI最多60秒，并受剩余预算约束；超时/登录/权限/观察不可用时保留BLOCKED，不能重试未知写入或编造capture续跑。协议会重读生命周期sidecar、保留产物和所有request/capture原文件，核对bin字节后重算断言。具体字段/操作与缺口见[DEV计划§7.2](DEV-全流程测试计划.md#72-console双向已发布版本切片)。

正常完成后才写本run/producer完成信封，退出码仍按业务结果为0/1/3。一类型失败不覆盖另一类型的真实结果；只有完整报告、合法信封和正常实际退出一致才保留独立case，过程异常或缺/错信封仍全部拒绝。每个PASS的原始业务重核没有因此放宽。

### 主题/图片资料与上下架切片

生命周期之后、Console之前，聚合器分别运行`verify-theme-resource-management.mjs`与`verify-image-resource-management.mjs`。二者复用同run新建资源及保留产物，在新临时工程用安装包login/bind；独立SDK先核对owner、两已发布版本及启用策略，再执行输入拒绝、整份/单字段/清空/封面资料编辑、validate、两次上下架及最终只读status三行文本核验。不是对任意资源执行的修复工具，不允许通过参数换目标或用旧成功前置续跑。

每步保存完整stdout/stderr、精确JSON/错误码、全工程摘要及公开管理/策略和两版本业务字段；协议按源码重算并重读本轮原始文件、产物和bin。真网快照不等于HTTP抓包，不能证明零PUT/零上传次数；这些由故障回归另证。每类型15分钟共享截止，失败停止后继并保留现场，成功先写证据再logout自建选择器/清理自建目录，线上资源保留下架。两条独立生产者不改变旧进程及Console完成信封规则。细节见[DEV计划§7.4](DEV-全流程测试计划.md#74-已发布主题图片的资料与上下架候选验收)。

这只覆盖单目标、显式旗标、主题目录/PNG的指定链；完整选择/bind/status其它等价类/show/list、策略、恢复、插件、TTY/跨端/跨平台仍待补齐。七项总gap没有消除。

## 当前历史与收尾

- [系统属性真实验收](DEV-系统属性真实验收-2026-10-15.md)记录本轮修复的主题/PNG/JPEG 链与原始边界；其中旧聚合器结果不是新发布认证。
- [无合约依赖试验](DEV-无合约依赖试验-2026-10-13.md)只证明声明与合同分离，不证明消费授权。
- 素材在 `fixtures/`；真实 JPEG 为文本 fixture。主题预构建素材不等于模板项目自身构建/运行时验收。
- 删除了固定个人 Windows 全局 0.5.3 包路径的过时验收脚本；Git 可追溯。不再将个人机器旧包当当前候选。

临时目录只清理脚本自己创建且路径核验通过的目标；失败保留现场并记录资源/进程状态。不要为了绿色结果删除工作稿、重试未知 POST 或把坏模板换成另一个成功模板。
