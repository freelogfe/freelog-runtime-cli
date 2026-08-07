# CLI 全量对齐 · 逐项核对计划

> **已归档（2026-08-07）。** 逐项核对已完成。见 [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md)。

最后更新：2026-08-07

**背景：** 实现 Phase 0–5 已落地（见 [CLI全量对齐任务清单.md](./CLI全量对齐任务清单.md)），但 Console 细节多、易漏。**本文是把计划附件 A–H 拆成可逐批执行的核对任务**，每批 30–60 分钟，做完打勾。

**三层核对标准（每任务必标 L1/L2/L3）：**

| 层 | 核对什么 | 通过标准 |
|---|---|---|
| **L1** | 业务/API | 同操作 → 同 HTTP 字段 → 平台状态一致 |
| **L2** | 校验/门禁 | 同规则、同失败时机、同前置检查 |
| **L3** | 文案/i18n | 同源 OSS key 或 `cli.*`；`--lang en_US` 可读 |

**图例：** ☐ 待核 · ☑ 已通过 · ↷ 交互等价（只核 hint/文档）· — 边界跳过

---

## 核对进度（2026-08-07）

| 批次 | 状态 | 备注 |
|---|---|---|
| **0** 自动化门禁 | ☑ | test 185/185 · i18n:audit 0 · verify:parity PASS · verify:scenarios 59/59 · typecheck OK |
| **1** SH | ☑ | SH-08 按类型 fileMaxSize（`resourceTypeCapabilities`）；SH-16 — |
| **2** 单品 | ☑ | RC-S1-01/04 ☑；RC-S2-07 ☑ draft discard |
| **3** 批量 | ☑ | RB-01 ↷（chunk 单测+fromDir 源码）；RB-09 ↷ |
| **4** 合集 | ☑ | CC-S2-04/CC-S4-01/CM ☑ S11e e2e |
| **5** 维护+Sidebar | ☑ | RV-02/06/07 ☑；SB-ON/OFF ☑ 单测 |
| **6** 策略+i18n | ☑ | I18N-02 已脚本化 spot 10 条 en_US |
| **7** C 层加深 | ↷ | 可选；现有 verify 脚本已覆盖主链 |
| **8** 文档收口 | ☑ | 见 CLI使用说明与对照表 §0.1 |

**本轮代码修复：** S11e 合集 CRUD e2e · S6c draft discard · `assertPublishVersionReady` · `onlineService.test.ts` · S3 status 隔离 cwd

---

## 批次 0 · 自动化门禁（每轮 PR 必跑，~15min）

| # | 任务 | 命令 | 期望 | ☐ |
|---:|---|---|---|:---:|
| 0.1 | 单元测试全绿 | `cd packages/cli && pnpm test` | 185 pass | ☑ |
| 0.2 | i18n 无中文硬编码 | `pnpm i18n:audit` | 0 命中 | ☑ |
| 0.3 | C 层 payload 一键 | `pnpm verify:parity` | 全 PASS | ☑ |
| 0.4 | 主链场景 | `pnpm verify:scenarios` | 59/59 | ☑ |
| 0.5 | 类型检查 | `pnpm typecheck` | 无新增 error | ☑ |

**出口：** 0.1–0.4 全绿才进入批次 1。

---

## 批次 1 · 公共链路 SH（~1h）

| ID | 核对项 | L | 怎么核 | 真源 | ☐ |
|---|---|:---:|---|---|:---:|
| SH-01 | uploadFile 仅 sha1 不存在时上传 | L1 | 读 `storageUpload.ts` + `verify:scenarios` S* 上传 | Console Task | ☑ |
| SH-02 | meta 解析 REST 与 SSE 同源 | L1 | `pnpm verify:meta` | PropertyParser | ☑ |
| SH-03 | handleData → systemProperties | L1 | `filePropertyService.test.ts` | service.ts | ☑ |
| SH-04 | 合集 sha1:'' 属性模板 | L1 | `verify:collection-attrs` | collection Step1 | ☑ |
| SH-05 | inputAttrs additional 映射 | L1 | S6f / `verify:payload` | step2 submit | ☑ |
| SH-06 | customPropertyDescriptors 映射 | L1 | 同上 | 同上 | ☑ |
| SH-07 | 类型格式/大小校验 | L2 | `resourceTypeCapabilities.test.ts` | FLocalUpload | ☑ |
| SH-08 | 视频 1GB / 其他 200MB | L2+L3 | 负例：超大文件 + `--lang en_US` 文案 | Task 硬编码 | ☑ |
| SH-09 | limitFileSize 按类型 | L2 | type info + processFile | 类型配置 | ☑ |
| SH-10 | SHA1 他人/自己占用 | L2+L3 | 负例：已发行 sha1 → `submitresource_err_*` | step2 上传 | ☑ |
| SH-11 | 主题/插件 zip | L1 | `processFile.test.ts` | zip 构建 | ☑ |
| SH-12–14 | 封面格式/5M/GIF/800px hint | L2+L3 | `coverUpload.test.ts` + hint 含 800px | FUploadCover | ☑ |
| SH-15 | CoverGenerator | L1 | `verify:cover` | CoverGenerator | ☑ |
| SH-16 | 云存储 | — | 文档标 —，不核 | storageSpace | — |

