# Freelog 资源发行模块 · 逆向需求分析报告

> 分析来源：
> 1. 平台帮助文档站（freelog3.freelog.cn）：《发行资源》操作指南、《基础概念》、《运营节点》相关章节
> 2. 前端代码：`D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource`（创建向导、列表、详情、侧边栏）及其调用的 service 层
>
> 说明：本报告由"帮助文档 + 前端代码"双向推导而成。帮助文档描述产品意图，前端代码验证字段约束与接口细节。两者不一致处已在文中标注。

---

## 一、平台概述与基础概念

### 1.1 平台角色

| 角色 | 定义 | 核心动作 |
|---|---|---|
| 资源作者 | 数字资源的创作者及版权所有者 | 发行资源、提供授权、获取收益 |
| 节点商 | 资源整合者，将资源签约到节点展示运营 | 签约展品、分享推广、获取中间人收益 |
| 资源消费者 | 最终消费者 | 与节点商签约获取授权 |

### 1.2 核心概念

| 概念 | 说明 |
|---|---|
| 资源 | 平台上流通的数字商品（小说、图片、音乐、视频、游戏、主题、插件等）。由资源名称、类型、封面、简介、版本、标签、授权策略组成 |
| 资源授权标识 | 资源的全局唯一标识，格式为 `用户名/资源名`，**创建后不可修改** |
| 资源类型 | 决定市场曝光度与节点展示方式。**创建成功后不可修改**；上传文件格式需与类型一致 |
| 资源版本 | 由版本号（SemVer 规范）、资源发行对象（文件，生成 Freelog ID）、基础属性、补充属性、自定义选项、资源依赖、版本描述组成 |
| 复合资源 | 存在依赖关系的资源（如带插图的小说依赖图片资源） |
| 上抛 | 依赖资源无法达成合约时，将依赖"上抛"给节点商处理授权 |
| 授权策略 | 资源作者/节点商对资源授权或转授权时的权利声明，包含授权对象（注册用户/节点商/自定义分组）、授权范围、授权主张（费用、期限等） |
| 节点 | 节点商面向消费者展示资源的平台。每用户最多创建 3 个节点；节点创建后不可删除 |
| 展品 | 被节点商签约到节点上的资源 |
| 合约 | 签约双方基于授权策略形成的协议记录 |
| 合集 | 资源的集合体（连载小说、连载漫画、音乐专辑、播客栏目），代码中 subjectType=4 |

### 1.3 关键业务规则（文档明确）

1. **授权策略一经发布，无法更改或删除**。如需变更，须停用旧策略并新建；旧策略已签约用户在合约期内继续生效。
2. **资源发行后无法删除**，只能下架；下架后已签约方在合约期内仍可获取授权。
3. 资源必须有授权策略才能上架到资源市场、开放签约。
4. 每个节点有且仅有一个测试节点；自有资源拥有天然测试授权。
5. 存储空间：最多 5 个，总容量 2GB；非空存储空间不可删除。上传至存储空间后可在测试节点测试，通过后作为发行对象导入资源新版本。

---

## 二、资源发行总体流程

### 2.1 入口

工作台点击【+】→「创建资源」，进入创建入口页（`/resource/creatorEntry`），提供三种方式：

| 方式 | 路由 | 适用场景 |
|---|---|---|
| 发行单个资源 | `/resource/creator` | 通用 |
| 批量发行资源 | `/resource/creatorBatch` | 图片、音频、视频等同类型资源批量发行 |
| 发行合集 | `/resource/collectionCreator` | 连载小说、连载漫画、音乐专辑、播客栏目 |

### 2.2 通用生命周期

```
创建授权条目 → 上传文件/添加单品 → 添加授权策略 → 完善信息并上架
     ↓                                              ↓
  (可"稍后处理"暂存)                        上架到资源市场开放签约
     ↓                                              ↓
版本管理/更新版本 ←—————————————— 资源管理（信息/策略/合约/依赖）
```

### 2.3 资源状态机

| 状态值 | 含义 | 说明 |
|---|---|---|
| 0 | 待发行 | 初始状态（已创建条目未上架） |
| 1 | 上架（online） | 在市场可见、可签约 |
| 4 | 下架（offline） | 作者主动下架 |
| 2 | 冻结（freeze） | 平台冻结，用户不可操作；批量管理中不可勾选 |

状态流转：`待发行(0) → 上架(1) ⇄ 下架(4)`；冻结(2) 由平台侧操作。

