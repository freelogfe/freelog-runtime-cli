# Freelog CLI 一期深度审计报告

> **角色：** 一期（资源发行域）设计与实现的结构性只读审计。  
> **范围：** `packages/cli` + `DESIGN.md` + `docs/新方案/{对齐,使用,验证,开发}`。  
> **方法：** Evidence / Inference / Unknown 分级；发现项 `F-*` + 严重度 P0–P3。  
> **版本基线：** `@freelog-cli/cli2@0.5.0`；对齐矩阵证据 commit `d74121e…`（[对齐/CLI数据操作与Console对照.md](../对齐/CLI数据操作与Console对照.md) L7）。  
> **最后更新：** 2026-08-21

---

## 0. Executive Summary

### 0.1 整体判断

Freelog CLI 一期在 **资源/合集发行** 域已达到 **可交付 dev/test 环境** 的成熟度：分层架构清晰、91 个单元测试文件、23 个 verify 脚本、对齐矩阵 SPEC+CODE+CONTRACT 覆盖完整。主要短板不在「功能缺失」，而在 **Agent 机器契约稳定性**、**默认 CI 门禁覆盖**、**npm 包 README 与真实命令面脱节**，以及若干 **ENV 签字未完成** 的 CORE/ADVANCED 能力。

| 维度 | 评分 (1–5) | 置信度 | 一句话 |
|---|:---:|:---:|---|
| 产品设计（DESIGN + 对齐） | **4.5** | 高 | 能力矩阵与门禁定义完整；ENV 维度诚实标注待 fixture |
| 代码实现 | **4.0** | 高 | services 分层 + 恢复状态机成熟；JSON `command` 字段不一致 |
| 测试与验证 | **4.0** | 高 | 金字塔厚实；`verify:json-envelope` 未进默认 `pnpm verify` |
| 文档治理 | **3.0** | 高 | `使用/` 有测试门禁；`packages/cli/README.md` 严重不完整 |

### 0.2 Top 10 发现（按严重度）

| 排名 | ID | 严重度 | 摘要 |
|:---:|---|:---:|---|
| 1 | F-001 | **P0** | JSON envelope `command` 字段不稳定（`type`/`scaffold`/`version`/`draft`/`collection rss` 等） |
| 2 | F-002 | **P1** | `verify:json-envelope` 不在默认 `pnpm verify` 内，JSON 契约回归可静默漂移 |
| 3 | F-003 | **P1** | `packages/cli/README.md` 命令表遗漏 validate/doctor/diff/release/config 等 15+ 公开命令 |
| 4 | F-004 | **P1** | `pull` / sync 无 dedicated 单元测试；R-05 冲突路径回归风险 |
| 5 | F-005 | **P1** | package preset 验收暂停（DESIGN + verify S8b skip）但 CLI 仍暴露 `init package` |
| 6 | F-006 | **P2** | R-06 frozen CORE 门禁：CODE+CONTRACT 有，ENV E2E 仍 SKIP（NEG-10 / P6-4） |
| 7 | F-007 | **P2** | C-10 RSS：实现完整，ENV mandatory 未进 run-all（受控邮箱链） |
| 8 | F-008 | **P2** | exit code **1** 作为非 CliError 默认 catch-all，Agent 分支粒度粗 |
| 9 | F-009 | **P2** | shell completion（`cliCatalog.ts`）缺 `session`/`studio`/`resource publish|update` |
| 10 | F-010 | **P2** | `validate`/`diff` 成功 envelope 可 `ok:false`，与失败 envelope 形态易混淆 |

### 0.3 做得好的地方（Evidence）

- **分层架构** 有 `ARCHITECTURE.md` + `architectureBoundary.test.ts` 强制依赖方向（commands 仅 login 可直访 platform）。
- **恢复模型** batch/import-dir 实现 `remote_outcome_unknown` / 对账语义（`ARCHITECTURE.md` L145–146；`verify-scenarios` S14/S14b）。
- **handoff code 5** `depAuthService.ts` 含 `actionUrl`、reason、hint，与 DESIGN 一致。
- **公开文档门禁** `publicDocumentationCommands.test.ts` 扫描 `使用/` 代码块命令合法性。
- **production 硬禁用** `core/env.ts` `productionEnvDisabled = true`。

