# Console 表单字段与交互规则

> 文档角色：Console 本地文件发行域的字段级事实账本。本文记录 Console 的**有效约束**、提示、条件展示和 API 映射；CLI 是否纳入产品范围由根目录 [DESIGN.md](../../../DESIGN.md) 决定，能力完成状态见 [CLI数据操作与Console对照](./CLI数据操作与Console对照.md)。

证据快照：2026-08-11，Console commit `d74121e647f0223203f1f0bb317354b4191266f1`。

## 1. 判定规则

每个字段使用稳定 `FORM-*` ID。一次字段对齐必须同时核对：

1. 出现页面和出现条件；
2. 必填、长度、格式、枚举、默认值和规范化；
3. 禁用、隐藏、确认和失败提示；
4. 最终 API 字段与省略规则；
5. CLI flag/manifest、校验器、错误提示和负向测试。

约束强度分为：

| 强度 | 含义 | CLI 处理 |
|---|---|---|
| `HARD` | Console 阻止提交或平台拒绝 | CLI 必须在写平台前失败 |
| `CONDITIONAL` | 由资源类型、状态或身份动态决定 | CLI 查询平台事实后校验 |
| `SUGGESTION` | 只提示，不阻止提交 | CLI 可提示，不得伪装成硬门禁 |
| `UI_ONLY` | 裁剪、拖拽、抽屉等交互 | CLI 提供显式等价操作或声明 `OUT` |

“组件 props 中声明”不自动等于有效约束。例如属性编辑器虽然传入部分 `maxLength` 配置，但当前内部输入组件存在 `lengthLimit={-1}` 路径；未确认实际阻止提交前，不登记为 `HARD`。

## 2. 资源创建壳

| ID | 页面 / 字段 | Console 有效规则与提示 | API | CLI 契约 | 状态 |
|---|---|---|---|---|---|
| `FORM-RES-TYPE` | creator/collectionCreator Step1 · 资源类型 | `HARD` 必选；只能提交有效资源类型。提示 `naming_convention_resource_type_required` | `resourceTypeCode`, 可选 `resourceTypeName` | `--resource-type` / `resource.typeCode`；动态查询并拒绝未知或非叶子类型 | 对齐 |
| `FORM-RES-TITLE` | Step1 / sidebar info · 标题 | `HARD` 非空、trim 后提交、最多 100 字。提示 `naming_convention_resource_title_required`、不超过 100 个字符 | `resourceTitle` | `--title` / `resource.title`；`assertResourceTitle` | 对齐 |
| `FORM-RES-NAME` | Step1 · 授权标识 | `HARD` 1–60 字；规范化空格、emoji 和禁用字符；300ms 后查重。提示 `naming_convention_resource_authid_required`、`naming_convention_resource_name`、`resource_name_exist` | `name` | `--name` / `resource.name`；相同规范化与创建前查重 | 对齐 |
| `FORM-RES-SUBJECT` | collectionCreator Step1 · 合集类型 | `HARD` 合集创建固定 `subjectType: 4` | `subjectType` | `collection create` 内部固定，不暴露用户输入 | 对齐 |

源码：`pages/resource/creator/Step1/index.tsx`、`models/resourceCreatorPage/step1Effects.ts`、`models/collectionCreatorPage/step1Effects.ts`。

## 3. 文件与版本表单