**上架前置条件**（代码验证）：必须存在已发布版本 + 至少一个上线状态的授权策略。侧边栏上架开关按以下优先级处理：
1. 无最新版本 → 提示先发布版本，终止；
2. 无任何策略 → 弹窗确认后打开策略构建器创建策略并上架；
3. 所有策略均下线 → 弹窗选择要启用的策略，更新后上架；
4. 否则直接 `Resource.update({status:1})`。

下架需二次确认弹窗。

---

## 三、单个资源发行流程（4 步向导）

路由 `/resource/creator`，状态管理 dva model `resourceCreatorPage`。Step1/Step2/Step4 有未保存数据时离开页面会弹窗确认（FPrompt）。每一步均提供"稍后处理"按钮跳转版本信息页暂存。

### Step1：创建资源授权条目

**字段与约束：**

| 字段 | name | 控件 | 必填 | 校验规则与提示 |
|---|---|---|---|---|
| 资源类型 | `step1_resourceType` | 下拉搜索+可自定义类型（FResourceTypeInput4） | ✅ | 不能为空，提示"请选择资源类型" |
| 资源标题 | `step1_resourceTitle` | 单行输入+字数统计 | ✅ | 非空（"请输入标题"）；≤100 字符（"不超过100个字符"） |
| 资源授权标识 | `step1_resourceName` | 单行输入，前缀固定 `{用户名}/` | ✅ | ≤60 字符；自动将 `\ / : * ? " < > | 空格 @ $ # Emoji` 替换为 `_`；300ms 防抖后端查重；已存在时提示"资源授权标识 {authID} 已存在" |

**业务逻辑：**
- 标题变更时，若授权标识与标题相同，自动同步（截取前 60 字符）——对应文档"自动生成资源授权标识"。
- 名称输入时自动优化并显示绿色提示："您的资源授权标识将自动转换为 {optimized}"。
- 提交按钮禁用条件：类型为空 / 名称为空 / 名称有错误或正在查重 / 标题为空或超长。

**接口：** `Resource.create` → `POST /v2/resources`，参数 `{ name, resourceTypeCode, resourceTypeName?, resourceTitle }`。
成功后获取 `resourceId`，再调 `Resource.getResourceTypeInfoByCode`（`GET /v2/resources/types/{code}`）拿到该类型的配置：`fileCommitMode`（决定上传方式）、`fileMaxSize`、`supportDownload/Edit/OptionalConfig` 等，然后进入 Step2。

### Step2：上传资源文件

**上传方式**（由资源类型配置的 `fileCommitMode` 位掩码决定显示哪些）：

| Bit | 值 | 方式 |
|---|---|---|
| 0 | 1 | 本地上传（受 fileMaxSize 限制） |
| 1 | 2 | 存储空间导入 |
| 2 | 4 | Markdown 编辑器（抽屉） |
| 3 | 8 | 漫画编辑器（抽屉） |

- 资源类型名称包含"视频"时，额外显示视频封面上传入口。
- 上传后展示文件卡片（文件名、来源、MIME 图标），支持编辑（若类型支持）、下载、移除（移除需二次确认）。

**基础属性区：**
- 系统属性（`systemProperties`）：上传后由后端自动解析，key/name/description 不可编辑；
- 自定义/补充属性（`customProperties`）：手动添加，**上限 30 条**，属性值最大 **100 字符**；由属性键、属性值、属性说明组成；
- 三类属性（系统属性、补充属性、自定义选项）的 key/name 全局互斥去重。

**更多设置区（默认折叠）：**
- 可选配置（`customConfigurations`）：仅当类型支持时显示；开放给节点商自定义设置（如背景色、播放顺序），由键、默认值、输入样式、说明组成；上限 30 条；
- 依赖授权：微前端组件 `FMicroAPP_Authorization`，维护直接依赖 `directDependencies`、基础上抛资源 `baseUpcastResources`、授权完整性 `isCompleteAuthorization`、授权排除项 `authExcludedItems`。对应文档"依赖声明"：若涉及引用或再创作，需添加依赖资源并获取授权。

**草稿：** 数据变更 300ms 防抖自动保存草稿。

**下一步条件：** 已选文件 且 授权完整（`isCompleteAuthorization=true`）。

### Step3：添加授权策略

- 策略列表 + 策略模板（按资源类型过滤推荐模板）；可从模板选择后调整授权价格、授权时间等。
- 文档流程：选模板 → 点【校验】→ 校验成功后【创建】→【下一步】。
- 策略在此步不强制添加（可稍后处理），但**无策略则无法上架**。

### Step4：完善资源信息并上架

