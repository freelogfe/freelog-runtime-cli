# 02 · Console 业务流程、字段与接口

> **文档角色：** 这是 CLI 一期对齐 Console 资源域的业务契约。开发实现时不能只看命令设计，必须先看这里的流程、字段、接口和错误恢复规则。

最后更新：2026-09-02

## 0. 本文怎么用

本文按“流程先行，字段跟随”的方式组织：

1. 先说明 Console 资源域有哪些确定流程。
2. 每个流程下列出 Console 表单字段、接口参数、前端可确认约束、CLI 交互要求和异常恢复。
3. 末尾给出开发落地规则，要求每个字段都能映射到 CLI 的校验器、提示文本、非交互错误和测试用例。

约束强度约定：

| 强度 | 含义 | CLI 落地 |
|---|---|---|
| HARD | Console 源码或平台接口可确认的硬约束 | 本地提前拦截，非交互直接失败 |
| DYNAMIC | 约束来自平台返回的资源类型能力、模板、枚举或当前资源状态 | 每次运行动态拉取，不能写死 |
| SERVER_FALLBACK | 前端没有本地门禁、或最终一致性只能由平台接口裁决 | CLI 不额外发明业务限制；接口拒绝时把平台错误转成稳定字段错误 |
| SOFT | Console 主要通过提示或推荐引导 | CLI 应展示建议，但允许用户继续 |
| HANDOFF | CLI 无法完成，需要跳转 Console | CLI 给明确原因和链接 |

## 1. Console 源码入口与证据范围

当前资源域对齐基于以下 Console 源码：

| 业务面 | Console 源码入口 | 主要证据 |
|---|---|---|
| 资源创建 | `D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/creator` | Step1 到 Step4 创建流程 |
| 资源创建模型 | `D:/appinside/freelogfe-web-repos/packages/console/src/models/resourceCreatorPage` | `Resource.create`、`Resource.createVersion`、`Resource.update` 参数 |
| 新版本创建 | `D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/versionCreator` | 已有资源新版本流程 |
| 新版本模型 | `D:/appinside/freelogfe-web-repos/packages/console/src/models/resourceVersionCreatorPage.ts` | 版本继承、版本号默认、版本发布参数 |
| 版本维护 | `D:/appinside/freelogfe-web-repos/packages/console/src/models/resourceVersionEditorPage.ts` | `Resource.updateResourceVersionInfo` 参数 |
| 批量创建 | `D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/creatorBatch` | 批量入口、支持批量资源类型筛选 |
| 资源类型选择 | `D:/appinside/freelogfe-web-repos/packages/console/src/components/FResourceTypeInput4` | 类型树、搜索、subjectType、批量过滤 |
| 标签编辑 | `D:/appinside/freelogfe-web-repos/packages/console/src/components/FResourceLabelEditor` | 标签数量、单标签长度、去 `#`、重复校验 |
| 策略模板 | `D:/appinside/freelogfe-web-repos/packages/console/src/components/fPolicyBuilder3` | 模板列表、策略标题、参数、编译、翻译 |
| 合集创建 | `D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/collectionCreator` | 合集 Step1 到 Step4 |
| 合集维护 | `D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/collectionSidebar` | RSS、collect-rules、条目信息维护 |
| 普通资源维护 | `D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/sidebar` | 普通资源详情、listing、版本、策略、上下架维护 |
| RSS 提交 | `D:/appinside/freelogfe-web-repos/packages/console/src/components/FPodcastRssSubmit` | feed 检测、验证码、数量限制、GUID 差异 |
| 主题与插件 | `D:/appinside/freelogfe-web-repos/packages/console/src/components/FRecommendThemes`、`D:/appinside/freelogfe-web-repos/packages/console/src/components/FThemeDependencyPlugins`、`D:/appinside/freelogfe-web-repos/packages/console/src/pages/node/formal/$id/Themes` | 主题激活、插件依赖展示和 Console 接力 |

本文只保留三类可实现口径：Console 源码可确认的写为 HARD，必须随平台返回变化的写为 DYNAMIC，前端没有本地门禁但平台仍可能拒绝的写为 SERVER_FALLBACK。CLI 实现不能把 DYNAMIC 写死，也不能把 SERVER_FALLBACK 当成缺失设计。

## 2. Console 资源域总流程

Console 的资源发行不是一个接口，而是一条逐步收敛的业务链：

```text
进入资源域
  → 选择主体类型：普通资源 / 合集 / 批量资源 / 主题展品集合
  → 选择资源类型：从平台类型树选择合法叶子类型
  → 创建资源壳：标题 + 授权标识 + 类型
  → 创建版本：文件/对象/编辑器产物 + 属性 + 依赖 + 授权排除
  → 配置策略：先选模板，再填参数，再编译和翻译，再保存到资源
  → 配置展示信息：封面 + 简介 + 标签
  → 上架或稍后上架
  → 后续维护：新版本、listing、策略、上下架、合集条目、RSS、collect-rules
```

CLI 必须保持这个业务顺序，但交互方式要适配终端：

- TTY 模式：一条命令进入会话，逐步补齐信息，关键写入前确认。
- 非交互模式：通过 manifest、参数或 stdin 一次性提供字段；缺失必填项时输出结构化错误，不进入问答。
- AI/自动化模式：输出稳定 JSON/NDJSON、plan/dry-run/report，可复制执行，可恢复。

### 2.1 Console 流程索引

