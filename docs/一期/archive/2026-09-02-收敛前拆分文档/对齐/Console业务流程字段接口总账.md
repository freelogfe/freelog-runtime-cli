# Console 业务流程、字段约束与接口调用总账

> 文档角色：这是一期 CLI 对齐 Console 的事实总账。后续 CLI 产品设计、交互设计、命令设计、代码实现都应先引用这里的 Console 事实，再说明 CLI 因终端环境产生的差异。

最后更新：2026-08-31  
Console 源码基线：`D:\appinside\freelogfe-web-repos`  
Console 基线提交：`d74121e647f0223203f1f0bb317354b4191266f1`  
主要范围：资源发行、版本维护、批量发行、合集、RSS、自动收集规则、策略、主题/插件资源与节点使用边界。

## 0. 阅读规则

1. 本文只记录从 Console 源码能确认的事实，不替 CLI 做交互取舍。
2. “CLI 必须对齐”表示业务字段、校验、接口调用、流程顺序或状态转换不能随意变形。
3. “CLI 可差异化”只允许发生在终端体验层，例如交互方式、批处理方式、脚本输出、链接跳转。
4. “待实测”表示源码存在歧义或类型漂移，不能凭旧 CLI 实现下结论。

## 1. Console 资源域业务拓扑

Console 的资源域核心不是“填一个表单”，而是一组围绕资源状态和版本状态的流程。

```text
资源类型树
  ├─ 普通资源类型：阅读 / 音频 / 图片 / 视频 / 游戏 / ...
  ├─ 主题资源类型：主题
  └─ 插件资源类型：插件

资源主体
  ├─ 独立资源 subjectType=默认资源
  │   ├─ 创建资源壳
  │   ├─ 创建版本 1.0.0
  │   ├─ 添加授权策略
  │   └─ 完善封面 / 标签 / 简介并上线
  ├─ 批量资源
  │   ├─ 选择支持批量创建的资源类型
  │   ├─ 批量选择文件 / 存储对象
  │   ├─ 批量补齐字段 / 授权 / 策略
  │   └─ createBatch 一次创建并上线或生成结果
  └─ 合集 subjectType=4
      ├─ 创建合集壳
      ├─ 添加合集条目或绑定 RSS
      ├─ 设置目录 / 属性 / 授权
      ├─ 添加策略
      ├─ 设置收集规则
      └─ 完善封面 / 标签 / 简介并上线
```

主题和插件在“资源发行”阶段仍然是资源类型树中的资源类型，不是另一套发行流程。它们的特殊性主要出现在：

- 类型选择必须能从一级分类“主题 / 插件”继续选择到终止类型。
- 属性和资源选项必须按该资源类型配置出现。
- 发布后如要用于节点，需要进入节点 / 展品 / 主题激活相关流程；这是资源 CLI 可以提示或跳转的边界，不应把节点全域强行塞进一期资源发行流程。

## 2. Console API 总账

### 2.1 用户与资源类型

| 业务动作 | Console API | 方法与路径 | CLI 对齐要求 |
| --- | --- | --- | --- |
| 获取当前用户 | `User.currentUserInfo` | `GET /v2/users/current` | 登录态必须能得到 userId、username 等创建资源所需身份。 |
| 分组加载资源类型树 | `Resource.resourceTypes` | `GET /v2/resources/types/listSimpleByGroup` | CLI 类型选择必须基于接口树，不能硬编码主题/插件/阅读等类型。 |
| 按父级或搜索加载类型 | `Resource.ListSimpleByParentCode` | `GET /v2/resources/types/listSimpleByParentCode` | CLI 应同时支持逐级选择和搜索；搜索不能替代逐级选择。 |
| 最近使用类型 | `Resource.listSimple4Recently` | `GET /v2/resources/types/listSimple4Recently` | 交互模式可展示最近使用；脚本模式可忽略。 |
| 获取类型配置 | `Resource.getResourceTypeInfoByCode` | `GET /v2/resources/types/getInfoByCode` | 上传方式、大小限制、属性、选项、支持能力都必须来自这里。 |

### 2.2 独立资源创建和维护