| 字段 | name | 控件 | 必填 | 校验规则 |
|---|---|---|---|---|
| 资源封面 | `step4_resourceCover` | 图片上传 | ❌ | JPG/PNG/GIF，≤5M，建议 800×600px |
| 资源简介 | `step4_resourceIntroduction` | 多行文本 | ❌ | ≤200 字符（超长时提交按钮禁用） |
| 资源标签 | `step4_resourceLabels` | 抽屉编辑+标签卡片 | ❌ | 用于分类和搜索 |

**提交：** `Resource.update` → `PUT /v2/resources/{resourceId}`，参数 `{ resourceId, tags, coverImages?, intro, status: 1 }`（提交即上架）。成功后进入"创建成功"页，可管理资源（更新版本、编辑信息、管理策略等）。

---

## 四、批量发行资源流程

路由 `/resource/creatorBatch`，三阶段页面：`选择资源类型 → 上传与信息完善 → 完成页`。仅支持同类型资源（图片、音频、视频等）。

### 阶段 1：选择资源类型

| 字段 | 控件 | 必填 | 校验 |
|---|---|---|---|
| 资源类型 | 下拉选择（不允许自定义新类型） | ✅ | 不能为空 |

底部提示："批量发行仅支持同类型资源"。

### 阶段 2：上传文件与信息完善

**文件来源：**
- 本地上传（多选，accept 格式由资源配置决定）；
- 存储空间导入（抽屉选择对象）。

**上限：最多 20 个文件**，超出部分截断并给出警告。

**每个资源卡片字段：**

| 字段 | 说明 | 校验 |
|---|---|---|
| fileName / sha1 | 文件名、哈希（只读） | — |
| cover | 封面（可自动生成） | — |
| resourceName | 授权标识（自动生成，可编辑） | 非空；批量内去重；自动合法化 |
| resourceTitle | 标题（默认取文件名去扩展名，截取 100 字符） | 非空 |
| resourceLabels | 标签 | — |
| resourcePolicies | 授权策略 `{title, text}` | — |
| systemProperties / customProperties / customConfigurations | 属性与配置 | — |
| directDependencies / baseUpcastResources | 依赖与上抛资源 | — |
| isCompleteAuthorization | 授权完整性 | 必须为 true 才能提交 |

**错误处理：**
- 文件已被其他用户发行 → 错误卡片提示"该文件已被其他用户发行"；
- 文件已被自己发行 → 错误卡片显示已有资源版本信息；
- 错误卡片支持"纠正"重新处理。

**批量应用：** 标签和授权策略支持一键应用到所有资源（对应文档"应用于所有资源"）；标签取并集，上限 20 个。

**提交：** 无策略的资源会在提交前弹窗确认。接口 `Resource.createBatch` → `POST /v2/resources/createBatch`，参数：

```
{
  resourceTypeCode,
  createResourceObjects: [{
    name, resourceTitle, policies[], coverImages[], intro, tags[],
    version: '1.0.0', fileSha1, filename, description,
    dependencies[], customPropertyDescriptors[], baseUpcastResources[],
    batchSignContracts[], inputAttrs[]
  }]
}
```

辅助接口：`Resource.generateResourceNames`（POST `/v2/resources/generateResourceNames`，批量生成合法名称）、`Resource.getResourceBySha1`（GET `/v2/resources/sha1/{sha1}`，检查文件占用）。

### 阶段 3：完成页

展示每个资源的创建结果（成功/失败及原因）。后续操作：管理我的资源、继续发行、签约到节点（仅上架成功的资源）、添加至合集。

---

## 五、合集发行流程（4 步向导）

路由 `/resource/collectionCreator`。适用于连载小说、连载漫画、音乐专辑、播客栏目。主页面以 60 秒间隔轮询 RSS 同步进度，显示导入中/错误横幅。

### Step1：创建合集

| 字段 | 控件 | 必填 | 校验 |
|---|---|---|---|
| 合集类型 | 下拉选择（不允许自定义） | ✅ | 不能为空 |
| 合集标题 | 单行输入 | ✅ | 非空；≤100 字符 |
| 合集授权标识 | 单行输入，前缀 `{用户名}/` | ✅ | ≤60 字符；自动合法化；后端查重 |

**接口：** 复用 `Resource.create`，关键区别是参数携带 `subjectType: 4`（合集标识）。
合集类型额外支持两种导入方式：`collectionLibrary`（bit 4）资源库添加、`podcastRss`（bit 5）播客 RSS 导入。

### Step2：添加单品资源

**两种添加模式**（由类型配置决定；只有一种时跳过选择直接执行，两种都有时弹选择器）：

