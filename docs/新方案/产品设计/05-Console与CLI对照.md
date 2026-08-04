# 产品设计：Console 与 CLI 对照

> Console 是业务契约来源，不是交互形态模板。CLI 对齐 API 字段、状态门禁和错误语义；不复刻 UI wizard。

## 1. 对齐矩阵

| 业务 | Console | CLI |
|---|---|---|
| 选择资源类型 | 页面组件选择类型节点 | `type list/search/info` 或 TTY 选择 |
| 创建资源 | Step1 `Resource.create` | `create` / `collection create` |
| 文件上传 | Step2 本地上传 / storage 选择 / 编辑器 | `publish` 读取 manifest.filePath 并上传 |
| 创建正式版本 | `Resource.createVersion` | `publish` |
| 编辑下一版草稿 | 防抖 `saveVersionsDraft` | `version set` + 显式 `draft push/pull` |
| 策略 | Builder + `Resource.update(addPolicies 新增 / updatePolicies 启停)` | `policy apply` 新增；`policy set` 启停 |
| listing | Step4 / 侧栏 info `Resource.update` | `update` / `collection update` |
| 上架 | 侧栏 `resourceOnline` helper | `online` 严格门禁 + `Resource.update(status:1)` |
| 下架 | `Resource.update(status:4)` | `offline` |
| 合集目录草稿 | collection Step2 catalogue draft APIs | `collection item *` |
| 合集发布 | `Resource.updateCollection` | `collection publish` |
| 自动收录 | collect rules UI | `collection collect-rules` |
| RSS | 邮箱验证码 + 绑定/同步 | `collection rss send-code/bind/sync` |

## 2. 单品创建与首版

| Console Step | API 契约 | CLI |
|---|---|---|
| Step1 输入名称/标题/类型 | 查重用 `username/name`；创建只传短 `name` | `create` |
| Step2 选择文件并发版 | `fileSha1`、`filename`、`version`、依赖、上抛、授权排除、属性 | `version set` + `publish` |
| Step3 策略 | `addPolicies` 新增；`updatePolicies(policyId,status)` 启停 | `policy apply` / `policy set` |
| Step4 基础信息 | `Resource.update` listing 字段 | `update` |
| 上架 | helper 读取 latestVersion/policies 后 status=1 | `online` |

约束：

1. `publish` 不因为本资源没有策略失败。
2. `online` 没有 latestVersion 或启用策略必须失败。
3. CLI 不暴露普通 `update --status 1`。

## 3. 单品续版

| Console | CLI |
|---|---|
| versionCreator 读取资源 info、类型配置、latestVersion | `status` / `pull` |
| 页面填写版本号、说明、文件、依赖、属性 | `version set` / 编辑 manifest |
| 防抖草稿 | `draft push/pull` |
| 提交正式版本 | `publish` |
| 已发布版本说明编辑 | `version edit` |

## 4. 多文件创建

| Console creatorBatch | CLI |
|---|---|
| 批量选择文件 | `resource import-dir <dir>` |
| 检查格式/大小/占用 | 资源类型配置校验 + SHA1 检查 |
| createBatch 或逐项 createVersion | 内部实现可用批量 API，但用户无 `batch *` |
| 结果页 | 汇总成功/失败，成功项生成子项目 state |

合集导入文件夹使用 `collection item import-dir`，在批量创建单品后追加目录草稿。

## 5. 合集

| Console Step | API 契约 | CLI |
|---|---|---|
| Step1 创建合集壳 | `Resource.create(subjectType=4)` | `collection create` |
| Step2 加目录项/排序/展示 | catalogue draft APIs + `catalogueProperty` | `collection item *` + `collection update --display-*` |
| Step2 防抖发版表单草稿 | `saveVersionsDraft` | `draft push --collection` |
| Step2 提交合集版本 | `Resource.updateCollection` | `collection publish` |
| Step3 策略 | `addPolicies` 新增；`updatePolicies(policyId,status)` 启停 | `policy apply` / `policy set` |
| Step4 基础信息/自动收录/上架 | `update` / `setCollectRules` / status=1 | `collection update` / `collect-rules` / `online` |

约束：

1. `collection publish` 不因为合集自身没有策略失败。
2. item 授权缺口可以阻断 `collection publish`。
3. `collection item *` 是目录草稿，不是发版表单草稿。

## 6. CLI 有意不同

| Console 行为 | CLI 约定 |
|---|---|
| wizard 步骤顺序 | 命令可组合，但拓扑职责固定。 |
| 自动保存草稿 | 显式 `draft push/pull/discard`。 |
| 弹窗创建/选择策略 | manifest 或 `--from-file`。 |
| 授权微应用 | 免费声明式签约；付费/复杂交互交给 Console。 |
| 可软上架 | `online` 严格门禁。 |
| 存储空间选择 | P0 先本地文件；storage 导入可作为 P2。 |

## 7. Console 源码依据

| 契约 | 源码 |
|---|---|
| 资源创建短名 | `packages/console/src/models/resourceCreatorPage/step1Effects.ts` |
| 单品 createVersion payload | `packages/console/src/models/resourceCreatorPage/step2Effects.ts` |
| 合集 updateCollection payload | `packages/console/src/models/collectionManager/versionEffects.ts` |
| 上架 helper | `packages/console/src/pages/resource/sidebar/Sider/index.tsx` |
| 资源 API | `packages/@freelog/tools-lib/src/service-API/resources.ts` |

## 8. 禁止扩散的问题

1. 不把 `resourceOnline` 写成平台 endpoint。
2. 不把 Step4 的 status 更新当成 CLI 上架。
3. 不把文件夹合集做成 zip 上传。
4. 不把旧 `batch *` 暴露为用户命令。
5. 不把平台状态写进 manifest。