---

## 1. 方法与证据分级

### 1.1 严重度定义

| 级别 | 含义 | 典型例子 |
|:---:|---|---|
| **P0** | Agent/CI 契约破坏或安全/数据风险 | 不稳定 JSON `command` 字段 |
| **P1** | CORE 回归风险或文档/实现严重不一致 | pull 无测试；README 遗漏命令 |
| **P2** | ADVANCED/体验/维护性 | completion 缺口；ENV 未签字 |
| **P3** | 命名/风格/低影响 | 单处 TODO 注释 |

### 1.2 证据类型

- **Evidence：** 可指向文件行号、脚本 ID、测试名的事实。
- **Inference：** 由多条 Evidence 归纳；标注 **置信度：高/中/低**。
- **Unknown：** 需运行时 ENV 或 Console 并排才能确认；本报告不臆测 PASS/FAIL。

### 1.3 审计输入清单

| 输入 | 路径 | 用途 |
|---|---|---|
| 产品真源 | [`DESIGN.md`](../../DESIGN.md) | 目标、非目标、交付契约 |
| 能力矩阵 | [`对齐/CLI数据操作与Console对照.md`](../对齐/CLI数据操作与Console对照.md) | R/V/D/P/C/N + 证据四维 |
| 用户文档 | [`使用/`](../使用/) | 公开命令与流程 |
| 验证索引 | [`验证/场景目录.md`](../验证/场景目录.md) | S*/NEG/JSON 映射 |
| 最新 dev 报告 | [`验证/reports/2026-08-18-dev.md`](../验证/reports/2026-08-18-dev.md) | ENV 签字快照 |
| 代码 | [`packages/cli`](../../../packages/cli) | 实现真源 |

---

## 2. 一期成熟度雷达

```mermaid
quadrantChart
  title 一期成熟度（主观审计评分）
  x 设计完备度
  y 实现质量
  quadrant-1 领先
  quadrant-2 设计债
  quadrant-3 待建设
  quadrant-4 实现债
  ResourceCore: [0.85, 0.82]
  AgentContract: [0.80, 0.65]
  DocGovernance: [0.75, 0.55]
  EnvSignoff: [0.70, 0.70]
```

**Inference（高）：** 「ResourceCore」= create→publish→policy→online 主链 + 合集；「AgentContract」= JSON/command/verify gate；「DocGovernance」= README vs 使用/ vs help；「EnvSignoff」= frozen/RSS/package 签字缺口。

---

## 3. 分维度分析

### 3.1 维度 1 · 产品与设计一致性

**结论：** 对齐矩阵与代码 **高度一致**；「已实现」在 ENV 维度上 **不应解读为全部签字完成**。

**Evidence：**
- 对齐矩阵 R-01~N-06 共 **6 域 30+ 能力 ID**，每项含 SPEC/CODE/CONTRACT/ENV 分列（[对齐 §2–§6](../对齐/CLI数据操作与Console对照.md)）。
- `subCommands.ts` 注册 27 个公开顶层命令 + dev 门控 `meta`/`cover`（`FREELOG_DEV=1`）。
- DESIGN 官方使用文档交付契约 §4：**package 预设暂停验收**（[DESIGN.md](../../DESIGN.md) L31）。
- `verify-scenarios.mjs` L839：`skip('S8b init package …', 'package 业务验收暂停…')`。

