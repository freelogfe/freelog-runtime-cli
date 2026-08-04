# 开发设计：Console 页面覆盖矩阵

> 对齐的是 Console 的业务契约，不是 React 页面交互。产品对照见 [../产品设计/05-Console与CLI对照.md](../产品设计/05-Console与CLI对照.md)。

## 1. 操作速查

| Console | CLI |
|---|---|
| 登录 / 我的资源 | `login`、`status` |
| 资源类型选择 | `type list/search/info` |
| 创建向导 Step1 | `init` 本地意图；`create` 创建平台资源壳 |
| 上传并创建版本 | `version set` -> `publish` |
| 发版页暂存 / 续编 | `draft push` / `draft pull` |
| 丢弃发版草稿 | `draft discard` |
| 修改正式版说明 | `version edit` |
| listing 信息 | `update` |
| 策略 | `policy apply/list/set` |
| 上下架 | `online` / `offline` |
| 合集目录编辑 | `collection item add/remove/update/reorder` |
| 本地文件夹成为合集 | `collection item import-dir` |
| 自动收录 / RSS | `collection collect-rules set` / `collection rss *` |
| 依赖未授权 | `publish` exit 5；免费策略可 `dep auth --policy-map`；付费回 Console |
| 财务、微应用、解冻 | 非目标 |

## 2. 核心分歧

| Console 形态 | CLI 约定 |
|---|---|
| 页面打开即加载并可编辑表单 | `pull` / `status` 显式同步 |
| 300ms 防抖保存发版草稿 | CLI 永不自动保存；只显式 `draft push` |
| Step4 可能直接 update status | CLI 上架只走 `online` 严格门禁 |
| 弹窗创建/选择策略 | `policy apply --from-file` / `policy set` |
| 授权微应用 | 结构化 `dep auth --policy-map`，付费或交互回 Console |
| 表单状态在浏览器内存 | 用户意图在 manifest，平台事实在 state |

## 3. 软上架与严格上架

| 路径 | Console | CLI |
|---|---|---|
| 创建向导 Step4 | 可能直接 `Resource.update({ status: 1 })` | 不复刻 |
| 侧栏上下架 | helper 先检查 latestVersion + policy，再 update status | `online` 对齐此路径 |
| 缺版本或缺启用策略 | UI 可引导补齐 | CLI exit 4，并给下一步命令 |

`online` 不是平台 endpoint 名；它是 CLI 对 Console helper 的非交互投影。

## 4. 单品覆盖

| Console 区域 | API/模型 | CLI | 优先级 |
|---|---|---|---|
| 基础框架 | info、owner、冻结、subjectType | `status`、写前门禁 | P0 |
| info tab | `Resource.update` | `update` | P0 |
| policy tab | `addPolicies` 新增；`updatePolicies(policyId,status)` 启停 | `policy *` | P0 |
| version creator | `createVersion`、typeInfo、authTree、draft | `version set`、`publish`、`draft *` | P0 |
| version info | `updateResourceVersionInfo` | `version edit` | P1 |
| dependency tab | 依赖树、授权微应用 | `dep list`、`dep auth` | P1/P2 |
| contract tab | 授权方合约 | 回 Console；CLI 不暴露顶层 `contract list` | 非目标 |
| 上下架 | helper + `Resource.update` | `online/offline` | P0 |

## 5. 合集覆盖

| Console 区域 | API/模型 | CLI | 优先级 |
|---|---|---|---|
| info | `Resource.update` | `collection update` | P0 |
| 目录草稿 | `catalogues/drafts/*` | `collection item *` | P0 |
| 合集发版 | `Resource.updateCollection` | `collection publish` | P0 |
| 展示属性 | `catalogueProperty` | `collection update --display-*` | P1 |
| 收录规则 | `setCollectRules` | `collection collect-rules set` | P1 |
| RSS | `Rss.*` | `collection rss *` | P1 |
| ChangeLog | `getCollectionUpdateLogs` | `collection logs` | P2 |
| 上下架 | 同单品 | `online/offline` | P0 |

合集目录草稿不是发版表单草稿。`collection item *` 写的是 catalogue draft；`collection publish` 把目录草稿合并为正式合集版本。

## 6. 资源形态覆盖

| 使用者场景 | CLI 路径 |
|---|---|
| React 主题项目 | 用户自行 build；CLI 压缩 build 输出；`publish` |
| Vue 插件项目 | 同主题；resource type 不同，runtime 模板可共用 |
| 单张图片 / 单个视频 | `init --scaffold none` -> `create` -> `version set --file` -> `publish` |
| 图片文件夹 / 视频文件夹作为多个单品 | `resource import-dir <dir>` |
| 图片文件夹 / 视频文件夹作为合集 | 先创建合集，再 `collection item import-dir <dir>` |

暂不覆盖：

1. 外部存储空间导入为资源。
2. 直播流、RSS 以外的动态源。
3. 付费策略签约自动化。
4. Console 中的财务与可视化 Builder。

## 7. RSS 人机混合

```text
bindingsPreview -> sendVerificationCode -> 用户查邮箱
  -> bind --code -> syncBinding -> 查询进度
```

| 场景 | CLI 行为 |
|---|---|
| 无邮箱 | exit 4 |
| 无 code bind | exit 4 |
| 已绑定冲突 | exit 4，提示解绑/换绑 |
| sync 超时 | exit 1，提示重试 |
| CI | 只能由人工或密钥系统注入 `--code` |

## 8. 优先级

| 优先级 | 能力 |
|---|---|
| P0 | type、init、create、version set、publish、policy apply/list/set、online/offline、status、pull、合集 create/item/publish |
| P1 | draft、version edit、resource import-dir、collection item import-dir、display、collect-rules、RSS |
| P2 | dep auth、collection logs、合集发版表单草稿 |
| 非目标 | 防抖自动保存、微应用、财务、解冻、可视化策略 Builder、隐藏式软上架 |
