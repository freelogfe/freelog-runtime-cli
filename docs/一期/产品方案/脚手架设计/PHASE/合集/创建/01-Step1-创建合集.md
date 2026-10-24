# Step1：创建合集

状态：已有实现；创建响应及身份边界仍在补齐，不宣称本页全部规则已验收。当前修复与证据只看交接。

本步创建一个 `subjectType=4` 的合集壳。用户必须选择一个可用于合集的最终叶子类型，填写合集标题和授权标识；平台创建成功后才保存本地合集身份。本步没有文件、目录压缩、版本号、单品、策略、属性、可选配置、依赖、目录发布或上架。

## 审阅重点

本页只需要确认三个选择：类型是否必须选到支持合集的最终叶子；标题是否只是可变展示值；授权标识是否是创建后永不改变的身份。三项均为“是”时，创建命令只负责建壳，不能偷做任何后续发行步骤。

```text
选择合集最终叶子类型
  → 填合集标题
  → 确定授权标识并在线查重
  → 显示摘要并确认
  → POST /v2/resources (subjectType:4)
  → 原子写入本地合集身份
```

建议命令：

```text
freelog-cli collection create --type <collection-leaf-code> --title <title> --name <short-name> --yes --env <env>
```

TTY 缺少字段时逐项询问；非 TTY 或 `--yes` 必须同时给 `--type`、`--title`、`--name`。本命令不接收 `--artifact`，也不复用单资源 `init` 的文件锚点。

本命令与`collection bind <target>`均不接受`--resource`，包括根命令继承值及空串；报`COLLECTION_RESOURCE_NOT_SUPPORTED`，不静默忽略或覆盖已有身份，并在本地事务前滚或平台请求前拒绝。

## 0. 先选类型：只能确认最终叶子

用户选择的是平台中**启用、支持合集、最终叶子**的 `resourceTypeCode`。父类型只能继续展开，不能直接确认；不允许在 CLI 新建类型、透传 `--type-name` 或按名称猜测类型 code。

类型树请求固定为：

```text
GET /v2/resources/types/listSimpleByGroup?category=1&status=1&subjectType=4
```

对应 tools-lib：`Resource.resourceTypes({ category: 1, status: 1, subjectType: 4 })`。

### 0.1 祖先路径的关键规则

`subjectType=4` 的实时响应会保留父级路径；父级本身可能只带 `subjectType:[1]`，其子级才带 `[4]`。例如实时 dev 响应中的 `阅读` 根节点是 `[1]`，有效叶子 `阅读 / 合集5` 才是 `[4]`。

因此选择器必须完整保留接口返回的树和祖先路径，**不得在逐层显示时按节点 `subjectType` 过滤**。只有用户最终选中的节点才校验其主体能力。每次展示均显示根到当前节点的路径；同名节点不能只显示叶子名。

### 0.2 三种选择方式

`collection create` 和未来的合集类型查询共用同一个参数化类型解析器，解析器输入为 `subjectType=4`。交互支持：

1. **层级选择**：每层仅显示当前节点；父节点进入下一层，最终叶子才可确认；可返回上一级。
2. **搜索后选择**：输入名称或 code 片段，搜索结果展示完整路径和 code，用户选中一项后仍做最终复验。
3. **直接输入 code**：只接受精确 code，不接受名称；适用于 `--type` 与非交互调用。

搜索使用 `Resource.ListSimpleByParentCode`，查询必须带 `category=1`、`isTerminate=true`、`status=1`、`subjectType=4`，并以初始类型树重建完整路径。搜索接口返回的 `names`、`nameChain` 或单项 `subjectType` 都不作为最终依据。

无论通过哪种方式取得 code，创建前均调用 `Resource.getResourceTypeInfoByCode({ code })`，且必须同时满足：

- `status === 1`；
- `isTerminate === true`；
- 详情返回的 `code` 必须与请求的、去除首尾空白后的 code 完全相等，不能用另一个有效合集叶子替代；
- `subjectType` 包含数值 `4`，兼容 `4`、`"4"`、`[4]` 与 `["4"]`；
- code 能在本次 `subjectType=4` 类型树中找到，并能推导出完整祖先路径。

任一条件不满足均不创建、不写本地身份。创建后进入表单或发布时仍复读类型，按实际能力决定可写字段；不把 `fileCommitMode` 误解为合集需要上传本地文件。

### 0.3 类型查询的可信边界

