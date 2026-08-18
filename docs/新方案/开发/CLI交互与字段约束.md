# CLI 交互流程与字段约束（实现规格）

> 文档角色：**TTY 交互与输入前约束提示**的实现规格。字段有效规则（HARD/CONDITIONAL/SUGGESTION）以 [Console表单字段与交互规则](../对齐/Console表单字段与交互规则.md) 的 `FORM-*` 为唯一事实来源；流程语义以 [Console完整业务梳理](../对齐/Console完整业务梳理.md) 与 [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md) 为准。本文不重复登记未在 Console 源码确认的有效约束。
>
> 证据快照：2026-08-18；Console commit `d74121e647f0223203f1f0bb317354b4191266f1`（与对齐目录一致）。源码漂移检查：`pnpm --filter @freelog-cli/cli2 verify:console-forms`。

最后更新：2026-08-18

## 1. 文档边界

| 层级 | 路径 | 职责 |
|---|---|---|
| 产品原则 | [DESIGN.md](../../../DESIGN.md) §Interaction states | TTY 须在输入前披露约束 |
| Console 字段事实 | [Console表单字段与交互规则.md](../对齐/Console表单字段与交互规则.md) | `FORM-*`、强度、Console 提示 key |
| 交互/流程规格 | **本文** | 逐步流程、prompt 文案、校验时机、实现状态 |
| 代码真源 | `packages/cli/src/services/shared/fieldConstraints.ts` | 与 `validation.ts` / `resourceName.ts` 同源；`@clack/prompts` 包装 |
| 静态数值 | `packages/cli/src/services/validation.ts` → `FIELD_LIMITS` | 已与 Console HARD 对齐的常量 |
| 用户手册 | `docs/新方案/使用/*` | 派生说明，不定义新约束 |

**禁止：** 在本文或实现中发明 Console 表单未登记的长度/格式；组件 props 未证实会阻止提交的规则不得标为 HARD（见 Console 表单 §1）。

## 2. 产品规则（TTY）

1. **输入前提示：** 每个 `@clack/prompts` 文本/选择步骤，`message`（或紧前一行 `consola.info`）须含该字段 HARD 约束摘要（长度、格式、必填）。
2. **输入时校验：** 同一字段须用与写平台前 **相同的 assert**（经 non-throw 包装供 `validate` 回调）。`FORM-RES-NAME` 允许输入待规范化字符，以 `normalizeCreateName` 结果为 gate；规范化后与输入不同时须 `input_resourceauthid_automodified_msg` 提示。
3. **确认前摘要：** `online` / `publish` / `draft push --force` 等不可逆或 P3 写操作，TTY 在 `confirm` 前须打印 preflight（门禁/漂移/草稿），不得仅在 API 失败后提示。
4. **非 TTY / `--yes` / `--json`：** 不要求 prompt；约束写在 `--help`（与 `FIELD_LIMITS` 同源）+ 失败时 `CliError`（code 4）。
5. **文案：** HARD 字段优先复用 bundled 中与 Console 同源的 i18n key（见 §4 表「Console 提示 key」列）。

## 3. 静态字段约束注册表（Console HARD → CLI）

数值与 [Console完整业务梳理](../对齐/Console完整业务梳理.md) Step1/Step4、FLabelEditor、FUploadCover 一致；自动化核对见 `verify:console-forms`。