---

## 批次 2 · 单品首版 resourceCreator（~1.5h）

### Step1 创建壳

| ID | 核对项 | L | 怎么核 | Console 参照 | ☐ |
|---|---|:---:|---|---|:---:|
| RC-S1-01 | 类型必选 | L2+L3 | `create` 无 type → `naming_convention_resource_type_required` | step1Effects | ☑ |
| RC-S1-02 | 标题 ≤100 | L2+L3 | `validation.test.ts` | Step1 硬编码 | ☑ |
| RC-S1-03 | 授权标识 1–60 + 禁字符 | L2+L3 | `resourceName.test.ts` 负例 | naming_convention_resource_name | ☑ |
| RC-S1-04 | 标题→authid 自动规范化 **info** | L3 | `resourceService.test.ts` automodified info | Step1 自动转换 | ☑ |
| RC-S1-05 | 查重 resource_name_exist | L2+L3 | 负例：重复 name；key 含 `{authID}` | debounce info | ☑ |
| RC-S1-06 | create 请求字段 | L1 | `manifestStateFlow.test.ts` | Resource.create | ☑ |
| RC-S1-07 | 脏数据离开 | ↷ | `status`/`pull` diff 提示文档即可 | FPrompt | ↷ |

### Step2 文件/首版

| ID | 核对项 | L | 怎么核 | ☐ |
|---|---|:---:|---|:---:|
| RC-S2-01 | version set + publish 链 | L1 | verify:scenarios 单品主链 | ☑ |
| RC-S2-02 | authExcludedItems 透传 | L1 | manifest + `verify:auth-fallback` | ☑ |
| RC-S2-03 | 依赖未授权 | L2+L3 | publish 有 deps 未签约 → `dep_auth_incomplete` | ☑ |
| RC-S2-04 | createVersion 字段（无 batchSign 单品） | L1 | `verify:console` RT005001 | ☑ |
| RC-S2-05 | videoCover CLI+ | L1 | `--video-cover` dry-run body 含 videoCover | ☑ |
| RC-S2-06 | 自动草稿 300ms | ↷ | 文档：`draft push` 等价 | ↷ |
| RC-S2-07 | 草稿 push/失败文案 | L3 | `draft push` / `draft discard` scenarios | ☑ |
| RC-S2-08 | Markdown/Cartoon | — | — | — |

### Step3–4

| ID | 核对项 | L | 怎么核 | ☐ |
|---|---|:---:|---|:---:|
| RC-S3-01 | policy 名 ≥2 | L2 | `policySchema.test.ts` | ☑ |
| RC-S3-02 | policyText encodeURIComponent | L1 | 抓包或 dry-run update body | ☑ |
| RC-S3-03 | policy apply API | L1 | verify:scenarios policy 段 | ☑ |
| RC-S3-04 | 无策略空态 hint | L3 | online 门禁 → `versionreleased_desc` / msg_* | ☑ |
| RC-S4-01 | tags 数量/长度/空串 | L2+L3 | `validation.test.ts` tags 段 | ☑ |
| RC-S4-02 | 软上架 | ↷ | update + online 分步文档 | ↷ |
| RC-S4-03 | update --cover 规则 | L2 | 同 SH-12 | ☑ |

---

## 批次 3 · 批量 creatorBatch（~1h）

