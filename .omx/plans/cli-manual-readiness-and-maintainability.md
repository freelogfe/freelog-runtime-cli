# CLI 手测前可维护性与业务收敛计划

状态：计划；尚未开始本计划中的实现改动。  
设计真源：[DESIGN.md](../../DESIGN.md)。  
架构真源：[packages/cli/src/ARCHITECTURE.md](../../packages/cli/src/ARCHITECTURE.md)。

## 1. 目标与边界

在人工验收开始前，让维护者可以从产品规则追到命令、服务、平台写入、本地回写和回归测试；同时保持现有 Console 对齐和 CLI 原生恢复语义不变。

本计划不把“代码行数变少”当目标，也不在首次手测前对身份、状态事务或远端创建逻辑做无证据的大规模重写。

### 产品业务模型

1. **三种发行模式**：单资源、批量独立资源、合集。它们分别对应一个工程、多个独立子工程、一个合集及有序条目，不能互相复用错误的生命周期。[DESIGN.md](../../DESIGN.md) §三种发行模式。
2. **四种持久化组合**：工程、命令会话、Studio 多账号工作区、交互会话。切换模式不能改变 owner、授权、冻结或版本门禁。[DESIGN.md](../../DESIGN.md) §工程模式与会话模式、§双维持久化。
3. **核心生命周期**：init/bind → create/update → version intent → publish → policy → online；`draft`、`pull`、`diff` 是意图和平台事实之间的显式协调，不是隐式同步。
4. **Console 对齐**：对齐字段含义、平台状态、权限、门禁和最终结果；不复制页面、拖拽、弹窗或云存储 UI。每项证据由能力矩阵的 `SPEC/CODE/CONTRACT/ENV` 分开记录。[CLI 数据操作与 Console 对照](../../docs/新方案/对齐/CLI数据操作与Console对照.md) §1。
5. **CLI 原生能力**：模板、构建、确定性压缩、dry-run、批量报告、JSON/NDJSON、session/Studio 都是正式能力，必须有可说明的副作用和恢复模型，而不是 Console parity 的例外。

## 2. 当前事实与优化原则

- `commands/` 只做参数、TTY 和输出；业务用例在 `services/`，启动装配在 `bin/`。见 [ARCHITECTURE.md](../../packages/cli/src/ARCHITECTURE.md) §分层、§运行时调用链。
- 工程和会话使用同一 `ProjectStore` 业务端口；工程侧以 manifest/state 的事务、锁和 revision 保证安全。见 `services/store/types.ts`、`config/project/store.ts`、`config/project/projects.ts`。
- 已登记的合集、初始化、依赖读取仍直接使用 config facade。它们不得被假称为已端口化；列表见 [ARCHITECTURE.md](../../packages/cli/src/ARCHITECTURE.md) §当前有意例外与待端口化边界。
- 当前发布门禁包含单元、类型、i18n、兼容、构建、打包 CLI smoke 和 pack，但真实 dev 场景、RSS、P6/frozen 与完整 parity 仍是独立环境验证。见 `packages/cli/package.json` 的 `verify*` scripts 与 [手动测试](../../docs/新方案/验证/手动测试.md)。

优化原则：

1. **先锁行为，再抽结构**：每个抽取前先补覆盖当前状态转换的测试；禁止“边改边猜”。
2. **按业务边界拆，不按文件大小机械拆**：每个模块只拥有一种状态机、DTO 映射或平台边界。
3. **远端写入优先可恢复性**：非幂等请求必须有确认、报告或对账路径；禁止用 catch-all 当作“未执行”。
4. **一个事实一个 owner**：产品规则在 DESIGN，Console 事实在证据文档，字段在 schema/字段账本，环境结果在日期化报告。
5. **手测是验收，不是调试器**：进入人工验收前，静态/单元/契约/本地 smoke 必须先绿；环境前置缺失必须写 skip，不得伪造 pass。

## 3. 实施波次

### Wave A：人工手测前的低风险收敛（必须先完成）

#### A1. 固化业务主链与手测输入

**改动范围**：

