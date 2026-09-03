# P0-F0-Step1: 创建授权条目

## 📋 概述

Console 单资源发行第 1 步：选叶子类型、填标题与授权标识、查重后创建资源壳，再拉类型配置并进入 Step2。

入口：`creatorEntry` 点「发行单个资源」→ `creator`，`step === 1` 时渲染本页。

步骤标题 i18n：`rqr_step1` → 「创建授权条目」。页面总标题：`rqr_title` → 「发行资源」。

证据只来自 Console 页面 + dva effects + `FServiceAPI` + `i18n.json` 的 `zh_CN`。不写真实代码。

### 主流程 (ASCII)

```
进入 Step1
  → 挂载页：写入当前 userName
  → 选资源类型（树 / 搜索 / 最近建议 / 在父级下添加新类型名）
  → 填资源标题（≤100；与授权标识仍相等时，标题前 60 字同步到标识）
  → 填授权标识（≤60；规范化后防抖 300ms 查重）
  → 「立即创建」可用
  → POST 创建资源壳
  → GET 类型配置（上传入口 / 大小上限 / 可下载可编辑可配选项）
  → step = 2，进入「提交资源文件」
```

---

## 一、选择资源类型

### 操作流程

1. 打开 `FResourceTypeInput4`（`showAddNewType=true`，`subjectType` 默认 `resource`）。
2. 挂载时拉类型树，并拉最多 6 条最近使用建议。
3. 可级联点到**无子节点的叶子**；有子节点的项只展开，不能选定。
4. 可搜索（输入防抖 300ms，只搜 `isTerminate=true` 的叶子）。
5. 可在某一父级最后一项点「添加新类型」，进入自定义输入；新类型名须过 `RESOURCE_TYPE`，创建时把父级 `code` 当作 `resourceTypeCode`，末段当作 `resourceTypeName`。**不会单独调用创建类型接口。**
6. 清空选择时，错误文案为 `naming_convention_resource_type_required`。

### API 调用

| 操作 | FServiceAPI | HTTP | 主要参数 | i18n key (zh_CN) |
|------|-------------|------|----------|------------------|
| 拉类型树 | `Resource.resourceTypes` | `GET /v2/resources/types/listSimpleByGroup` | `category=1`，`status=1`，`subjectType=1` | `createresource_selectresourcetype_input_hint`: 「选择资源类型」 |
| 最近建议 | `Resource.listSimple4Recently` | `GET /v2/resources/types/listSimple4Recently` | `subjectType=1`；前端 `slice(0, 6)` | `createresource_selectresourcetype_input_hint2`: 「建议」 |
| 搜索叶子 | `Resource.ListSimpleByParentCode` | `GET /v2/resources/types/listSimpleByParentCode` | `nameChain`，`subjectType=1`，`isTerminate=true`，`status=1` | — |
| 自定义输入联想（当前父级） | `Resource.ListSimpleByParentCode` | 同上 | `parentCode`，`name`，`isTerminate=true` | `createresource_selectresourcetype_input_resourceqty`: 「{ResourceQty}个资源」 |
| 自定义输入联想（排除当前父级） | `Resource.ListSimpleByParentCode` | 同上 | `parentCode`，`category=1`，`name`，`excludeParentCode=true`，`isTerminate=true` | 同上 |
| 添加新类型入口 | 无独立 API | — | 只改本地 `customInput` | `createresource_selectresourcetype_btn_addnewtype`: 「添加新类型」 |
| 确认添加该名称 | 无独立 API | — | 随 `Resource.create` 提交 `resourceTypeName` | `createresource_selectresourcetype_btn_addthis`: 「添加新类型」 |

### 字段约束