| 业务动作 | Console API | 方法与路径 | CLI 对齐要求 |
| --- | --- | --- | --- |
| 检查资源名是否占用 | `Resource.info` | `GET /v2/resources/{resourceIdOrName}` | 创建前应检查 `username/name` 是否已存在。 |
| 创建资源壳 | `Resource.create` | `POST /v2/resources` | name、resourceTitle、resourceTypeCode、resourceTypeName 规则必须一致。 |
| 更新资源信息 / 状态 / 策略 | `Resource.update` | `PUT /v2/resources/{resourceId}` | 标题、简介、封面、标签、上下线、策略增删改都走此接口。 |
| 获取资源详情 | `Resource.info` | `GET /v2/resources/{resourceIdOrName}` | 编辑、上下线、版本创建前都要重新读取真实状态。 |
| 批量获取资源详情 | `Resource.batchInfo` | `GET /v2/resources/list` | 批量、合集、节点签约前使用。 |
| 生成可用资源名 | `Resource.generateResourceNames` | `POST /v2/resources/generateResourceNames` | 批量创建时用服务端生成不冲突名称。 |
| 获取推荐标签 | `Resource.availableTags` | `GET /v2/resources/tags/availableTags` | 交互模式可展示推荐标签。 |

注意：Console 源码里 `Resource.update` 的 TypeScript 类型对 `status` 的声明和实际使用存在漂移。源码实际会用 `status:4` 下线资源，而部分类型声明只写了 `0 | 1`。CLI 应按真实接口行为实测确认后实现，不能只相信类型声明。

### 2.3 资源版本、文件、存储

| 业务动作 | Console API | 方法与路径 | CLI 对齐要求 |
| --- | --- | --- | --- |
| 判断文件是否已在存储 | `Storage.fileIsExist` | `GET /v2/storages/files/fileIsExist` | 上传前先按 sha1 检查。 |
| 上传普通文件 | `Storage.uploadFile` | `POST /v2/storages/files/upload` | 单资源、批量资源都必须按 sha1 与大小限制处理。 |
| 上传封面图 | `Storage.uploadImage` | `POST /v2/storages/files/uploadImage` | 封面只允许图片并受 5MB 限制。 |
| 查询 sha1 关联资源 | `Resource.getResourceBySha1` | `GET /v2/resources/files/{fileSha1}` | 判断文件是否已被当前用户或其他用户使用。 |
| 创建资源版本 | `Resource.createVersion` | `POST /v2/resources/{resourceId}/versions` | 首版固定 1.0.0；后续版本必须大于最新版本。 |
| 获取版本详情 | `Resource.resourceVersionInfo1` | `GET /v2/resources/{resourceId}/versions/{version}` | 创建新版本、编辑版本属性时使用。 |
| 获取版本列表 | `Resource.getVersionListByResourceID` | `GET /v2/resources/{resourceId}/versions` | 版本维护和展示使用。 |
| 编辑已发布版本信息 | `Resource.updateResourceVersionInfo` | `PUT /v2/resources/{resourceId}/versions/{version}` | 只能改描述、输入属性、自定义属性、依赖解析项等；不能改文件和版本号。 |
| 保存版本草稿 | `Resource.saveVersionsDraft` | `POST /v2/resources/{resourceId}/versions/drafts` | Console 会为创建过程保存草稿；RSS 相关资源跳过。 |
| 读取版本草稿 | `Resource.lookDraft` | `GET /v2/resources/{resourceId}/versions/drafts` | CLI 是否使用草稿可差异化，但不能污染登录态或项目状态。 |
| 删除版本草稿 | `Resource.deleteResourceDraft` | `DELETE /v2/resources/{resourceId}/versions/drafts` | 需要明确用户意图。 |
| 解析文件属性 | `PropertyParser` | `GET /v2/storages/files/listSSE/info` | sha1 + resourceTypeCode 解析系统属性。 |

### 2.4 批量创建

| 业务动作 | Console API | 方法与路径 | CLI 对齐要求 |
| --- | --- | --- | --- |
| 批量创建资源 | `Resource.createBatch` | `POST /v2/resources/createBatch` | 批量发行应使用 Console 同一聚合接口。 |
| 批量导入存储对象 | `Storage.batchObjectList` | `GET /v2/storages/objects/list` | 从存储空间选文件时使用。 |

### 2.5 合集、RSS、自动收集

