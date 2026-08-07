# CLI 全量对齐任务清单

> **已归档（2026-08-07）。** 批次 0–8 已全部 ☑。日常 parity 见 [CLI数据操作与Console对照 §0](../对齐/CLI数据操作与Console对照.md)。

最后更新：2026-08-07

**用途：** Console → CLI 对齐台账（实现 + **逐项核对**）。  
**真源：** [Console完整业务梳理.md](../对齐/Console完整业务梳理.md) · [CLI数据操作与Console对照.md](../对齐/CLI数据操作与Console对照.md)

**逐项核对计划（细节多，按批执行）：** [CLI全量对齐核对计划.md](./CLI全量对齐核对计划.md) ← **从这里一点点核**

**图例：** ✅ 实现完成 · ☑ 核对通过 · ☐ 待核对 · ↷ 交互等价 · — 边界/不做

**审计：** `pnpm i18n:audit` → **0 命中**（`packages/cli`）

---

## 实现 Phase（已完成）

- [x] Phase 0：本清单 + `pnpm i18n:audit`
- [x] Phase 1：i18n 全量 cliError 迁移（~55 文件）
- [x] Phase 2：校验行为（查重/semver/SHA1/tags/policy/100/batch warn/strict）
- [x] Phase 3：确认流（offline/version clear-file/authid hint/online policy hint）
- [x] Phase 4：负例单元测试（`batchReleaseGuards.test.ts` 等，185 tests）
- [x] Phase 5：文档 §0.1 / Console §15–16 / CLI使用说明

---

## 核对 Phase（按 [核对计划](./CLI全量对齐核对计划.md) 执行）

- [x] **批次 0** 自动化门禁（test 185 / i18n:audit / verify:parity / verify:scenarios 59 / typecheck）
- [x] **批次 1** 公共链路 SH（SH-01～15）
- [x] **批次 2** 单品 resourceCreator（RC-S1～S4）
- [x] **批次 3** 批量 creatorBatch（RB-01～09）
- [x] **批次 4** 合集 + 维护（CC + CM）
- [x] **批次 5** 发新版 + Sidebar（RV + SB）
- [x] **批次 6** 策略逻辑 + i18n 抽检（POL + I18N）
- [x] **批次 7** C 层加深（可选，主链已覆盖）
- [x] **批次 8** ↷ 与边界文档收口

---

## 边界（永不对齐 —）

云存储 · Markdown/Cartoon · RSS · collect-rules · 付费 · 已发版 videoCover 维护 · 封面裁剪 UI · 列表/收藏/收入

---

## 关键新增能力（2026-08-07）

| 能力 | CLI |
|---|---|
| i18n 全量 | `cliError` + OSS/bundled；`pnpm i18n:audit` |
| 批量 20 | 默认 auto-chunk + warn；`--strict-batch-limit` 硬限 |
| 无策略发行确认 | import-dir 交互确认 / `--yes` |
| SHA1 占用 | `getResourceBySha1` → submitresource_err_* |
| 合集添加 ≤100 | `additem_alert_qtylimit` |
| 策略重复 | policy apply 预检名/码 |
| 合集禁止 publish | `create_new_version_error_unknowsubject` |
| 下架确认 | offline 交互 + Console 同源文案 |
| 清除文件 | `version set --clear-file` + 确认 |
| 合集 properties sync dry-run | `collection properties sync --dry-run` |
| customPropertyDescriptors 空数组 | sync 契约 `[]` 非 undefined |

---

详细逐项表见 [CLI数据操作与Console对照.md §0–§2](../对齐/CLI数据操作与Console对照.md) 与 [Console完整业务梳理.md §4–§13](../对齐/Console完整业务梳理.md)。