| 字段名 | 约束 | 必填 | 默认值 | i18n key (zh_CN) |
|--------|------|------|--------|------------------|
| `step1_resourceType` | 叶子：`{ value: typeCode, labels[] }`；新建：另带 `customInput` | ✅ | `null` | `rqr_input_resourcetype`: 「资源类型」 |
| 类型帮助 | — | — | — | `rqr_input_resourcetype_help`: 「选择最贴切描述此资源的类型，其他用户会通过资源类型在资源市场中寻找他们想要的资源。」 |
| 选择器 placeholder | — | — | — | `createresource_selectresourcetype_input_hint`: 「选择资源类型」 |
| 新类型名 `customInput` | `FUtil.Regexp.RESOURCE_TYPE`：`^[\u4e00-\u9fefa-zA-Z0-9\\-&.,]{1,40}$` | 仅走「添加新类型」时 | 无 | `createresource_selectresourcetype_input_hint4`: 「输入新资源类型名称」 |
| 未选类型 | `value === null` | — | `''` | `naming_convention_resource_type_required`: 「请选择资源类型」 |

### Console 源码位置

- `creator/index.tsx` L77：步骤名 `rqr_step1`
- `creator/Step1/index.tsx` L75–111：类型区与 `FResourceTypeInput4`
- `FResourceTypeInput4/index.tsx` L76–91：拉树；L93–106：最近建议；L110–150：自定义联想（300ms）；L156–194：搜索（300ms）；L223–260：新类型提交形态
- `FResourceTypeInput4/CascaderMenu.tsx` L49–53：只有无子节点才 `onSelect`；L108–125：父级末项「添加新类型」
- `models/resourceCreatorPage/step1Effects.ts` L17–36：空类型写错误文案
- `packages/tools-lib/src/utils/regexp.ts` L8：`RESOURCE_TYPE`
- `packages/tools-lib/src/service-API/resources.ts` L779–847：上述 HTTP

---

## 二、输入资源标题，并在未分叉时同步授权标识

### 操作流程

1. 标题输入框 `FInput_PinyinSafeTextCounter`，`lengthLimit=100`；超出时组件截断，不让本地值超过 100。
2. 每改一次标题：effects 里空串 → 必填错误；`length > 100` → 硬编码「不超过100个字符」（无 i18n key）。因输入框已截断，后一条在 UI 上通常走不到。
3. 同步规则（以**改标题前**的旧标题、旧标识比较）：若旧标题 === 旧标识，且新标题前 60 字 ≠ 旧标识，则把前 60 字写入标识，并触发 300ms 查重。
4. 标题 effects **不**增加 `step1_dataIsDirty_count`。离开页脏检查只看类型 / 标识是否改过（以及后续 Step 的 dirty）。

### API 调用

标题本身无接口。同步出去的标识走第三节查重。

| 文案 | i18n key (zh_CN) |
|------|------------------|
| 标签 | `rqr_input_resouce_title`: 「资源标题」 |
| 帮助 | `rqr_input_resouce_title_help`: 「标题直接影响资源的搜索曝光机会，建议在标题中加入品牌/内容主旨；标题长度不超过100个字符。」 |
| placeholder | `cqr_input_title_hint`: 「输入标题」 |
| 空标题 | `naming_convention_resource_title_required`: 「请输入资源标题」 |

### 字段约束

| 字段名 | maxLength | 必填 | 默认值 | 变化规则 |
|--------|-----------|------|--------|----------|
| `step1_resourceTitle` | 100（输入框截断 + effects 再判） | ✅ | `''` | 用户输入；创建请求时 `trim()` |
| 同步到 `step1_resourceName` | 标题 `substring(0, 60)` | 条件触发 | — | 仅当标题与标识尚未分叉 |

### Console 源码位置

- `Step1/index.tsx` L115–164：标题区；L139–152：同步标识
- `FInput_PinyinSafeTextCounter/index.tsx` L64–83：超长截断
- `step1Effects.ts` L38–58：空 / 超长错误

---

## 三、校验资源授权标识唯一性

### 操作流程

1. 展示前缀 `{userName} /` + 短标识输入。`userName` 来自进页 `userPermission.getUserInfo`。
2. 输入框 `lengthLimit=60`。每次改标识：立刻规范化到 `step1_resourceName_optimized`，清空错误，`isVerify=true`（按钮禁用、出 loading）。
3. 规范化：把 ` \ / : * ? " < > |` 空白、`@ $ #`、emoji 段替换成 `_`（`FRegExpMgr.resourceNameOptimized`）。
4. 防抖 300ms 后 `onVerify_step1_resourceName`：
   - `optimized === ''` → `naming_convention_resource_authid_required`
   - 否则 `Resource.info`，`resourceIdOrName` 为 `encodeURIComponent(userName + '/' + optimized)`；`data` 有值则 `resource_name_exist`（插值 `authID`）
