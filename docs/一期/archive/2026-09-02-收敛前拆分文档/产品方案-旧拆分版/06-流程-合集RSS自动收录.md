# 06 · 流程：合集、RSS 与自动收录

> **文档角色：** 定义合集创建、合集维护、本地目录导入合集、RSS 绑定/更新/同步、collect-rules 自动收录的完整流程。

最后更新：2026-09-01

## 0. 流程卡片

| 项 | 内容 |
|---|---|
| 用户目标 | 创建和维护合集资源：管理合集壳、目录草稿、合集版本、策略上下架、RSS 绑定同步和 collect-rules 自动收录。 |
| TTY 路径 | `freelog-cli start` 选择合集/RSS，先建立合集壳，再选择条目来源，维护草稿，发布合集版本，配置策略、自动收录并上架。 |
| AI/CI 路径 | 显式 collection manifest/config + `--env` + 写操作 `--yes` + `--json/--json-lines`；RSS 验证码仍需要用户或外部系统提供。 |
| Console 对齐点 | 合集 subjectType、目录草稿 API、`isMergeCatalogueDraft`、RSS 预览/验证码/锁字段、collect-rules 字段与 Console 业务结果一致。 |
| 平台写入 | `Resource.create(subjectType=4)`、合集草稿项 API、`Resource.updateCollection`、`Resource.bindRssFeed`、`Resource.setCollectRules`、`Resource.update` 策略/上下架。 |
| 本地写入 | collection manifest 保存展示/条目意图；state 保存合集资源和版本事实；RSS 导入/本地目录导入必须有 report。 |
| Console 接力 | RSS 邮箱验证码、付费签约/结算、复杂授权、封面裁剪、导入中冲突需要给 Console 链接或等待/恢复命令。 |

## 1. 合集产品模型

合集不是一个压缩包。它有四层对象：

```text
合集壳
  → 目录草稿
      → 条目：引用一个资源
  → 合集版本
  → 策略和上下架状态
```

| 层 | 用户理解 | 平台动作 |
|---|---|---|
| 合集壳 | 创建一个相册/专辑/合集 | Resource.create + subjectType=4 |
| 子资源 | 合集里引用的每个作品 | 普通资源 create/publish/online |
| 目录草稿 | 合集条目列表、标题、顺序 | draft item APIs |
| 合集版本 | 发布后的目录和展示配置 | Resource.updateCollection |

## 2. 合集创建总流程

```text
选择“创建或维护合集”
  → 选择合集类型 leaf
  → 填 title/name
  → 创建合集壳
  → 选择条目来源
      ├─ 添加已有线上资源
      ├─ 从本地目录创建子资源并加入合集
      └─ 绑定 RSS feed
  → 编辑展示设置和排序
  → 发布合集版本
  → 添加策略
  → 设置 collect-rules
  → 上架
```

### 2.1 AI/CI 等价流程

```text
准备 collection manifest/config
  → collection create --env <env> --yes --json
  → collection item add/import-dir --env <env> --yes --json-lines
  → collection publish --env <env> --yes --json
  → policy template apply --env <env> --yes --json
  → collect-rules set --env <env> --yes --json
  → online --env <env> --yes --json
```

RSS 绑定的 AI/CI 约束：

- bind 前必须先 inspect/preview；
- 验证码不能由 CLI 猜测，必须由用户或外部系统显式传入；
- `bindingsPreview.matchedItemCount` 超过 1000 时必须传日期范围；
- 日期范围提交给平台时使用日开始/日结束的 `YYYY-MM-DD HH:mm:ss`；
- 导入中状态返回 progress，不混入人类文案到 stdout；
- 需要邮箱验证或 Console 签约时返回 code 5 和 handoff URL。

## 3. 创建合集壳

接口顺序：

```text
选择合集类型
  → 检查 name
  → Resource.create(subjectType=4)
  → 保存合集平台事实
```

字段：

| 字段 | 规则 |
|---|---|
| collection type | 必须是合集类型 leaf |
| title | 非空，最多 100 |
| name | 1–60，规范化，唯一 |
| subjectType | 固定 4，不让用户输入 |
| custom type | 合集不允许自定义类型 |

## 4. 添加已有线上资源为条目

```text
输入 resourceId/authId 或搜索资源
  → 批量读取资源详情
  → 检查是否已在当前合集
  → 检查条目授权
  → 添加到目录草稿
  → 可编辑条目标题和排序
```

字段：

| 字段 | 规则 |
|---|---|
| resourceIds | 一次最多按 Console 行为处理 100 个 |
| itemTitle | 最多 100 |
| sort | 可手动排序或按规则重排 |
| auth | 授权不完整时处理排除项或阻断 |