| 流程 | 起点 | 关键用户动作 | 写接口 | 成功状态 | CLI 必须补强 |
|---|---|---|---|---|---|
| F1 资源类型选择 | 创建/批量/合集/主题入口 | 浏览类型树或搜索，确认叶子类型 | 无直接写入 | 得到 `resourceTypeCode` 和类型能力 | 逐级浏览不能缺；搜索只是加速 |
| F2 资源壳创建 | Step1 | 填标题、授权标识、类型 | `Resource.create` | 得到 `resourceId/resourceName` | 写前展示账号、环境、owner、类型路径 |
| F3 版本创建 | Step2 或新版本页 | 上传/选择文件，填版本信息、依赖、属性 | `Resource.createVersion` | 得到版本号和文件身份 | 本地目录/工程必须先构建或打包 |
| F4 策略保存 | Step3/策略抽屉 | 选模板、填参数、编译、翻译、确认 | `Policy.policyTemplates`、`Policy.policyReCompile`、`Policy.policyTranslation`、`Resource.update` | 资源拥有可用策略 | 不能默认手写策略 |
| F5 listing 与上下架 | Step4/sidebar | 改封面、简介、标签、状态 | `Storage.uploadImage`、`Resource.update` | 展示信息或线上状态更新 | 上下架必须二次确认或显式声明 |
| F6 已有资源维护 | sidebar/versionInfo | 选择新版本、版本信息、listing、策略、上下架 | `Resource.info`、`Resource.resourceVersionInfo1`、`Resource.createVersion`、`Resource.updateResourceVersionInfo`、`Resource.update` | 只提交用户选择的维护项 | 所有更新必须先展示 diff |
| F7 合集 | collectionCreator/sidebar | 创建合集、添加条目、排序、条目标题、目录草稿 | `Resource.create`、`Resource.updateCollection`、`Resource.updateCollectionItemsInfo_Draft` | 合集目录/草稿状态更新 | 条目展示字段不能混成资源本体字段 |
| F8 RSS | RSS 提交组件 | feed 检测、验证码、数量筛选、GUID 确认 | `Rss.*`、`Resource.bindRssFeed`、`Resource.batchResourceItems` | feed 绑定并生成/同步条目 | RSS 锁定字段必须在 CLI 里体现 |
| F9 collect-rules | 合集信息页 | 启用规则、选条件关系、添加条件 | `Resource.setCollectRules` | 自动收录规则保存 | 规则构造器必须显示自然语言摘要 |
| F10 批量 | 批量创建入口 | 选择支持批量类型，提交对象数组 | `Resource.createBatch`，必要时逐项补版本/listing | 多资源逐项成功/失败 | 不能黑盒；必须分批、报告、恢复 |
| F11 主题/插件 | 主题管理/插件依赖 | 发行主题/插件资源，节点激活/签约接力 | 资源发行同 F2-F5；节点激活涉及 `Exhibit.*` | 资源发行完成，Console 接力明确 | 不能漏掉主题/插件资源类型 |

## 3. F1 · 资源类型选择设计

### 3.1 Console 资源类型选择流程

```text
打开类型选择器
  → 加载推荐类型
  → 展开一级/二级/多级类型树
  → 可搜索类型
  → 只能选择 isTerminate=true 的末级类型
  → 返回 code、name、names
```

Console 源码事实：

- `FResourceTypeInput4` 按 `subjectType` 拉取类型。
- 普通资源和批量资源使用 `subjectType=1`。
- 合集使用 `subjectType=4`。
- 主题展品集合使用 `subjectType=5`。
- 批量资源额外传 `supportCreateBatch=2`。
- 搜索和逐级选择都调用平台类型接口；搜索不是唯一入口。

### 3.2 相关接口

| 接口 | 场景 | CLI 要求 |
|---|---|---|
| `Resource.resourceTypes` | 初始化类型树 | 按主体类型拉取，不缓存为永久真相 |
| `Resource.ListSimpleByParentCode` | 搜索、展开子类型 | 搜索时必须带 `isTerminate=true`；逐级展开时保留父子路径 |
| `Resource.getResourceTypeInfoByCode` | 选中类型后读取能力 | 决定文件入口、大小、下载、编辑、可选配置等 |

### 3.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-RES-TYPE | 资源类型 | `FResourceTypeInput4` 选择器 | `resourceTypeCode`，自定义类型时可能带 `resourceTypeName` | HARD：必填；必须来自平台类型树的末级类型。DYNAMIC：按主体类型过滤，普通资源/批量/合集/主题展品集合不同 | 默认逐级浏览；支持 `/` 路径输入和搜索；搜索结果必须展示完整路径、已有资源数、主体类型 | 非末级类型提示继续展开；未知 code 重新拉取；平台下架或失效时提示重新选择 |
| FORM-RES-SUBJECT | 主体类型 | 由入口决定，不是用户随意填 | 类型查询的 `subjectType` | HARD：普通资源=1，合集=4，主题展品集合=5；批量资源沿用普通资源但加批量能力过滤 | `freelog-cli create` 默认普通资源；`collection` 进入合集；主题相关命令必须进入主题展品集合或主题资源类型分支 | 主体类型与资源类型不一致时停止，不自动替用户转换 |
| FORM-RES-THEME-PLUGIN | 主题/插件资源类型 | 主题管理和插件依赖组件只认平台资源类型 | `resourceTypeCode`、后续依赖/签约参数 | HARD：主题、插件仍然是资源类型树中的类型，不是 CLI 自造分类。DYNAMIC：具体 code 由平台返回 | 类型树里必须能看到主题/插件相关路径；CLI 可以提供“主题/插件”快捷筛选，但结果仍来自平台 | 找不到主题/插件类型时提示平台类型树无匹配，并给出 Console 接力检查入口 |

## 4. F2 · 单资源创建流程：资源壳创建

### 4.1 Console 流程

```text
Step1
  → 选择资源类型
  → 输入资源标题
  → 自动生成授权标识候选
  → 用户可修改授权标识
  → 300ms 防抖检查是否已存在
  → 创建资源壳
  → 拉取资源类型能力
  → 进入版本创建
```

### 4.2 相关接口