| 业务动作 | Console API | 方法与路径 | CLI 对齐要求 |
| --- | --- | --- | --- |
| 创建合集壳 | `Resource.create` | `POST /v2/resources` | 创建时带 `subjectType:4`。 |
| 更新合集版本 / 目录 | `Resource.updateCollection` | `PUT /v2/resources/catalogue/{resourceId}` | 合集条目、目录属性、依赖、授权等通过合集专用接口提交。 |
| 获取合集草稿条目 | `Resource.getCollectionItems_Draft` | `GET /v2/resources/catalogues/drafts/{resourceId}/items` | 合集条目编辑基于草稿。 |
| 获取合集条目授权 | `Resource.getCollectionItemsAuth_Draft` | `GET /v2/resources/catalogues/drafts/{resourceId}/items/batchAuth` | 条目授权不完整时必须处理。 |
| 添加合集条目 | `Resource.addResourceItems_Draft` | `POST /v2/resources/catalogues/drafts/{resourceId}/items` | 添加资源到合集草稿。 |
| 更新合集条目信息 | `Resource.updateCollectionItemsInfo_Draft` | `PUT /v2/resources/catalogues/drafts/{resourceId}/items` | 自定义条目标题等。 |
| 删除合集条目 | `Resource.deleteCollectionItems_Draft` | `DELETE /v2/resources/catalogues/drafts/{resourceId}/items` | 删除前 CLI 应明确提示影响草稿。 |
| 手动排序合集条目 | `Resource.setCollectionItemsSortID_Draft` | `PUT /v2/resources/catalogues/drafts/{resourceId}/manualSort` | 拖拽排序在 CLI 中需转成序号或命令化。 |
| 批量重排合集条目 | `Resource.reorderCollectionItems_Draft` | `PUT /v2/resources/catalogues/drafts/{resourceId}/reorder` | 支持按创建时间、标题、更新时间排序。 |
| 检查条目是否存在 | `Resource.resourceIsExistInItems_Draft` | `GET /v2/resources/catalogues/drafts/{resourceId}/items/checkExists` | 添加前避免重复。 |
| 获取收集规则 | `Resource.getCollectionCollectRules` | `GET /v2/resources/catalogue/{resourceId}/items/collectRules` | 维护自动收集规则前读取。 |
| 设置收集规则 | `Resource.setCollectRules` | `POST /v2/resources/catalogue/{resourceId}/items/collectRules` | 字段、操作符、值必须按 Console 规则限制。 |
| RSS 预览 | `Rss.bindingsPreview` | `POST /v2/rss/bindings/preview` | 绑定或更新 RSS 前先预览。 |
| RSS 更新对比 | `Rss.bindingsCompare` | `POST /v2/rss/bindings/compare` | 更新 RSS URL 前必须带验证码做差异风险确认；验证码错误按字段错误处理。 |
| 发送 RSS 验证码 | `Rss.sendVerificationCode` | `POST /v2/rss/bindings/sendVerificationCode` | 通过 ownerEmail 验证归属。 |
| 绑定 RSS | `Resource.bindRssFeed` | `POST /v2/resources/rss/{resourceId}/bindFeed` | 创建或更新绑定。 |
| RSS 同步 | `Rss.syncBinding` | `PUT /v2/rss/bindings/{resourceId}/sync` | 维护期同步。 |
| RSS 同步进度 | `Rss.getSyncProgress` | `GET /v2/rss/bindings/{resourceId}/progress` | 同步中状态展示。 |
| RSS 失败条目 | `Rss.failedItems` | `GET /v2/rss/bindings/{resourceId}/failedItems` | 失败原因展示和修复提示。 |

### 2.6 策略、授权、支付边界

| 业务动作 | Console API | 方法与路径 | CLI 对齐要求 |
| --- | --- | --- | --- |
| 获取策略模板 | `Policy.policyTemplates` | `POST /v2/translate/translate-config/list4Client` | 策略流程应先选模板，再填变量，再预览。 |
| 编译策略模板 | `Policy.policyReCompile` | `POST /v2/translate/reCompile` | 模板变量填完后编译成策略文本。 |
| 翻译策略文本 | `Policy.policyTranslation` | `POST /v2/translate/translate` | 确认前展示可读预览。 |
| 检查结算状态 | `Payment.queryWithdrawStatus` | Console 支付服务 API | 含交易事件策略前需确认是否已补充结算信息；CLI 可跳转 Console。 |
| 批量检查合约 | `Contract.batchContracts` | Console 合约服务 API | 合集、节点签约、授权排除项处理依赖此接口。 |