| ID | 页面 / 字段 | Console 有效规则与提示 | API | CLI 契约 | 状态 |
|---|---|---|---|---|---|
| `FORM-VER-FILE` | creator Step2 / versionCreator · 本地文件 | `CONDITIONAL` 资源类型必须允许本地上传；格式/MIME/类型大小上限来自类型能力 | Storage upload → `fileSha1`, `filename` | `version.filePath`；类型能力校验后上传 | 对齐 |
| `FORM-VER-SIZE` | 本地上传任务 | `HARD` 视频不超过 1GB，其他不超过 200MB，并叠加类型 `fileMaxSize`。提示“文件大小不能超过…” | 上传前无写入 | `assertLocalFileAllowedByType` | 对齐 |
| `FORM-VER-SHA1` | 上传后查重 | `HARD` 同一文件已被自己或他人发行时阻止当前发行 | SHA1 查询 | publish/import-dir 前执行 SHA1 release guard | 对齐 |
| `FORM-VER-NUMBER` | 首版 / 发新版 · 版本号 | 首版固定 `1.0.0`；维护页 `HARD` semver 且大于 latestVersion；默认 patch +1 | `version` | manifest `version.version`，支持显式 bump；相同 semver 与递增门禁 | 对齐 |
| `FORM-VER-DESC` | Step2 / versionCreator · 版本说明 | 可为空；首版 Console 默认空串 | `description` | `version.description` | 对齐 |
| `FORM-VER-INPUT` | 系统附加属性 | `CONDITIONAL` 字段、类型、候选值来自资源类型和文件属性解析结果 | `inputAttrs[]` | 平台属性解析后合并 manifest 显式值 | 部分 C 证据 |
| `FORM-VER-CUSTOM` | 自定义属性/配置 | `CONDITIONAL` UI 配置依属性类型变化；当前部分声明长度并非所有输入路径的有效硬拦 | `customPropertyDescriptors[]` | manifest 显式结构；按 API 结构归一化 | 部分 C 证据 |
| `FORM-VER-DEPS` | 依赖 | `HARD` 发布前依赖授权必须完整。提示“依赖中存在未获取授权的资源” | `dependencies`, `baseUpcastResources`, `authExcludedItems` | 独立 manifest 字段；按 Console 契约解析嵌套 authTree，提取 contractIds 后查询 batchContracts 的 status/authStatus；失败码 5 | 对齐 |
| `FORM-VER-COVER` | 视频版本封面 | 仅视频类型显示；创建/发新版 Console 当前保存草稿字段但未传 `createVersion` | `videoCover` 当前 Console 提交缺失 | CLI 允许新版本显式设置，是 CLI 增强；不计作严格 parity | 已裁决 |
| `FORM-VER-DRAFT` | 发版表单草稿 | Console 300ms 防抖自动保存，失败提示“草稿保存失败” | save/look/deleteVersionsDraft | CLI 显式 `draft push/pull/discard`，双边变化时冲突 | 等价 |

源码：`creator/Step2`、`resourceVersionCreatorPage.ts`、`FLocalUpload`、`PropertyParser.ts`。

## 4. Listing 表单

| ID | 页面 / 字段 | Console 有效规则与提示 | API | CLI 契约 | 状态 |
|---|---|---|---|---|---|
| `FORM-LIST-COVER` | creator Step4 / sidebar info · 封面 | `HARD` JPEG/PNG/GIF、最大 5MB；800px 只是 `SUGGESTION`；裁剪是 `UI_ONLY` | `coverImages[]` | 本地文件校验并上传；不提供裁剪，本地预裁 | 对齐 |
| `FORM-LIST-INTRO` | creator/collectionCreator Step4 / sidebar info · 简介 | `HARD` 最多 200 字；`FIntroductionInput` 默认也是 200；RSS 关联对象禁用编辑 | `intro` | `--intro` / `resource.intro`；`assertIntro` 统一限制 200 | 对齐 |
| `FORM-LIST-TAGS` | creator Step4 / sidebar info · 标签 | `HARD` 最多 20 个；单标签最多 20 字；空值和重复值不接受 | `tags[]` | `--tags` / `resource.tags`；`assertTags`，提交前去重 | 对齐 |
| `FORM-LIST-RSS-LOCK` | sidebar info · RSS 关联资源 | `CONDITIONAL` 标题、封面、简介、标签等按 Console 状态锁定 | Resource update | CLI 写入前必须识别相同平台限制；能力矩阵按专项环境证据验收 | 待专项 ENV |

源码：`creator/Step4/index.tsx`、`collectionCreator/Step4/index.tsx`、`FIntroductionInput`、`FLabelEditor`、`sidebar/info/$id`。

## 5. 策略、上架与下架