1. **资源库添加**：弹窗勾选已创建的单品资源 → 处理授权。也可在新标签页创建新资源后返回添加（文档）；
2. **Podcast RSS 导入**：输入 RSS URL → 发送验证码 → 绑定 Feed → 自动进入 Step3。
   - `Rss.sendVerificationCode`（发送验证码）
   - `Resource.bindRssFeed` → `POST /v2/resources/rss/{resourceId}/bindFeed`，参数 `{ feedUrl, verificationCode, pubStartDate?, pubEndDate? }`

**单品管理功能：**
- 搜索（300ms 防抖）、展示样式设置（卡片/列表视图，封面/序号/标题/简介显隐）、排序（按添加时间/标题/更新日期，或手动拖拽）、分页（卡片视图每页 6 条、列表视图每页 10 条）；
- 单品操作：处理授权排除、删除单品、自定义单品标题。

**基础属性与更多设置**：结构与单个资源 Step2 相同，但自定义属性值最大长度为 **140 字符**（单个资源为 100）。

**草稿：** 支持手动"保存草稿"按钮 + 自动防抖保存，显示保存状态与时间。

**下一步条件：** 授权完整（`isCompleteAuthorization=true`）。

### Step3：添加授权策略

与单个资源 Step3 一致：策略模板（按合集类型过滤）+ 策略列表。文档强调合集必须添加授权策略才能上架。

### Step4：完善合集信息并上架

| 字段 | 控件 | 必填 | 校验 |
|---|---|---|---|
| 合集封面 | 图片上传 | ❌ | RSS 合集禁用（由 RSS 同步控制） |
| 资源简介 | 多行文本 | ❌ | ≤200 字符；RSS 合集禁用 |
| 更新状态设置 | 单选+条件编辑器 | ❌ | 匹配条件值非空；RSS 合集禁用 |
| 合集标签 | 抽屉编辑 | ❌ | — |

**更新状态设置（对应文档"更新方式"）：**
- 完结状态 `isFinish`：true=更新完毕（已完结），false=持续更新；
- 自动收录单品 `automatic`（勾选后定义收录规则）；
- 匹配模式 `conditionType`：`every`（满足所有条件）/ `some`（满足任一条件）；
- 匹配条件 `conditions[]`，每项：
  - `key`：`resourceTitle`（资源标题）/ `authIdentity`（授权标识）/ `resourceTypeCode`（资源类型）
  - `limitOperatorType`：`INCLUDES` / `NOT_INCLUDES` / `STARTS_WITH` / `ENDS_WITH` / `EQUAL` / `NOT_EQUAL`
  - `value`：匹配值

**提交（三次串行调用）：**
1. `Resource.update` → `PUT /v2/resources/{id}`：`{ tags, coverImages?, intro }`
2. `Resource.setCollectRules` → `POST /v2/resources/catalogue/{id}/items/collectRules`：`{ serializeStatus, status, conditionType, filterConditions[] }`
3. `Resource.update` → `PUT /v2/resources/{id}`：`{ status: 1 }`（上架）

全部成功后跳转合集创建成功页。

---

## 六、版本管理与更新

### 6.1 版本结构（文档）

版本号遵循 SemVer 规范；版本由版本号、资源发行对象、基础属性、补充属性、自定义选项、资源依赖、版本描述组成。更新入口：【创建新版本】或【更新】→ 完善版本号、添加对象、描述 →【发行】。

### 6.2 版本创建页（`/resource/versionCreator/:id`）

单页表单（非向导），含离开保护。

| 字段 | 控件 | 校验规则 |
|---|---|---|
| 资源文件 | 与 Step2 相同的四种上传方式（按类型配置） | 必须选择文件 |
| 版本号 | FVersionInput | 非空；必须符合 SemVer；**必须大于当前最新版本号**；默认值为最新版本号或 `1.0.0` |
| 基础属性 | 系统属性（自动解析）+ 补充属性（上限 30 条，值 ≤140 字符） | — |
| 可选配置 | 上限 30 条 | 仅类型支持时显示 |
| 依赖授权 | 微前端组件（版本更新模式） | `isCompleteAuthorization` 必须为 true |
| 版本描述 | 富文本/Markdown 编辑器 | — |

**草稿：** 数据变更 300ms 防抖自动保存，显示"已保存 {time}"。

**提交：** `Resource.createVersion` → `POST /v2/resources/{resourceId}/versions`，参数：

```
{
  resourceId, version, fileSha1, filename, description,
  customPropertyDescriptors[], inputAttrs[],
  dependencies[], baseUpcastResources[],
  authExcludedItems[], batchSignContracts[]
}
```

### 6.3 版本信息页（侧边栏 `versionInfo/$id`）