支付、结算、节点签约不是一期资源发行 CLI 的核心表单字段，但它们会被策略和主题/插件使用路径触发。CLI 不能假装不存在：至少要给出清晰阻断原因和 Console 跳转。

## 3. 字段约束总账

### 3.1 资源基础字段

| 字段 | Console 规则 | CLI 必须对齐 |
| --- | --- | --- |
| 资源类型 | 必填；来自资源类型树；独立资源可添加终止自定义子类型；合集和批量不可添加自定义类型。 | 提供逐级选择和搜索；主题/插件必须作为类型树路径出现。 |
| 自定义资源类型名 | 中文、英文、数字、`-`、`&`、`.`、`,`；区分大小写；1-40 字。 | 只在独立资源、父类型为终止选择场景开放。 |
| 资源标题 | 必填；最大 100 字。 | 创建、维护均校验。 |
| 资源名 / 授权身份 | 创建时由标题自动带出；输入长度 UI 限制 60；会将特殊字符、空白、emoji 等替换为 `_`；以 `username/name` 检查唯一性。 | CLI 应显示优化后的真实 name，并在提交前检查占用。 |
| 简介 | 最大 200 字。 | 超过 200 不提交。 |
| 封面 | jpg/jpeg/jpe/png/gif；最大 5MB；Console 会裁剪后上传。 | CLI 无裁剪 UI 时应说明差异，可直接上传合规图片或提示去 Console 裁剪。 |
| 标签 | 最多 20 个；单个最长 20；输入时去掉 `#`；不能为空；不能重复。 | 推荐标签可展示；脚本模式按同规则校验。 |

### 3.2 版本与文件

| 字段 / 行为 | Console 规则 | CLI 必须对齐 |
| --- | --- | --- |
| 首版版本号 | 固定 `1.0.0`。 | 首次发行默认 1.0.0，不让用户误以为可随意首版。 |
| 后续版本号 | 必填；必须是有效 semver；必须大于最新版本；默认 patch +1。 | CLI 自动推荐并校验。 |
| 单资源文件 | 一次一个文件；接受格式来自资源类型配置；大小来自资源类型配置。 | 不能用全局固定规则代替类型配置。 |
| 批量文件数量 | 最多 20 个。 | 超过应明确截断或拒绝，不能静默。 |
| 批量文件大小 | 视频一级类型最大 1GB；非视频最大 200MB。 | 这是批量流程的特殊规则，不能套单资源配置。 |
| 文件 sha1 占用 | 单资源：同用户已用可继续确认；他人已用阻断。批量：同用户或他人已用都作为错误卡阻断。 | 两种流程要区分。 |
| 已发布版本编辑 | 只能改描述、输入属性、自定义属性、依赖解析项；不能改文件、版本号、依赖列表本身。 | 改文件或依赖列表应引导创建新版本。 |

### 3.3 系统属性、自定义属性、资源选项

| 字段 | Console 规则 | CLI 必须对齐 |
| --- | --- | --- |
| 系统属性 | 由资源类型和文件解析得到；insertMode=1 为只读原始值；insertMode=2 为用户补充值。 | CLI 需要按解析结果显示哪些能改、哪些只读。 |
| 文本属性值 | 按 nullable、minLength、maxLength 校验。 | 同步校验。 |
| 整数属性值 | 必须是整数；安全范围约为 ±99999999999；再叠加配置的 min/max。 | 同步校验。 |
| 小数属性值 | 必须是数字；按 precision 截断；再叠加 min/max。 | 同步校验。 |
| 日期属性值 | `YYYY-MM-DD`；受 startDate/limitDate 限制。 | 同步校验。 |
| 日期时间属性值 | `YYYY-MM-DD HH:mm:ss`；受 startDateTime/limitDateTime 限制。 | 同步校验。 |
| 枚举属性值 | 只能选配置项；可重置默认值。 | CLI 提供选择列表。 |
| 自定义属性名 | 必填；最大 50；不能重名。 | 同步校验。 |
| 自定义属性 key | 必填；最大 30；不能重复；以英文字母开头，只能含字母、数字、下划线。源码正则实际要求至少 2 位。 | 按源码正则处理，并在提示里说明最少 2 位。 |
| 自定义属性描述 | 可空；最大 50。 | 同步校验。 |
| 资源选项 key | 实际保存时带 `options_` 前缀；整体最大 30；同自定义 key 正则；不能重复。 | CLI 应让用户理解“显示 key”和“实际 key”的关系。 |
| 资源选项名 | 必填；最大 50；不能重名。 | 同步校验。 |
| 资源选项描述 | 可空；最大 50。 | 同步校验。 |
| 输入型资源选项默认值 | 最大 140；可空。 | 同步校验。 |
| 选择型资源选项 | 至少 1 项；最多 30 项；每项必填、最大 140、不能重复；默认值为第一项。 | CLI 应支持增删改排序。 |

