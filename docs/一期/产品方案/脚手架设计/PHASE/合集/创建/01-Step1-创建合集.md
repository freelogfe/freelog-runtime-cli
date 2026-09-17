# Step1：创建合集

状态：已实现；单元测试已覆盖，待 dev 联调。

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
- `subjectType` 包含数值 `4`，兼容 `4`、`"4"`、`[4]` 与 `["4"]`；
- code 能在本次 `subjectType=4` 类型树中找到，并能推导出完整祖先路径。

任一条件不满足均不创建、不写本地身份。类型详情还会在创建成功后读取，但只供后续步骤按实际能力决定表单和单品入口，不把 `fileCommitMode` 误解为合集需要上传本地文件。

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
