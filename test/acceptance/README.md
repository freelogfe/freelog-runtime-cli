# 结构化验收边界

本目录把“脚本正常退出”和“产品用例已验证”分开。它是当前发布门禁的覆盖下限，不是完整功能清单，也不承诺已覆盖全部命令和组合。正式流程见 [研发质量契约](../../docs/研发交付规范/README.md)。

`catalog.mjs` 保存经复核的义务与生产者、必需断言标识。现有 14 条脚本保留为 `legacy-suite`：退出 0 只证明进程完成。命令参数、完整版本更新、资源/合集管理、Console 双向往返及支持平台矩阵仍有明确缺口，初始化为 `NOT_TESTED`。带 `gap` 的义务即使有人在报告中填入 `PASS` 也会被拒绝；必须先实现用例并复核目录，不能填几个成功布尔值绕过。

## 执行

```sh
# 只列覆盖义务，不读取账号，不操作线上
node test/run-final-acceptance.mjs --plan

# 工作区调试：不是发布证据；真实 dev 副作用须已有授权
node test/run-final-acceptance.mjs --env dev

# 对 release:prepare 产生的固定安装包验收；不重建或回退 dist
node test/run-final-acceptance.mjs --candidate .artifacts/release/<id>/candidate.json --env dev
```

候选报告写入该候选目录的 `acceptance.json`；每次运行有独立 `runId` 和 `evidence/<runId>/`。候选文件在运行前后都重新核验。development候选和非候选模式均为 `releaseEvidence:false`、`releaseApproved:false`，不能发布；非候选模式写系统临时目录。运行失败、用例失败、阻塞或未测试均为非零退出；没有“忽略失败”参数。

`FREELOG_TEST_CLI_BIN` 仅由候选聚合器传递，所有子脚本通过 `cli-bin.mjs` 使用同一个绝对入口。显式入口无效就失败，不回退工作区；候选模式禁止构建。TTY 的 Inquirer 也从安装包解析，能力探针在单独、有超时的自有进程内运行，不依赖 node-pty 私有字段、不结束用户进程。

## 报告协议

候选聚合报告使用 `schemaVersion:2`，包含 `environment:dev`、实际 `purpose`、`sourceRevision:{commit,tree,clean}`、`releaseEvidence`、源码摘要、tarball SHA-512、安装 bin、`runId`、`evidenceDir`、开始/结束时间、本地目录摘要、`cases`。子生产者的case文件与原始观测仍各为schema 1，不是旧候选schema的兼容入口。状态只有 `PASS / FAIL / BLOCKED / NOT_TESTED`。

目录只接受 `legacy-suite` 与 `product-case`，gap不是另一种更弱的case。无gap必须有实际普通生产者文件；目录稳定去重执行生产者，一个脚本的多个业务case必须完整上报，不自动生成LEGACY。每个结果用稳定 `id` 对账；缺失、重复、未知 ID 和断言都失败。`PASS` 必须有目录要求的非空成功断言。子进程的 error、signal、空退出码和超时不可能被当成预期业务拒绝。非 PASS 必须给出原因；不会从 DSL 错误字符串推断是后端责任。

真实产品 case 的每条断言有精确 `expected`、`actual`，结果另绑定本轮证据文件的绝对路径、SHA-256、runId、caseId 和原始观测。文件缺失、被换、跨运行、越界、符号链接或断言不一致均拒绝。合集模板逐个保留结果；另一模板成功不能替代失败样本。真实 TTY 模板数量不足第二页时只证明首页取消，跨页项仍为 `NOT_TESTED`，不能假装翻过页。

原始文件摘要只证明绑定，不证明业务事实。每个可PASS的业务ID必须有源码登记的语义核验分支；未知ID没有默认放行路径，不能仅删gap、登记生产者并写一份自洽的expected/actual文件。

临时工程仅在该场景所有断言成功后清理；失败、阻塞、未知结果保留工程并打印路径，不再由 `finally` 无条件删除。公共清理器再次校验系统 Temp 内真实自有前缀目录；发现版本 pending、事务 `.txn` 或合集发布 intent 就拒绝删除，包括声明“成功”的场景。TTY 退出保留 signal，信号终止不因 exitCode 恰好为 0 而变成成功。

发布检查从独立候选文件获得源码/包/bin/候选目录绑定，从当前 `catalog.mjs` 重算清单摘要，最长认可 24 小时内的证据。报告不能自行提供“信任我的清单”或延长有效期。上述机制用于防止错误流程和误报，不宣称能对抗有权限者故意篡改所有代码和证据。

候选发布检查另外要求schema 2的 `delivery.json`，绑定源码固定的9条设计/目录义务与真实双路审查原始记录，详见质量契约。规则与case是不同身份，可多对多映射；每条映射不能重复、缺失或引用别人的case，全部业务case都须归属。它不生成 case PASS、不消除 gap，也不替代上述真实 dev 报告。`test/quality/fixtures/delivery.mjs` 明确只产生 synthetic 测试数据，不得用于交付或复制成真实审查结果。测试必须精确命中新增门禁的错误，不依赖原有7项缺口替负例救绿。