主题和插件的资源选项不是附属小功能。Console 在批量卡片中对“主题 / 插件”明确展示资源选项，单资源则由资源类型配置的 `supportOptionalConfig` 决定是否展示。

### 3.4 策略字段

| 字段 / 行为 | Console 规则 | CLI 必须对齐 |
| --- | --- | --- |
| 策略入口 | 先加载可选策略模板，再选择模板，再填写变量，再编译、翻译、预览、确认。 | CLI 不能让用户直接凭空写策略作为默认主流程。 |
| 策略标题 | 必填；最少 2；最多 20；同一资源内不能重复。 | 同步校验。 |
| 策略文本 | 模板编译得到；同一资源内不能重复策略文本。 | 编译后检查重复。 |
| 数字变量 | 默认 min 0.01、precision 2；相对时间事件 min 1、precision 0。 | 根据模板变量类型提示。 |
| 选择变量 | 从模板候选项选择。 | CLI 展示候选列表。 |
| 时间变量 | 使用模板默认值或用户输入。 | CLI 提示格式并校验。 |
| 交易事件策略 | 需要检查结算信息；未补充时 Console 引导去结算信息创建页。 | CLI 应提示并给 Console 跳转链接。 |

### 3.5 合集条目和目录

| 字段 / 行为 | Console 规则 | CLI 必须对齐 |
| --- | --- | --- |
| 合集类型 | 只能从 collection subjectType 类型树选择，不支持添加自定义类型。 | 不允许自定义合集类型。 |
| 合集条目来源 | 根据类型配置出现：合集资源库、Podcast RSS，也可能二者都有。 | CLI 应先根据资源类型配置展示可用来源。 |
| 一次添加资源数量 | `FAddResourcesHandleAuth` 会把 resourceIDs 截到前 100 个。 | CLI 批量添加时要提示上限。 |
| 条目授权 | 添加到合集前检查授权；不完整时处理排除项或阻断。 | 不能绕过授权检查。 |
| 条目标题 | 可用资源标题、序号、自定义标题或隐藏。 | CLI 需要提供等价配置。 |
| 条目排序 | 支持手动排序；支持按创建时间、条目标题、资源更新时间重排。 | CLI 将拖拽转换成序号或排序命令。 |
| 条目展示 | 卡片 / 列表；不同页大小选项；图片、序号、简介可显示或隐藏。 | CLI 维护这些目录属性，不必复刻 UI。 |
| RSS 合集条目 | RSS 相关合集禁用自定义标题、删除、手动排序等手工编辑。 | CLI 必须识别 RSS 相关状态并阻断手工改动。 |

### 3.6 RSS 字段

| 字段 / 行为 | Console 规则 | CLI 必须对齐 |
| --- | --- | --- |
| RSS URL | 必填；更新时不能与原 URL 相同。 | 提交前校验。 |
| RSS 预览 | 绑定前调用 preview；显示标题、图片、作者、ownerEmail、条目数量等；导入数量使用 `matchedItemCount`。 | CLI 要把预览作为确认前步骤。 |
| ownerEmail | 缺失时报 noemail；无法完成邮箱验证。 | CLI 应阻断并说明原因。 |
| 已被自己绑定 | Console 允许继续进入发布。 | CLI 应提示“已存在，但属于当前账号，可继续”。 |
| 已被他人绑定 | Console 不给继续按钮。 | CLI 应阻断。 |
| 验证码 | Console UI 文案提示 6 位；源码只校验非空。 | CLI 暂按非空提交，但提示用户按邮件码输入；长度是否强校验列为待实测。 |
| 单次导入上限 | `matchedItemCount` 超过 1000 时必须选择日期范围，直到匹配数不超过 1000。 | CLI 必须支持日期范围缩小。 |
| 日期范围 | 起止日期不能是未来；提交给接口时扩展到当天 00:00:00 / 23:59:59。 | 同步处理。 |
| 更新 RSS URL | 新 URL 不得等于旧 URL；先 preview/验证码，再 `bindingsCompare(resourceId, feedUrl, verificationCode)`；验证码错误 inline；GUID 大规模不匹配时二次确认。 | CLI 需要风险确认；验证码错误返回字段级错误。 |
| 同步状态 | `''`、`pending`、`running` 被视为导入中；`syncBinding` 已发出但 progress 未刷新也要防重复。 | CLI 在导入中禁止冲突操作和重复同步。 |
| RSS 相关资源 | 任一 `feedUrl`、`rssGuid`、`rssPubDate` 非空即视为 RSS 相关。 | CLI 应锁定 Console 锁定的字段和草稿操作；当前 tags 仍允许维护。 |

