# CLI 数据操作与 Console 对照

最后更新：2026-08-10

**本文是 parity 扁平索引真源。** 梳理 Console 本地文件脚手架相关的全部**数据写入**业务，逐项标注 CLI 是否实现。**细粒度拓扑（页面→Effect→API→CLI）见 [CLI拓扑与Console对照.md](./CLI拓扑与Console对照.md)。**

字段定义见 [CLI字段账本](../开发/CLI字段账本.md)；命令参数见 [CLI使用说明与Console差异](../使用/CLI使用说明与Console差异.md)。**Console 业务流程与提示词全集见 [Console完整业务梳理.md](./Console完整业务梳理.md)。**

---

## 0. 对齐公理（脚手架 = Console 无界面版）

**脚手架与 Console 浏览器端的关系：只差有没有界面。** Console 上本地文件发版与维护能做的事、能写的 API 字段、能到达的平台状态，CLI **都必须能等价完成**。

| 维度 | 是否允许与 Console 不同 | 说明 |
|---|---|---|
| **功能 / 业务能力** | **否** | 每条写入 API 的业务操作都须有 CLI 等价路径（命令或 manifest 字段）；缺命令 = 待补齐，不是范围外 |
| **业务流程 / 阶段** | **否** | 创建壳 → 设版本意图 → 发版 → 策略 → 上下架 → 维护更新；阶段与门禁与 Console 一致 |
| **请求体 / 平台事实** | **否** | 同文件、同类型下 `createVersion` / `updateCollection` 等 payload 须与 Console 同源（源码 Effect + C 层验证） |
| **数据填写方式** | **是（唯一常态差异）** | Console 表单向导 vs CLI 命令行 / manifest / JSON·YAML 批量配置 |
| **可视化交互** | **是** | 无 Builder UI、无拖拽目录、无防抖自动存草稿；用文件与显式 `draft push` 达到同一远端对象 |

**一句话：** 流程与功能都要一样；**仅**界面与「怎么把数据填进系统」可以不同。不能因为没有 UI 就省略 Console 已有的业务能力，也不能用「最终状态看起来差不多」代替字段级 parity。

---

## 0.1 一屏结论（2026-08-07 全量对齐）

**范围：** Console 本地文件发版 + sidebar 维护写入 API。不含：云存储选文件、付费签约、列表/收藏/节点/收入。（RSS / collect-rules 属 sidebar 维护，CLI 已覆盖。）

| 层级 | 含义 | 当前 |
|---|---|---|
| **L1 业务/API** | 同操作 → 同 API → 同平台状态 | ✅ 81 项 §2 无 ❌ |
| **L2 校验/门禁** | 同字段规则、同失败时机 | ✅ 查重/semver/SHA1/批量/合集100/策略重复 |
| **L3 文案/i18n** | OSS 同源 key + `cli.*` bundled | ✅ `pnpm i18n:audit` 0 命中 |

| 状态 | 数量 | 含义 |
|---|---:|---|
| ✅ L1+L2+L3 | **~68+** | 脚手架范围内可对齐项已对齐 |
| ↷ 交互等价 | **~8** | 裁剪 UI、Builder、自动草稿、软上架等 |
| — 边界 | **5** | §0.2 完全做不到 / Console 同限 |

**能否说「脚手架已对齐 Console」？→ 边界与 ↷ 除外，L1+L2+L3 全量对齐完成；验证：`pnpm verify:parity` + `pnpm verify:scenarios`（以脚本末尾汇总为准）+ **207** 单元测试。详见 [Console对齐核对报告](./Console对齐核对报告.md)。**

**图例（§2 状态列）：** ✅ A+B（主链 dev 可达）· ⚠️ 仅 A 或 A+B 但 C 未证 · ❌ 明确不对齐 · ↷ 填写/交互差异（功能仍须等价）· — 不在范围