| FORM-ID | 字段 | Console 有效规则 | Console 源码（verify 锚点） | Console 提示 key（zh） | CLI assert / 模块 | 输入前提示文案（zh，TTY） | 实现状态 |
|---|---|---|---|---|---|---|---|
| `FORM-RES-TYPE` | 资源类型 | 必选；须为平台有效叶子类型 | `step1Effects.ts` | 请选择资源类型 | `assertLeafResourceTypeCode` / type pick | 「须从平台类型树选叶子节点」 | pick 已有；无单独 text prompt |
| `FORM-RES-TITLE` | 资源标题 | 非空；trim；≤100 | `creator/Step1` `lengthLimit={100}` | 请输入资源标题；不超过100个字符 | `assertResourceTitle` | 「展示标题，1–100 字，不可为空」 | ✅ P1/P2 fieldConstraints |
| `FORM-RES-NAME` | 授权标识 | 1–60；非法字符 **规范化**为 `_`（非拒绝输入）；禁含 `/` | `creator/Step1` `lengthLimit={60}` + `resourceNameOptimized` | `rqr_input_resourceauthid_hint`；失败时 `naming_convention_resource_name` | `normalizeCreateName` | `rqr_input_resourceauthid_hint`（TTY message） | ✅ P1 init/import/collection/create |
| `FORM-LIST-INTRO` | 简介 | ≤200 | `FIntroductionInput` / Step4 | （组件计数） | `assertIntro` | 「简介最多 200 字」 | ✅ P2 update 向导 |
| `FORM-LIST-TAGS` | 标签 | ≤20 个；单项 ≤20；非空；去重 | `FLabelEditor` | Console `form_input_tag_*`；CLI 用 `cli.tag_*`（数值一致） | `assertTags` | 「最多 20 个标签，每个最多 20 字」 | ✅ P2 update 向导 |
| `FORM-LIST-COVER` | 封面文件 | JPG/PNG/GIF；≤5MB；禁动画 GIF | `FUploadCover` | 图片不能超过5M；格式提示 | `assertLocalCoverFile` | 「JPG/PNG/GIF，≤5MB；800px 为建议非阻断」 | ✅ P2 update 向导 |
| `FORM-POL-NAME` | 策略名 | 2–20；非空；不可重复 | `fPolicyBuilder3` | 请输入策略名称；不少于2个字符 | `assertPolicyName` | 同上 | policy 文件路径；TTY 待补 |
| `FORM-COL-TITLE` | 合集条目标题 | ≤100 | `FCollectionItems2` | — | `assertCollectionItemTitle` | 「条目标题最多 100 字」 | ✅ P4 `--help` |
| `FORM-BATCH-TITLE` | 批量项标题 | 默认文件名去扩展名；≤100 | creatorBatch | — | `assertResourceTitle` | import 向导 titlePrefix 同规则 | ✅ P1 batchImportWizard |
| `FORM-BATCH-NAME` | 批量授权标识 | 1–60；批内不重复；规范化 | creatorBatch Handle | 同 FORM-RES-NAME | `normalizeCreateName` + 批内去重 | 同 FORM-RES-NAME | import-dir 内部；无 prompt |
| `FORM-BATCH-COUNT` | 批量文件数 | 单批 ≤20 | creatorBatch Handle | — | batch 分批 | 扫描后 info 提示文件数 | 已有 scan hint |
| `FORM-COL-ADD` | 合集加条目 | 单次 ≤100 | `FAddResourcesHandleAuth` | 一次最多可添加 100 个目录项 | collection item guards | 操作前 info | service 层已有 |
| `FORM-VER-SIZE` | 上传大小 | 视频 ≤1GB；其它 ≤200MB + 类型上限 | creatorBatch Task | 文件大小不能超过… | `assertLocalFileAllowedByType` | 选定文件后、上传前 consola | ✅ P5 publish/version set TTY |

**动态 / 条件（CONDITIONAL）— 输入前须先查平台再提示：**

| FORM-ID | 条件 | Console 行为 | CLI 输入前动作 | 实现状态 |
|---|---|---|---|---|
| `FORM-VER-FILE` | 类型是否允许本地上传 | 类型能力 gating | `type info` / capability；拒绝时 **不进入** file prompt | 已有 assert |
| `FORM-LIST-RSS-LOCK` / `FORM-COL-RSS-LOCK` | RSS 关联合集 | 标题/封面/简介/标签等 disabled | `isRssRelatedResource` → 先 info「feed 托管不可改」 | ✅ P2/P5 update 向导预检 |
| `FORM-ONLINE` | latestVersion + 启用策略 | sidebar 三分支错误文案 | confirm 前打印 gates；无版本用 `msg_release_version_first` | ✅ P3 preflight + onlineService 三分支 |
| `FORM-VER-INPUT` | 类型解析属性 | PropertyParser 动态 | 文件选定后列出必填属性名（只读） | ✅ P5 CLI 已提示；ENV 待执行 |