**Inference（高）：**
- [`二期/04 §3–§6`](../二期/04-能力矩阵与验收.md) 写「一期 ✅ 已实现」是 **CODE 层** 摘要；与对齐矩阵 ENV 列 **不矛盾**，但读者易误读为「全部 ENV PASS」。
- R-06：`ENV 待 fixture`（对齐 L28）；2026-08-18 报告 frozen **SKIP 1**（[验证/reports/2026-08-18-dev.md](../验证/reports/2026-08-18-dev.md) L24）。
- C-10 RSS：`ENV mandatory`（对齐 L92）；报告 **延后**（同报告 L50）。

**Unknown：** production 重新开放后的文档与 env 门禁变更尚未发生（DESIGN 明确当前 hard-disable）。

---

### 3.2 维度 2 · 架构与分层

**结论：** 分层 **执行良好**；`config/project` 直访例外 **已文档化** 且范围可控。

**Evidence：**
- `architectureBoundary.test.ts`：core/config/platform/adapters 不得 import commands/services；services 不得 import commands/bin；commands 仅 `login.ts` 可 import platform。
- `ARCHITECTURE.md` §「当前有意例外」列出 7 类 config/project 直访场景（L179–195），含 bind/create/diff/validate 等 **只读探测** 理由。
- `postbuild.mjs`（package.json `build` 脚本）bundles tools-lib2，禁止 dist 残留 workspace import。

**Inference（中）：**
- services 层大量 import `config/project`（30+ 文件）是 **Store 模式下的正常实现**；风险在于新增 service 绕过 Store 扩大例外——架构测试 **未** 自动禁止 services→config，仅靠文档 + review。

**Unknown：** 合集 session 模式若未来加入，ARCHITECTURE 已预留「先扩展 ProjectStore.subject()」（L194–195），尚未实现。

---

### 3.3 维度 3 · 命令面与信息架构

**结论：** **真实命令面 ⊃ 包 README ⊂ 使用/ 文档**；completion 介于两者之间。

**Evidence — 已注册顶层命令（`subCommands.ts`）：**

`login` `logout` `status` `validate` `doctor` `diff` `release` `completion` `config` `workspace` `type` `template` `init` `bind` `create` `resource` `publish` `draft` `dep` `version` `policy` `online` `offline` `update` `pull` `collection` `lang` `session` `studio`

**Evidence — `packages/cli/README.md` 命令表（L17–25）遗漏：**

| 遗漏命令/子命令 | 在 使用/ 或 help 中 |
|---|---|
| `validate` `doctor` `diff` `release` | [工程化与预检.md](../使用/工程化与预检.md) |
| `config` `workspace` `template` `lang` | config 示例 L10 却未列入表 |
| `resource search` `publish` `update` | [维护与草稿.md](../使用/维护与草稿.md) 等 |
| `collection update` `policy` `properties` `logs` `init-from-folder` | [合集.md](../使用/合集.md) |
| `dep init-auth-map` | 依赖文档 |
| `version set` `bump` `show` | 发行文档 |
| `type pick` | 对齐 R-03 主推路径 |

**Evidence — completion（`cliCatalog.ts`）：**
- `CLI_TOP_COMMANDS` **无** `session` `studio`（L2–30）。
- `resource` 补全仅 `import-dir search`（L96–98），**无** `publish` `update`。

**Inference（高）：** npm 包 README 作为 **npmjs 首页** 会系统性低估 CLI 能力 → **F-003**。

**Inference（中）：** `type list/search/info` 均输出 `command:"type"`（`type.ts` L49/87/108），Agent 无法从 envelope 区分子命令 → 见 **F-001**。

---

### 3.4 维度 4 · Agent / CI 机器契约

**结论：** envelope **形态** 与 schema 对齐 DESIGN；**`command` 字符串语义** 不稳定是最大 Agent 风险。

**Evidence — envelope 实现：**
- `jsonEnvelope.ts`：`schemaVersion:1`、`ok`、`command`、`data`、`warnings`、`meta.env`（L19–32）。
- 发布 schema：[`schemas/json-envelope.schema.json`](../../../packages/cli/schemas/json-envelope.schema.json)。
- 敏感字段 redaction：`redactSensitiveValue` key 匹配 token|password|cookie|authorization（L10–11）。