- 版本选择器 + 更新版本按钮 + 草稿标记；
- 文件信息卡片：文件名、SHA1、预览（按 MIME 类型走文件预览/漫画预览/Markdown 预览）、下载；
- 基础属性：系统属性 + 自定义属性，支持行内编辑（RSS 资源禁用）；
- 可选配置：支持编辑（key/name/type 不可改）；
- 依赖授权：微前端组件展示；
- 版本描述：富文本编辑/保存；
- 相关视图：授权链 + 依赖链图谱（AntV G6）；
- 草稿管理：有草稿无正式版本时可丢弃草稿（`Resource.deleteResourceDraft` → `DELETE /v2/resources/{id}/versions/drafts`）。

**版本信息更新接口：** `Resource.updateResourceVersionInfo` → `PUT /v2/resources/{id}/versions/{ver}`，参数 `{ description, customPropertyDescriptors, inputAttrs }`。

**属性类型映射：**

| 前端类型 | API type |
|---|---|
| 只读自定义属性 | `readonlyText` |
| 可编辑配置（input） | `editableText` |
| 选择配置（select） | `select` |

---

## 七、资源列表与管理

路由 `/resource/list`，5 个 Tab：我的资源、我的合集、我的收藏、交易记录、创作收入。

### 7.1 我的资源（Resources）

**资源卡片字段：**

| 字段 | 说明 |
|---|---|
| `id` / `title` / `name` | 资源 ID、标题、授权标识 |
| `cover` / `type` / `version` | 封面、类型链、最新版本号 |
| `policy` | 策略名称列表 |
| `status` | 0 待发行 / 1 上架 / 4 下架 / 2 冻结 |
| `updateDate` / `username` / `useAvatar` | 更新时间、创作者信息 |
| `isChoice` | 是否编辑精选 |
| `authProblem` | 是否存在授权问题 |

**筛选与搜索：** 状态筛选（全部/上架/下架/待发行/冻结）、类型筛选、关键词搜索、分页加载。

**操作：**

| 操作 | 触发条件 | 说明 |
|---|---|---|
| 创建资源 | 始终 | 新窗口打开创建入口 |
| 查看详情 / 编辑版本 / 更新版本 | 非批量模式 | 跳转对应页面 |
| 批量管理 | 始终 | 进入批量模式 |
| 全选 | 批量模式 | 自动排除冻结(2)资源 |
| 添加至合集 | 批量+已选 ≤100 个 | 弹窗选合集后处理授权 |
| 添加至节点 | 批量+已选 | 签约到节点 |
| 批量上架 | 批量+已选 | `status:1` |
| 批量下架 | 批量+已选 | 二次确认后 `status:4` |
| 批量添加策略 | 批量+已选 | 策略构建后批量更新 |

**接口：** `Resource.list`、`Resource.batchAuth`、`Resource.batchUpdate`。

### 7.2 我的合集（Collections）

与"我的资源"差异：卡片左侧封面+右侧单品列表；额外字段 `isFinish`（完结状态）、`itemsCount`（单品数）、`itemsNames`（最近更新单品名）；状态筛选无"待发行"；批量操作无"添加至合集"。

**接口：** `Resource.list`（`subjectType=4`）、`Resource.batchResourceItems`（批量取单品）、`Resource.getVersionList` 等。

### 7.3 我的收藏（Collects）

资源与合集混合展示，支持取消收藏，点击按类型跳转详情。无批量管理。
**接口：** `Collection.collectionResources`、`Resource.batchInfo`、`Collection.deleteCollectResource`。

### 7.4 交易记录（Transaction）

**交易字段：** 交易时间、交易对方（用户/节点）、金额、备注、合约 ID/名称、交易状态。

| 状态值 | 含义 |
|---|---|
| 1 | 交易完成 |
| 2 | 交易关闭 |
| 其他 | 系统处理中 |

交易对方类型：`counterpartyType` 1=用户、2=节点；`transactionType` 1=入金（金额显示为负）、2=出金。

**筛选：** 时间范围（快捷：近一周/近一月/近一年）、金额范围、关键词（交易 ID/合约 ID/标的物授权标识）。

**接口：** `Payment.queryTransactionList`、`Payment.queryStatistics`。

### 7.5 创作收入（Income）

展示可提现金额、近 30 天收入、总收入、提现记录。

**提现状态：** 1 处理中 / 2 成功 / 3 失败。

**不可提现原因：**

| reason | 条件 | 引导 |
|---|---|---|
| `noAccount` | 未设置结算信息 | 前往结算信息设置 |
| `noWithdrawableAmount` | 无可提现金额 | — |
| `within24Hours` | 24 小时内已提现 | 每 24 小时仅可提现一次 |
| `noBankCard` | 未绑定银行卡 | 前往绑定银行卡 |