**核对防漏：** 新增/改 Console 写入 Effect 时，先在 [拓扑文档 §3](./CLI拓扑与Console对照.md#3-按-console-页面展开) 增 `TOP-*` 节点，再改 §2 行。

---

## 0.2 CLI 不应做 / 完全做不到（边界真源）

除下列条目外，Console 本地文件发版与维护的**写入业务 CLI 都必须对齐**（见 §0 对齐公理）。缺能力 = 待补齐，**不得**以「无 UI」为由搁置。

### 完全做不到（形态 / 平台限制，非脚手架 bug）

| # | 业务 | 原因 | Console 侧 |
|---:|---|---|---|
| 12 | 云存储选文件作版本源 | 脚手架只认本地 `filePath`，无法浏览远端 Storage | step2 storageSpace |
| 19 | Markdown / Cartoon 微应用编辑器 | 内嵌浏览器微应用 + 专用 draft，非本地文件路径 | step2 editMarkdown/Cartoon |
| 68 | 付费策略签约 | 须支付收银台人机确认；CLI 可声明 dep、免费 batchSetContracts | 支付 + 合同 |

另：**资源列表浏览、收藏、加节点、交易收入、contract 只读查询** — Console 运营/消费侧，**从来不在**脚手架范围（见 [CLI脚手架设计 §1.9.5](../开发/CLI脚手架设计.md#195-不在脚手架范围勿当缺口)）。

### 不应做（Console 也不做 / 或 CLI 用等价路径，不算缺口）

| # | 业务 | CLI 约定 |
|---:|---|---|
| 64 | 修改已有策略正文 | 与 Console 同限：新增策略 + 启停，不改旧 policyText |
| — | 封面裁剪 UI | Console `FUploadCover`+`FCropperModal` 交互裁切；CLI **无裁剪 UI**，须本地裁好再 `--cover` / `--video-cover` | ↷ |
| — | 创建期 videoCover | Console step2/versionCreator **TODO 未传** createVersion；CLI `version set --video-cover` → `publish` | ⚠ Console 落后 |
| — | 改 Console 浏览器端代码 | 本仓库只开发 CLI |

### 填写/交互不同，功能须等价（↷，不是「可不做」）

| # | Console | CLI 等价 |
|---:|---|---|
| 22 | Step4 软上架 `status:1` | 严格 `online`（门禁相同） |
| 63 | 新增策略后顺带上架 | 用户再执行 `online` |
| 81 | 300ms 自动 `saveVersionsDraft` | 显式 `draft push` |
| — | 策略 Builder UI | `policy apply --from-file` |
| 29 | batchSign 授权微应用 UI | manifest / `freelog.batch.json` 手填 + `dep auth` |

### 仍须继续对齐（不在上表内）

§2 中仍为 ⚠️ 的项属于**待补齐**，不是「不应做」。当前无 ❌。

---

## 0.3 CLI 增强（Console 无等价 UI，不违反对齐公理）

脚手架在 **Console 写入 API parity 之外**，还提供本地工程化能力；不改变「发版 payload 须与 Console 同源」的要求。

| 能力 | CLI | Console | 说明 |
|---|---|---|---|
| **主题/插件/前端库模板** | `template list` + `init theme\|widget\|package --template …` 落盘工程 | **无**本地模板脚手架；Step2 **上传已有 zip** | CLI 增强：帮开发者从零建工程；发版仍走同一 createVersion 链 |
| **type pick 定稿** | `init theme/widget/package` 或 `type pick` | Step1 选类型（UI） | 业务相同，入口不同 |
| **声明式 dep 签约** | `dep auth --policy-map auth-map.yaml` | sidebar **dependency / contract** + **FContractHandleDrawer** 微应用 | **双方都有**；Console 不是「没有签约」，是可视化微应用；CLI 用 YAML/JSON 等价调 `batchSetContracts` |
| **batchSignContracts 手填** | manifest / `freelog.batch.json` | creatorBatch / 微应用 UI | 同一 API 字段，填写方式不同（↷ §0.2） |
| **封面上传校验** | `assertLocalCoverFile`（OSS/bundled 同源文案） | `FUploadCover` 同规则 + **裁剪 UI** | 硬约束对齐；裁剪见 §0.2 ↷ |
| **国际化** | `t()` 纯文本 + `--lang` / `FREELOG_LANG` / `lang set` | Console `tAuto()` → React | OSS 同源 key；CLI strip HTML |

**纠正常见误解：** 「依赖签约 Console 没有」→ **不对**。Console 有依赖页与合同微应用；CLI 的 `dep auth` 是**无 UI 的等价路径**，不是 Console 缺能力。

---

## 1. 范围与核对方法

| 项 | 说明 |
|---|---|
| Console 源码 | `freelogfe-web-repos/packages/console/src/pages/resource/`、`src/models/` |
| Console 业务全集 | [Console完整业务梳理.md](./Console完整业务梳理.md)（流程 + 提示词 + 校验） |
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
| 2 | TOP-SH-PARSE-SSE/POLL | 上传后 SSE 解析文件 meta | `PropertyParser.parsePromise` | GET SSE `/v2/storages/files/listSSE/info` | `pollFilesSha1Info`（REST 轮询，Node 无 EventSource；`verify:meta` 证同源） | ✅ |
| 3 | TOP-SH-HANDLE | 组装 systemProperties | `handleData_By_Sha1…2` | 内部 + `getAttrsInfoByKey` | `handleFilePropertiesBySha1` | ✅ |
| 4 | TOP-SH-TEMPLATE | 无文件时加载类型属性模板 | collection Step1；sha1 为空 | `Storage.filesInfo` GET | `resolveCollectionPropertiesFromType` | ✅ |
| 5 | TOP-SH-PARSE-POLL | 批量上传后轮询解析完成 | creatorBatch Task | `Storage.filesListInfo` GET | `pollFilesSha1Info` | ✅ |
| 6 | TOP-SH-MAP-ATTR | 解析结果 → createVersion.inputAttrs | step2/versionCreator/batch 提交前 | `inputAttrs[{key,value}]`（additional） | publish/import-dir 自动解析 + manifest inherit | ✅ C |
| 7 | TOP-SH-MAP-CUSTOM | 解析结果 → customPropertyDescriptors | 同上 | `customPropertyDescriptors[]` | publish/import-dir 自动解析 + manifest inherit | ✅ |
| 8 | TOP-SH-VALIDATE | 本地算 SHA1 + 格式/大小校验 | 浏览器 / 类型配置 | `getResourceTypeInfoByCode` | `processFile` + `assertLocalFileAllowedByType` | ✅ |
| 9 | TOP-SH-ZIP | 主题/插件/库目录 zip | 构建产物 | 本地 zip | `processFileForPublish` | ✅ |
| 10 | — | 封面/视频封面上传 | update；versionCreator | `Storage.uploadImage` | `coverUpload`（格式/5M/静态 GIF）；`--cover`/`--video-cover` | ✅ |
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
| 25 | 每文件 PropertyParser `TOP-SH-*` | `handleLocalUploadSuccess` | #2–#7 每文件 | `batch/prepare.prepareFiles` | ✅ |
| 26 | 批量优化 resourceName | Handle | `generateResourceNames` | `batch/prepare` 内部 | ✅ |
| 27 | 批量 createBatch | `onClickRelease` | `createBatch` · createResourceObjects[] | `resource import-dir` | ✅ |
| 28 | createBatch 内 inputAttrs/属性 `TOP-RB-BATCH-ATTR` | 每 item systemProperties | 每项 inputAttrs, customPropertyDescriptors | prepareFiles 自动解析 | ✅ C（`verify:create-batch`） |
| 29 | createBatch.batchSignContracts `TOP-RB-BATCH-SIGN` | batch 提交 | batchSignContracts | manifest / `freelog.batch.json` + `dep auth` | ✅ A（↷ 无微应用 UI，见 §0.2） |
| 30 | authExcludedItems 项降级单条 `TOP-RB-FALLBACK` | Handle | create + createVersion | fallback 路径 | ✅ C（`verify:auth-fallback`） |

### 2.4 创建 / 首版 — 合集 `collectionCreator`

| # | 业务操作 | Console | API · 关键字段 | CLI | 状态 |
|---:|---|---|---|---|:---:|
| 31 | 创建合集壳 | step1 createBtn | `create` · subjectType:4 | `collection create` | ✅ |
| 32 | 加载合集类型属性模板 `TOP-CC-S1-TEMPLATE` | step1 后 handleData sha1:'' | #4 | `collection create` 后 hydrate | ✅ C（`verify:collection-attrs`） |
| 33 | 本地上传 → 子资源 + 首版 | Step2 本地上传 | create + createVersion + policy + online | `collection item import-dir` | ✅ |
| 34 | 添加单品到目录草稿 | FAddResourcesHandleAuth | `addResourceItems_Draft` · addCollectionItems[] | `collection item add/import-dir` + authExcludedItems | ✅ |
| 35 | 单品 authExcludedItems `TOP-CC-S2-AUTH-EX` | FContractHandleDrawer | addCollectionItems[].authExcludedItems | manifest / `--auth-excluded-file` | ✅ C（`verify:collection-attrs`） |
| 36 | 改单品标题 | Step2 | `updateCollectionItemsInfo_Draft` | `collection item update` | ✅ |
| 37 | 删单品 | Step2 | `deleteCollectionItems_Draft` | `collection item remove` | ✅ |
| 38 | 排序单品 | Step2 | reorder / manualSort | `collection item reorder` | ✅ |
| 39 | 合集 inputAttrs / 自定义属性 `TOP-CC-S2-SUBMIT` | Step2 saveInputAttrs 等 | `updateCollection` · inputAttrs, customPropertyDescriptors | manifest + publish / properties sync | ✅ C（`verify:collection-attrs`） |
| 40 | 合集发版首版 `TOP-CC-S2-SUBMIT` | step2 submitBtn | `updateCollection` · isMergeCatalogueDraft:1 | `collection publish` | ✅ C（merge0/1） |
| 41 | 合集发版草稿 | step2_SaveDraft | `saveVersionsDraft` --collection | `draft push --collection` | ✅ |
| 42 | 合集策略 Step3 | step3 | `update` · addPolicies | `collection policy apply` | ✅ |
| 43 | 合集 listing Step4 | step4 | `update` · tags, coverImages, intro | `collection update` | ✅ |
| 44 | 合集上架 | step4 | status:1 | `online` | ✅ |
| 45 | RSS 绑定 | infoEffects | Rss.* | `collection rss send-code` / `bind` / `sync` | ✅ |
| 46 | 自动收录规则 | infoEffects | setCollectRules | `collection collect-rules set`（`--from-file` 含 filterConditions） | ✅ |

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
| 53 | 发新版-本地上传+解析 `TOP-RV-UPLOAD` | versionCreator UploadFile | #1–#7 | `version set --file` + publish 自动解析 | ✅ |
| 54 | 发新版 createVersion `TOP-RV-CREATE` | CreateVersionBtn | 同 #16 | `publish` | ✅ C（同 verify:console） |
| 55 | 发新版草稿 | SaveDraft | `saveVersionsDraft` | `draft push` | ✅ |
| 56 | 拉/丢弃草稿 | versionInfo | lookDraft / deleteResourceDraft | `draft pull/discard` | ✅ |
| 57 | 改已发版 description | versionEditor updateDataSource | `updateResourceVersionInfo` · description | `version edit --description` | ✅ |
| 58 | 改已发版 inputAttrs `TOP-RE-SYNC` | syncAllProperties | `updateResourceVersionInfo` · inputAttrs | `version edit --sync-properties` | ✅ C（S6e） |
| 59 | 改已发版 customPropertyDescriptors `TOP-RE-SYNC` | syncAllProperties | 同上 · customPropertyDescriptors | `version edit --sync-properties` | ✅ C（S6e） |
| 60 | 改已发版 videoCover `TOP-RE-VIDEO` | versionEditor | updateResourceVersionInfo | `version edit --video-cover` | ✅ |

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
| 69 | createVersion.batchSignContracts `TOP-RB-BATCH-SIGN` | batch/creator | batchSignContracts | manifest + publish / import-dir | ✅ A（↷ 见 §0.2） |

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
| 74 | 维护期保存合集属性 `TOP-CM-SYNC-PROP` | version_syncAllProperties | updateCollection（仅 authExcluded + custom） | `collection properties sync` | ✅ C（`verify:properties-sync`） |
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
| 接入点 | publish / batch / collection | `resource/publishVersion`、`batch/prepare.prepareFiles`（含 collection item import-dir） |

**无 UI 约定：** 用户可在 manifest 预填补充属性；上传后 CLI 自动解析文件 meta 并合并 inherit，再写入 createVersion/createBatch 请求体与本地 manifest。

| P | 任务 | 影响总表 # | 现状 |
|---|---|---|:---:|
| **P0** | C 层：CLI round-trip（dry-run ↔ publish ↔ version show value） | 2–7, 16, 54 | ✅ dev RT005001（2026-08-06） |
| **P0** | Console 源码契约 + CLI 真实 API | 16, 54 | ✅ `verify:console`（契约 + RT005001 round-trip） |
| **P0** | updateCollection merge0/1 + 真实 publish | 40, 76 | ✅ `verify:collection` |
| **P0** | verify-scenarios 增加属性/sync 断言 | 58–59, 74 | ✅ S6d/S6e/S11d（2026-08-06） |
| **P1** | collection publish `isMergeCatalogueDraft` 条件化 | 76 | ✅ 目录指纹（2026-08-06） |
| **P1** | version edit sync 应先 pull 平台属性再 merge manifest | 58–59 | ✅ merge 逻辑（2026-08-06） |
| **P2** | createBatch 每项 inputAttrs ↔ 单品同文件 | 28 | ✅ `verify:create-batch`（2026-08-07） |
| **P2** | authExcluded 降级单条 create | 30 | ✅ `verify:auth-fallback` |
| **P3** | 合集 #32/#35/#39 | 32,35,39 | ✅ `verify:collection-attrs`（2026-08-07） |

**不在 P 队列（边界，勿当缺口）：** 见 §0.2 — 云存储 #12、付费 #68、Markdown/Cartoon #19。

**CLI 增强（非缺口）：** 见 §0.3 — 模板脚手架；`dep auth` 与 Console 微应用等价。

---

## 4. 附录

### 4.1 策略 policyText（dev 实测）

| 资源 | 语法 |
|---|---|
| 单品 | `for public` + `initial[active]:` |
| 合集壳 RT003006 | `FOR PUBLIC` + `Initial:`（非 `Initial Permit:`） |

提交前 URL 编码。详见 [CLI交接文档 §10.1](../交接/CLI交接文档.md#101-本轮自动化已覆盖2026-08-06pnpm-verifyscenarios-4242)。

### 4.2 dev 实测索引

`pnpm verify:scenarios` **115/115**（2026-08-10，dev 偶发网络超时可能导致单项失败；以脚本末尾汇总为准）：

- init 五选一、create、publish、policy、online/offline、update listing
- 主题/插件/视频/图片/合集/import-dir 主链
- version edit **--description** + **--sync-properties**；draft push/pull
- **S6f** publish 后 manifest / dry-run ↔ 平台 inputAttrs **value 一致**
- **S14** REST ↔ SSE metaInfoArray 一致
- **S13b** import-dir inherit additional ↔ 平台 value
- **S6e** sync-properties 读回一致性
- **S11d** 无目录变更 publish **merge=0** + properties sync
- **S16–S16d** 小说 P2/P3/P4/连载维护；**VID-03/05** 短视频；**COM-06/07** bind；**IMG/F/VID** 负向；**E3** 跨账号 owner

**明确不覆盖（不能据此声称与 Console Network 100% 一致）：**

- collection #32/#35/#39（`verify:collection-attrs`）

**已覆盖的 C 层（2026-08-07 更新）：**

- authExcluded 降级（#30 · `verify:auth-fallback`）
- createBatch 每项 inputAttrs（#28 · `verify:create-batch`）
- collection properties sync（#74 · `verify:properties-sync`）

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
| createBatch 每项 | ✅ | `pnpm verify:create-batch` |
| authExcluded 降级 | ✅ | `pnpm verify:auth-fallback` |
| properties sync | ✅ | `pnpm verify:properties-sync` |
| collection #32/#35/#39 | ✅ | `pnpm verify:collection-attrs` |
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
| CLI publish | `packages/cli/src/services/resource/publishVersion.ts` |
| CLI import | `packages/cli/src/services/batch/createFromDir.ts` |
| 拓扑真源 | [CLI拓扑与Console对照.md](./CLI拓扑与Console对照.md) |
| 场景验证 | `packages/cli/scripts/verify-scenarios.mjs` |