## 4. 交互流程规格（逐步）

### 4.1 `init`（`services/init/wizard.ts` + `prompts.ts` + `picker.ts`）

| 步骤 | 用户输入 | 关联 FORM | Console 对照 | 输入前须展示 | 输入时 validate | 当前代码 | 目标 |
|---|---|---|---|---|---|---|---|
| 1 | 五选一类别 | — | creator 向导入口 | 各类别 hint（已有 `INIT_CATEGORY_OPTIONS`） | select | ✅ | 保持 |
| 2 | 类型树 pick / 搜索 | `FORM-RES-TYPE` | Step1 类型必选 | 须 login；叶子类型说明 | 平台树 + 拒绝非叶子 | ✅ picker | 保持 |
| 3 | 模板 / namespace | — | Step2 工程 | runtime/package 说明 | pickInitTemplate / pickInitNamespace | ✅ 部分 | namespace 规则若 Console 无 HARD 则仅非空 |
| 4 | 短授权标识 | `FORM-RES-NAME` | Step1 + `resourceNameOptimized` | §3 表 `naming_convention_resource_name` | **`normalizeCreateName`（非仅 regex）** | ✅ fieldConstraints | **P1 完成** |
| 5 | 资源标题 | `FORM-RES-TITLE` | Step1 ≤100 | 「1–100 字」 | **`assertResourceTitle(..., true)`** | ✅ fieldConstraints | **P1 完成** |
| 6 | artifact-mode（none） | `FORM-VER-FILE` | 类型能力 | `--artifact-mode` 说明 | init 非交互已强制 | ✅ init.ts | TTY 缺 flag 时 select |

**非交互：** 缺 `--resource-type` / `--artifact-mode` 等 → code 4（已有）；`--help` 须含 §3 约束（**P4**）。

### 4.2 `resource import-dir` 向导（`batchImportWizard.ts`）

| 步骤 | FORM | 输入前 | validate | 当前 | 目标 |
|---|---|---|---|---|---|
| 媒体目录路径 | — | 顶层文件规则（jpg/png/mp4…） | 非空 | scan 后 hint ✅ | 保持 |
| 确认导入 | `FORM-BATCH-COUNT` | 文件数 / 分批说明 | confirm | ✅ | 保持 |
| 类型 pick | `FORM-RES-TYPE` | 同 4.1 | picker | ✅ | 保持 |
| 标题前缀 | `FORM-BATCH-TITLE` | ≤100 | `assertResourceTitle` | ✅ fieldConstraints | **P1 完成** |

### 4.3 `collection init-from-folder`（`collectionFolderWizard.ts`）

| 步骤 | FORM | 输入前 | validate | 当前 | 目标 |
|---|---|---|---|---|---|
| 合集类型 pick | `FORM-RES-TYPE` | 同 4.1 | picker | ✅ | 保持 |
| 项目目录名 | — | 目录名字符集 | `^[a-zA-Z0-9_-]+$` | ✅（非 FORM） | 保持 |
| 媒体目录 | — | 同 import | 非空 | ✅ | 保持 |
| 条目类型 pick | `FORM-RES-TYPE` | 同 4.1 | picker | ✅ | 保持 |
| 合集短名 | `FORM-RES-NAME` | §3 表 | **`normalizeCreateName`** | ✅ fieldConstraints | **P1 完成** |
| 合集标题 | `FORM-RES-TITLE` | ≤100 | **`assertResourceTitle`** | ✅ fieldConstraints | **P1 完成** |

### 4.4 `login`（`commands/login.ts`）

无 Console 表单 HARD 字段约束；不要求长度提示。保持现状。

### 4.5 旗标式写命令（TTY 向导 — **P2 已完成**）