**Evidence — `command` 字段不一致（部分列表）：**

| 用户命令 | envelope `command` | 文件 |
|---|---|---|
| `type list/search/info` | `"type"` | `type.ts` L49/87/108 |
| `type pick` | `"type pick"` | `type.ts` L147 |
| `policy init` | `"scaffold"` | `scaffoldInit.ts` L67 |
| `version set/bump/edit/show` | `"version"` / `"version edit"` | `version.ts` |
| `draft push/pull/discard` | `"draft"` | `draft.ts` |
| `collection rss *` | `"collection rss"` | `collection/rss.ts` |
| `collection item *` | `"collection item"` | `collection/item.ts` |
| `dep add/remove/...` | `"dep add"` 等 | `dep.ts` ✓ 较好 |
| `policy apply/set/list` | `"policy apply"` 等 | `policy.ts` ✓ |

**Evidence — verify 与默认 gate：**
- `verify-json-envelope.mjs` L59 **期望** `policy init` → `command:'scaffold'`（脚本与代码一致，但与用户命令名不一致）。
- `package.json` L34：`verify` **不含** `verify:json-envelope`；后者为独立脚本 L54。

**Evidence — exit codes：**
- `errors.ts` L1：`ExitCode = 0|1|2|3|4|5`；`toExitCode` 非 CliError → **1**（L20–22）。
- `validate.ts` L26–27：`writeJsonSuccess(..., { ok: result.ok })` + `process.exit(4)` 若失败。
- `diff.ts` L20–21：drift 时 `ok:false` + exit **3**。

**Evidence — handoff：**
- `depAuthService.ts` L164–203：code **5**，details 含 reason、`actionUrl`、resourceId/policyId。

**Inference（高）：** Agent 若按 `command` 路由下一步，**F-001 P0** 成立。

**Inference（中）：** 失败 JSON 经 `writeJsonFailure` 写 **stdout**（`jsonEnvelope.ts` L114），与 DESIGN「日志 stderr」在失败路径上可能混用 stdout——verify JSON-03 允许空 stdout 或 envelope（场景目录 U-F3）。

---

### 3.5 维度 5 · Console 对齐与 PARITY 债务

**结论：** 有意差异 **大多已文档化**；CLI **严格 sidebar 门禁** 相对 Console creator Step4 软上架是核心 EQUIVALENT 点。

**Evidence — 设计登记：**
- 对齐 §7 OUT：支付、云存储 picker、batchUpdate、节点展品等（L109–117）。
- [使用/Console差异说明.md](../使用/Console差异说明.md) 用户可读差异。
- P-03：CLI **不**复制 creator Step4 软上架（对齐 L58–61）。

**Evidence — 代码门禁样例：**
- frozen：`services/shared/guards/frozenStatus.ts` + `onlineService.test.ts`（对齐 R-06）。
- policy append：`FOR PUBLIC` + `Initial:` 额外校验（对齐 P-01）。
- offline 写 status **4**（对齐 P-04）。

**Evidence — verify：**
- `verify-console-parity.mjs`、`verify-payload-parity.mjs`、`verify-p6-parity.mjs` 覆盖 payload/dep/frozen。
- 2026-08-18：Console parity **10 子脚本 PASS**；frozen **SKIP 1**。

**Inference（中）：** 无「Console 有、文档未 OUT、CLI 静默缺失」的一期 CORE 漏网项（节点域属二期范围，对齐 §7 仍写 OUT，见 §8）。

---

### 3.6 维度 6 · 双模式与 Store（Auth × Store）

**结论：** 00/01/10/11 四模式 **边界清晰**；session/studio **非 headless 路径** 在文档与实现上一致。

**Evidence：**
- `ManifestStateStore` / `ManifestCollectionStore` / `EphemeralStore` 分工（ARCHITECTURE L167–176）。
- `sessionInteractive.ts` L8–9：描述「须 TTY」；`handleCommandError(error)` **无** json 分支（L19）——session 本不支持 `--json` headless。
- `verify:session-smoke` + L3-H 在 2026-08-18 报告 PASS。