### 3.7 自动收集规则 collect-rules

| 字段 | Console 规则 | CLI 必须对齐 |
| --- | --- | --- |
| serializeStatus | `1` 表示更新完毕；`0` 表示持续更新。 | 用清晰文案，不直接暴露晦涩字段名。 |
| status | `1` 启用自动收集；`0` 关闭。 | 开关必须明确。 |
| conditionType | `1` 满足所有条件；`2` 满足任一条件。 | CLI 提供 all/any 选择。 |
| 条件字段 | `resourceTitle`、`authIdentity`、`resourceTypeCode`。 | 只能选这三类。 |
| 标题操作符 | INCLUDES、NOT_INCLUDES、STARTS_WITH、ENDS_WITH。 | 不开放 EQUAL/NOT_EQUAL。 |
| 授权身份操作符 | INCLUDES、NOT_INCLUDES、STARTS_WITH、ENDS_WITH。 | 不开放 EQUAL/NOT_EQUAL。 |
| 资源类型操作符 | 只能 EQUAL。 | 值必须来自资源类型选择器。 |
| 标题值 | 必填；最大 100。 | 同步校验。 |
| 授权身份值 | 必填；最大 60。 | 同步校验。 |
| 资源类型值 | 必填；来自类型树。 | 同步校验。 |
| 空条件 | 启用自动收集但无条件时，Console 注入一个标题包含空值的默认条件。 | CLI 不应制造难懂空条件；应引导用户补条件或明确保存 Console 等价空条件。 |

Console 源码对 `authIdentity STARTS_WITH` 的保存存在差异：维护页会追加 `username + '/' + value`，创建 Step4 代码路径看起来没有等价追加。该点必须列为待实测，不能靠旧 CLI 设计拍脑袋。

RSS 当前补充规则：

- `PODCAST_RSS_EPISODE_LIMIT = 1000`；`matchedItemCount > 1000` 时必须选择日期范围并重新 preview。
- 日期范围传给平台时格式化为开始日 `YYYY-MM-DD 00:00:00` 与结束日 `YYYY-MM-DD 23:59:59`。
- `VerificationCodeInvalid` 或 `msg === 'wrong_verified_code'` 都视为验证码字段错误。
- 换源 GUID 大面积不匹配判定：`max(oldFeedItemCount, newFeedItemCount) - guidMatchedCount > abs(newFeedItemCount - oldFeedItemCount)`。
- `Rss.syncBinding` 发出后，在进度未刷新到 importing 前也要防重复同步。

## 4. 业务流程总账

### 4.1 独立资源首次发行

```text
选择资源类型
  -> 填标题 / 确认资源名
  -> 检查资源名唯一性
  -> Resource.create 创建资源壳
  -> getResourceTypeInfoByCode 获取类型配置
  -> 选择上传方式 / 文件
  -> sha1 检查 / 上传 / 解析属性
  -> 补齐系统属性 / 自定义属性 / 资源选项 / 依赖 / 授权排除
  -> createVersion 创建 1.0.0
  -> 选择策略模板
  -> 填变量 / 编译 / 翻译 / 预览 / 确认
  -> Resource.update 添加策略
  -> 填封面 / 标签 / 简介
  -> Resource.update status=1 上线
```

关键点：

- 类型选择必须能逐级浏览，也能搜索。
- 自定义终止类型只属于独立资源创建。
- 策略主流程是“选择模板”，不是先手写策略。
- 首次发行 Step4 可以直接 `Resource.update({status:1})` 上线；维护期上线还有额外检查。