当 **TTY && !--yes && 命令行覆盖值与 manifest 合并后仍缺业务字段** 时进入向导；否则保持
字段级 assert。工程模式 `create` 的 `--title/--type/--name` 是 manifest 覆盖项，不是
`create --yes` 的重复必填项。

| 命令 | 触发 | 步骤 | FORM 覆盖 |
|---|---|---|---|
| `create` | manifest 与 flags 合并后仍缺 title/type/name | 只补缺失项：type pick → title → name | `FORM-RES-TYPE/TITLE/NAME` |
| `update` | 无 listing flag | 多选字段 → 各 prompt | `FORM-RES-TITLE`、`FORM-LIST-INTRO/TAGS/COVER` + RSS lock 预检 |
| `collection update` | 同上 | + display 枚举说明 | 合集 listing + `FORM-COL-DISPLAY` |

### 4.6 确认类（preflight — **P3 已完成**）

| 命令 | confirm 前须打印（Console 对照） | FORM | 当前 |
|---|---|---|---|
| `online` | `hasLatestVersion`；`enabledPolicyCount`；冻结 | `FORM-ONLINE` | ✅ gates 摘要 + confirm |
| `offline` | 下架副作用 | `FORM-OFFLINE` | confirm ✅ |
| `publish` / `collection publish` | `validate --for publish` 的 warn | 多 FORM | ✅ collection publish preflight |
| `draft push --force` | 覆盖方向 + 已有 confirm 文案 | `FORM-VER-DRAFT` | ✅ preflight + confirm |

**`online` 错误文案映射（须与 Console sidebar 一致）：**

| 条件 | Console key | CLI 应用层 |
|---|---|---|
| 无 `latestVersion` | `msg_release_version_first` | ✅ `onlineService` 优先此 key |
| 零策略 | `msg_set_resource_avaliable_for_auth01` | 已有 |
| 有策略但全禁用 | `msg_set_resource_avaliable_for_auth02` | 已有 |

## 5. 实现状态（P0–P5 已完成，2026-08-14）

```text
P0  fieldConstraints.ts + validate 非 throw 包装 + 单测          ✅
P1  4.1–4.3 现有 wizard 对齐 §3 表（init / import / collection folder） ✅
P2  4.5 create / update 交互向导                              ✅
P3  4.6 online/publish preflight 摘要 + online 文案分支        ✅
P4  cliArgs / command --help 与 FIELD_LIMITS 同源             ✅
P5  FORM-VER-INPUT 文件后属性列表；RSS 向导预检（ENV 待执行）   ✅ CLI / ⏳ RSS ENV
```

遗留（计划外或未要求 TTY）：`FORM-POL-NAME` 独立 prompt；`resource publish` 无 confirm（仅有 TTY 文件 hint，collection publish 有 preflight+confirm）。

每阶段已更新 §3「实现状态」列；CI：`pnpm verify` + `verify:console-forms` + `documentationGovernance`。

## 6. 验收

| 检查 | 命令 / 文件 |
|---|---|
| Console 源码锚点未漂移 | `pnpm --filter @freelog-cli/cli2 verify:console-forms` |
| 静态边界与 Console 一致 | `packages/cli/tests/validation.test.ts` |
| TTY prompt 含约束且 validate 同源 | `packages/cli/tests/fieldConstraints.test.ts` |
| 交互流程无 API 泄漏非法值 | [探索测试清单](../验证/探索测试清单.md) L3-G |
| 文档与 FORM 表一致 | `documentationGovernance.test.ts` |

## 7. 参考索引

- Console Step1 字段表：[Console完整业务梳理](../对齐/Console完整业务梳理.md) §Step 1
- CLI 静态校验：`packages/cli/src/services/validation.ts`、`resourceName.ts`
- 交互入口清单：`packages/cli/src/services/init/prompts.ts`、`batchImportWizard.ts`、`collectionFolderWizard.ts`、`createWizard.ts`、`updateListingWizard.ts`、`collectionUpdateWizard.ts`
- 对齐完成条件：[Console表单字段与交互规则](../对齐/Console表单字段与交互规则.md) §9