| ID | 页面 / 字段/动作 | Console 有效规则与提示 | API | CLI 契约 | 状态 |
|---|---|---|---|---|---|
| `FORM-POL-NAME` | fPolicyBuilder3 · 策略名 | `HARD` 非空、2–20 字、名称不可重复。提示“请输入策略名称”“不少于2个字符”“策略名称已存在” | `policyName` | 策略文件解析后执行同样长度和重复校验 | 对齐 |
| `FORM-POL-TEXT` | 策略正文 | `HARD` 策略代码不可重复；API 层 URI 编码 | `policyText` | 本地保存明文，平台 adapter 层编码 | 对齐 |
| `FORM-ONLINE` | sidebar 上架 | `HARD` 必须存在正式版本并至少启用一条策略；冻结状态拒绝 | `status: 1` | `online` 采用 sidebar 严格门禁，不复制创建向导软上架 | 对齐 |
| `FORM-OFFLINE` | sidebar 下架 | 写前确认 | `status: 4` | TTY 确认；非交互要求 `--yes` | 对齐 |
| `FORM-PAID` | 付费策略签约 | 需要收银台/结算能力 | 合同相关 API | 收银台为 `OUT`；免费策略 CLI 直签，付费/不可验证返回环境感知的 Console 依赖页、合约页和 `nextCommand` | 接力契约对齐 |

## 6. 合集表单与目录

| ID | 页面 / 字段/动作 | Console 有效规则与提示 | API | CLI 契约 | 状态 |
|---|---|---|---|---|---|
| `FORM-COL-ADD` | collectionCreator Step2 · 添加条目 | 单次最多添加 100 个；条目必须满足平台授权和可加入条件 | `addResourceItems_Draft` | `collection item add/import-dir`；相同数量、重复和授权门禁 | 对齐 |
| `FORM-COL-TITLE` | 条目标题 | 最多 100 字 | `updateCollectionItemsInfo_Draft` | `collection item update --title`；共用 `assertCollectionItemTitle` | 对齐 |
| `FORM-COL-ORDER` | 条目排序 | 拖拽形成稳定顺序 | reorder/sort draft API | `collection item reorder` / order file | 等价 |
| `FORM-COL-DISPLAY` | 合集展示设置 | 五个固定枚举：序号、图片、简介 show/hide；视图 list/card；排序 ascending/descending | `catalogueProperty` | manifest `collection.display`，API 映射为 `catalogueProperty` | 对齐 |
| `FORM-COL-MERGE` | 发布合集 | 目录发生变化才 `isMergeCatalogueDraft=1` | `updateCollection` | 稳定目录指纹生成 0/1 | 对齐 |
| `FORM-COL-RULES` | 自动收录 | `serializeStatus` 0/1；`conditionType` every/some；key/operator 固定组合；值必填；标题/授权标识最多 100/60 字；授权标识 starts-with 自动加 username 前缀 | `setCollectRules` + resource info | `collection collect-rules set/get`；文件与简写统一经过契约校验 | 对齐；dev round-trip |
| `FORM-COL-RSS` | RSS 绑定和同步 | 地址预检、owner email、重复占用、15 条阈值与日期范围、验证码、换源 GUID 比对、同步进度/失败项 | Rss APIs | `collection rss inspect/send-code/bind/status/sync`；危险换源须 `--force --yes` | CONTRACT 对齐；受控邮箱 ENV 待执行 |
| `FORM-COL-RSS-LOCK` | RSS 合集维护 | 除标签外，标题/封面/简介、更新规则、条目、展示、草稿和手工版本发布禁用 | Resource/Rss APIs | service guard 统一拒绝 feed 管理内容写入；tags 保留 | CONTRACT 对齐；RSS ENV 待执行 |

## 7. 批量创建

| ID | 页面 / 字段/动作 | Console 有效规则与提示 | API | CLI 契约 | 状态 |
|---|---|---|---|---|---|
| `FORM-BATCH-COUNT` | creatorBatch · 文件列表 | 单次最多 20 个文件 | `createBatch` | CLI 可接受更大目录并分批，但每个平台批次不超过 20；这是 CLI 原生等价 | 对齐方式已裁决 |
| `FORM-BATCH-TITLE` | 每项标题 | 默认文件名去扩展名，截取 100 字；可编辑，最多 100 字 | item `resourceTitle` | prepare 时生成并限制 100 字 | 对齐 |
| `FORM-BATCH-NAME` | 每项授权标识 | 规范化、1–60 字、批内不得重复、平台查重 | item `name` | 每项使用相同 name validator 和幂等查重 | 对齐 |
| `FORM-BATCH-POLICY` | 批量应用策略 | 无策略仍发行时 Console 弹窗确认 | item `policies` | 非交互模式必须显式配置；不得隐式确认 | 等价 |
| `FORM-BATCH-CONTRACT` | 批量签约映射 | 微应用生成 `batchSignContracts` | item `batchSignContracts` | manifest/batch config 显式声明；付费交互仍 `OUT` | 边界明确 |