树、搜索和详情都必须有数值 `ret:0`、`errCode:0`。树/搜索只接受 `data[]`，不兼容裸数组、`dataList`或失败信封中的数组；详情接受 `data` 对象，成功null表示找不到。请求失败、信封/列表结构异常报固定 `COLLECTION_TYPE_RESPONSE_INVALID`，不转发原始异常或服务端msg，也不当成空结果继续选择。合法空搜索结果才报没有匹配类型。

树中的每级节点必须有非空code和名称；children存在时必须是数组，code不得在同棵树出现两次。不按祖先subjectType过滤；最终节点必须在当前树中确认为启用、支持合集、无子级，并以详情确认 `isTerminate:true`。主体兼容只限数值4和字符串`"4"`，不接受`"04"`、`" 4 "`等数值猜测。

共享解析器返回详情及从本次树计算的完整路径 `pathLabel`，它只用于本次显示、不进入创建请求或本地身份。层级菜单、搜索结果、直接code确认都使用该完整路径，不信任搜索行自带的names，也不把详情叶子名称改写为整条路径。创建、表单pull/edit、发布及确认后复核均共用相同可信边界；任一类型失败须在建壳、覆盖稿或保存发布intent之前停止，保留已有本地字节。

接口依据补核：2026-10-22通过本库tools-lib对dev公开只读查询，树/搜索均为成功信封内数组，详情为对象；`阅读 / 漫画 / 连载漫画`树叶无isTerminate，详情为true；搜索行仅名称/code等字段，不包含主体资格。此样本说明DTO与祖先规则，不是CLI安装包、TTY或完整C01验收。

## 1. 合集标题

终端提示固定为：

> 合集标题
> 标题直接影响合集的搜索曝光机会，建议在标题中加入品牌/内容主旨；标题长度不超过100个字符。

字段 `resourceTitle` 取 `trim()` 后的值：不能为空，最长 100 个字符。空值报“请输入合集标题”，超长报“不超过100个字符”；不得截断后静默提交。

标题是可变展示字段，不是身份键。创建请求携带它；创建成功后本地保存一份标题缓存，后续成功更新标题时刷新它，身份选择始终用资源 ID 或完整授权标识。

## 2. 合集授权标识

终端展示登录名和短标识：`<loginName> / <name>`。提示固定为：

> 合集授权标识
> 此合集在整个授权系统中的唯一标识符，一旦创建则不能更改。

用户只输入短标识，不能传 `<loginName>/<name>` 完整名。短标识先按单资源已有规则规范化：空白、`\\ / : * ? " < > | @ $ #` 与 emoji 替换为 `_`；规范化后长度必须为 1–60。若发生转换，先显示实际将创建的短标识，再查重和确认。

TTY 中，用户尚未主动修改标识时，默认值为标题 `trim()` 后的前 60 个字符；用户改过标识或显式传入 `--name` 后，标题不再覆盖它。`--name` 含 `/` 直接失败。

查重键为 `<loginName>/<normalized-name>`。调用 `Resource.info({ resourceIdOrName, isLoadLatestVersionInfo: 1 })`：

- 不存在：可以创建。
- 属于其他账号：提示授权标识已被使用；TTY 回到短标识输入，非 TTY 失败。
- 属于当前账号且 `subjectType` 为 `4`：禁止再次 `POST`，提示使用 `collection bind <id|loginName/name>` 接入已有合集；不能因“还没有发布目录”把它当作可重新创建的壳。
- 属于当前账号但不是合集：该短标识已被其它授权主体占用，TTY 回到短标识输入，非 TTY 失败；不能执行 `collection bind`。
- 查询出现认证、网络、权限或服务端错误：失败，绝不当成“名称可用”。

查重只接受数值ret/errCode均0的成功信封；data为null（Console的不存在分支）才视为可用，现存对象必须有有效resourceId，完整授权标识必须等于查重键。完整HTTP404（SDK Axios response.status或SDK固定status错误）可作不存在；其它异常、失败信封、缺data、空对象或不匹配身份一律`COLLECTION_LOOKUP_FAILED`并零POST。不依据ownerId/creatorId或字符串数字猜归属。

现存对象的 `userId` 必须为正的安全整数，`subjectType` 为数值或非空数值数组；字符串数字不作为归属/主体证明。只有精确本人且主体包含数值4才提示 `COLLECTION_OWN_SHELL`；合法他人/其它主体报 `COLLECTION_NAME_TAKEN`。两种占用都零POST。404只认数值 `response.status === 404` 或SDK固定的 `Error('{"status":404}')`，不能把字符串404、正文提及404或服务端业务码当成HTTP不存在。