失败：

| 情况 | 处理 |
|---|---|
| 资源不存在 | 单项失败 |
| 重复条目 | 提示已存在，可跳过 |
| 授权不完整 | 进入授权处理或阻断 |
| RSS 锁定合集 | 禁止手动添加/删除/排序 |

## 5. 从本地目录创建合集

这是最容易做错的流程。正确模型：

```text
本地目录
  → 扫描文件
  → 为每个文件创建/发布一个子资源
  → 子资源上线或达到可加入状态
  → 把成功子资源加入合集目录草稿
  → 发布合集版本
```

它不是：

```text
本地目录 → zip → 一个合集
```

交互必须先确认：

```text
你希望这个目录怎样使用？
  1. 目录整体作为一个 zip 资源
  2. 每个文件发布为独立资源
  3. 每个文件成为合集条目
```

字段：

| 字段 | 规则 |
|---|---|
| 子资源类型 | 每个文件对应的资源类型 leaf |
| 子资源 title/name | 按批量规则生成和校验 |
| 子资源 policy | 可统一模板或逐项配置 |
| 子资源 online | 加入合集前应满足授权和状态要求 |
| itemTitle | 默认资源标题，可自定义 |

部分失败处理：

- 成功创建的子资源可以加入目录草稿。
- 失败项进入 report。
- unknown 项不加入合集。
- 合集 publish 前显示“加入了多少，失败多少，未知多少”。

## 6. 目录草稿维护

支持动作：

| 动作 | 规则 |
|---|---|
| list | 分页读取完整目录草稿 |
| add | 添加已有资源，检查重复和授权 |
| import-dir | 从本地目录创建子资源并添加 |
| update title | 条目标题最多 100 |
| remove | 删除前确认影响目录草稿 |
| reorder | 支持手动序号、按标题、按创建时间、按资源更新时间 |

目录草稿动作是即时写 draft API；但正式合集版本只有 `collection publish` 后才更新。

## 7. 展示设置

合集展示配置不复刻 UI，但要表达同等字段：

| 字段 | 选择 |
|---|---|
| 视图 | card / list |
| 每页数量 | card 默认 6；list 默认 10 |
| 是否显示序号 | show / hide |
| 是否显示图片 | show / hide |
| 是否显示简介 | show / hide |
| 条目标题来源 | 资源标题 / 序号 / 自定义标题 / 隐藏 |
| 排序方向 | asc / desc |

CLI 交互中应把这些字段放到“展示设置”一组，不要让用户直接编辑晦涩 payload。

## 8. 发布合集版本

接口：

```text
读取目录草稿
  → 计算目录指纹
  → 汇总展示设置、属性、依赖、授权排除
  → 判断 isMergeCatalogueDraft
  → Resource.updateCollection
  → 保存合集版本事实
```

规则：

- 目录项变化时 `isMergeCatalogueDraft=1`。
- 仅展示设置或属性变化时 `isMergeCatalogueDraft=0`。
- 发布前依赖授权必须完整。
- RSS 导入中禁止冲突发布。

## 9. 合集策略和上下架

合集也是资源主体，策略和上下架复用资源规则：

```text
collection publish
  → policy template apply
  → online
```

门禁：

- 已有合集版本；
- 至少一条启用策略；
- owner 正确；
- 非 frozen；
- RSS/目录状态没有冲突。

## 10. RSS 新绑定流程

```text
输入 RSS URL
  → Rss.bindingsPreview
  → 显示 feed 标题、作者、封面、ownerEmail、条目数
  → ownerEmail 缺失则阻断
  → 若已被他人绑定则阻断
  → 若已被自己绑定则显示已有关联合集并允许明确继续
  → 发送验证码
  → 输入验证码
  → 若 matchedItemCount > 1000，选择日期范围并重新 preview
  → Resource.bindRssFeed
  → 查询同步状态
```

字段：

| 字段 | 规则 |
|---|---|
| RSS URL | 必填；必须是可访问 feed URL |
| ownerEmail | preview 返回为空则阻断 |
| verify code | 提示输入发送到 ownerEmail 的 6 位验证码；平台返回 `VerificationCodeInvalid` 或 `wrong_verified_code` 时只提示验证码错误 |
| date range | `matchedItemCount` 超过 1000 条时必填；不能是未来日期；提交为日开始/日结束的 `YYYY-MM-DD HH:mm:ss` |
| item limit | 单次导入不超过 1000 |

## 11. RSS 更新 URL 流程