| 接口 | API 参数 | Console 行为 | CLI 要求 |
|---|---|---|---|
| `Resource.info` | `resourceIdOrName` | 检查 `userName/resourceName` 是否已存在 | CLI 创建前必须做一次存在性检查；最终仍以 `Resource.create` 为准 |
| `Resource.create` | `name`、`resourceTypeCode`、`resourceTypeName`、`resourceTitle` | 创建资源壳 | 写入前展示账号、环境、owner、标题、标识、类型路径 |
| `Resource.getResourceTypeInfoByCode` | `code` | 创建成功后取类型能力 | 决定下一步版本内容入口 |

### 4.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-RES-TITLE | 资源标题 | `FInput_PinyinSafeTextCounter`，`lengthLimit=100` | `resourceTitle` | HARD：必填，trim 后不能为空；长度不超过 100 个字符 | 提示标题会影响搜索曝光；如果只给本地文件名，默认用去扩展名后的文件名并可编辑 | 超长时显示当前长度和上限；非交互返回字段错误 |
| FORM-RES-NAME | 授权标识 | 用户名前缀固定展示，输入部分 `lengthLimit=60`；非法字符自动转 `_` | `name` | HARD：必填；优化后不能为空；输入部分最多 60 个字符；创建后不可改。SERVER_FALLBACK：重复性仍以 `Resource.info` 和 `Resource.create` 返回为最终裁决 | 默认从标题截取 60 字符生成；展示“原输入 → 优化后”；用户确认后写入 | 已存在时要求换名；被优化为空时重新输入；写入后不支持修改，只能新建资源 |
| FORM-RES-NAME-NORMALIZE | 授权标识规范化 | `FRegExpMgr.resourceNameOptimized` 替换 `\ / : * ? " < > | 空白 @ $ # emoji` 为 `_` | `name` | HARD：CLI 必须复用同一规则或等价规则 | 在确认页展示规范化结果，避免用户误以为按原样保存 | 平台返回更严格错误时，按字段错误展示并停止写入；不在当前会话里猜测替换规则 |
| FORM-RES-CREATE-CHECK | 创建按钮可用性 | 类型、标题、标识、重复校验都通过才可点 | 无单独参数 | HARD：缺任一必填项不得写入 | TTY 逐项补齐；AI/CI 输出缺字段列表 | 网络或平台校验失败时保留会话草稿，可重试 |

## 5. F3 · 版本内容与版本信息

### 5.1 Console 流程

```text
Step2 / 新版本页
  → 根据资源类型能力展示入口
      localUpload / storageSpace / markdownEditor / cartoonEditor
  → 选择或生成文件对象
  → 平台解析系统属性
  → 填补额外属性
  → 维护自定义属性和可选配置
  → 选择依赖资源和版本范围
  → 处理授权排除项
  → 创建版本
```

首个版本与新版本的差异：

| 场景 | 版本号 | 继承行为 | 接口 |
|---|---|---|---|
| 首个版本 | Console 固定 `1.0.0` | 无历史版本，只能来自当前文件/编辑器草稿 | `Resource.createVersion` |
| 已有资源新版本 | 默认 `semver.inc(latestVersion, 'patch')`，失败则 `1.0.0` | 可继承上个版本的文件名、sha1、描述、属性、依赖、上抛资源等 | `Resource.createVersion` |
| 已有版本信息维护 | 不替换文件身份 | 维护属性、依赖、描述等可编辑信息 | `Resource.updateResourceVersionInfo` |

### 5.2 相关接口

| 接口 | 场景 | CLI 要求 |
|---|---|---|
| `Resource.getResourceTypeInfoByCode` | 获取 `fileCommitMode`、`fileMaxSize`、`fileMaxSizeUnit`、`supportDownload`、`supportEdit`、`supportOptionalConfig` | 本地文件入口和大小限制必须来自这里 |
| `Resource.lookDraft` | 查看版本草稿 | CLI 一期以本地会话草稿为主；如对接平台草稿，必须标明来源 |
| `Resource.saveVersionsDraft` | 保存 Console 编辑器草稿 | CLI 只有在调用 Console 编辑器接力时使用 |
| `Resource.createVersion` | 创建版本 | 版本创建的唯一写接口 |
| `Resource.updateResourceVersionInfo` | 更新版本信息 | 不用于替换已发布版本文件 |

