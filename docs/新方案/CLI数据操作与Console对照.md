# CLI 数据操作与 Console 对照

最后更新：2026-08-06

**本文是 parity 扁平索引真源。** 梳理 Console 本地文件脚手架相关的全部**数据写入**业务，逐项标注 CLI 是否实现。**细粒度拓扑（页面→Effect→API→CLI）见 [CLI拓扑与Console对照.md](./CLI拓扑与Console对照.md)。**

字段定义见 [CLI字段账本](./CLI字段账本.md)；命令参数见 [CLI使用说明与Console差异](./CLI使用说明与Console差异.md)。

---

## 0. 一屏结论（2026-08-06 诚实核对）

**范围：** Console 本地文件发版 + sidebar 维护写入 API。不含：云存储选文件、RSS、collect-rules、付费签约、列表/收藏/节点/收入。

**三种状态（不要混为一谈）：**

| 层级 | 含义 | 当前 |
|---|---|---|
| **A 代码路径** | CLI 有对应模块/命令，请求字段形状与 Console 源码同构 | 大部分已具备 |
| **B dev 主链可达** | `pnpm verify:scenarios` 52 项：create/publish/online/合集/import-dir 等 API 能通 | **已通过**（2026-08-06） |
| **C payload parity** | 同文件、同类型下 createVersion/updateCollection 请求体与 Console Network 抓包一致 | **createVersion：RT005001/RT001/RT006003**；**updateCollection：merge0/1**（`verify:console` / `verify:collection`） |

| 状态 | 数量 | 含义 |
|---|---:|---|
| ✅ A+B | **~38** | 主链 dev 可达（verify:scenarios 覆盖项） |
| ✅ C partial | **7 类** | dry-run↔平台 value、REST↔SSE meta、createVersion×3 类型、updateCollection merge0/1、cover SSE↔sync、batchSign 透传 |
| ⚠️ A 有、C 未证 | **~12** | authExcluded 降级、createBatch 每项 body、properties sync Console 抓包等 |
| ❌ 明确不对齐 | **0** | ~~#76 isMergeCatalogueDraft~~ 已修（2026-08-06） |
| ↷ 流程差异 | **3** | 软上架、自动草稿、策略 Builder UI |
| — 不在范围 | **6** | 云存储、Markdown/Cartoon、RSS、collect-rules、改策略正文、付费 |

**能否说「脚手架已对齐 Console」？→ 仍不能。** B≠C。已证关键 createVersion（3 类型）+ updateCollection（merge0/1），但 createBatch 每项、authExcluded 降级、维护 sync Console 抓包等待扩展。

**图例（§2 状态列）：** ✅ A+B（主链 dev 可达）· ⚠️ 仅 A 或 A+B 但 C 未证 · ❌ 明确不对齐 · ↷ 流程差异 · — 不在范围