## 8. CLI 交互转换总表

| Console 方式 | CLI 等价方式 | 必须保持不变的业务事实 |
|---|---|---|
| 必填/长度计数器 | schema/validator + code 4 | 字段可接受集合 |
| 下拉和候选过滤 | 平台查询 + 枚举校验 | 类型和候选集合 |
| disabled 按钮 | preflight 失败 | 状态门禁 |
| 自动规范化 | 规范化后显示最终值 | 最终 API 值 |
| debounce 自动草稿 | 显式 `draft push` | 草稿对象与字段 |
| 确认弹窗 | TTY 确认或 `--yes` | 风险知情与副作用 |
| 裁剪/拖拽 | 本地预裁、reorder 命令 | 上传结果与最终顺序 |
| 页面内存 | manifest + state | 用户意图与平台事实分离 |

## 9. 对齐完成条件

字段状态只有在以下条件全部满足后才能写“对齐”：Console 源码位置有效；有效约束已登记；CLI 入口和校验存在；API 字段/省略语义一致；至少一个边界负测；涉及动态平台事实时有目标环境证据。

`部分 C 证据` 和 `待专项 ENV` 都不是完成状态，不能折算成绿色总数。

## 10. 证据反向索引

| FORM 范围 | Console 源码 | CLI 实现 | 自动化证据 |
|---|---|---|---|
| `FORM-RES-*` | `creator/Step1/index.tsx`、`step1Effects.ts` | `resourceName.ts`、`validation.ts`、`resourceService.ts` | `validation.test.ts`、`resourceName.test.ts`、`resourceService.test.ts` |
| `FORM-VER-FILE/SIZE/SHA1` | `FLocalUpload`、creatorBatch `Task` | `resourceTypeCapabilities.ts`、`processFile.ts`、`sha1ReleaseGuard.ts` | `resourceTypeCapabilities.test.ts`、`processFile.test.ts`、guard tests |
| `FORM-VER-NUMBER/DEPS` | `resourceVersionCreatorPage.ts` | `publishVersion.ts`、publish guards、dep auth | version/publish/dep tests 与 dev parity 脚本 |
| `FORM-VER-INPUT/CUSTOM` | `PropertyParser.ts`、`handleData_By_Sha1...` | `filePropertyService`、`createVersionParams.ts` | payload parity；仍需完整 C 证据 |
| `FORM-LIST-*` | `creator/Step4`、`FIntroductionInput`、`FLabelEditor`、sidebar info | `validation.ts`、`coverUpload.ts`、resource/collection maintenance | `validation.test.ts`、cover tests、场景负例 |
| `FORM-POL-*` | `fPolicyBuilder3` | `policyService.ts` | `policySchema.test.ts`、`validation.test.ts` |
| `FORM-ONLINE/OFFLINE` | sidebar `Sider/index.tsx` | `onlineGates.ts`、online/offline services | `onlineGates.test.ts`、online service tests |
| `FORM-COL-*` | collectionCreator/collectionSidebar、`FCollectionItems2` | `services/collection/*`、`catalogueDraftTracking.ts` | collection tests、merge parity |
| `FORM-BATCH-*` | creatorBatch `Handle/Card/Task` | `services/batch/*` | `batch.test.ts`、batch robustness/parity |

Console 源码根为 `D:/appinside/freelogfe-web-repos/packages/console/src`；CLI 源码根为 `packages/cli/src`。Console commit 变化后，先重新核对本索引，再更新能力矩阵，不允许只修改“已对齐”状态。

本地源码漂移检查：

```bash
pnpm --filter @freelog-cli/cli verify:console-forms
```

默认读取相邻仓库 `../freelogfe-web-repos/packages/console`；其他位置通过 `FREELOG_CONSOLE_ROOT` 或 `--console-root=<packages/console>` 指定。脚本检查 Console commit、工作区洁净度和 18 组核心 `FORM-*` 源码模式，不替代 Network payload 与目标环境验收。最近一次真实 dev 结果见 [2026-08-12 dev 验证报告](../验证/reports/2026-08-12-dev.md)（[2026-08-11](../验证/reports/2026-08-11-dev.md) 为上一版）。