### 4.2 独立资源维护

```text
读取 Resource.info
  -> 校验 owner / 冻结 / 类型
  -> 维护基础信息：标题、简介、封面、标签
  -> 维护状态：上线 / 下线
  -> 维护策略：新增 / 启停
  -> 创建新版本：默认 patch +1
  -> 或编辑已发布版本的可编辑字段
```

维护期上线逻辑：

1. 读取资源详情和最新版本。
2. 没有最新版本时，先要求发布版本。
3. 没有策略时，进入策略模板 Builder，创建策略并上线。
4. 有策略但全部禁用时，进入策略启用选择。
5. 否则直接 `Resource.update({status:1})`。

维护期下线逻辑：

- Console 通过 `Resource.update({status:4})` 下线。
- CLI 应二次确认，因为这是外部状态改变。

### 4.3 批量资源发行

```text
选择支持批量创建的资源类型
  -> 选择本地文件或存储对象，最多 20 个
  -> 每个文件计算 sha1 / 检查占用 / 上传或引用存储
  -> 每个文件解析属性
  -> 为每个资源生成 title/name，调用 generateResourceNames
  -> 在卡片中补齐字段、属性、资源选项、授权、策略、封面、标签
  -> Resource.createBatch 一次提交
  -> 展示成功 / 失败 / 冻结 / 下线结果
  -> 可继续发行、查看资源、添加到节点、添加到合集
```

批量流程和单资源流程不能混为一谈：

- 类型选择 subjectType 是 `batchResources`，且 `supportCreateBatch=2`。
- 批量文件占用处理更严格，同用户已用也作为错误卡处理。
- 视频与非视频大小限制是批量流程自己的规则。
- 主题 / 插件批量卡片需要展示资源选项。

### 4.4 合集创建和维护

```text
选择合集类型
  -> 填标题 / 确认资源名
  -> Resource.create(subjectType=4) 创建合集壳
  -> 根据类型配置选择条目来源：合集资源库 / Podcast RSS
  -> 添加条目或绑定 RSS
  -> 配置目录展示、排序、条目标题、授权排除
  -> Resource.updateCollection 提交合集版本
  -> 添加策略模板
  -> 设置收集规则
  -> 完善封面 / 标签 / 简介
  -> Resource.update status=1 上线
```

合集特殊性：

- 合集类型不能自定义。
- 合集内容编辑基于草稿条目。
- RSS 合集绑定后，很多手工编辑能力被锁定。
- collect-rules 是合集上线前后的重要能力，不是 CLI 可忽略功能。

### 4.5 RSS 绑定、更新、同步

```text
输入 RSS URL
  -> bindingsPreview 预览
  -> 校验 ownerEmail / 是否已绑定
  -> sendVerificationCode 发送验证码
  -> 输入验证码
  -> 若条目数 > 1000，选择日期范围并重新 preview
  -> 更新场景先 bindingsCompare
  -> bindRssFeed
  -> 进入同步进度查询 / 失败条目查看
```

RSS 对 CLI 是可实现能力，不是 Console-only 能力。CLI 至少要支持：

- 新建合集时绑定 RSS。
- 维护合集时更新 RSS URL。
- 手动同步 RSS。
- 查询同步进度和失败条目。
- 对 RSS 相关资源执行 Console 同款字段锁定。

### 4.6 自动收集规则

```text
读取已有 collect-rules
  -> 选择是否持续更新
  -> 选择是否启用自动收集
  -> 选择满足全部 / 任一条件
  -> 添加条件：标题 / 授权身份 / 资源类型
  -> 按字段限制操作符和值
  -> setCollectRules 保存
```

CLI 设计时应把字段翻译成用户能懂的文案：

- `serializeStatus=0`：持续自动收集后续符合条件的资源。
- `serializeStatus=1`：本次收集完成后不再继续收集。
- `status=1`：自动收集开。
- `conditionType=1`：全部条件都满足。
- `conditionType=2`：任一条件满足。

### 4.7 主题 / 插件与节点使用边界

资源发行阶段：

```text
选择资源类型树中的“主题”或“插件”
  -> 按普通资源发行链路创建版本、策略、封面、标签、上线
```

节点使用阶段：