5. 无错误且输入 ≠ 规范化结果时：绿字自动转换提示 + 黄字命名规范。无错误且已规范化：绿勾。

`tools-lib` 的 `Resource.info` 会再对 path 做一次 `encodeURIComponent`。Console 传入值已是编码后的 `userName/optimized`。CLI 侧应传未预编码的 `username/name`，只依赖 tools-lib 编一次。

### API 调用

| 操作 | FServiceAPI | HTTP | i18n key (zh_CN) |
|------|-------------|------|------------------|
| 进页拿账号 | `userPermission.getUserInfo` | 用户信息（非资源 API） | — |
| 查重 | `Resource.info` | `GET /v2/resources/{resourceIdOrName}` | `resource_name_exist`: 「资源授权标识 {authID} 已被使用，请重新输入。」 |
| 空规范化结果 | — | — | `naming_convention_resource_authid_required`: 「请输入资源授权标识」 |
| 自动转换 | — | — | `input_resourceauthid_automodified_msg`: 「您的资源授权标识将自动转换为{authid}」（Console 插值键为 `authid`） |
| 规范说明 | — | — | `naming_convention_resource_name`: 「资源授权标识长度必须在 1–60 字符之间，不能包含空格、表情符号（emoji）及以下字符：\\ / : * ? \" < > \| @ # $」 |

### 字段约束

| 字段名 | maxLength | 必填 | 默认值 | 说明 |
|--------|-----------|------|--------|------|
| `step1_resourceName` | 60 | ✅（以 optimized 为准） | `''` | 用户可见输入 |
| `step1_resourceName_optimized` | 由规范化得到 | 创建时用这个 | `''` | 查重与 `create.name` |
| `step1_resourceName_isVerify` | — | — | `false` | `true` 时禁用创建按钮 |
| 标签 / 帮助 / hint | — | — | — | `rqr_input_resourceauthid`: 「资源授权标识」；`rqr_input_resourceauthid_help`: 「此资源在整个授权系统中的唯一标识符，一旦创建则不能更改。」；`rqr_input_resourceauthid_hint`: 「1-60个字符，不能包含空格、表情符号（emoji）及以下特殊字符：\\ / : * ? \" < > \| @ # $」 |

### Console 源码位置

- `pageEffects.ts` L8–21：写入 `userInfo`
- `Step1/index.tsx` L27–36：查重防抖 300ms；L169–271：标识区
- `step1Effects.ts` L60–113：规范化 + 查重
- `utils/FRegExpMgr.ts` L2–4：规范化规则
- `tools-lib/.../resources.ts` L231–237：`GET /v2/resources/{idOrName}`

---

## 四、创建资源壳并进入 Step2

### 操作流程

1. 「立即创建」在以下任一为真时禁用：类型 `null`、标识空、标识有错、正在查重、标题空、标题有错。
2. 点击后若类型仍为 `null` 则直接 return。
3. `Resource.create` 请求体：
   - `name`：规范化后的短标识（不是 `userName/name` 全名）
   - `resourceTypeCode`：所选 `value`（新建类型时是**父级 code**）
   - `resourceTypeName`：仅有 `customInput` 时带上
   - `resourceTitle`：标题 `trim()`
   - 不传 `subjectType`（tools-lib 默认普通资源 `1`）
4. `ret !== 0` 或 `errCode !== 0` 或无 `data`：toast 平台 `msg`，停在 Step1。
5. 成功后再 `Resource.getResourceTypeInfoByCode({ code: type.value })`，写入 Step2 类型配置，然后 `step = 2`。
6. 成功后本地还会：`step1_createdResourceInfo` 记下 `resourceId / resourceName / resourceType / resourceTypeCode`；`step1_dataIsDirty_count = 0`；**把 `step1_resourceTitle` 改写成当时的 `step1_resourceName`（未规范化的输入）**。后一条是 Console 现状，CLI 不要学。