## 3. 创建请求与本地结果

所有字段通过校验后，TTY 先展示：

```text
类型：根 / … / 叶子（code）
标题：<title>
授权标识：<loginName>/<name>
```

确认后调用 `Resource.create`：

```json
{
  "name": "<normalized short name>",
  "resourceTitle": "<trimmed title>",
  "resourceTypeCode": "<verified collection leaf code>",
  "subjectType": 4
}
```

不发送 `resourceTypeName`、`policies`、`coverImages`、`intro`、`tags`，也不发送任何文件或版本字段。响应必须包含 `resourceId`；缺失、明确失败或无法证明成功时，不写本地身份。

创建回复必须为数值ret/errCode均0、data对象，包含非空安全resourceId、与本次完整授权标识完全相等的resourceName、与本次已验证叶子完全相同的resourceTypeCode；不补造resourceName，也不拿失败信封内的ID建立身份。类型详情同样要求成功信封且返回code精确等于请求code，创建/表单/发布共用该复验。类型树和搜索失败不能当空结果或以data数组绕过失败码。

确认后的创建调用至多一次；抛异常或回复无法证明成功时以固定`COLLECTION_CREATE_RESULT_UNKNOWN`提示按完整授权标识只读核对后bind，零本地身份写、零自动重发，不转发原始异常或服务端msg。本地身份落盘失败也明确已成功返回的完整名/ID并引导bind，不把它解释为远端创建失败后重发。短标识超过60报错，不能静默截断用户指定的不可变身份；默认建议才取标题前60字符。

创建回复的ID必须能直接用于现行 `id:` 选择器（字母/数字/下划线/点/连字符，且不是单独的 `.` 或 `..`），不修剪或转义坏ID后建立身份。创建结果未知提示只引用本次已确认的完整授权标识，不引用无法验证的响应字段；即使失败信封夹带ID也不采信。成功回复已精确核验、但本地写入失败时，报 `COLLECTION_CREATE_LOCAL_STATE_FAILED`，提示已创建的完整名/安全ID和显式bind路径；保留当前本地稿、事务及原始故障现场，不自动清理或再次调用create。

成功后以当前工作区锁和原子写入建立一个新的 `.freelog/N.json`。这是未来需要扩展的身份判别联合：

```json
{
  "schemaVersion": 1,
  "subject": "collection",
  "resourceId": "<platform id>",
  "resourceName": "<loginName/name>",
  "name": "<short name>",
  "title": "<title cache>",
  "typeCode": "<verified collection leaf code>",
  "env": "dev"
}
```

`env=prod` 与既有规则一致，不落盘。合集身份没有 `filePath`；单资源身份仍必须有 `filePath`。该主体区分已实现，`collection create` 可运行；dev 环境的真实接口联调仍待执行。

本地写入失败而平台已返回成功时，结果是未知的本地收尾状态：不得重发 `POST`；按完整授权标识查询并通过未来的 `collection bind` 恢复本地身份。

## 4. 验收

1. dev 类型树查询使用 `subjectType=4`，并能显示主体字段为 `[1]` 的祖先和 `[4]` 的叶子完整路径。
2. 层级、搜索、直接 code 三条路径都拒绝父级、停用节点、非合集叶子和不存在 code。
3. 标题空白、101 字、短标识规范化为空、短标识规范化后超过 60、完整名误传给 `--name` 都在平台写入前失败。
4. 同名他人合集不创建；同名本人合集不重复创建，而是提示 bind。
5. 创建请求精确包含 `subjectType:4` 和三个业务字段，不包含文件、版本、策略、listing 字段。
6. 成功时写入无 `filePath` 的合集身份；失败时不写身份；平台成功但本地写失败时不重发。

## 5. 证据

- 业务梳理：[P0-C0 Step1](../../../../业务梳理/创建流程%20-%20发行合集/P0-C0-Step1-创建合集.md)。
- Console 实际代码：`D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/collectionCreator/Step1/index.tsx` 与 `models/collectionCreatorPage/step1Effects.ts`；类型组件为 `components/FResourceTypeInput4/index.tsx`。
- dev 实时类型树：`GET /v2/resources/types/listSimpleByGroup?category=1&status=1&subjectType=4`，2026-09-17 读取；`RT003011` 详情确认 `isTerminate:true`、`status:1`、`subjectType:[4]`。