```text
已上线主题 / 插件资源
  -> 添加到节点 / 展品
  -> 若策略未满足，先处理策略或启用策略
  -> 主题资源可进入节点主题激活流程
```

一期 CLI 设计原则：

- 发行主题 / 插件资源必须完整支持。
- 发布后可提示“添加到节点 / 去 Console 签约 / 去 Console 激活主题”。
- 如果 CLI 要继续做节点管理，需要另开节点 / 展品 / 主题激活事实总账，不能混在资源发行文档里半懂半写。

## 5. 已知差异、歧义和待实测项

| 编号 | 问题 | 当前证据 | 处理要求 |
| --- | --- | --- | --- |
| G1 | `Resource.update` 下线状态类型漂移 | 类型声明偏窄，但 Console 实际用 `status:4` 下线。 | 用 dev 账号实测后确定 CLI 类型和文案。 |
| G2 | collect-rules 的 `authIdentity STARTS_WITH` 前缀 | 维护页会追加 `username/`；创建 Step4 路径看起来没有追加。 | 实测创建和维护 payload，CLI 不提前固化错误行为。 |
| G3 | RSS 验证码长度 | UI 文案像 6 位码；源码只做非空。 | CLI 先提示按邮件码输入；是否强校验长度待接口确认。 |
| G4 | 合集授权排除字段名 | 源码里部分路径出现 `excludedType:'contractId'` 与 `excludedValue: policyID` 的不一致迹象。 | 对照真实 payload 和接口返回后修正。 |
| G5 | 封面裁剪 | Console 有裁剪 UI；CLI 没有天然裁剪交互。 | CLI 可接受已裁剪图片，或提示去 Console 裁剪；这是体验差异，不是业务字段差异。 |
| G6 | 节点 / 展品 / 主题激活 | 资源发行可触达，但不是本文完整范围。 | 若一期要做节点管理，必须补单独事实总账。 |

## 6. CLI 后续设计红线

1. 不能只做搜索式资源类型选择；必须保留逐级选择，主题 / 插件必须在类型树中可达。
2. 不能用旧 CLI 的现有流程反推 Console 业务；以本文 Console 事实为准。
3. 策略流程必须先看模板、选模板、填变量、预览，再应用。
4. RSS 和 collect-rules 是可 CLI 化能力，不能因为旧设计缺失就删掉。
5. 单资源、批量、合集、RSS、主题/插件不能混成一个粗糙流程；它们共享资源域，但约束不同。
6. CLI 自身体验可以优化为“一次命令进入会话，连续完成发行或更新”，但每一步的业务校验必须能追溯到 Console 事实。
7. AI 使用场景需要稳定的 JSON/NDJSON、dry-run、resume/report，但这些是 CLI 增强能力，不能改变 Console 的业务状态机。
8. 登录态、会话态、项目状态、本地资源清单必须分层保存，不能互相污染。

## 7. 主要源码证据

更细的文件索引见 [Console源码证据索引.md](./Console源码证据索引.md)。本文主要依据：

- `packages/console/src/pages/resource/creator/**`
- `packages/console/src/models/resourceCreatorPage/**`
- `packages/console/src/pages/resource/creatorBatch/**`
- `packages/console/src/models/resourceCreatorBatchPage.ts`
- `packages/console/src/pages/resource/collectionCreator/**`
- `packages/console/src/models/collectionCreatorPage/**`
- `packages/console/src/pages/resource/collectionSidebar/**`
- `packages/console/src/models/collectionManager/**`
- `packages/console/src/components/FResourceTypeInput4/**`
- `packages/console/src/components/fPolicyBuilder3/**`
- `packages/console/src/components/FPodcastRssSubmit/**`
- `packages/console/src/components/FAddResourcesHandleAuth/**`
- `packages/console/src/components/FLocalUpload/**`
- `packages/console/src/utils/PropertyParser.ts`
- `packages/console/src/utils/rss.ts`
- `packages/console/src/utils/category.ts`
- `packages/console/src/utils/FRegExpMgr.ts`
- `packages/@freelog/tools-lib/src/service-API/modules/resources.ts`
- `packages/@freelog/tools-lib/src/service-API/modules/rss.ts`
- `packages/@freelog/tools-lib/src/service-API/modules/storages.ts`
- `packages/@freelog/tools-lib/src/service-API/modules/policies.ts`
- `packages/@freelog/tools-lib/src/utils/regexp.ts`