**接口：** `Payment.queryWithdrawStatus`、`Payment.queryFinancialAccountInfo`、`Payment.queryStatistics`、`Payment.queryWithdrawCashList`、`Payment.withdrawCash`（提现）、`User.currentUserInfo`（开户前检查手机号）。

---

## 八、资源详情与侧边栏管理

### 8.1 资源详情页（`/resource/details/:id`，公开页）

**展示：** 标题、授权标识、创作者、简介、收藏/分享、版本选择器、版本描述、基础属性、可选配置；右侧：签约至节点按钮、资源状态卡片、基础上抛资源列表、标签、授权链视图、依赖链视图（AntV G6 图谱，可全屏查看）。

**状态/警告：**
- `error` 非空 → 无法获取授权；
- `warning: authException` → 授权异常；
- `warning: ownerFreeze` → 所有者账号冻结。

**操作：** 收藏/取消收藏、分享（埋点 `TS000024`）、切换版本、签约至节点（需无 error 且已登录）。

### 8.2 资源侧边栏（`/resource/sidebar/`，作者管理页）

左右分栏：左侧导航 + 上下架开关，右侧内容页。导航 5 项：版本管理、资源信息、授权策略、授权合约、依赖授权。

#### 资源信息页（`info/$id`）

| 字段 | 编辑方式 | 限制 |
|---|---|---|
| 资源授权标识 | 只读 | 不可修改 |
| 资源标题 | 行内编辑 | ≤100 字符；RSS 关联时禁用 |
| 封面图 | 上传 | RSS 关联时禁用 |
| 简介 | 富文本 | RSS 关联时禁用 |
| 标签 | 抽屉编辑 | — |

均通过 `Resource.update` → `PUT /v2/resources/{id}` 保存。

#### 授权策略页（`policy/$id`）

**策略字段：** `policyId`、`policyName`、`policyText`（策略 DSL 文本）、`status`（0 下线 / 1 上线）。

**业务规则：**
- 至少需要一个上线策略才能上架；
- 上线/下线切换：`Resource.update({updatePolicies:[{policyId,status}]})`；
- 添加策略：策略构建器 → `Resource.update({addPolicies:[...]})`；
- 提供按资源类型过滤的策略模板；
- 对应文档：**策略一经发布无法更改或删除，只能停用后新建**。

#### 授权合约页（`contract/$id`）

展示该资源作为授权方（licensor）被签约的合约列表。

| 列 | 说明 |
|---|---|
| 被授权方 | 区分资源方/节点方/用户方，可点击跳转 |
| 所签策略 / 合约状态 / 创建时间 / 合约 ID | 状态徽章展示 |
| 操作 | 查看合约详情（抽屉） |

**合约状态枚举：** 0 生效中 / 1 已终止 / 2 异常。
**接口：** `Contract.contracts` → `GET /v2/contracts`（`identityType=1, licensorId=resourceId`）。

#### 依赖授权页（`dependency/$id`）

- 版本下拉选择器，切换版本重载依赖数据；
- 微前端组件展示依赖树与授权状态；
- 传入直接依赖与基础上抛资源；
- 对应文档：依赖资源的授权须达成合约，否则可"上抛"由节点商处理。

### 8.3 合集详情与合集侧边栏

**合集详情页**：与资源详情页类似，但**无版本选择器（合集固定版本 `1.0.0`）**，新增"合集内容"区块展示单品列表（分页、卡片/列表视图、序号/封面/标题/简介显隐），显示完结状态标签（已完结/连载中），签约时版本固定 `1.0.0`。

**合集侧边栏导航：** 单品管理、合集信息、授权策略、授权合约、上游授权管理。

**合集信息页** 额外字段：
- RSS 订阅地址（仅 RSS 合集，可更改，`Resource.bindRssFeed`）；
- 更新状态（完结状态 + 自动收录规则，`Resource.setCollectRules`；RSS 合集禁用，标签仍可编辑）。

**RSS 同步：** 侧边栏 60 秒轮询同步进度（`Rss.getSyncProgress`），导入中/错误横幅提示。

---

## 九、接口汇总清单

### 9.1 资源域（Resource）