```text
输入新 URL
  → 新旧 URL 不得相同
  → Rss.bindingsPreview
  → ownerEmail 缺失则阻断
  → 发送验证码
  → 输入验证码
  → Rss.bindingsCompare(resourceId, feedUrl, verificationCode)
  → 验证码错误时停在验证码输入
  → GUID 大面积不匹配时二次确认
  → matchedItemCount > 1000 时选择日期范围并重新 preview
  → Resource.bindRssFeed
```

高风险包括：

- Console 当前显式确认的是 GUID 大面积不匹配；
- 判定公式：`max(oldFeedItemCount, newFeedItemCount) - guidMatchedCount > abs(newFeedItemCount - oldFeedItemCount)`；
- CLI 可以额外展示删除/新增、ownerEmail 或 feed 元信息变化作为风险摘要，但不能跳过 Console 同款 GUID 二次确认。

## 12. RSS 同步与失败项

支持动作：

| 动作 | 用户目标 |
|---|---|
| status | 查看当前绑定和同步进度 |
| sync | 手动触发同步 |
| failed-items | 查看导入失败条目 |
| inspect | 预览一个新 feed |
| compare | 更新前比较新旧 feed |

同步状态规则：

- 空字符串、pending、running 都视为导入中；
- 已发起 `Rss.syncBinding` 但进度尚未刷新回来时，也要视作短暂 pending，防止重复同步；
- 导入中禁止手工编辑 RSS 锁定字段和冲突目录动作；
- failed-items 要展示失败原因和建议，而不是只给 raw error。

## 13. RSS 锁字段

RSS 相关资源必须区分“feed 托管字段”和“用户可维护字段”。Console 当前规则是：

必须锁定：

- 标题；
- 封面；
- 简介；
- 更新状态 / 自动收录设置；
- 目录展示；
- 目录项删除；
- 目录项手动排序；
- 目录项自定义标题；
- 发版表单草稿保存/读取。

允许用户维护：

- 标签 tags。Console 当前普通 RSS 相关资源页和 RSS 合集信息页都保留标签编辑入口；CLI 不得再把 tags 当成 RSS 锁字段。

CLI 没有 UI，也必须在写平台前做同样阻断；但不得因为旧设计把允许维护的 tags 错误阻断。

## 14. collect-rules 自动收录流程

```text
读取当前规则
  → 选择是否启用自动收录
  → 选择持续收录或收录到此为止
  → 选择全部条件 / 任一条件
  → 添加条件
  → 预览人类可读语义
  → Resource.setCollectRules
```

条件字段：

| 字段 | 可用操作符 | 值规则 |
|---|---|---|
| resourceTitle | INCLUDES / NOT_INCLUDES / STARTS_WITH / ENDS_WITH | 必填，最多 100 |
| authIdentity | INCLUDES / NOT_INCLUDES / STARTS_WITH / ENDS_WITH | 必填，最多 60 |
| resourceTypeCode | EQUAL | 必须来自资源类型 leaf |

空条件处理：

- 启用自动收录但无条件时，Console 会有等价空条件行为。
- CLI 不应默认制造难懂空条件。
- 应提示用户补条件，或明确确认“启用但不限制条件”。

待实测：

- `authIdentity STARTS_WITH` 在不同 Console 路径是否都加 `username/` 前缀。

## 15. 用户实际会遇到的情况

| 情况 | 处理 |
|---|---|
| 用户把合集当 zip | 第一屏纠正，解释三种目录模型 |
| 子资源部分失败 | 成功项可加入，失败项 report，unknown 不加入 |
| 合集条目很多 | 分页读取和展示，不能只读第一页 |
| 条目授权不完整 | 阻断或进入授权处理 |
| RSS 没 ownerEmail | 阻断，说明无法验证 |
| RSS 已被他人绑定 | 阻断 |
| `matchedItemCount` 超过 1000 | 要求日期范围并重新 preview |
| RSS 导入中或 sync 请求刚发出 | 禁止冲突编辑和重复同步 |
| RSS 验证码错误 | 停在验证码输入或返回字段级错误，不当作普通 toast/raw error |
| collect-rules 条件为空 | 提示补条件或明确确认 |

## 16. 验收标准

- 合集创建、条目草稿、合集 publish 三者边界清楚。
- 本地目录建合集不会变成 zip 上传。
- RSS preview 是绑定前必经步骤。
- RSS 锁字段被 CLI 阻断，tags 仍可维护。
- collect-rules 有完整字段编辑和用户语义预览。
- 合集上线仍遵守版本、策略、owner、frozen 门禁。
