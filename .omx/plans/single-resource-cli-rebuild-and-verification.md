# 单资源 CLI 重建与全量验证计划

状态：待执行。本文是后续实现的唯一执行基线；产品契约以 `docs/一期/产品方案/业务梳理/字段级校验对照表.md` 为最高优先级，脚手架设计仅在与其一致时生效。

## 1. 交付目标与非目标

将 `packages/cli` 重建为一个只支持**单资源**的 CLI：账号、工作区本地状态、普通资源与主题/插件 `init`、`bind`、创建、首版/新版本、属性/可选配置/依赖、策略和管理命令具有单一、可恢复的实现；所有本地可验证场景均由自动化测试覆盖。

这不是“在旧实现上加兼容层”。现有源码只可作为平台调用、字段校验和已验证测试的参考，不能反向限制新架构。实现完成后不保留自制加密凭据、`--scaffold`、`artifactMode`、无判别状态的版本草稿、按数组第一项自动选择策略、平台版本草稿调用或已经废弃的入口。

范围：单资源、普通资源、主题（`RT001`）和插件（`RT002`）。模板仅安装固定版本的线上 npm 包并复制 `template/`；本期不渲染、不安装依赖、不构建。合集、批量、多工作区 session/studio、支付和浏览器 OAuth 均不在范围内。

## 2. 已确认的可验收契约

1. 秘密只在操作系统凭据库；工作区 `.freelog/auth` 和全局 `auth-default.json` 只能保存凭据选择器。凭据库不可用时登录失败，绝无文件加密或明文回退。见 `ARCHITECTURE/01-账号.md`。
2. `init` 不创建线上资源。普通资源必须解析当前启用、`subjectType=1`、最终叶子类型；支持逐级选择、搜索选择、直接输入/`--type` 校验。主题/插件类型固定，不要求登录。见 `ARCHITECTURE/03-init.md`、`PHASE/单资源/创建/01-Step1-创建授权条目.md`。
3. `N.json` 只存身份及最小立项信息，未绑定时不得预写 `name`；`N.version.json` 必须有 `schemaVersion` 和 `draftKind`，并维护文件 SHA/分析、属性、可选配置、依赖、描述的完整不变量。见 `ARCHITECTURE/02-本地状态.md`。
4. 所有 `.freelog` 写入采用同一把独占锁、同目录临时文件 + 原子替换、多文件事务日志与可证明的恢复；初始化只回滚自己创建的内容，不能删除并发产生的未知文件。见 `ARCHITECTURE/02-本地状态.md` §2.1、`ARCHITECTURE/03-init.md` §4。
5. `create-version` 仅首版，`update-version` 仅已有版本；提交成功删除相应工作稿，失败保留。字段形状和边界值严格等于字段级校验对照表。
6. 依赖未授权时展示所有可签约的启用策略，由用户选择；非交互/`--yes` 必须给精确 `--policy-id`。可选择外部付费策略并得到 `authStatus=128`，但 CLI 不处理支付；发版不以 `isAuth` 或“授权完成”作客户端拦截。见 `版本表单/03-依赖.md`。
7. 所有场景以用户视角的 S1–S55 为验收目录；场景与命令、领域服务、测试必须可相互追溯。见 `场景/真实场景/README.md`。

## 3. 目标结构与切换原则

### 3.1 模块边界

以以下边界替换当前“命令、平台、磁盘规则互相穿透”的实现：

```text
commands/            参数解析、TTY 交互、展示和退出码；不写业务状态
application/         一个用户动作一个 use case，组织读写顺序和恢复点
domain/              类型选择、身份、工作稿、版本、依赖等纯规则与状态机
ports/               PlatformPort / CredentialStore / WorkspaceStore / Clock / UI
adapters/platform/   tools-lib API DTO 映射、超时和错误归一
adapters/credential/ 系统凭据库的唯一实现及测试替身
adapters/workspace/  锁、事务、schema、文件系统原子写入和恢复
schemas/             Zod 磁盘 schema、命令输入 schema、平台响应 schema
```

领域层不得直接 import `FServiceAPI`、`node:fs`、Commander 或 Inquirer。平台写请求只发生在 application 层经 `PlatformPort` 发起；所有本地状态仅经 `WorkspaceStore` 进入磁盘。

### 3.2 不保留旧包袱的方式

先在新边界下写测试和实现，再逐条将命令切到新 use case；完成某个领域的端到端切换后，立即删除其旧实现与测试中的旧行为断言，禁止双写、双读、隐式 fallback 或“暂时兼容”的并行状态机。旧凭据和旧工作稿不迁移、不解密、不转换：显式 logout / discard 后再建立 v1 状态。