### API 调用

| 操作 | FServiceAPI | HTTP | 请求字段 |
|------|-------------|------|----------|
| 创建资源壳 | `Resource.create` | `POST /v2/resources` | `name`，`resourceTypeCode`，可选 `resourceTypeName`，`resourceTitle` |
| 拉类型配置 | `Resource.getResourceTypeInfoByCode` | `GET /v2/resources/types/getInfoByCode` | `code` |

创建成功响应（effects 使用的字段）：`resourceId`，`resourceName`，`resourceType[]`，`resourceTypeCode`。

类型配置如何变成 Step2 状态：

| `resourceConfig` | 本地字段 | 规则 |
|------------------|----------|------|
| `fileCommitMode` 含 `2^0` | `uploadEntry` 加 `localUpload` | 本地上传 |
| 含 `2^1` | 加 `storageSpace` | 存储空间 |
| 含 `2^2` | 加 `markdownEditor` | Markdown |
| 含 `2^3` | 加 `cartoonEditor` | 漫画编辑器 |
| `fileMaxSize` + `fileMaxSizeUnit` | `limitFileSize` | `fileMaxSize * 1024 * (1024 ** fileMaxSizeUnit)`；unit `1\|2` |
| `supportDownload === 2` | `isSupportDownload` | `1` 为否，`2` 为是 |
| `supportEdit === 2` | `isSupportEdit` | 同上 |
| `supportOptionalConfig === 2` | `isSupportOptionalConfig` | 同上 |

### 按钮与提示 i18n

| 场景 | i18n key (zh_CN) |
|------|------------------|
| 按钮 | `rqr_step1_btn_createnow`: 「立即创建」 |
| 首次可点时的热点 | `hotpots_rqr_createauthid`: 「点击完成资源授权条目创建」 |

### Console 源码位置

- `Step1/index.tsx` L276–311：按钮禁用与点击
- `step1Effects.ts` L114–213：创建 + 拉配置 + 跳 Step2
- `types.ts` L15–40：Step1 / Step2 配置形态
- `initialState.ts` L8–25：默认值
- `tools-lib/.../resources.ts` L37–59：`POST /v2/resources`；L815–822：`getInfoByCode`
- `creator/index.tsx` L39–44：`step1_dataIsDirty_count !== 0` 触发离开确认

---

## 五、CLI 实现要点

对照已有 `freelog-cli create`，不要另起一套 flag。

| Console 字段 | 已有 CLI | 决策 |
|--------------|----------|------|
| 叶子 `resourceTypeCode` | `--type` / manifest `resource.typeCode` | ✅ 必须；CLI 另有 `assertLeafResourceTypeCode` |
| 新类型 `customInput` | `--type-name` | ✅ 可选；标准 `RT*` 叶子不要传展示名 |
| 标题 | `--title` / manifest `resource.title` | ✅ ≤100，空则 `naming_convention_resource_title_required` |
| 短标识 | `--name`；不填则用标题规范化 | ✅ 与 Console 同一套非法字符 → `_`，长度 1–60 |
| 查重 | CLI 已调 `Resource.info(username/name)` | ✅ 同名但标题/类型不一致要冲突；完全一致可断线恢复绑定 |
| 创建 | `Resource.create({ name, resourceTypeCode, resourceTypeName?, resourceTitle })` | ✅ 短 `name`，不要自己拼 `userName/name` 当 create 参数 |
| 拉类型配置 | CLI 在后续 `version set` / 上传阶段按需 `getResourceTypeInfoByCode` | ✅ Step1 文档只要求记下：创建成功后 Step2 依赖这份配置 |
| 类型树 UI / 最近建议 / Markdown / 漫画编辑器 | — | ❌ 交互壳不搬；CLI 用 `type search` / `type info` |
| 创建成功后把 title 改成 name | — | ❌ 不实现 |

### 推荐命令（已存在）