**Inference（低）：** session 错误路径忽略 `--json` 对 Agent **无实际影响**（Agent 不应调用 session）→ 非 P0/P1。

**Inference（中）：** `--session` 模式（01）与 `session` 交互壳（11）命名接近，新用户易混淆——`使用/交互会话与多账号工作区.md` 已解释，属文档 UX 问题 **P3**。

---

### 3.7 维度 7 · 错误处理、恢复与幂等（P8）

**结论：** batch/import-dir **恢复模型最成熟**；pull/diff **测试覆盖薄于 batch**。

**Evidence：**
- ARCHITECTURE L145–146：`remote_outcome_unknown` 必须先对账。
- `verify-scenarios` S14/S14b、CHAOS-03：batch resume（场景目录 U-C4）。
- `operationContext.test.ts`、`manifestStateFlow.test.ts`、`draftSession.test.ts`：含 pull/diff 相关逻辑，**无** `pull.test.ts` 或 `pullResource.test.ts`。
- 场景目录 U-E3 写「pull 单测」——**Evidence：** 实为间接覆盖（operationContext 等），非 dedicated 命令级测试 → **F-004**。

**Inference（高）：** R-05 双边冲突 code 3 是 CORE 路径，Dedicated 测试缺失增加回归风险。

**Inference（中）：** publish fileSha1 reuse + `--reuse-version` 有 `publishReuse.test.ts` + P6 ENV，恢复语义 **较好**。

---

### 3.8 维度 8 · 测试与验证金字塔

**结论：** 单元 + verify **数量充足**；**默认 `pnpm verify` 边界** 窄于全量 verify:*。

**Evidence：**
- **91** 个 `*.test.ts`（`packages/cli/tests/`）。
- **23** 个 `verify*.mjs` 脚本。
- 默认 `verify`（package.json L34）：`test` + `typecheck` + `i18n:audit` + `check:compat` + `build` + `verify-l3h-automated --packaged-only` + `pack:dry-run`。
- **不在** 默认 verify：`verify:json-envelope`、`verify:scenarios`、`verify:negative-gates`、`verify:p6-parity`、`verify:rss`、`verify:session-smoke`（session-smoke 在 prepublishOnly 的 verify 链中间接部分覆盖）。

**Evidence — ENV-blocked（2026-08-18 报告）：**

| 项 | 状态 | 脚本/ID |
|---|---|---|
| frozen E2E | SKIP | P6-4 / NEG-10 |
| RSS 全流程 | 延后 | `verify:rss` |
| package S8b | skip | verify-scenarios |

**Inference（高）：** CI 仅跑 `pnpm verify` **不能** 保证 JSON envelope 与 dev 主场景不回归 → **F-002**。

---

### 3.9 维度 9 · 文档治理

**结论：** `使用/` + 测试门禁 **强**；`packages/cli/README.md` **弱**；DESIGN 交付契约 **基本满足**。

**Evidence：**
- `publicDocumentationCommands.test.ts`：扫描 `使用/*.md` 中 `freelog-cli` 命令是否挂载、flag 是否声明。
- `documentationGovernance.test.ts`：内部链接与治理规则。
- DESIGN 交付契约 §1–8（L26–35）：自洽、无 production、示例一致、暂停 package 等。
- README 示例 L10 使用 `config init` 但命令表 **无 config**（L17–25）。

**Inference（高）：** 对外 npm 首页与 DESIGN「help 也是用户文档表面」（L34）在 README 层 **未达标** → F-003。

---

### 3.10 维度 10 · 安全与凭据

**结论：** 凭据加密、production 禁用、JSON 脱敏 **到位**；CI secret 文档 **可再强化**。