可复用的仅限：字段级校验的事实、无副作用的 SHA/zip/DTO 纯函数、tools-lib 的稳定调用封装和已证明正确的测试夹具。所有复用必须由新测试证明，不以旧模块路径作为公共契约。

## 4. 实施波次

每一波先写/更新该波验收测试，再完成实现；每波结束运行其目标测试、全包 typecheck，最后才进入下一波。若旧代码与本计划冲突，以删除和替换为准。

### Wave 0：建立重建基线、可观测错误与测试夹具

**涉及**：`packages/cli/src/{commands,application,domain,ports,adapters,schemas}`（新目录）、`packages/cli/tests/{contract,unit,integration,e2e}`、`packages/cli/package.json`。

1. 制定稳定 `CliError` 码、JSON 错误形状、取消/TTY/非交互语义和脱敏规则；命令层只将领域错误翻译为展示。
2. 从字段级对照表生成/手写表驱动夹具：每个字段的合法最小值、上界、格式、跨字段约束、预期平台 payload 与错误码；不以文档字符串测试替代行为测试。
3. 建立 `PlatformPort` 的可编程 fake，记录调用、payload、顺序、失败点；建立临时目录、锁竞争、损坏 JSON、崩溃恢复和 TTY 的公共测试工具。
4. 为 S1–S55 建 `scenario-id → command/use-case → test file` 追踪表；缺失的场景先标为 failing test，不能标成已实现。

**退出条件**：测试能在无网络、无真实凭据下重放所有平台响应；任一失败能由稳定错误码和操作阶段定位；无真实 secret 出现在测试快照、日志或 fixture。

### Wave 1：账户、凭据选择器与平台认证边界

**涉及**：替换 `src/local/auth.ts`、`domain/account/*`、`platform/bootstrap.ts`、`commands/account/*`；新增 `ports/credential.ts`、`adapters/credential/*`、选择器 schema 与迁移测试。

1. 以一份小型跨平台验证原型确定并锁定可随 CLI 分发的系统凭据库适配器；必须覆盖 Windows Credential Manager、macOS Keychain、Linux Secret Service，失败即报 `CREDENTIAL_STORE_UNAVAILABLE`，不允许文件回退。适配器只暴露 `get/set/delete(credentialKey)`，业务层不接触库特有对象。
2. 实现不含秘密的工作区/全局 selector：向上寻找最近 `.freelog/auth`，命中后绝不回退全局；环境不符、格式损坏、凭据不存在均失败并显示修复命令。
3. 实现 TTY 与 stdin 登录、15 秒超时、一次读取密码、取消与网络/认证失败零副作用；已有目标 selector 不覆盖，必须 logout 后再 login。
4. 实现 logout 的精确 selector 删除与无引用凭据清理；不删除任何 `N*.json`、工作稿或非本次 key 的凭据。
5. 旧 `.freelog/auth`/`~/.freelog-auth` 若带 token/cookie/密文字段一律报“重新登录”；只有显式 logout 可删除目标文件。新代码不含解密、旧密钥或旧格式转换逻辑。

**退出条件**：扫描源码与测试输出，找不到固定 AES key、token/cookie/password 磁盘字段或日志；所有 selector 优先级、环境隔离、旧文件拒绝、vault 拒绝和非 TTY 分支均有测试。

### Wave 2：工作区状态内核与恢复模型

**涉及**：替换 `src/local/{types,identity,draft,resolve,template}.ts`；新增 `adapters/workspace/*`、`schemas/workspace.ts`；调整 bind/version 调用方。

1. 实现严格 v1 schemas：未绑定身份允许仅 `subject/typeCode/filePath`；绑定后才有 `resourceId/name/env`；`prod` 不落盘；`N.template.json` 仅模板缓存字段。
2. 实现有判别的 `VersionDraft`：`initial|update`、身份快照、来源版本、文件/分析 SHA、孤儿输入属性、属性/配置/依赖和两个恒空数组；所有读写先做 schema 与业务不变量校验。
3. 实现原子独占锁、同目录 temp + flush + rename、校验和事务日志、进程存活判断和启动恢复；index 永远由身份主本重建。锁、事务和恢复对 init/create/bind/版本编辑/提交清稿共用。
4. 旧/无 schemaVersion 的工作稿只读报错、保留原文件并给出 discard/pull 恢复路径；`bind --force`、身份重建和模板失败要按照设计同步清理 draft/template cache。

**退出条件**：并发、陈旧锁、崩溃在多文件写入中、损坏/旧 schema、index 冲突均不会丢失或猜测用户数据；初始化/绑定前的 identity 不含 name。

### Wave 3：统一资源类型解析与安全 `init`