| # | 函数 | 方法 | 路径 | 用途 |
|---|---|---|---|---|
| 1 | `Resource.create` | POST | `/v2/resources` | 创建资源/合集条目（合集带 subjectType=4） |
| 2 | `Resource.createBatch` | POST | `/v2/resources/createBatch` | 批量创建资源 |
| 3 | `Resource.createVersion` | POST | `/v2/resources/{id}/versions` | 创建新版本 |
| 4 | `Resource.update` | PUT | `/v2/resources/{id}` | 更新资源信息/状态/策略（上下架、加策略） |
| 5 | `Resource.batchUpdate` | PUT | `/v2/resources/updateBatch` | 批量更新状态/策略 |
| 6 | `Resource.info` | GET | `/v2/resources/{idOrName}` | 资源详情（也用于授权标识查重） |
| 7 | `Resource.batchInfo` | GET | `/v2/resources/list` | 批量查询资源 |
| 8 | `Resource.list` | GET | `/v2/resources` | 资源/合集分页列表（支持状态、类型、关键词筛选） |
| 9 | `Resource.batchAuth` | GET | `/v2/auths/resources/batchAuth/results` | 批量查询授权结果 |
| 10 | `Resource.resourceVersionInfo1` | GET | `/v2/resources/{id}/versions/{ver}` | 版本详情 |
| 11 | `Resource.getVersionListByResourceID` | GET | `/v2/resources/{id}/versions` | 版本列表 |
| 12 | `Resource.updateResourceVersionInfo` | PUT | `/v2/resources/{id}/versions/{ver}` | 更新版本属性/配置/描述 |
| 13 | `Resource.deleteResourceDraft` | DELETE | `/v2/resources/{id}/versions/drafts` | 删除版本草稿 |
| 14 | `Resource.resolveResources` | GET | `/v2/resources/{id}/resolveResources` | 查询依赖集 |
| 15 | `Resource.batchSetContracts` | PUT | `/v2/resources/{id}/versions/batchSetContracts` | 批量设置策略版本 |
| 16 | `Resource.authTree` | GET | `/v2/resources/{id}/authTree` | 授权链树 |
| 17 | `Resource.dependencyTree` | GET | `/v2/resources/{id}/dependencyTree` | 依赖链树 |
| 18 | `Resource.getResourceTypeInfoByCode` | GET | `/v2/resources/types/{code}` | 资源类型配置（上传方式、大小限制等） |
| 19 | `Resource.generateResourceNames` | POST | `/v2/resources/generateResourceNames` | 批量生成合法授权标识 |
| 20 | `Resource.getResourceBySha1` | GET | `/v2/resources/sha1/{sha1}` | 按文件哈希查重（批量发行） |
| 21 | `Resource.updateCollection` | PUT | `/v2/resources/catalogue/{id}` | 合集属性/配置保存 |
| 22 | `Resource.getCollectionItems` | GET | `/v2/resources/catalogue/{id}/items` | 合集单品列表 |
| 23 | `Resource.batchResourceItems` | GET | `/v2/resources/catalogue/items/batch/list` | 批量获取合集单品 |
| 24 | `Resource.setCollectRules` | POST | `/v2/resources/catalogue/{id}/items/collectRules` | 合集自动收录规则 |
| 25 | `Resource.bindRssFeed` | POST | `/v2/resources/rss/{id}/bindFeed` | 绑定 RSS 订阅 |
| 26 | `Resource.deleteCollectionItems_Draft` | DELETE | （合集单品） | 删除合集单品（草稿） |
| 27 | `Resource.updateCollectionItemsInfo_Draft` | PUT | （合集单品） | 更新单品标题（草稿） |
| 28 | `Resource.reorderCollectionItems_Draft` | POST | （合集排序） | 单品排序（草稿） |
| 29 | `Resource.setCollectionItemsSortID_Draft` | POST | （合集排序） | 设置单品排序 ID（草稿） |

### 9.2 收藏域（Collection）

| # | 函数 | 方法 | 路径 | 用途 |
|---|---|---|---|---|
| 30 | `Collection.collectionResources` | GET | `/v2/collections/resources` | 收藏列表 |
| 31 | `Collection.collectResource` | POST | `/v2/collections/resources` | 收藏资源 |
| 32 | `Collection.deleteCollectResource` | DELETE | `/v2/collections/resources/{id}` | 取消收藏 |
| 33 | `Collection.isCollected` | GET | `/v2/collections/resources/isCollected` | 是否已收藏 |
| 34 | `Collection.collectedCount` | GET | `/v2/collections/resources/{id}/count` | 收藏数 |

### 9.3 合约域（Contract）

| # | 函数 | 方法 | 路径 | 用途 |
|---|---|---|---|---|
| 35 | `Contract.contracts` | GET | `/v2/contracts` | 合约列表 |
| 36 | `Contract.batchContracts` | GET | `/v2/contracts/list` | 批量查询合约 |
| 37 | `Contract.contractDetails` | GET | `/v2/contracts/{id}` | 合约详情 |

### 9.4 支付域（Payment）

