# 合集场景

本夹是合集的独立场景册。单资源仍看上一层的 `真实场景/` 与 `场景实现/`；合集不要混进单资源编号，也不要把单资源版本流程套到 `subjectType=4` 上。

## 怎么读

| 文档 | 写什么 | 不写什么 |
|---|---|---|
| [真实场景](./真实场景.md) | 用户为什么要做合集、现状、目标、成功和失败 | 命令名、旗标、接口字段 |
| [场景实现](./场景实现.md) | 用当前已设计/已实现的命令走完同一条 C-S 场景 | 不为了命令缺口反改用户场景 |

编号使用 `C-Sxx`，两份文档保持一一对应。真实场景只讲用户视角；实现文档必须使用现有命令，不能伪造还没实现的入口。

## 当前边界

合集已经具备创建、接入、目录草稿、表单草稿、直接依赖、策略模板、发布、上下架和只读维护的主链。它不是“上传一个本地合集文件”：单品必须来自线上本人已上架的单资源；如果用户手里只有本地内容，需要先按单资源流程发行，再把线上资源加入合集。

以下边界必须写清楚：

- `collection create` 只建合集壳，不添加单品、不发布、不上架。
- `collection bind` 接入线上本人合集，不关联本地文件或目录。
- 单品目录是服务端草稿；`collection publish` 才把目录草稿按需合并到已发布合集。
- 表单草稿是 CLI 本地操作稿；CLI 不读、不兼容、不覆盖 Console 的服务端草稿。
- 策略模板添加主链已实现；合集和单资源共用参数化模板交互，合集按返回的 `compileType=collection` 过滤。
- `collection item auth status` 已实现；已有单品重新处理授权的 `auth resolve` 仍受 dev 契约阻塞，不能写成可用命令。
- RSS 暂时忽略；普通合集命令检测到 RSS 来源时拒绝写入。

参数化策略模板的公共异常和交互细节不在合集册重复展开；合集只记录主体差异，公共场景见 [S71-S80 参数化策略与异常](../真实场景/09-参数化策略与异常.md) 与对应实现。

## 场景索引

| 编号 | 用户旅程 | 命令路径 |
|---|---|---|
| C-S1 | 全新创建合集壳 | `collection create` |
| C-S2 | 直接管理线上已有合集或接入本地 | `--resource id:/name:` 或 `collection bind` |
| C-S3 | 把本地内容先发行成单资源再加入合集 | 单资源流程 + `collection item add` |
| C-S4 | 添加线上本人已上架单资源 | `collection item add/list` |
| C-S5 | 单品有上游授权缺口 | `collection item add --policy ...` |
| C-S6 | 编辑、移动、排序、删除目录单品 | `collection item rename/move/sort/remove` |
| C-S7 | 自动收录和手工目录互斥 | `collection collect-rules` + `collection item` |
| C-S8 | 维护合集资料和更新状态 | `collection update` + `collection collect-rules` |
| C-S9 | 编辑属性、可选配置、描述和展示 | `collection form` + `collection display` |
| C-S10 | 维护合集直接依赖 | `collection dep` |
| C-S11 | 发布目录和表单变更 | `collection publish` |
| C-S12 | 处理发布未知结果和冲突 | `collection publish resume` |
| C-S13 | 添加、启停合集自身策略 | `collection policy` |
| C-S14 | 上架、下架和门禁 | `collection online/offline` |
| C-S15 | 查看日志和授权方合约 | `collection log/contract` |
| C-S16 | RSS、冻结、无权等写保护 | 写命令拒绝；只读允许 |
| C-S17 | 环境、权限、并发和混合身份 | `--env dev`、`--resource`、本地锁 |
| C-S18 | 仍未实现的授权修复边界 | 只写 `auth status`，不写 `auth resolve` |