- `docs/新方案/验证/手动测试.md`
- `docs/新方案/验证/场景目录.md`
- `docs/新方案/对齐/CLI数据操作与Console对照.md`
- `packages/cli/tests/documentationGovernance.test.ts`

**工作**：

1. 将主路径按单资源、工程型、bind、批量、合集、授权、P6、RSS 的依赖顺序编号，修正当前 M8/M7 的阅读顺序。
2. 每个手测项标出：输入夹具、预期远端变化、预期本地变化、不可自动完成的 Console/邮箱前置、清理要求。
3. 强制把 `ENV` 未验证、frozen fixture 缺失和 RSS 邮箱缺失写成未签字/skip，不让自动化总数掩盖它们。

**验收**：

- 新维护者不查源码即可按顺序执行每条主路径。
- 文档治理测试覆盖主路径顺序、证据分类和外部前置声明。

#### A2. 为人工阅读建立稳定的“业务入口 → 测试”索引

**改动范围**：

- `packages/cli/src/ARCHITECTURE.md`
- `docs/新方案/README.md`
- `packages/cli/tests/architectureBoundary.test.ts`

**工作**：

1. 在现有调用链后追加“业务动作索引”：create、publish、draft、policy/online、batch、collection、session/Studio、RSS 分别链接服务入口和关键测试。
2. 标注每个动作的副作用等级（R0/L1/T2/P3/D4）、恢复模型和是否需要 Console 接力。
3. 架构测试只验证稳定边界与文档存在，不用字符串测试代替业务测试。

**验收**：

- 阅读者可从任一命令在两次跳转内找到 service、Store、平台调用和测试。
- 架构文档不再使用“所有 service 都已经端口化”之类与代码不符的绝对表述。

#### A3. 清理当前高密度文件中的纯函数边界，不改变对外行为

**改动范围**：

- `config/project/projects.ts`
- `config/project/store.ts`
- `services/resource/publishVersion.ts`
- `services/batch/prepare.ts`
- 对应 `tests/*`

**工作**：

1. 只抽取已有的纯 DTO 映射、意图差异比较、文件扫描/准备、发布阶段计划等无副作用函数；保留现有公开 facade，避免命令调用面变化。
2. 每个抽取后的编排函数保留完整阶段名：preflight、artifact、upload、payload、remote write、local commit/recovery。
3. 不在本波次改变 manifest/state schema、锁策略、远端 API 请求顺序、JSON/NDJSON schema 或恢复状态枚举。

**验收**：

- 对每个抽取点补“原输入 → 原输出/错误码/平台调用次序”回归测试。
- `pnpm verify` 与 targeted publish/batch/storage tests 全绿。
- `git diff --check` 无格式问题；新模块名表达业务职责，不使用 `utils`、`common2` 一类容器名。

#### A4. 将测试门禁分为本地确定性与环境签字两层

**改动范围**：

- `packages/cli/package.json`
- `packages/cli/scripts/verify-*.mjs`
- `docs/新方案/验证/手动测试.md`
- `docs/新方案/验证/reports/_template-*.md`

**工作**：

1. 保持 `pnpm verify` 为无凭据、可重复的本地发布门禁；不把有远端副作用的 dev 场景偷偷塞入其中。
2. 新增或统一 `verify:readiness`：运行所有确定性单元、架构、schema、Console form snapshot、包产物 smoke；输出当前 commit、CLI 版本和 dist hash。
3. 保持 `verify:scenarios`、`verify:parity`、`verify:rss`、P6/frozen 明确独立，并由日期化 ENV 报告记录，skip 必须独立计数。

**验收**：

- 不带账号时能稳定运行 `verify`/`verify:readiness`。
- 带账号的脚本不会被误称为 release gate；报告不会记录密码、token、cookie。

### Wave B：首次手测通过后的端口化与结构演进（不抢在手测前进行）

#### B1. 引入专用 CollectionStore，消除合集写入例外

**改动范围**：

- `services/store/types.ts`
- 新建 `services/store/collectionStore.ts` 或等价聚合端口
- `services/collection/{owner,maintenance,publish,platform,items}.ts`
- `config/project/projects.ts`
- `tests/architectureBoundary.test.ts` 与 collection tests