### 5.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-VER-ENTRY | 内容入口 | 按 `fileCommitMode` 展示 `localUpload`、`storageSpace`、`markdownEditor`、`cartoonEditor` | 间接影响 `fileSha1`、`filename` | DYNAMIC：入口来自资源类型能力，CLI 不能自行开放不存在的入口 | 本地优先；若类型支持 markdown/cartoon 编辑但 CLI 无编辑器，则生成 Console 跳转或导入已有文件 | 用户选择不支持入口时展示该类型实际支持入口 |
| FORM-VER-FILE | 文件/对象 | 上传或选存储对象后得到 sha1 和文件名 | `fileSha1`、`filename` | HARD：创建版本必须有 sha1 和 filename。DYNAMIC：格式、解析能力由平台和资源类型决定 | 本地文件必须存在、可读；目录先构建/打包成单一产物再上传；上传后展示 sha1 | 上传成功但发布失败时保留 sha1，重试不重复上传 |
| FORM-VER-SIZE | 文件大小 | `limitFileSize = fileMaxSize * 1024 * 1024 ** fileMaxSizeUnit` | 上传前校验 | DYNAMIC：大小上限来自 `getResourceTypeInfoByCode`；不得写死视频/图片等固定值 | 扫描时显示当前文件大小和类型上限 | 超限时建议压缩、换类型或跳转 Console |
| FORM-VER-NUMBER | 版本号 | 首版固定 `1.0.0`；新版本默认 patch + 1；`FVersionInput` 使用 `semver.valid` 和 `semver.gt(input, latestVersion || '0.0.0')` | `version` | HARD：首版为 `1.0.0`；新版本必填、必须是合法 semver、必须大于当前最新版本 | 新版本默认建议 patch+1；可让用户改 minor/major | 冲突或小于等于最新版本时列出已有版本；非交互返回建议版本 |
| FORM-VER-DESC | 版本描述 | 富文本编辑器保存 HTML；空编辑器 `<p></p>` 序列化为 `''`；RSS 相关资源/合集禁用描述编辑 | `description` | SOFT：可空；Console 未设置本地长度门禁，CLI 不额外发明长度上限 | 提示用于版本变更说明；可从 changelog/commit 提取；非 HTML 输入可按纯文本包装或直接发送纯文本，由实现统一 | 平台拒绝时转为 `FORM-VER-DESC` 字段错误，保留原输入供用户缩短或修改 |
| FORM-VER-INPUT | 额外输入属性 | 文件解析后展示 additional system properties | `inputAttrs[{key,value}]` | DYNAMIC：字段来自平台解析结果；必填性和格式以解析结果/平台为准 | 逐项展示名称、key、当前值、是否继承；缺值时停在该字段 | 解析失败时允许重新上传或保留手填字段后再试 |
| FORM-VER-CUSTOM-PROP | 自定义属性 | `customProperties` 转 readonlyText | `customPropertyDescriptors` | DYNAMIC：字段来自解析/继承；CLI 不发明字段 | 表格展示 key/name/remark/defaultValue | key 冲突或平台拒绝时回到属性编辑 |
| FORM-VER-CUSTOM-CONFIG | 可选配置 | 仅 `supportOptionalConfig === 2` 时展示 | `customPropertyDescriptors` | DYNAMIC：支持状态来自资源类型能力；输入型转 `editableText`，选择型转 `select` | 不支持时隐藏；支持时展示“高级配置”阶段 | 缺少候选项时停止并提示平台模板异常 |
| FORM-VER-DEPS | 直接依赖 | 依赖资源 + versionRange；版本选择器使用 `semver.validRange`，并要求至少匹配一个已有版本 | `dependencies[{resourceId,versionRange}]` | HARD：依赖必须是平台存在资源；版本范围默认非空、必须是合法 semver range、必须能命中该依赖至少一个版本；从解析结果生成时默认 `^latestVersion` | 支持搜索资源、从文件解析依赖、手动添加；展示 resourceName/latestVersion/选择范围 | 未授权依赖进入授权处理，不得静默跳过；版本范围不命中时回到该依赖 |
| FORM-VER-UPCAST | 基础上抛资源 | baseUpcastResources 列表 | `baseUpcastResources[{resourceId}]` | DYNAMIC：候选关系来自当前资源类型和平台解析/继承结果，CLI 不开放任意资源手填 | 作为高级项展示；默认继承 Console/上一版本 | 平台拒绝时展示资源 ID 和原因 |
| FORM-VER-AUTH-EXCLUDE | 授权排除项 | 未授权依赖可排除 contract/policy | `authExcludedItems[{resourceId,excludedType,excludedValue}]` | HARD：只有用户显式排除才发送；不得自动替用户排除 | 显示未授权资源、合同/策略，要求确认 | 存在未处理授权时禁止发布版本 |

## 6. F4 · 策略模板与策略保存

### 6.1 Console 流程

```text
Step3 / 策略抽屉
  → 展示策略模板列表
  → 用户选择模板
  → 填策略标题
  → 填模板参数：number / select / datetime
  → 调用编译接口生成策略代码
  → 检查策略代码是否重复
  → 调用翻译接口生成可读预览
  → 用户确认
  → Resource.update 添加策略
```

这里必须纠正旧设计影响：CLI 不是让用户先写策略代码，而是应先看可选策略模板，再选择策略进行应用。手写策略只应作为高级/后续能力。

### 6.2 相关接口

| 接口 | API 参数 | Console 行为 | CLI 要求 |
|---|---|---|---|
| `Policy.policyTemplates` | `resourceTypeCodes4Resource` 或 `resourceTypeCodes4Presentable` | 根据资源类型或展品资源类型取模板 | CLI 必须先展示模板列表 |
| `Policy.policyReCompile` | `_id`、`fillArgs[{name,value}]` | 把模板参数编译为策略代码 | 编译失败停在参数编辑 |
| `Policy.policyTranslation` | Base64 后的 contract | 生成可读翻译 | 保存前必须展示翻译预览 |
| `Resource.update` | `addPolicies[{policyName,policyText}]` | 添加策略到资源 | policyText 发送前按 Console 方式编码 |

### 6.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-POL-TEMPLATE | 策略模板 | 模板卡片列表 | `_id` | HARD：必须来自 `Policy.policyTemplates`；不能填不存在模板 ID | 显示模板标题、可读描述、适用资源类型；支持搜索 | 无模板时允许跳过策略，但上架前提示可能影响签约 |
| FORM-POL-NAME | 策略名称 | 输入框 `lengthLimit=20` | `policyName` | HARD：必填；不少于 2 个字符；不超过 20 个字符；不能与已有策略名重复 | 默认用模板标题；重复时建议追加序号 | 非交互重复直接失败并返回已有策略名 |
| FORM-POL-ARG-NUMBER | 数字参数 | 模板 UI 参数 | `fillArgs.value` | DYNAMIC：普通数字 min=0.01 precision=2；RelativeTimeEvent min=1 precision=0 | 展示单位、默认值、最小值、小数位 | 越界回到该参数 |
| FORM-POL-ARG-SELECT | 选择参数 | 模板 selectOptions | `fillArgs.value` | DYNAMIC：必须来自模板候选项 | TTY 下拉编号选择；非交互校验枚举 | 候选项过期时重新拉模板 |
| FORM-POL-ARG-DATETIME | 日期时间参数 | datetime 参数 | `fillArgs.value` | DYNAMIC：默认值和格式来自模板；平台编译为最终校验 | 提供当前默认值，支持输入标准日期时间 | 编译失败提示具体参数 |
| FORM-POL-CODE | 编译后的策略代码 | 编译后进入确认页 | `policyText` | HARD：不能与已有策略代码重复 | 保存前展示翻译和代码摘要；默认不展示长代码，支持 `--show-policy-code` | 重复时回到模板或参数阶段 |
| FORM-POL-TRANSLATION | 策略翻译 | 确认页可读文本 | 无保存字段 | HARD：保存前必须成功生成或明确警告 | 展示“将创建的策略含义” | 翻译接口失败时不静默保存 |