```text
freelog-cli create --type <typeCode> --title "<title>" --name "<shortName>" --yes --env <env>
```

可选：`--type-name` 对应 Console `customInput`。

`type search` / `type info` 对应本节的类型发现，不在 `create` 里再做树形 UI。

---

## 六、本步必须对齐的 i18n

| key | zh_CN（来自 i18n.json） |
|-----|------------------------|
| `rqr_title` | 发行资源 |
| `rqr_step1` | 创建授权条目 |
| `rqr_step1_btn_createnow` | 立即创建 |
| `rqr_input_resourcetype` | 资源类型 |
| `rqr_input_resourcetype_help` | 选择最贴切描述此资源的类型，其他用户会通过资源类型在资源市场中寻找他们想要的资源。 |
| `naming_convention_resource_type_required` | 请选择资源类型 |
| `rqr_input_resouce_title` | 资源标题 |
| `rqr_input_resouce_title_help` | 标题直接影响资源的搜索曝光机会，建议在标题中加入品牌/内容主旨；标题长度不超过100个字符。 |
| `cqr_input_title_hint` | 输入标题 |
| `naming_convention_resource_title_required` | 请输入资源标题 |
| `rqr_input_resourceauthid` | 资源授权标识 |
| `rqr_input_resourceauthid_help` | 此资源在整个授权系统中的唯一标识符，一旦创建则不能更改。 |
| `rqr_input_resourceauthid_hint` | 1-60个字符，不能包含空格、表情符号（emoji）及以下特殊字符：\ / : * ? " < > \| @ # $ |
| `naming_convention_resource_authid_required` | 请输入资源授权标识 |
| `naming_convention_resource_name` | 资源授权标识长度必须在 1–60 字符之间，不能包含空格、表情符号（emoji）及以下字符：\ / : * ? " < > \| @ # $ |
| `input_resourceauthid_automodified_msg` | 您的资源授权标识将自动转换为{authid} |
| `resource_name_exist` | 资源授权标识 {authID} 已被使用，请重新输入。 |
| `hotpots_rqr_createauthid` | 点击完成资源授权条目创建 |
| `createresource_selectresourcetype_input_hint` | 选择资源类型 |
| `createresource_selectresourcetype_input_hint2` | 建议 |
| `createresource_selectresourcetype_input_hint3` | 选择资源类型 |
| `createresource_selectresourcetype_btn_addnewtype` | 添加新类型 |
| `createresource_selectresourcetype_btn_addthis` | 添加新类型 |
| `createresource_selectresourcetype_input_hint4` | 输入新资源类型名称 |
| `createresource_selectresourcetype_input_resourceqty` | {ResourceQty}个资源 |

硬编码、无 key：标题超长 「不超过100个字符」。

---

## 七、相对旧 P0-F0 总览必须改掉的点

| 旧文档说法 | 源码事实 |
|------------|----------|
| `resourceService.checkResourceName` / `GET /resource/info` | `FServiceAPI.Resource.info` → `GET /v2/resources/{idOrName}` |
| `resourceService.createResource` / `POST /resource/create` | `FServiceAPI.Resource.create` → `POST /v2/resources` |
| `typeService.getResourceTypeTree` / `search` / `createResourceType` | `resourceTypes` + `ListSimpleByParentCode` + `listSimple4Recently`；新类型不单独 POST |
| `rqr_input_resourcetype` = 「请选择资源类型」 | 该 key 是「资源类型」；必填句是 `naming_convention_resource_type_required` |
| `rqr_step1_btn_createnow` = 「创建现在」 | 「立即创建」 |
| `rqr_input_resouce_title` = 「请输入资源标题」 | 「资源标题」 |
| 创建 body 字段叫 `resourceName` | 字段名是 `name` |
| 步骤叫「创建资源授权条目」 | i18n 是「创建授权条目」 |

---

**源码对齐日期**: 2026-09-03  
**主证据**: `packages/console/src/pages/resource/creator/Step1/index.tsx`、`models/resourceCreatorPage/step1Effects.ts`、`components/FResourceTypeInput4/`、`docs/一期/产品方案/业务梳理/i18n.json`