**Evidence：**
- README L7–8：`.freelog-auth` AES-256-GCM；`login -g` 全局路径。
- `core/env.ts` production hard-disable（grep `productionEnvDisabled`）。
- 2026-08-18 报告 L39：password-stdin、损坏凭据清理已回归。
- `authAndDebug.test.ts` + verify JSON-04：redaction。

**Inference（低）：** 无 Evidence 表明 token 写入 stdout JSON；设计符合二期 §01 §7 方向（一期已实现脱敏）。

**Unknown：** 多账号 studio 凭据隔离的渗透测试未在本仓库证据中。

---

### 3.11 维度 11 · 可维护性

**结论：** i18n 审计 + tools-lib2 单点 platform 边界 **健康**；API cast 耦合是长期风险。

**Evidence：**
- `pnpm i18n:audit` 在默认 verify 内。
- `platform/tools-lib.ts` 统一 re-export FServiceAPI。
- services 中大量 `as Parameters<typeof FServiceAPI.*>` 模式（platform 变更脆弱点）。
- `ARCHITECTURE.md` L58–60：i18n↔platform 启动循环 **有意** 且测试覆盖。

**Inference（中）：** collection RSS 等路径存在 **中文硬编码** 消息（i18n audit 可能有例外）→ **P3 F-024**。

---

### 3.12 维度 12 · 已知暂停与显式债务

**结论：** package preset **最大产品债务**；源码 TODO **极少**。

**Evidence：**
- `init.ts` L45–47、L191：仍注册 `package` preset。
- DESIGN + verify S8b + 场景目录：package **暂停验收**。
- 全 packages/cli **唯一** TODO：`console-source-contract.mjs` L100 videoCover。
- V-08 videoCover 编辑 OUT（对齐 L43–44）。

**Inference（高）：** 用户可 `init package` 但无 ENV 签字、无公开教程 → **F-005**「暴露但未承诺」。

---

## 4. 发现项登记表

| ID | 维度 | 严重度 | 置信度 | 证据摘要 | 影响 | 可选后续 |
|---|---|:---:|:---:|---|---|---|
| F-001 | 4 | **P0** | 高 | `type.ts` L49/87/108 → `"type"`；`scaffoldInit.ts` L67 → `"scaffold"` | Agent 无法稳定路由 | 统一 `command` 为完整命令路径；major schema 说明 |
| F-002 | 8 | **P1** | 高 | `package.json` verify 不含 json-envelope | CI 默认 gate JSON 漂移 | 纳入 verify 或 verify:readiness |
| F-003 | 9 | **P1** | 高 | `packages/cli/README.md` L17–25 vs subCommands | npm 用户低估能力 | 同步命令表或链到 使用/ |
| F-004 | 7/8 | **P1** | 高 | 无 pull*.test.ts；仅 bindService mock | R-05 回归 | 增 pullResource/sync 单测 |
| F-005 | 12 | **P1** | 高 | init package + S8b skip + DESIGN 暂停 | 用户误入未验收路径 | hide preset 或文档 WARN |
| F-006 | 1/8 | **P2** | 高 | 对齐 R-06 ENV 待 fixture；报告 SKIP | frozen CORE 无 E2E 签字 | provision-frozen-fixture + NEG-10 |
| F-007 | 1/8 | **P2** | 高 | C-10 ENV mandatory；RSS 延后 | ADVANCED 未产品签字 | 受控 ENV 跑 verify:rss |
| F-008 | 4 | **P2** | 中 | `errors.ts` toExitCode→1 | Agent 难细分 API 错 | 更多 CliError 分类 |
| F-009 | 3 | **P2** | 高 | `cliCatalog.ts` 无 session/studio | shell 补全不完整 | 扩展 CLI_TOP_COMMANDS |
| F-010 | 4 | **P2** | 中 | validate/diff ok:false success envelope | 自动化断言易错 | 文档化或统一 error 子对象 |
| F-011 | 4 | **P2** | 中 | legacy `unwrapCliJson` 双格式 | 脚本/envelope 漂移 |  deprecate 时间表 |
| F-012 | 9 | **P2** | 中 | 04 recap「已实现」vs 对齐 ENV 列 | PM 误读签字状态 | 04 脚注链对齐 ENV |
| F-013 | 3 | **P3** | 中 | type pick vs list 文档主次 | 选型路径误导 | README 推荐 pick |
| F-014 | 6 | **P3** | 低 | session vs --session 命名 | 用户混淆 | 术语表强化 |
| F-015 | 2 | **P3** | 中 | services→config 无自动测试 | 例外清单扩大 | 架构 test 扩展 |
| F-016 | 5 | **P3** | 低 | 对齐 §7 节点展品 OUT vs 二期 IN | 文档体系边界 | 08 合并时修订 |
| F-017 | 11 | **P3** | 中 | FServiceAPI cast 耦合 | API 变更脆 | 生成类型或 wrapper |
| F-018 | 12 | **P3** | 高 | console-source-contract TODO videoCover | V-07 边界 | 关 TODO 或 ADR |
| F-019 | 4 | **P2** | 中 | 失败 JSON 写 stdout | 与 DESIGN stderr 叙述张力 | 文档澄清或分流 |
| F-020 | 8 | **P2** | 中 | verify:scenarios 不在默认 verify | dev 主链回归 | CI nightly 跑 scenarios |
| F-021 | 3 | **P2** | 高 | resource publish/update 未进 completion | shell 用户遗漏 | cliCatalog 补全 |
| F-022 | 1 | **P2** | 中 | R-02 RSS 字段锁定需专项 ENV | 维护场景未签字 | RSS ENV 与 R-02 联测 |
| F-023 | 7 | **P3** | 低 | draft cancel exit 0 | CI 误判取消 | 文档说明 |
| F-024 | 11 | **P3** | 中 | collection 中文硬编码 | i18n 不一致 | 换 i18n key |
| F-025 | 9 | **P3** | 高 | @freelog-cli/cli2 临时包名 | 发布认知成本 | DESIGN 已说明，正式名裁决 |