## 7. F5 · sidebar 维护：Listing、封面、简介、标签与上下架

### 7.1 Console 流程

```text
Step4 / sidebar info
  → 上传或继承封面
  → 填简介
  → 编辑标签
  → 可选择稍后处理或立即上架
  → Resource.update 保存 listing 和 status
```

RSS 场景例外：RSS 绑定后标题、封面、简介受 feed 锁定，但 tags 仍允许维护。

### 7.2 相关接口

| 接口 | API 参数 | Console 行为 | CLI 要求 |
|---|---|---|---|
| `Resource.availableTags` | `resourceTypeCode` | 拉推荐标签/活动标签 | CLI 展示推荐标签，但允许自定义 |
| `Resource.update` | `tags`、`coverImages`、`intro`、`status` | 保存展示信息和上下架状态 | 写入前展示 diff 和 status 变化 |

### 7.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-LIST-COVER | 封面 | `FUploadCover` 上传后保存 URL；默认允许 jpeg/jpg/jpe、png、gif；单文件最大 `5 * 1024 * 1024` 字节 | `coverImages` | HARD：可空；如上传本地文件，格式必须是 JPEG/PNG/GIF，大小不超过 5MB；如已有 URL，保存为数组首项 | 支持本地图片上传、URL、继承首帧/默认；写入前预览 URL | 上传失败保留本地路径，允许重试 |
| FORM-LIST-INTRO | 简介 | 多行输入 `lengthLimit=200`；超过时发布按钮 disabled | `intro` | HARD：最多 200 个字符；可空 | 显示剩余字符；AI 模式可自动摘要但必须可见 | 超长时给截断建议但不自动覆盖，除非用户指定 |
| FORM-LIST-TAGS | 标签 | 最多 20 个；单个最多 20 字符；去掉 `#`；不能重复 | `tags` | HARD：数量小于等于 20；单标签小于等于 20；去 `#`；去重后保存 | 展示推荐标签和已选标签；支持添加/删除；RSS 场景仍开放 | 重复时提示已有标签；达到 20 个时只能删除不能新增 |
| FORM-ONLINE | 上架状态 | Step4 “发行/上架”；也可稍后处理 | `status=1` 上架，其他状态以平台定义为准 | HARD：上架前必须已有版本；策略缺失时至少强提示；账号、owner、资源 ID 要确认 | 写入前展示环境、账号、资源、版本、策略数量、listing diff | 平台拒绝上架时保留草稿并给 Console 链接 |
| FORM-OFFLINE | 下架状态 | sidebar/list 中维护 | `status=0` | HARD：下架写入 `Resource.update({ status: 0 })`；必须二次确认，因为影响线上访问 | 确认页展示环境、账号、资源、当前 online 状态和将变更为 offline | 失败时展示平台原因；本地状态不提前标记成功 |

## 8. F6 · 已有资源更新流程与版本维护

### 8.1 Console 流程

```text
选择已有资源
  → 查看 resource info
  → 选择创建新版本、维护版本信息、维护 listing、维护策略、上下架
  → 新版本默认继承 latestVersion 信息
  → 写入前只提交本次变更字段
```

### 8.2 相关接口

| 接口 | 场景 | CLI 要求 |
|---|---|---|
| `Resource.info` | 加载资源基础信息、策略、版本列表 | 必须校验 owner 和当前登录账号 |
| `Resource.resourceVersionInfo1` | 读取最新或指定版本详情 | 新版本继承和版本信息维护都要用 |
| `Resource.createVersion` | 发布新版本 | 替换文件身份只能通过新版本 |
| `Resource.updateResourceVersionInfo` | 维护版本信息 | 不替换 `fileSha1` 的情况下更新描述、属性、依赖等 |
| `Resource.update` | listing、策略、上下架 | 写入前展示 diff |

### 8.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-UPD-RESOURCE | 目标资源 | list/sidebar/detail 选择 | `resourceIdOrName` 或 `resourceId` | HARD：必须存在；必须属于当前账号或当前账号有权限维护 | 支持按 resourceId、全名、标题搜索；展示唯一确认页 | 搜索多结果时必须人工/显式选择 |
| FORM-UPD-INHERIT | 继承字段 | 新版本页默认带出上个版本 | 多字段 | SOFT：继承不是静默写入，必须标明来源 | 展示“继承自 latestVersion”的字段列表 | 本地 manifest 和远端都改同字段时停止 |
| FORM-UPD-VERSION-INFO | 版本信息维护 | 版本信息编辑器 | `description?`、`customPropertyDescriptors?`、`resolveResources?`、`inputAttrs` | HARD：只维护版本元信息，不替换 `fileSha1`/`filename`；只提交用户改过的字段 | 只提交用户改过的字段，避免覆盖 | 平台拒绝时回滚本地状态 |

## 9. F7 · 合集流程：创建、条目维护与目录草稿

### 9.1 Console 流程

```text
合集 Step1
  → 选择合集类型 subjectType=4
  → 填标题和授权标识
  → 创建合集资源壳
合集 Step2
  → 添加已有资源 / RSS 导入 / 创建或选择子资源
  → 编辑条目展示信息和排序
  → 保存合集草稿或更新合集
合集 Step3
  → 策略模板
合集 Step4
  → listing 和上架
```

合集不是把本地目录压缩成一个普通资源。目录导入只是 CLI 的输入体验，最终仍要映射为合集条目。

### 9.2 相关接口