**核对防漏：** 新增/改 Console 写入 Effect 时，先在 [拓扑文档 §3](./CLI拓扑与Console对照.md#3-按-console-页面展开) 增 `TOP-*` 节点，再改 §2 行。

---

## 1. 范围与核对方法

| 项 | 说明 |
|---|---|
| Console 源码 | `freelogfe-web-repos/packages/console/src/pages/resource/`、`src/models/` |
| API 签名 | `freelog-runtime-cli/tools-lib/src/service-API/resources.ts` |
| CLI 实现 | `packages/cli/src/services/`、`commands/` |
| 属性链路 | Console 凡本地上传 → `handleData_By_Sha1…` → PropertyParser SSE → `systemProperties` → 提交前写入 `inputAttrs` / `customPropertyDescriptors` |

### 1.1 C 层验证策略（默认，非浏览器抓包）

| 优先级 | 做法 | 命令 / 位置 |
|:---:|---|---|
| **1** | **CLI 真实登录 + 真实 dev API**：走完整 init → create → publish 链，断言平台接受且读回一致 | `pnpm verify:scenarios`、`verify:payload`、`verify:console`（含 RT005001 round-trip） |
| **2** | **Console 源码 / tools-lib 类型契约**：Effect 组参字段（如 step2Effects 不传 `batchSignContracts`）↔ CLI `buildCreateVersionParams` | `scripts/lib/console-source-contract.mjs`；`verify:console` / `verify:collection` |
| **3** | **浏览器 Network 抓包** | 仅当 1+2 无法消除歧义时手工 spot check；自动化加 `--browser-golden` |

Console 侧 `Parameters<typeof FServiceAPI.Resource.createVersion>[0]` 等在源码里已定义；**不必**以 Playwright 快照为主金样。

---

## 2. 业务操作 parity 总表

> **拓扑列：** 每行 `#` 对应 [CLI拓扑与Console对照.md](./CLI拓扑与Console对照.md) 中的 `TOP-*` 节点 ID。

### 2.1 上传、Storage、文件属性（所有本地文件的公共链路）

| # | 拓扑 | 业务操作 | Console | API · 关键字段 | CLI | 状态 |
|---:|:---:|---|---|---|---|:---:|
| 1 | TOP-SH-UPLOAD | 本地文件上传到 Storage | `FLocalUpload`；creator/versionCreator/batch Task | `Storage.uploadFile` POST | `storageUpload.uploadFileIfNeeded`；publish/import-dir | ✅ |
| 2 | TOP-SH-PARSE-SSE/POLL | 上传后 SSE 解析文件 meta | `PropertyParser.parsePromise` | GET SSE `/v2/storages/files/listSSE/info` | `pollFilesSha1Info`（REST 轮询，非 SSE） | ⚠️ |
| 3 | TOP-SH-HANDLE | 组装 systemProperties | `handleData_By_Sha1…2` | 内部 + `getAttrsInfoByKey` | `handleFilePropertiesBySha1` | ⚠️ |
| 4 | TOP-SH-TEMPLATE | 无文件时加载类型属性模板 | collection Step1；sha1 为空 | `Storage.filesInfo` GET | `resolveCollectionPropertiesFromType` | ⚠️ |
| 5 | TOP-SH-PARSE-POLL | 批量上传后轮询解析完成 | creatorBatch Task | `Storage.filesListInfo` GET | `pollFilesSha1Info` | ⚠️ |
| 6 | TOP-SH-MAP-ATTR | 解析结果 → createVersion.inputAttrs | step2/versionCreator/batch 提交前 | `inputAttrs[{key,value}]`（additional） | publish/import-dir 自动解析 + manifest inherit | ⚠️ |
| 7 | TOP-SH-MAP-CUSTOM | 解析结果 → customPropertyDescriptors | 同上 | `customPropertyDescriptors[]` | publish/import-dir 自动解析 + manifest inherit | ⚠️ |
| 8 | TOP-SH-VALIDATE | 本地算 SHA1 + 格式/大小校验 | 浏览器 / 类型配置 | `getResourceTypeInfoByCode` | `processFile` + `assertLocalFileAllowedByType` | ✅ |
| 9 | TOP-SH-ZIP | 主题/插件/库目录 zip | 构建产物 | 本地 zip | `processFileForPublish` | ✅ |
| 10 | — | 封面/视频封面上传 | update；versionCreator | `Storage.uploadImage` | `coverUpload`；`--cover`/`--video-cover` | ✅ |
| 11 | TOP-SH-COVER-SYNC | 自动生成封面（图片/视频） | CoverGenerator SSE | POST SSE `generateCoverImageSSE` | `coverGenerateService`（同步 + SSE）；`cover compare` | ✅ |
| 12 | TOP-RC-S2-STORAGE | 云存储选文件作版本源 | step2 storageSpace | Storage 引用 | — | — |

### 2.2 创建 / 首版 — 单品 `resourceCreator`

| # | 业务操作 | Console Model / Effect | API · 关键字段 | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 13 | 创建资源壳 Step1 | `onClick_step1_createBtn` | `create` · name, resourceTypeCode, resourceTitle | `create` | ✅ |
| 14 | 本地上传 Step2 | `onSucceed_step2_localUpload` | #1–#3 | `version set --file` + publish 自动解析 | ✅ |
| 15 | 用户编辑系统/补充属性 | Step2 表单 | 本地 state | manifest inherit + 解析合并 | ✅ |
| 16 | 发行首版 createVersion `TOP-RC-S2-SUBMIT` | `onClick_step2_submitBtn` | `createVersion` · fileSha1, filename, inputAttrs, customPropertyDescriptors, dependencies, baseUpcastResources, authExcludedItems | `publish` | ✅ C（RT005001/RT001/RT006003） |
| 17 | 存发版表单草稿 | `onTrigger_step2_SaveDraft` | `saveVersionsDraft` · draftData | `draft push` | ✅ |
| 18 | 丢弃发版草稿 | versionInfo 空态 | `deleteResourceDraft` | `draft discard` | ✅ |
| 19 | Markdown/Cartoon 编辑器 | step2 editMarkdown/Cartoon | 微应用 + draft | — | — |
| 20 | 新增策略 Step3 | `onClick_step3_addPolicyBtn` | `update` · addPolicies | `policy apply --from-file` | ✅ |
| 21 | 改 listing Step4 | `onClick_step4_submitBtn` | `update` · tags, coverImages, intro | `update` | ✅ |
| 22 | 软上架 Step4 | 同上 | `update` · status:1（无门禁） | — | ↷ |
| 23 | 硬上架 | sidebar `resourceOnline` | `update` · status:1 + 门禁 | `online` | ✅ |

### 2.3 创建 / 首版 — 批量 `resourceCreatorBatch`

| # | 业务操作 | Console | API · 关键字段 | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 24 | 批量本地上传 | Handle/Task | #1 | `import-dir` 内部 | ✅ |
| 25 | 每文件 PropertyParser `TOP-SH-*` | `handleLocalUploadSuccess` | #2–#7 每文件 | `fromDirService.prepareFiles` | ⚠️ |
| 26 | 批量优化 resourceName | Handle | `generateResourceNames` | `fromDirService` 内部 | ✅ |
| 27 | 批量 createBatch | `onClickRelease` | `createBatch` · createResourceObjects[] | `resource import-dir` | ✅ |
| 28 | createBatch 内 inputAttrs/属性 `TOP-RB-BATCH-ATTR` | 每 item systemProperties | 每项 inputAttrs, customPropertyDescriptors | prepareFiles 自动解析 | ⚠️ |
| 29 | createBatch.batchSignContracts `TOP-RB-BATCH-SIGN` | batch 提交 | batchSignContracts | manifest / `freelog.batch.json` 手填；`dep auth` 声明式 | ⚠️ A（Console 微应用无 CLI 等价） |
| 30 | authExcludedItems 项降级单条 `TOP-RB-FALLBACK` | Handle | create + createVersion | fallback 路径 | ⚠️ |

### 2.4 创建 / 首版 — 合集 `collectionCreator`

| # | 业务操作 | Console | API · 关键字段 | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 31 | 创建合集壳 | step1 createBtn | `create` · subjectType:4 | `collection create` | ✅ |
| 32 | 加载合集类型属性模板 `TOP-CC-S1-TEMPLATE` | step1 后 handleData sha1:'' | #4 | `collection create` 后 hydrate | ⚠️ |
| 33 | 本地上传 → 子资源 + 首版 | Step2 本地上传 | create + createVersion + policy + online | `collection item import-dir` | ✅ |
| 34 | 添加单品到目录草稿 | FAddResourcesHandleAuth | `addResourceItems_Draft` · addCollectionItems[] | `collection item add/import-dir` + authExcludedItems | ✅ |
| 35 | 单品 authExcludedItems `TOP-CC-S2-AUTH-EX` | FContractHandleDrawer | addCollectionItems[].authExcludedItems | manifest / `--auth-excluded-file` | ⚠️ |
| 36 | 改单品标题 | Step2 | `updateCollectionItemsInfo_Draft` | `collection item update` | ✅ |
| 37 | 删单品 | Step2 | `deleteCollectionItems_Draft` | `collection item remove` | ✅ |
| 38 | 排序单品 | Step2 | reorder / manualSort | `collection item reorder` | ✅ |
| 39 | 合集 inputAttrs / 自定义属性 `TOP-CC-S2-SUBMIT` | Step2 saveInputAttrs 等 | `updateCollection` · inputAttrs, customPropertyDescriptors | manifest + publish / properties sync | ⚠️ |
| 40 | 合集发版首版 `TOP-CC-S2-SUBMIT` | step2 submitBtn | `updateCollection` · isMergeCatalogueDraft:1 | `collection publish` | ✅ C（merge0/1） |
| 41 | 合集发版草稿 | step2_SaveDraft | `saveVersionsDraft` --collection | `draft push --collection` | ✅ |
| 42 | 合集策略 Step3 | step3 | `update` · addPolicies | `collection policy apply` | ✅ |
| 43 | 合集 listing Step4 | step4 | `update` · tags, coverImages, intro | `collection update` | ✅ |
| 44 | 合集上架 | step4 | status:1 | `online` | ✅ |
| 45 | RSS 绑定 | infoEffects | Rss.* | — | — |
| 46 | 自动收录规则 | infoEffects | setCollectRules | — | — |

### 2.5 维护 — 基础信息（sidebar info）

| # | 业务操作 | Console | API · 字段 | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 47 | 改资源/合集标题 | info SaveEditTitleBtn | `update` · resourceTitle | `update --title` / `collection update` | ✅ |
| 48 | 改简介 | SaveIntroductionBtn | `update` · intro | `--intro` | ✅ |
| 49 | 改封面 | onChange_Cover | `update` · coverImages | `--cover` | ✅ |
| 50 | 改标签 | onChange_Labels | `update` · tags | `--tags` | ✅ |
| 51 | 从平台拉回 listing | 打开页 / pull | `info` 读 | `pull --apply-listing` | ✅ |
| 52 | 改合集展示样式 | collection info | `updateCollection` · catalogueProperty | `collection update --display-*` | ✅ |

### 2.6 维护 — 版本、属性、草稿

| # | 业务操作 | Console | API · 关键字段 | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 53 | 发新版-本地上传+解析 `TOP-RV-UPLOAD` | versionCreator UploadFile | #1–#7 | `version set --file` + publish 自动解析 | ⚠️ |
| 54 | 发新版 createVersion `TOP-RV-CREATE` | CreateVersionBtn | 同 #16 | `publish` | ✅ C（同 verify:console） |
| 55 | 发新版草稿 | SaveDraft | `saveVersionsDraft` | `draft push` | ✅ |
| 56 | 拉/丢弃草稿 | versionInfo | lookDraft / deleteResourceDraft | `draft pull/discard` | ✅ |
| 57 | 改已发版 description | versionEditor updateDataSource | `updateResourceVersionInfo` · description | `version edit --description` | ✅ |
| 58 | 改已发版 inputAttrs `TOP-RE-SYNC` | syncAllProperties | `updateResourceVersionInfo` · inputAttrs | `version edit --sync-properties`（先 resourceVersionInfo1 再 merge） | ⚠️ |
| 59 | 改已发版 customPropertyDescriptors `TOP-RE-SYNC` | syncAllProperties | 同上 · customPropertyDescriptors | `version edit --sync-properties` | ⚠️ |
| 60 | 改已发版 videoCover `TOP-RE-VIDEO` | versionEditor | updateResourceVersionInfo | `version edit --video-cover` | ⚠️ |

### 2.7 维护 — 策略

| # | 业务操作 | Console | API · 字段 | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 61 | 新增策略 | resourceAuthPage | `update` · addPolicies | `policy apply` | ✅ |
| 62 | 策略启停 | resourceAuthPage | `update` · updatePolicies | `policy set <id> <0\|1>` | ✅ |
| 63 | 新增策略后顺带上架 | online_afterSuccessCreatePolicy | status:1 | 用户再 `online` | ↷ |
| 64 | 修改已有策略正文 | — | 平台惯例：不做 | 同 Console | — |

### 2.8 维护 — 依赖授权

| # | 业务操作 | Console | API | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 65 | 声明依赖（版本意图） | versionCreator 表单 | 随 createVersion.dependencies | manifest + `dep add/update/remove` | ✅ |
| 66 | 免费策略签约 | 授权微应用 / batch | `batchSetContracts` / Contract | `dep auth --policy-map` | ✅ |
| 67 | publish 前 authTree 校验 | 发行前 | `authTree` | `publish` 内部 | ✅ |
| 68 | 付费策略签约 | 支付流程 | 支付 + 合同 | — | — |
| 69 | createVersion.batchSignContracts `TOP-RB-BATCH-SIGN` | batch/creator | batchSignContracts | manifest + publish / import-dir | ⚠️ |

### 2.9 维护 — 上下架

| # | 业务操作 | Console | API | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 70 | 上架（硬路径） | Sider resourceOnline | `update` status:1 + 门禁 | `online` | ✅ |
| 71 | 下架 | Sider operateResource | `update` status:4 | `offline` | ✅ |

### 2.10 维护 — 合集目录与发版

| # | 业务操作 | Console | API | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 72 | 维护期添加单品 | collectionSidebar | addResourceItems_Draft | `collection item add/import-dir` | ✅ |
| 73 | 维护期目录 CRUD/排序 | versionInfo | item draft APIs | `collection item *` | ✅ |
| 74 | 维护期保存合集属性 `TOP-CM-SYNC-PROP` | version_syncAllProperties | updateCollection（仅 authExcluded + custom） | `collection properties sync` | ⚠️ |
| 75 | 合集发版草稿 `TOP-CM-SAVE-DRAFT` | version_SaveDraft | saveVersionsDraft | `draft * --collection` | ✅ |
| 76 | 发布合集更新 `TOP-CM-PUBLISH` | version_SaveDate | updateCollection · isMergeCatalogueDraft | `collection publish`（目录指纹条件 merge） | ✅ |
| 77 | 合集变更日志 | ChangeLogDrawer | getCollectionUpdateLogs | `collection logs` | ✅（只读） |

### 2.11 特殊 / 基础

| # | 业务操作 | Console | API | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 78 | 半路接入已有资源 | — | info | `bind` | ✅ |
| 79 | 显式同步 state | 打开页 | info / lookDraft / collection items | `pull` / `status` | ✅ |
| 80 | init 脚手架 | — | —（仅本地 manifest） | `init` | ✅ |
| 81 | 300ms 自动存草稿 | step2/versionCreator | saveVersionsDraft | — | ↷ |

---

## 3. 未对齐项 → 代码任务（按优先级）

### 3.1 P0 实现设计（2026-08-06 已落地核心）

**模块：** `packages/cli/src/services/filePropertyService.ts`

| 步骤 | Console | CLI 实现 |
|---|---|---|
| 上传后解析 meta | PropertyParser SSE | `pollFilesSha1Info` → `Storage.filesListInfo` 轮询（与 creatorBatch Task 同 API，Node 无 EventSource） |
| 组装 systemProperties | `handleData_By_Sha1…` | `handleFilePropertiesBySha1` |
| inherit 来源 | step2 draft | manifest `inputAttrs` / `customPropertyDescriptors` → `inheritDataFromVersionConfig` |
| 提交前映射 | step2 submitBtn | `createVersionPropertiesFromHandleData` → `inputAttrs`（additional）+ `customPropertyDescriptors` |
| 接入点 | publish / batch / collection | `publishService.publishVersion`、`fromDirService.prepareFiles`（含 collection item import-dir） |

**无 UI 约定：** 用户可在 manifest 预填补充属性；上传后 CLI 自动解析文件 meta 并合并 inherit，再写入 createVersion/createBatch 请求体与本地 manifest。

| P | 任务 | 影响总表 # | 现状 |
|---|---|---|:---:|
| **P0** | C 层：CLI round-trip（dry-run ↔ publish ↔ version show value） | 2–7, 16, 54 | ✅ dev RT005001（2026-08-06） |
| **P0** | Console 源码契约 + CLI 真实 API | 16, 54 | ✅ `verify:console`（契约 + RT005001 round-trip） |
| **P0** | updateCollection merge0/1 + 真实 publish | 40, 76 | ✅ `verify:collection` |
| **P0** | verify-scenarios 增加属性/sync 断言 | 58–59, 74 | ✅ S6d/S6e/S11d（2026-08-06） |
| **P1** | collection publish `isMergeCatalogueDraft` 条件化 | 76 | ✅ 目录指纹（2026-08-06） |
| **P1** | version edit sync 应先 pull 平台属性再 merge manifest | 58–59 | ✅ merge 逻辑（2026-08-06） |
| **P2** | batchSignContracts：manifest 透传 + 单品默认不传 | 29, 69 | ✅ `verify:batch`（2026-08-06） |
| **P2** | generateCover：SSE vs 同步 API 同 sha1 结果对比 | 11 | ✅ `pnpm verify:cover`（2026-08-06） |
| ~~P2~~ | ~~collection properties sync~~ | 74 | ✅ 已修 payload（仅 authExcluded + customPropertyDescriptors） |

**不在 P 队列：** 云存储 #12、RSS #45、collect-rules #46、付费 #68、Markdown/Cartoon #19。

---

## 4. 附录

### 4.1 策略 policyText（dev 实测）

| 资源 | 语法 |
|---|---|
| 单品 | `for public` + `initial[active]:` |
| 合集壳 RT003006 | `FOR PUBLIC` + `Initial:`（非 `Initial Permit:`） |

提交前 URL 编码。详见 [CLI交接文档 §10.1](./CLI交接文档.md#101-本轮自动化已覆盖2026-08-06pnpm-verifyscenarios-4242)。

### 4.2 dev 实测索引

`pnpm verify:scenarios` **52 项**（2026-08-06，dev 偶发网络超时可能导致单项失败）：

- init 五选一、create、publish、policy、online/offline、update listing
- 主题/插件/视频/图片/合集/import-dir 主链
- version edit **--description** + **--sync-properties**；draft push/pull
- **S6f** publish 后 manifest / dry-run ↔ 平台 inputAttrs **value 一致**
- **S14** REST ↔ SSE metaInfoArray 一致
- **S13b** import-dir inherit additional ↔ 平台 value
- **S6e** sync-properties 读回一致性
- **S11d** 无目录变更 publish **merge=0** + properties sync

**明确不覆盖（不能据此声称与 Console Network 100% 一致）：**

- authExcludedItems 降级单条 create 路径（#30）
- createBatch 每项 body 与 Console creatorBatch 抓包并排
- collection properties sync / version sync 维护页 Console 抓包
- Console 微应用 batchSign（CLI 仅 manifest/`freelog.batch.json` 手填 + `dep auth`）

**已覆盖的 C 层 partial（dev，2026-08-06）：**

- `publish --dry-run` createVersion body ↔ 发版后 `version show` **value 一致**（S6f / `verify:payload`）
- manifest inputAttrs ↔ 平台读回 **value 一致**
- REST `filesListInfo` ↔ SSE `listSSE/info` **metaInfoArray 一致**（S14 / `verify:meta`）
- **Console Network createVersion ↔ CLI dry-run**（`verify:console`：RT005001/RT001/RT006003）
- **Console updateCollection ↔ CLI `collection publish --dry-run`**（`verify:collection`：merge0/1）
- generateCover **同步 API ↔ SSE** 同 sha1 URL 一致（`verify:cover`）
- batchSignContracts **manifest 透传** + 单品默认不传（`verify:batch`）
- import-dir batch inherit additional（S13b，key 须在类型 meta 模板内）

### 4.3 C 层 payload 验证

| 项 | 状态 | 做法 |
|---|---|---|
| dry-run ↔ 平台 value | ✅ | S6f、`pnpm verify:payload` |
| manifest ↔ 平台 value | ✅ | S6f |
| SSE vs REST meta | ✅ | S14、`pnpm verify:meta` |
| import-dir inherit additional | ✅ | S13b |
| createVersion Console 契约 + CLI API | ✅ 3 类型 | `pnpm verify:console`（默认）；浏览器金样 `--browser-golden` |
| updateCollection merge0/1 | ✅ | `pnpm verify:collection`（默认）；`--browser-golden` 可选 |
| cover SSE ↔ sync | ✅ | `pnpm verify:cover` |
| batchSign 透传 | ✅ | `pnpm verify:batch` |
| **一键跑齐** | — | `pnpm verify:parity` |

### 4.4 维护约定

1. Console 新增数据写入 → 先在 [拓扑文档](./CLI拓扑与Console对照.md) 增 `TOP-*` 节点，再增 §2 一行，再改代码。
2. 实现完成 → 按 A/B/C 改状态列，并更新 §0 计数；**禁止**仅用 mock 或 42/42 将 ⚠️ 改为 ✅。
3. 其它文档（脚手架设计 §1.9、交接 §9.3）只保留指针，**不重复维护状态**。

---

## 5. 权威路径

| 用途 | 路径 |
|---|---|
| Console 资源页 | `D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource\` |
| PropertyParser | `...\console\src\utils\PropertyParser.ts` |
| handleData | `...\console\src\utils\service.ts` |
| CLI publish | `packages/cli/src/services/publishService.ts` |
| CLI import | `packages/cli/src/services/fromDirService.ts` |
| 拓扑真源 | [CLI拓扑与Console对照.md](./CLI拓扑与Console对照.md) |
| 场景验证 | `packages/cli/scripts/verify-scenarios.mjs` |