| ID | 核对项 | L | 怎么核 | ☐ |
|---|---|:---:|---|:---:|
| RB-01 | auto-chunk 20 | L1 | `batch/createFromDir` + `verify:create-batch` | ☑ |
| RB-02 | 超 20 **warn** 文案 | L2+L3 | 21 文件 import-dir 看 stderr → `brr_submitresource_alert_limitation` | ☑ |
| RB-03 | `--strict-batch-limit` 硬拦 | L2 | 21 文件 + flag → exit 4 | ☑ |
| RB-04 | 无策略发行确认 | L2+L3 | 无 policies + 交互 confirm / 非交互需 `--yes` | ☑ |
| RB-05 | batch config policies 透传 | L1 | `freelog.batch.json` + createBatch body | ☑ |
| RB-06 | 授权标识空/≤60 | L2+L3 | resourceName 负例 | ☑ |
| RB-07 | batchSignContracts | L1 | `verify:batch` | ☑ |
| RB-08 | authExcluded 降级单条 | L1 | `verify:auth-fallback` | ☑ |
| RB-09 | 标题 placeholder | ↷ | manifest resourceTitle 文档 | ↷ |

---

## 批次 4 · 合集 collectionCreator + 维护（~2h）

| ID | 核对项 | L | 怎么核 | ☐ |
|---|---|:---:|---|:---:|
| CC-S1-01 | subjectType:4 | L1 | collection create API | ☑ |
| CC-S1-02 | 属性模板 hydrate | L1 | `verify:collection-attrs` #32 | ☑ |
| CC-S2-01 | item add | L1 | verify:scenarios 合集 item | ☑ |
| CC-S2-02 | item import-dir | L1 | import-dir 合集链 | ☑ |
| CC-S2-03 | 单次添加 ≤100 | L2+L3 | `batchReleaseGuards.test.ts` + 101 负例（可选 dev） | ☑ |
| CC-S2-04 | 目录 CRUD/排序 | L1 | S11e `collection item *` | ☑ |
| CC-S2-05 | authExcluded 合集项 | L1 | `verify:collection-attrs` #35 | ☑ |
| CC-S2-06 | properties sync 无 merge | L1 | `verify:properties-sync` | ☑ |
| CC-S2-07 | publish merge0/1 | L1 | `verify:collection` | ☑ |
| CC-S3-01 | collection policy apply | L1 | scenarios | ☑ |
| CC-S4-01 | collection update listing | L1 | S11e `collection update` | ☑ |
| CC-S4-02 | collect-rules | — | — | — |
| CC-S4-03 | online 合集 | L1 | online 门禁 | ☑ |
| CM-01–05 | 维护期目录/sync/logs/display | L1 | S11e + S11d scenarios | ☑ |

---

## 批次 5 · 维护发新版 + Sidebar（~2h）

| ID | 核对项 | L | 怎么核 | ☐ |
|---|---|:---:|---|:---:|
| RV-01 | 合集目录禁止 publish | L2+L3 | 合集 cwd + publish → `create_new_version_error_unknowsubject` | ☑ |
| RV-02 | 版本号必填 | L2+L3 | `assertPublishVersionReady` 单测 | ☑ |
| RV-03 | semver | L2+L3 | `validation` + `freelog_versioning` | ☑ |
| RV-04 | version > latest | L2+L3 | `publishGuards.test.ts` 文案含 semver 规则 | ☑ |
| RV-05 | publish --bump | L1 | `bumpAndCover.test.ts` | ☑ |
| RV-06 | `--clear-file` 确认 | L2+L3 | `createversion_remove_file_confirmation` i18n 单测 | ☑ |
| RV-07 | draft push/pull/discard | L1+L3 | S6c draft * scenarios | ☑ |
| RV-08 | --video-cover 发新版 | L1 | publish body | ☑ |
| SB-INFO | update listing ≤1000 intro | L2+L3 | update 负例 | ☑ |
| SB-POL | apply/set + 重复预检 | L2 | `batchReleaseGuards` policy 段 + dev 重复名 | ☑ |
| SB-POL | 最后一条策略不可停用 | L2 | `collectionPolicyStatus.test.ts` | ☑ |
| SB-DEP | dep auth + authTree | L1 | `depAuthMap.test.ts` + publish | ☑ |
| SB-VER | version edit sync/description | L1 | S6e + version edit | ☑ |
| SB-ON | online 四门禁 | L2 | `onlineGates.test.ts` + dev | ☑ |
| SB-ON | 策略全下线 hint | L3 | `onlineService.test.ts` msg02 | ☑ |
| SB-OFF | offline 确认文案 | L3 | `onlineService.test.ts` confirm key | ☑ |