---

## 5. 附录 A · 能力矩阵审计（CODE / DOC / ENV / TEST 四态）

图例：**Y**=有 / **N**=无 / **P**=部分 / **—**=OUT / **S**=暂停

| ID | 能力 | CODE | DOC(使用/) | ENV | TEST |
|---|---|:---:|:---:|:---:|:---:|
| R-01 | create | Y | Y | Y | Y |
| R-02 | update | Y | Y | P | Y |
| R-03 | type | Y | Y | Y | Y |
| R-04 | bind | Y | Y | Y | Y |
| R-05 | pull | Y | Y | P | **P** |
| R-06 | frozen gate | Y | Y | **N** | P |
| V-01~V-06 | publish/version | Y | Y | Y | Y |
| V-07 | video-cover CLI_ONLY | Y | P | P | P |
| V-08 | videoCover edit OUT | — | Y | — | — |
| D-01~D-05 | dep/auth | Y | Y | Y | Y |
| P-01~P-04 | policy/online/offline | Y | Y | Y | Y |
| C-01~C-08 | collection core | Y | Y | Y | Y |
| C-09 | collect-rules | Y | P | Y | Y |
| C-10 | RSS | Y | P | **N** | P |
| N-01 | templates | Y | Y | P | Y |
| N-01 package | package preset | Y | **S** | **N** | **S** |
| N-04 | import-dir | Y | Y | Y | Y |
| N-05 | validate/diff/release | Y | P | P | Y |
| N-06 | --session | Y | Y | Y | Y |

**Inference（高）：** CODE 列几乎全 Y；ENV/TEST 主要缺口在 **R-06、C-10、package、R-05**。

---

## 6. 附录 B · 命令面 diff（subCommands vs README vs completion）