**决策**：新增聚焦的 `CollectionStore`，而不是把当前 resource/version 专用 `ProjectStore` 扩张为包含大量可空方法的万能接口。

**验收**：

- 合集 owner、listing、目录草稿、publish 的 manifest/state 读写只走 CollectionStore。
- 除 init 和明确的纯意图读取外，service 不再直接 import config/project facade。
- 集合的 revision、transaction、remote-write-confirmed 语义与资源侧一致。

#### B2. 以“状态机拥有者”为单位拆分大文件

**改动范围**：

- `config/project/projects.ts`（resource/version/collection DTO 与 patch/revision 边界）
- `config/project/store.ts`（path/gitignore、snapshot transaction、schema access 边界）
- `services/resource/publishVersion.ts`（preflight、artifact plan、remote publish/recovery）
- `services/batch/prepare.ts`（scan、subproject preparation、batch create/version reconcile）

**验收**：

- 每个模块只有一个可叙述的所有权；公共 facade 兼容但不再同时承担 mapping、网络、恢复和终端展示。
- 远端请求发生点可通过 `rg 'FServiceAPI|Resource\.'` 在少量明确模块定位。
- 每次拆分只有一条业务链的行为变化，且有 mutation-oriented 负向测试。

#### B3. 让真实环境验证成为可审计的补充，而不是隐式依赖

**改动范围**：

- `test/run-all-scenarios.mjs`
- `packages/cli/scripts/verify-*.mjs`
- `docs/新方案/验证/reports/`

**工作**：

1. 每个真实写入场景输出稳定 case ID、创建的 resource/collection ID、cleanup 状态和报告路径。
2. 将 P6、RSS、session/Studio 的 external prerequisites 写成显式条件；无法满足时产生 skipped，而非 pass。
3. 对 Console 源码快照、CLI commit、环境、账号角色建立一份不可覆盖的 run manifest。

**验收**：

- 任一“对齐完成”结论可追到一次日期化报告、case ID 和 Console 证据。
- 真实验证失败可定位到产品规则、API 契约、环境前置或 CLI 实现之一。

## 4. 风险与控制

| 风险 | 控制措施 |
|---|---|
| 重构状态存储改变并发/恢复语义 | Wave A 禁止动事务与远端写顺序；Wave B 每一步保留 facade 并执行 storage/recovery/chaos 负向测试。 |
| dev 验证污染账号或资源 | 不自动运行有副作用脚本；测试使用仓库外目录、受控账号与日期化报告。 |
| 文档再次形成多个真源 | 产品范围只写 DESIGN；Console 事实只写证据；字段只写 schema/账本；结果只写 reports。 |
| 为了 DRY 建立万能抽象 | CollectionStore 与 ProjectStore 保持聚焦；先提取纯函数，不新建无所有权的 helpers。 |
| 人工手测把环境问题误判为代码问题 | 每项强制记录 env、账号、fixture、CLI/dist hash、远端 ID 和 cleanup。 |

## 5. 手测交付条件

在 Wave A 完成后，才交给人工手测。交付包必须同时满足：

1. `pnpm verify`、`verify:readiness`、字段/表单契约测试均通过；
2. 手动测试按依赖顺序可执行，且每项有本地/远端断言和清理说明；
3. 功能外部前置（RSS 邮箱、frozen fixture、Console 支付/验证码）明确列为签字条件或 skip；
4. 维护者可从 [ARCHITECTURE.md](../../packages/cli/src/ARCHITECTURE.md) 找到任意主链的入口、状态边界与回归测试；
5. 无凭据、报告、临时项目或测试资源残留在仓库工作树。

## 6. 后续执行顺序

1. A1、A2：先让测试人员和代码阅读者拥有单一入口。
2. A3：只进行有测试保护的低风险抽取；每一个领域单独提交/验证。
3. A4：把本地确定性门禁和环境签字分开。
4. 进行第一次完整人工手测并写日期化报告。
5. 手测确认业务语义后，再执行 B1 → B3；不以结构整洁为理由跳过真实验收。