| # | 函数 | 方法 | 路径 | 用途 |
|---|---|---|---|---|
| 38 | `Payment.queryWithdrawStatus` | GET | `/v3/transactions/withdrawCash/check` | 提现资格检查 |
| 39 | `Payment.queryFinancialAccountInfo` | GET | `/v3/transactions/accounts/query` | 金融账户信息 |
| 40 | `Payment.queryStatistics` | GET | `/v3/transactions/statistics` | 收支统计 |
| 41 | `Payment.queryWithdrawCashList` | GET | `/v3/transactions/withdrawCash/records` | 提现记录 |
| 42 | `Payment.queryTransactionList` | GET | `/v3/transactions/records` | 交易记录 |
| 43 | `Payment.withdrawCash` | POST | `/v3/transactions/withdrawCash` | 发起提现 |

### 9.5 其他

| # | 函数 | 方法 | 路径 | 用途 |
|---|---|---|---|---|
| 44 | `User.currentUserInfo` | GET | `/v2/users/current` | 当前用户信息 |
| 45 | `User.batchUserList` | GET | `/v2/users/list` | 批量用户信息 |
| 46 | `Activity.pushMessageTask` | POST | `/v2/activities/facade/pushMessage4Task` | 分享等任务埋点 |
| 47 | `Node.details` | GET | `/v2/nodes/{id}` | 节点详情 |
| 48 | `Rss.getSyncProgress` | GET | `/v2/rss/bindings/{id}/progress` | RSS 同步进度 |
| 49 | `Rss.sendVerificationCode` | POST | `/v2/rss/bindings/sendVerificationCode` | RSS 验证码 |
| 50 | `Storage.batchObjectList` | GET | （存储模块） | 批量获取存储空间对象 |

> 注：标注"（合集单品）""（存储模块）"等未列出完整路径的接口，为代码中引用但本次未展开到 service 定义的接口，如需精确路径可进一步核查 `src/services` 目录。

---

## 十、关键枚举与常量汇总

### 资源状态（status）
0=待发行，1=上架，2=冻结，4=下架

### 标的物类型（subjectType）
1=普通资源，4=合集资源

### 合约状态
0=生效中，1=已终止，2=异常

### 被授权方类型（licenseeIdentityType）
1=资源方，2=节点方，3=用户方

### 交易状态
1=交易完成，2=交易关闭，其他=系统处理中

### 提现状态
1=处理中，2=成功，3=失败

### fileCommitMode 位掩码（上传方式）
1=本地上传，2=存储空间，4=Markdown 编辑器，8=漫画编辑器，16=合集资源库，32=播客 RSS

### 资源名称合法化
正则替换 `\ / : * ? " < > | 空格 @ $ # Emoji` → `_`

---

## 十一、字段约束速查表

| 字段 | 约束 |
|---|---|
| 资源标题 / 合集标题 | 必填；≤100 字符 |
| 资源授权标识 | 必填；≤60 字符；自动合法化；全局唯一（后端查重）；创建后不可改 |
| 资源类型 | 必填；创建后不可改；文件格式须匹配 |
| 资源封面 | JPG/PNG/GIF；≤5M；建议 800×600px |
| 资源简介 | ≤200 字符 |
| 版本号 | SemVer；必须大于当前最新版本 |
| 补充属性 | ≤30 条；值 ≤100 字符（资源）/ ≤140 字符（合集、版本更新） |
| 可选配置 | ≤30 条 |
| 批量发行文件数 | ≤20 个 |
| 批量应用标签 | 并集 ≤20 个 |
| 批量添加至合集 | ≤100 个资源 |
| 存储空间 | ≤5 个，总容量 2GB |
| 节点数 | 每用户 ≤3 个 |

---

## 十二、待确认/文档与代码差异点

1. **策略编辑能力**：文档称策略"一经发布无法更改或删除"，代码中策略页仅提供上线/下线切换与新增，未见编辑/删除入口，两者一致。
2. **批量发行的资源类型范围**：文档称"目前仅适用于图片、音频、视频"，代码中通过类型配置控制（`showAddNewType=false`），具体可用类型由后端类型配置决定，建议以后端配置为准。
3. **帮助文档未覆盖部分**："创作者快速入驻指南"、"常见问题"、"Freelog Markdown 语法说明"三个章节内容本次未完整读取（浏览器自动化在展开目录时受阻）；如需补充可再次抓取。
4. **部分接口路径**：合集单品草稿类、存储空间类接口未展开到 service 定义层，路径待补。
5. **授权策略的构建细节**（策略 DSL 语法、授权对象/范围/主张的完整字段结构）由独立策略构建器组件（`fPolicyBuilder3`）实现，未在本次页面代码范围内，如需完整字段约束建议进一步分析该组件与策略校验接口。