| 命令 | subCommands | README 表 | cliCatalog TOP | 使用/ 文档化 |
|---|:---:|:---:|:---:|:---:|
| validate/doctor/diff/release | Y | N | Y | Y |
| config/workspace/template/lang | Y | N | Y | 部分 |
| session/studio | Y | Y(壳) | **N** | Y |
| resource publish/update | Y | N | **N** | Y |
| dep init-auth-map | Y | N | Y(dep子) | 部分 |
| collection update/logs/… | Y | 部分 | Y(collection子) | Y |

---

## 7. 附录 C · 验证覆盖地图

### 7.1 默认 `pnpm verify` 包含

`vitest(91 files)` · `tsc` · `i18n:audit` · `check:compat` · `build` · `verify-l3h-automated --packaged-only` · `pack:dry-run`

### 7.2 重要但非默认 gate 的脚本

| 脚本 | 能力/场景 | 建议频率 |
|---|---|---|
| `verify:json-envelope` | N-05 JSON-* | 每次改 envelope |
| `verify:scenarios` | S1–S14 dev 主链 | nightly / 发版前 |
| `verify:negative-gates` | NEG-* | 发版前 |
| `verify:p6-parity` | P6 frozen/reuse | 发版前 |
| `verify:rss` | C-10 | ENV 就绪时 |
| `verify:session-smoke` | N-06 | 改 session 时 |
| `verify:console-forms` | CONTRACT 快照 | verify:readiness |

### 7.3 能力 ID → 脚本映射（摘录）

| 能力 | 主要脚本 |
|---|---|
| N-04 batch | verify-scenarios S13–S14b, verify-batch-* |
| D-05 dep auth | verify-scenarios DEP-AUTH |
| P-03 online | verify-scenarios, onlineService.test |
| C-09 | verify:collection |
| C-10 | verify:rss |
| R-06 | verify:p6-parity, verify-negative-gates NEG-10 |

---

## 8. 与二期边界说明

**Evidence：** 对齐 §7 仍写「节点展品 OUT」（L117）；二期设计包规划 `node exhibit *` IN，合并前以 [08 附录 A](../二期/08-DESIGN回写草案.md) 修订为准。

**Inference（高）：** 本报告 **不** 评价二期设计质量；一期审计仅确认 **代码中无 node/market/exhibit 命令**（`subCommands.ts` grep 无匹配）符合当前 DESIGN 非目标。

---

## 9. 参考索引

| 主题 | 路径 |
|---|---|
| 产品真源 | [`DESIGN.md`](../../DESIGN.md) |
| 能力矩阵 | [`对齐/CLI数据操作与Console对照.md`](../对齐/CLI数据操作与Console对照.md) |
| 架构 | [`packages/cli/src/ARCHITECTURE.md`](../../../packages/cli/src/ARCHITECTURE.md) |
| 验证场景 | [`验证/场景目录.md`](../验证/场景目录.md) |
| 最新 dev 报告 | [`验证/reports/2026-08-18-dev.md`](../验证/reports/2026-08-18-dev.md) |
| 包 README | [`packages/cli/README.md`](../../../packages/cli/README.md) |
| 命令注册 | [`packages/cli/src/bin/subCommands.ts`](../../../packages/cli/src/bin/subCommands.ts) |
| JSON envelope | [`packages/cli/src/core/jsonEnvelope.ts`](../../../packages/cli/src/core/jsonEnvelope.ts) |
| 审计索引 | [`审计/README.md`](./README.md) |

---

## 10. 可选后续工作（非本报告范围）

以下仅为发现项的 **可能**  remediation，需单独评审与排期：

1. **P0 批次：** 统一 JSON `command` 字段 + 扩展 verify-json-envelope 断言全命令。
2. **P1 批次：** README 命令表同步；pull 单测；package preset 隐藏或 WARN。
3. **P2 批次：** frozen/RSS ENV fixture；completion 补全；verify:scenarios 进 nightly。
4. **文档：** 在对齐矩阵 ENV 列增加「签字报告链接」字段。

**本报告完成时未修改任何代码或 DESIGN。**