| 接口 | 场景 | CLI 要求 |
|---|---|---|
| `Resource.create` | 创建合集资源壳 | 使用合集类型 code |
| `Resource.updateCollection` | 保存合集目录/条目 | 写入前展示条目增删改排序 diff |
| `Resource.updateCollectionItemsInfo_Draft` | 修改合集条目草稿展示信息 | CLI 如支持条目草稿，必须区分资源 listing 和条目 listing |
| `Resource.batchResourceItems` | 查询合集条目 | RSS/合集预览时使用 |

### 9.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-COL-TYPE | 合集类型 | `subjectType='collection'`，`showAddNewType=false` | `resourceTypeCode` | HARD：必须来自合集类型树；不能用普通资源类型冒充 | 进入 collection 流程后只显示合集类型 | 选错主体类型时回到类型选择 |
| FORM-COL-ADD | 添加条目 | 选择已有资源或导入 | collection items | HARD：条目必须引用存在资源/版本；不能引用未创建成功资源 | 本地扫描先预览 create/update/skip；每个条目有独立结果 | 单项失败不污染其他条目；报告中可恢复 |
| FORM-COL-ORDER | 条目排序 | 拖拽/列表排序 | collection items order | HARD：排序必须是确定序列；不能丢项或重复 | CLI 以编号排序、move、批量导入顺序维护 | 排序冲突时展示远端最新顺序 |
| FORM-COL-ITEM-LISTING | 条目展示信息 | 条目自定义标题草稿维护；RSS 合集禁用该编辑 | `updateCollectionItemsInfo_Draft({ data:[{ itemId, itemTitle }] })` | HARD：一期只维护合集条目标题 `itemTitle`；必须有 `itemId`；这是合集草稿字段，不是资源自身 listing | CLI 明确提示“这是合集内展示标题，不是资源全局标题”；支持逐项预览 diff | 用户误改时可撤销本次会话变更；RSS 合集提示由 RSS 源维护 |
| FORM-COL-MERGE | 合并目录草稿 | Console 有目录草稿合并行为 | `isMergeCatalogueDraft` 或等价参数 | HARD：必须显式确认；不能默认合并 | 写入前提示会影响合集目录草稿 | 用户取消则保留草稿，不调用合并 |

## 10. F8 · RSS 流程：订阅绑定与同步

### 10.1 Console 流程

```text
输入 RSS feedUrl
  → 检测地址
  → 展示播客卡片：标题、封面、作者、单集数、邮箱掩码
  → 已存在则区分自己已提交 / 他人已提交
  → 发送验证码
  → 输入验证码
  → 导入前校验 matchedItemCount
  → 超过 1000 单集则要求日期范围筛选
  → 修改 RSS 地址时比较 GUID 差异
  → 绑定/导入
  → RSS 锁定标题、封面、简介；tags 仍允许维护
```

### 10.2 相关接口

| 接口 | 场景 | CLI 要求 |
|---|---|---|
| `Resource.bindRssFeed` | 绑定/更新 RSS | 捕获验证码错误和平台错误 |
| `Resource.info` | RSS 后读取资源/合集状态 | 确认锁定字段和 tags 可维护 |
| `Resource.batchResourceItems` | 读取 RSS 生成条目 | 展示导入结果 |
| `Resource.updateCollection` | RSS 相关合集更新 | 与普通合集更新共用但必须区分来源 |
| `Rss.bindingsPreview` | 预览 RSS 数量和信息 | `matchedItemCount` 校验 |
| `Rss.bindingsCompare` | 修改 RSS 时比较 GUID | 大面积不匹配需要确认 |

### 10.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-RSS-FEED | RSS 地址 | 输入框 placeholder `https://`，点击检测地址 | `feedUrl` 或 `rssUrl` | HARD：必填；update 模式下不能与原地址相同。SERVER_FALLBACK：可访问性、feed 格式、邮箱、是否已绑定由预览/绑定接口裁决 | 先检测再验证码；不要跳过预览直接绑定 | 无效链接、缺邮箱、已存在都进入对应错误状态 |
| FORM-RSS-PREVIEW | 播客预览 | 标题、封面、作者、单集数、邮箱掩码 | 预览返回字段 | HARD：没有成功预览不得导入 | 展示 feed 标题、封面、作者、episode count、matchedItemCount | 预览失败可重试或换地址 |
| FORM-RSS-CODE | 验证码 | 发送到 feed 邮箱；按钮 60 秒倒计时 | `verificationCode` | HARD：导入前必填；验证码错误识别 `VerificationCodeInvalid` 和 `wrong_verified_code` | 错误只贴在验证码字段，不把整条流程清空 | 错误后保留 feed 和预览，只清验证码 |
| FORM-RSS-LIMIT | 单集数量限制 | `PODCAST_RSS_EPISODE_LIMIT = 1000` | `matchedItemCount` | HARD：`matchedItemCount > 1000` 阻止直接导入 | 弹出/进入日期范围筛选；日期筛选后重新查询 | 查询失败不导入；超过仍要求重新选择日期 |
| FORM-RSS-DATE | 日期范围 | RangePicker，不能选未来；API 格式 `YYYY-MM-DD HH:mm:ss` | `pubStartDate`、`pubEndDate` | HARD：超过 1000 时必须提供；结束时间为当日结束 | CLI 用 `YYYY-MM-DD` 输入，发送时转换为当天开始/结束时刻 | 结束早于开始、未来日期直接拦截 |
| FORM-RSS-GUID | GUID 差异确认 | 修改 RSS 地址时比较新旧 feed | `oldFeedItemCount`、`newFeedItemCount`、`guidMatchedCount` | HARD：GUID 不匹配数量 = `max(oldFeedItemCount, newFeedItemCount) - guidMatchedCount`；大于数量差值视为大面积不匹配 | 大面积不匹配时必须明确确认“将作为全新单集发布” | 用户取消则终止，不调用绑定 |
| FORM-RSS-LOCKED | RSS 锁定字段 | RSS 资源锁定 title/cover/intro | 相关 listing 字段不应发送 | HARD：绑定后标题、封面、简介由 RSS 源维护；tags 仍允许维护 | CLI listing 阶段隐藏或只读锁定字段，保留 tags 编辑 | 用户传入锁定字段时提示忽略原因或直接失败 |