---

## 批次 6 · 策略 Builder 逻辑 + i18n 抽检（~1h）

| ID | 核对项 | L | 怎么核 | ☐ |
|---|---|:---:|---|:---:|
| POL-01–02 | 名空/名<2 | L2+L3 | policy.json 非法 | ☑ |
| POL-03 | 名重复 | L2+L3 | apply 与平台同名 → `策略名称已存在` | ☑ |
| POL-04 | 码重复 | L2+L3 | 同 policyText 不同名 → `策略代码已存在` | ☑ |
| POL-05 | 付费模板 | — | 边界 — | — |
| I18N-01 | 核心 OSS key zh/en 非空 | L3 | `i18n.test.ts` 扩展 spot | ☑ |
| I18N-02 | `--lang en_US` 抽检 10 条错误 | L3 | `i18n.test.ts` en_US spot 10 | ☑ |
| I18N-03 | 富文本 strip | L3 | `plainTextFromRichI18n` test | ☑ |

---

## 批次 7 · C 层加深（可选，~2h）

| # | 任务 | 做法 | ☐ |
|---:|---|---|:---:|
| 7.1 | createVersion 第 4 类型 spot | 扩展 `verify:console` 一种常用 typeCode | ↷ |
| 7.2 | 浏览器金样 spot | 歧义字段 `--browser-golden` 手工 1 次 | ↷ |
| 7.3 | import-dir inherit S13b | scenarios 已有，复核 additional key 在模板内 | ☑ |
| 7.4 | 负例 scenario 登记 | strict-batch / 无策略 / policy 重复 加入 verify-scenarios（可选） | ↷ |

---

## 批次 8 · ↷ 与边界文档收口（~30min）

| ID | 项 | 动作 | ☐ |
|---|---|---|:---:|
| ↷-01 | Step4 软上架 | 使用说明写清 update + online | ☑ |
| ↷-02 | 自动草稿 | draft push 对照 300ms | ☑ |
| ↷-03 | Builder UI | policy apply --from-file | ☑ |
| ↷-04 | fPolicyOperator | online hint policy set | ☑ |
| ↷-05 | batchSign 微应用 | manifest + dep auth | ☑ |
| ↷-06 | 封面裁剪 | 本地预裁 + 800px 建议 | ☑ |
| — | §0.2 五项边界 | 对照表 — 列无遗漏 | ☑ |
| CLI+ | videoCover / auto-chunk | 文档标注 CLI 领先 Console | ☑ |

---

## 推荐执行顺序（一点点来）

```text
第 1 天  批次 0 → 批次 1（SH）→ 批次 2 Step1–2
第 2 天  批次 2 Step3–4 → 批次 3（批量）
第 3 天  批次 4（合集）
第 4 天  批次 5（维护 + Sidebar）
第 5 天  批次 6（策略 + i18n 抽检）→ 批次 8 文档
可选     批次 7（C 层加深）
```

**每批出口：** 该批 ☐ 全改 ☑ 或明确 ↷/—；发现缺口 → 修代码/补测 → 重跑批次 0。

---

## 缺口处理规则

1. **L1 失败** → 优先修 API/字段，补 `verify:scenarios` 或 parity 脚本。
2. **L2 失败** → 修校验时机/规则，补单元测试（参考 `batchReleaseGuards.test.ts`）。
3. **L3 失败** → 补 bundled key + `cliError`；跑 `i18n:audit`。
4. **↷ 项** → 只要求 hint/文档等价，不复制 UI。
5. **— 项** → 不核，但对照表须标 —。

---

## 核对记录模板（每批填一行）

| 日期 | 批次 | 执行人 | 结果 | 缺口 ID | 跟进 |
|---|---|---|---|---|---|
| 2026-08-07 | 0 | agent | ☑ 全绿 | — | test 178 · parity · scenarios 52 |
| 2026-08-07 | 1–8 | agent | ☑ 完成 | CC-S2-04/CM e2e ↷ | 命令已实现，e2e 可后续补 |

---

维护：完成某 ID 核对后，同步更新 [CLI全量对齐任务清单.md](./CLI全量对齐任务清单.md) 与 [CLI数据操作与Console对照.md §0.1](../对齐/CLI数据操作与Console对照.md)（若发现与一屏结论不符）。