发布入口另实时读取GitHub固定源码的CI与当前保护审批状态，只接受 `fixed-source-current-policy` 范围明确通过；这不是合并时历史权限审计，也不是同tarball跨平台验收。fixture传输只用于隔离单测，不是远端成功证据。网络等待后重新检查源码、包、验收及审查原始记录，未知/不可见项阻止发布。

## 新增用例

先从正式设计确定正常/异常、字段、状态、副作用和清理，再给出稳定 ID 与实际执行生产者。通过 `writeSuiteCases` 输出机器结果，逐字段读回，而不是扫描日志中的 `PASS`。增加质量工具负例，独立复核后才把相应 `gap` 变为已实现项；不能只删除缺口、修改断言或添加空测试名字。

命令参数先实现可隔离的本地切片：非法环境、`version show --local`与已发号冲突、策略启停方向冲突/缺失、账号设计01规定的六种非TTY登录缺参数输入，以及七种logout选择器边界（详见[差集§6.4～6.5](../验收覆盖差集-2026-10-19.md#64-s02账号入口的首个参数等价切片)）。code/message及成功输出另外锁定技术映射：十一种拒绝核退出1、完整错误JSON、空stderr、工程不变；logout核完整工作区/home及固定选择器摘要，只能删除精确目标，其余字节/目录不变，缺目标则拒绝。logout在原生keyring加载前替换为拒绝装置；文件保护仅覆盖当前字符串readFileSync/unlinkSync，改API前先扩装置和反例，不是通用沙箱。全部核网络guard且零attempt，不使用真实账号。只证明这十八例，不覆盖成功登录、凭据库写入、其它合法输入/参数/环境或远端状态，`COMMAND.PARAMETER_CONTRACT`总gap保持。未知旧flag/缺必需参数属于Commander纯stderr通道，不能虚构统一错误JSON。

账号绑定另加[差集§6.6](../验收覆盖差集-2026-10-19.md#66-s02选择器键与凭据读取)四例，参数生产者现共二十二例。复用的保护文件改名为account，并增加有限selector模式；仅允许读本例owned work/home的选择器，固定输入摘要、实际来源、零凭据/回退/网络、完整工作区/home均重核。旧十八例及logout禁读语义不变；没有原生库成功读写或真实dev认证的证明。凭据缺失/坏值/库故障等另有内存单测，不与安装包层混称。

版本专项先把现有主题、PNG、JPEG首版→更新链变成三个独立叶子：每条同链包含自定义属性、文本/下拉可选配置、依赖、说明，以及适用的系统附加值；完整线上JSON按字段核对，不凭产物名关键词。覆盖1.0.0/1.1.0、拉稿、换产物、成功删稿和身份路径回写，保留本轮原始读回。子集运行、前置/任一步失败或阻塞时，其它叶子仍明确NOT_TESTED，不能因summary exit0变成PASS。插件/预制包/bind/bump/reset/未知结果等范围尚需各自叶子，`VERSION.UPDATE_MATRIX`总gap保持，不将三个样本当全矩阵。实现装置之后还必须用实际安装包和授权dev账号取证。

叶子还核对源码固定的真实argv、必需成功步骤的顺序/唯一性/退出0，以及两个 `version show` 原始stdout与派生DTO的完全一致；不能只写正确标签、把成功步骤改成预期拒绝或塞入旧版本JSON。诊断文本用 `evidence-redaction.mjs` 作秘密防线，不用于规范化业务DTO或掩盖失败；类型能力仅在成功且精确的类型详情行上判断，请求失败或未知输出为FAIL，不归因后台不支持。

标题同步专项新增三个叶子：两份自建资源缓存的全部成功、部分失败、全部失败。完整批次JSON、退出码、stderr、SDK独立基线、原始文件字节与只改title均由源码重算；业务预期exit1不等于脚本失败。故障ID只在自有测试fixture中注入，先观察HTTP404或成功信封data:null，不把认证失败/服务器错误当资源缺失。它只核对四个声明的线上字段不变，不替代整个资源管理矩阵，详情见DEV计划§7.1。缺原始观察、改写布尔或换bin均拒绝。

Console专项新增主题/PNG各两个方向的4叶子，共享一个真实浏览器桥接生产者：同候选同run的首版/更新版查看与定点保存，以及网页保存后CLI拉稿/继承/发新版本。不能复用旧capture、把接口数据当网页值，或只靠同名sidecar存在。最终协议重读原始生命周期、保留产物、request/capture并重算业务断言，绑定当前run/evidenceDir及真实安装bin摘要。synthetic正控仅证明校验器，不能代替实际跨端测试；两个INTEROP总gap仍在。操作和超时规则见[测试入口](../README.md#console-双向已发布版本切片)与DEV计划§7.2。