## 11. F9 · collect-rules 自动收录

### 11.1 Console 流程

```text
进入合集信息页
  → 打开自动收录设置
  → 选择全部满足 / 任一满足
  → 添加一个或多个条件
  → 条件字段为资源标题、授权标识、资源类型
  → 保存规则
```

collect-rules 是合集维护能力，不是 RSS 同步。它影响“哪些资源被自动收录”，而 RSS 影响“feed 条目如何导入/同步”。

### 11.2 相关接口

| 接口 | API 参数 | Console 行为 | CLI 要求 |
|---|---|---|---|
| `Resource.setCollectRules` | `resourceId`、`serializeStatus`、`status`、`conditionType`、`filterConditions` | 保存自动收录规则 | 保存前展示规则的人类可读摘要 |

### 11.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-RULE-ENABLE | 自动收录开关 | 启用/停用自动收录，保存时带序列化状态 | `status=1/0`、`serializeStatus=1/0` | HARD：启用规则时必须有至少一个条件；停用时仍可保存已有条件供下次启用 | 显示“只保存规则”与“启用自动收录”的区别 | 停用失败不删除本地规则草稿 |
| FORM-RULE-TYPE | 条件关系 | `every` / `some` 单选 | `conditionType=1` 表示全部满足，`2` 表示任一满足 | HARD：只能二选一 | 展示“全部满足”和“任一满足”的自然语言含义 | 启用且无条件时不允许保存 |
| FORM-RULE-FIELD | 条件字段 | `resourceTitle` / `authIdentity` / `resourceTypeCode` | `filterConditions[].key` | HARD：只能三选一 | 资源类型条件进入类型树选择；标题/授权标识进入文本输入 | 未知字段直接拒绝 |
| FORM-RULE-OPERATOR | 条件操作符 | Console/API 支持 `INCLUDES`、`NOT_INCLUDES`、`STARTS_WITH`、`ENDS_WITH`、`EQUAL`、`NOT_EQUAL`；资源类型字段默认 `EQUAL` | `filterConditions[].limitOperatorType` | HARD：操作符必须来自枚举；`resourceTypeCode` 只能选择对类型 code 有意义的等值类操作；`authIdentity` 使用 `STARTS_WITH` 时会拼接 `username/` 前缀 | CLI 默认给字段推荐操作符，同时允许展开高级操作符 | 字段切换时同步校验操作符，不合法则回到操作符选择 |
| FORM-RULE-VALUE | 条件值 | 文本或资源类型 code；`authIdentity + STARTS_WITH` 会保存为 `username/value` | `filterConditions[].value` | HARD：不能为空；资源类型必须来自类型树；授权标识前缀由当前账号决定，不能让用户手写别人的 owner 前缀 | 保存前显示规则摘要，如“标题包含 X”“类型等于 Y”“授权标识以 当前用户/X 开头” | 空值、过期类型或 owner 不一致时回到该条件 |

## 12. F10 · 批量创建

### 12.1 Console 流程与 CLI 差异

Console 有批量创建入口，但 CLI 是本地资源管理工具，批量能力更核心：

```text
选择本地目录
  → 扫描文件
  → 选择支持批量的资源类型
  → 生成标题/授权标识/版本内容
  → 预览 create / update / skip / fail
  → 分批创建资源壳和版本
  → 每个资源写独立结果
```

### 12.2 相关接口

| 接口 | 场景 | CLI 要求 |
|---|---|---|
| `Resource.resourceTypes` | 批量类型选择 | 必须传 `supportCreateBatch=2` |
| `Resource.createBatch` | 批量创建资源 | 请求前必须已经有确定 manifest 和预览结果 |
| `Resource.createVersion` | 必要时逐项创建版本 | 每项有独立状态，不能整批黑盒 |

### 12.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-BATCH-SOURCE | 本地输入目录/文件 | CLI 特有 | 本地路径，不直接是 API 字段 | HARD：路径存在、可读；目录扫描要排除隐藏/临时文件规则可配置 | 扫描后先展示数量、大小、类型推断 | 空目录停止；不可读文件逐项标记失败 |
| FORM-BATCH-TYPE | 批量资源类型 | Console 批量入口过滤支持批量类型 | `resourceTypeCode` | HARD：必须来自 `supportCreateBatch=2` 的类型树 | 默认逐级选择；搜索只是加速 | 类型不支持批量时回到类型选择 |
| FORM-BATCH-NAME | 批量命名规则 | Console 仍受标题/授权标识约束 | `resourceTitle`、`name` | HARD：每项都满足 FORM-RES-TITLE 和 FORM-RES-NAME | 提供模板预览：文件名、序号、目录名组合 | 冲突项标记 skip/rename/fail，由用户选择策略 |
| FORM-BATCH-COUNT | 批量规模 | Console/API 暴露 `createResourceObjects[]`，前端未设置固定条数上限 | 分批请求 | HARD：CLI 不把批量总数写成平台上限；默认分批只是恢复粒度和限流保护，不是业务限制 | 预览每批大小；默认保守分批，允许配置 `batchSize`；写入前展示总数、批次数和失败恢复方式 | 请求结果未知时记录 `remote_outcome_unknown`，重试前先查远端，不得盲目重建 |
| FORM-BATCH-REPORT | 报告与恢复 | CLI 特有 | 本地报告文件 | HARD：每项都有 started/succeeded/failed/unknown 状态 | 输出 JSON/NDJSON 和人类可读摘要 | 中断后从报告恢复，先查远端再决定重试 |

## 13. F11 · 主题、插件、签约和支付接力

### 13.1 Console 事实

主题和插件不是 CLI 自己发明的对象：