**涉及**：替换 `domain/create/typePick.ts`、`domain/init/scaffold.ts`、`commands/project/{init,type}.ts`、`domain/init/templates.ts`；新增类型解析与 staging 测试。

1. 将“树形逐层选择、搜索叶子、精确 code 校验”实现为同一个 TypeResolver，供 `init` 与 `create` 使用；仅接受 `status=1 && subjectType=1 && isTerminate=true`，拒绝父级、停用、未知、模糊名称和不支持 subject。
2. 命令面为 `init [dir] [--type <leaf-code>]`；`--resource-type` 只作一个发布周期的弃用别名，两个参数同时出现报错；删除 `--scaffold` 及其全部类型和帮助残留。TTY 无 `--type` 才进统一选择器；非 TTY 缺参失败。
3. 普通 `init` 通过认证读取最新类型，但绝不创建资源；主题/插件固定 RT001/RT002、不读账号且不出现类型选择。
4. 模板从固定清单给出的 npm 包和版本下载，验证包名/版本、只复制 `template/`；绝不执行脚本、渲染、安装或构建。`projectName/projectVersion` 只写 `N.template.json`。
5. 使用目标外同文件系统 staging、初始化锁和二次空目录检查；失败只清理本命令登记的路径，目标不存在时优先 rename，已有空目录时绝不删除并发未知文件。

**退出条件**：普通、theme、widget 三条 init 主链与所有失败路径均可在临时文件系统复现；tar 包损坏/错版本、并发写入、取消、锁冲突和网络失败不会留下半工程或状态。

### Wave 4：身份创建、绑定、环境与管理读取

**涉及**：替换 `domain/{create,bind,status,management}`、相应 commands 与平台 DTO 映射。

1. `create` 在提交前重新验证 init 的类型、认证账号和 owner 语义；资源创建成功才原子补齐 `resourceId/name/env`，失败不污染身份。处理已有同名、已有壳无版本、已有版本的明确接续提示。
2. `bind` 远端核验 id/name/type/owner，支持同 id 幂等和 `--force` 换资源；换资源按 Wave 2 原子清除关联 draft/template cache，身份冲突不猜测合并。
3. 统一 prod/test/dev 选择、平台 client 装配、环境和 selector 一致性校验；每个命令只在真正需要平台前读取一次凭据。
4. 管理/状态命令永远读取平台当前事实，不把策略、listing、已发版本或线上标题缓存进 `N.json`。

**退出条件**：创建/绑定/环境错配/owner 不匹配/网络失败的远端调用顺序和本地回写均由 fake platform 断言；只读命令零本地写入。

### Wave 5：文件、工作稿、字段表单与版本状态机

**涉及**：替换 `domain/version/{file,gates,submit,createVersion,updateVersion}.ts`、`domain/version/form/*`、`commands/version/*`；保留并迁入已验证字段规则。

1. 实现文件路径确认、主题/插件临时 zip、SHA、上传、平台分析和 120 秒解析上限；上传成功立即把 SHA 写入工作稿，失败保留可恢复稿。
2. 按 `analyzedSha1` 实现系统属性重解析、兼容项保留和不兼容项进入 `orphanedInputAttrs`；TTY 显示确认，`--yes` 对孤儿项失败。属性、可选配置和描述的字段/跨字段规则逐项对齐字段级校验对照表。
3. 将 `create-version` 和 `update-version` 写成独立 use case：首版不能用于已有版本，更新不能用于无版本；更新稿只相对本次 `--reuse-version`/latest 判定；成功 POST 才删除稿，所有失败保留稿。
4. 版本 payload 只从已验证 v1 工作稿构造，禁止使用平台版本草稿或把线上版本内容偷偷写进 identity；提交前再读远端 latest 处理竞态。

**退出条件**：字段表每一行都有正反例与准确 payload 断言；首版、更新、草稿覆盖/续用/冲突、文件变化、zip、超时和提交竞态在无网络集成测试中通过。

### Wave 6：依赖、策略与上架边界

**涉及**：重写 `domain/version/form/dep.ts`、`commands/version/dep.ts`、策略/上架 domain 与 tests；保留最新“显式策略选择”实现的行为作为回归输入。

1. 文件依赖、资源依赖、范围变更和删除全部使用 v1 工作稿；识别自身依赖、版本范围/已发版有效性、基础依赖与字段对照表中的限制。
2. 未授权时只从 `status=1` 且有 policy id 的候选中选择：TTY 显示完整列表，`--policy-id` 精确验证，`--yes`/非交互缺值失败；签约成功直接写草稿。绝不取 `policies[0]`。
3. 允许外部付费策略签约结果 `authStatus=128` 留在草稿；不提供付款/支付引导；提交不调用授权完成门禁、不因 `isAuth`/auth status 拒绝。
4. 自有资源策略管理严格限制其产品范围；策略的新增、调整、上/下架与依赖选择不能混为同一流程。