- 主题、插件首先都是平台资源类型树中的资源或展品相关类型。
- 主题激活发生在节点主题管理页，涉及资源、版本、策略和节点展品关系。
- 插件依赖由主题相关组件展示，资源类型、插件说明和配置仍由平台数据决定。
- 支付、签约、收银台、节点激活等强 UI/平台风控流程不能在 CLI 内完整替代。

### 13.2 CLI 设计边界

| 能力 | CLI 一期处理 | 原因 |
|---|---|---|
| 发行主题资源/插件资源 | 可以按普通资源发行流程处理，但类型必须来自平台类型树；旧预定义类型只能作为提示，不作为硬编码全集 | 发行本质仍是资源发行；当前 Console 选择以类型树为准 |
| 主题资源的文件、模板、压缩、打包 | CLI 可提供本地构建和打包体验 | 这是 CLI 原生优势 |
| 主题激活到节点 | HANDOFF：给 Console 链接和需要携带的资源/version/policy 信息 | Console 有节点上下文、签约和 UI 确认 |
| 插件依赖配置 | 一期只展示/校验依赖，复杂 UI 配置接力 Console | 依赖配置表单可能来自主题和平台动态数据 |
| 支付/签约 | HANDOFF：提醒并打开 Console 支付/签约入口 | 涉及支付、合同确认和风控 |

### 13.3 字段账本

| 字段 ID | 字段 | Console 表现 | API 参数 | 约束 | CLI 交互 | 异常恢复 |
|---|---|---|---|---|---|---|
| FORM-THEME-TYPE | 主题资源类型 | 类型树和主题页过滤；历史预定义里存在 `theme`，但当前 UI 以平台类型树为准 | `resourceTypeCode` | DYNAMIC：必须来自平台主题相关类型；CLI 只能提供“主题/插件”快捷筛选，不能固定写死 code 集合 | 类型选择中提供主题快捷筛选，但最终选择仍是 code | 无匹配时提示去 Console 检查类型配置 |
| FORM-THEME-ACTIVATE | 节点主题激活 | Console 节点主题页调用 `Exhibit.createPresentable`，随后 `Exhibit.presentablesOnlineStatus({ onlineStatus: 1 })` | 节点/展品/策略相关参数 | HANDOFF：一期不在 CLI 闭环节点激活；资源发行本身仍可在 CLI 完成 | CLI 发行完成后输出 Console 链接、resourceId、latestVersion、policyIds、建议 presentableName/presentableTitle | 用户要求继续时说明需要 Console 完成节点上下文、合同/支付/风控确认 |
| FORM-PLUGIN-DEPS | 主题依赖插件 | `FThemeDependencyPlugins` 展示插件块 | 依赖资源信息 | DYNAMIC：来自平台资源/主题数据 | CLI 展示依赖插件是否存在、是否已发行、是否需要签约 | 缺签约或支付时给 Console 接力 |

## 14. 开发落地规则

### 14.1 字段账本的实现验收映射

每个字段 ID 必须能被实现和测试追溯，但本文不指定旧代码文件：

| 字段账本内容 | 代码必须提供 |
|---|---|
| 字段 ID | validator 名称、错误 code、测试名都包含该 ID 或稳定映射 |
| 约束强度 | 本地校验、动态拉取、平台兜底、Console 接力四种路径之一 |
| TTY 交互 | prompt 文案、默认值、帮助、重新输入路径 |
| 非交互 | 缺字段错误、字段错误、退出码、JSON 错误体 |
| 异常恢复 | 会话 checkpoint、报告、重试前远端查询 |

### 14.2 不能再出现的实现方式

- 不能写“按 Console 限制”而没有具体字段。
- 不能只支持搜索资源类型，不支持逐级选择。
- 不能让用户手写策略代码作为默认流程。
- 不能把合集当成本地压缩包上传。
- 不能把 RSS 和 collect-rules 混为一个功能。
- 不能在 RSS 绑定后继续允许修改被 feed 锁定的标题、封面、简介。
- 不能在主题/插件场景绕过平台资源类型树。
- 不能把支付、签约、节点主题激活伪装成 CLI 已闭环能力。

### 14.3 已闭环结论与动态边界

| 项 | 结论 | CLI 实现口径 |
|---|---|---|
| 版本描述 | Console 保存富文本 HTML，空编辑器保存为空字符串；RSS 相关资源/合集禁用描述编辑；Console 源码没有本地长度门禁 | CLI 不设置自创长度上限；平台拒绝时按 `FORM-VER-DESC` 字段错误展示 |
| 版本范围 | Console 使用 `semver.validRange`，并要求至少匹配一个已有版本；解析依赖默认可给 `^latestVersion` | CLI 本地复用 semver range 校验和命中校验，不能只把字符串交给服务端 |
| 批量规模 | `createBatch` 接口是 `createResourceObjects[]`，Console 前端未设置固定条数上限 | CLI 默认分批是恢复和限流设计，不是平台硬限制；遇到服务端体积/限流错误时自动拆小并记录 |
| 封面上传 | `FUploadCover` 默认支持 JPEG/PNG/GIF，最大 5MB，通过 `Storage.uploadImage` 获得 URL | CLI 上传本地封面前先做格式和大小校验；URL 模式只在保存前预览 |
| 合集条目标题 | `updateCollectionItemsInfo_Draft` 只接收 `itemId`、`itemTitle`；RSS 合集禁用条目标题编辑 | CLI 一期只做条目标题草稿维护，不声称支持条目简介等不存在字段 |
| collect-rules | 接口字段为 `serializeStatus`、`status`、`conditionType`、`filterConditions`；条件字段限 `resourceTitle`、`authIdentity`、`resourceTypeCode`；操作符来自接口枚举 | CLI 做规则构造器，字段、操作符、值联动校验；保存前展示自然语言摘要 |
| 主题/插件类型 | 具体 code 来自平台类型树，历史预定义只能辅助搜索；节点主题激活由 Console 调 `Exhibit.createPresentable` 和上架接口完成 | CLI 能发行主题/插件资源，但节点激活、签约、支付属于 Console 接力 |