**退出条件**：多个策略、选择取消、无可签策略、非法 policy id、非交互、签约失败、付费待处理、已授权和提交后草稿清理均有回归测试；代码检索没有任何第一项策略兜底或授权完成 gate。

### Wave 7：命令切换、删除旧实现与发布级验证

**涉及**：`commands/index.ts`、帮助/README、所有旧模块及其替换测试、`package.json` scripts、根文档索引。

1. 将每个公开命令切到新 application use case，统一帮助、TTY、`--yes` 和 JSON 输出；以 S1–S55 更新场景映射。
2. 删除被替代的 local auth AES、旧 `scaffold`/`artifactMode`、旧 draft shape、过期命令选项、死代码和只证明旧行为的测试。更新或删除与新单资源范围矛盾的文档，而不是保留“历史兼容说明”。
3. 新增 `verify:unit`、`verify:integration`、`verify:architecture`、`verify:scenarios` 和聚合 `verify`；本地 `verify` 不要求真实账号或网络。真实平台 smoke 独立且只在显式环境变量/专用账号下运行，绝不进入默认门禁。

**退出条件**：源码检索确认旧概念和过期参数不存在；完整测试、类型检查、构建、打包后 CLI help/smoke 全绿；每个 S1–S55 均有通过、显式跳过理由或明确的非本期范围标记（本计划目标是零未映射）。

## 5. 测试策略与最终门禁

| 层级 | 证明内容 | 必须覆盖 |
|---|---|---|
| 单元 | schema、字段规则、状态转换、payload、错误码 | 字段级对照表全部正反例；类型叶子规则；草稿不变量；依赖策略选择 |
| 适配器 | 平台 DTO、凭据库、原子文件、锁/事务 | 超时/401/403、vault 拒绝、selector 优先级、崩溃恢复、迁移原子性 |
| 集成 | 一条 use case 的本地状态 + fake 平台顺序 | init/create/bind/首版/更新/策略/上架；失败后可续作 |
| CLI e2e | Commander 参数、TTY/非 TTY、stdout/stderr、退出码 | `--type`/弃用别名冲突、`--yes`、stdin 密码、`--policy-id`、无状态残留 |
| 场景 | 用户从开始到结束的体验 | S1–S55，含主题/插件与多资源同目录 |
| 发布 | 可安装产物 | `pnpm pack` 后从临时目录执行 `freelog-cli --help` 与关键离线 smoke |

最终必须连续通过：

```text
pnpm --filter @freelog-cli/cli2 verify
pnpm --filter @freelog-cli/cli2 pack
<临时目录安装包后的 CLI help + init/theme/widget/错误路径 smoke>
git diff --check
```

额外的静态反证检查必须为零：固定/可推导 AES key、token/password/cookie 写文件、`--scaffold`、`artifactMode`、`policies[0]`、授权完成 gate、平台版本草稿 API、`init` 中创建资源 API。检索只作防回归补充，不能代替上述行为测试。

## 6. 主要风险与控制

| 风险 | 控制 |
|---|---|
| 原生凭据库在某个平台无法随 npm 产物分发 | Wave 1 先做 Windows/macOS/Linux 安装与读写验证；不满足三端则更换适配器，绝不以文件“临时替代”。 |
| 文件系统原子 rename/锁行为跨平台不同 | 所有文件操作放进单一适配器；Windows 锁竞争、崩溃事务、已有空目录并发写入用真实临时目录测试。 |
| fields 文档与平台 DTO 不一致 | 字段级对照表为输入，PlatformPort 契约测试锁 payload；发现 SDK 事实冲突先更新设计/对照表和测试，再实现。 |
| 重建遗漏已有命令 | Wave 0 的命令清单和 S1–S55 映射作为删除前检查；命令只能在对应场景全绿后切换。 |
| 测试污染真实账号/凭据 | 默认 fake platform、in-memory credential store；真实 vault 测试写测试专用 key 并在 finally 精确删除，真实平台测试显式隔离。 |

## 7. 完成定义

1. 所有单资源命令均由新边界实现，源码不存在旧状态/账号/init/版本双轨；
2. 产品设计、字段级对照表、命令帮助、payload 和测试相互一致；
3. S1–S55 均有可追溯自动化结果，默认验证不依赖网络或真人凭据；
4. 默认 `verify`、打包 smoke 与 `git diff --check` 已在最终代码上重新运行并保留结果；
5. 任何未能自动验证的真实平台前置都单独记录为环境验证，不以本地测试通过替代。
