# 一期 CLI 体验拓扑设计

> **文档角色：** 一期脚手架的主流程拓扑和全局交互契约。本文不写完整场景剧本；场景只放在 [场景/](./场景/README.md)。Console 事实以 [Console业务流程字段接口总账](./对齐/Console业务流程字段接口总账.md) 为准。

最后更新：2026-08-31

## 1. 总拓扑

CLI 的主体验是一条连续工作流，而不是让用户背命令链。

```text
入口
  → 环境和账号
  → 用户任务
  → 本地/线上对象
  → 资源类型或合集类型
  → 本地意图：文件、版本、标题、属性、策略
  → 写入前预检
  → 用户确认
  → 平台写入
  → 成功下一步 / 失败恢复
```

所有流程都必须回答：

- 现在操作哪个 env、账号、资源或合集？
- 这一步只写本地，还是会写平台？
- Console 对应的业务动作是什么？
- 用户失败后停在哪个 checkpoint？
- 专家/AI 是否有等价命令？

## 2. 入口分流

### 2.1 第一屏

```text
freelog-cli start

你要做什么？
  1. 发布一个新资源
  2. 更新当前本地工程
  3. 维护一个已有线上资源
  4. 批量发布一个本地文件夹
  5. 创建或维护合集
  6. 只管理策略 / 依赖 / 上下架
  7. 进入 session / studio 临时工作
```

### 2.2 当前目录识别

| 当前目录 | 默认建议 | 可切换 |
|---|---|---|
| 空目录 | 发布新资源、创建合集 | 登录、绑定线上资源 |
| 有项目但无 manifest | 接入已有工程 | 普通文件/目录发布 |
| 有 resource manifest | 更新当前资源 | listing、版本、策略、online |
| 有 collection manifest | 维护当前合集 | item、RSS、collect-rules、publish |
| 有未完成 report | 恢复上次任务 | 查看、放弃、重新开始 |

### 2.3 本地目录三分叉

```text
目录整体是一个作品      → 普通目录 zip
目录里每个文件都是作品  → 批量发布
目录要组成相册/专辑     → 合集
```

这一步必须在前面问清。后面再纠正，会导致资源模型错误。

## 3. 运行表面

| 表面 | 入口 | 保存 | 不保存 | 适合 |
|---|---|---|---|---|
| 工程模式 | `start` / 显式命令 | manifest、state、report | token 明文 | 长期维护、Git、CI |
| 单命令会话 | `--session --resource-id` | 无长期状态 | manifest/state | 临时维护一次线上资源 |
| session 壳 | `session` | 进程内状态 | 凭据、manifest/state | 一个终端里连续做完 |
| studio | `studio` | 子工程、report | 本轮临时凭据 | 多账号、多文件工作台 |
| AI/CI | `--json --yes --env` | 工程/report | prompt | 自动化 |

运行表面只改变 Auth、Store 和输出方式，不改变业务规则。

## 4. 全局交互契约

### 4.1 资源类型选择器

默认是逐级选择，搜索是快捷入口。

```text
一级类型
  → 子类型
  → leaf
  → 展示完整路径 / code / 上传方式 / 格式 / 大小 / 支持能力
  → 确认
```

硬规则：

- 主题、插件、package 是一等入口。
- 最终必须选平台 leaf，不能提交父类型。
- 类型数据来自 Console 同源接口，不能写死 `RT*`。
- 独立资源可添加终止自定义类型；合集和批量不可添加。
- 类型选完必须展示能力摘要，避免用户发到错误类型。

### 4.2 本地产物处理

| 资源语义 | 本地处理 |
|---|---|
| 主题 | 选择或接入模板，build 后发布 dist zip |
| 插件 | 独立插件入口，build 后发布 dist zip |
| package | package 模板，build 后发布目录 zip |
| 普通单文件 | 原文件上传 |
| 普通目录 | 按 ignore 规则生成稳定 zip |
| 批量目录 | 扫描成多个资源，不压成一个 zip |
| 合集目录 | 子资源 + 合集目录草稿 |

### 4.3 策略模板 Builder

新增策略默认流程：

```text
拉取可用模板
  → 用户选择模板
  → 填模板参数和策略名
  → policyReCompile
  → policyTranslation
  → 展示策略代码摘要和人类译文
  → 确认应用
```

`policy apply --from-file` 只给专家、迁移、AI/CI fallback，不能作为普通用户主路径。

### 4.4 写入前 preflight

任何平台写入前都展示同一种摘要：

```text
环境：env
账号：username / userId
对象：resourceId 或 collectionId
动作：create / publish / policy / online / offline / rss / collect-rules
将写入：字段摘要、版本、文件 sha1、策略、依赖、状态
风险：覆盖、下线、付费、验证码、远端未知、RSS 锁字段
恢复：report path / nextCommand / handoff URL
```

非 TTY 下没有 prompt，必须用 `--yes` 显式确认。

### 4.5 成功页

成功页不只说 “ok”，必须给下一步：

```text
已完成：publish 1.0.0
资源：title / resourceId / resourceName
下一步：
  1. 选择策略模板
  2. 检查依赖授权
  3. 上架
  4. 加入合集
  5. 退出
可复制命令：...
报告：...
```

### 4.6 handoff

CLI 不能伪造浏览器动作。

| 场景 | CLI 处理 |
|---|---|
| 支付 / 结算 | code 5 + Console 链接 + nextCommand |
| 验证码 | 用户输入验证码；需要浏览器时 handoff |
| 浏览器签约 | 可 CLI 免费签则处理；否则 handoff |
| 主题激活到节点 | 发布后提示 Console 或后续节点命令；一期不假装完整节点管理 |

## 5. 主流程拓扑

### 5.1 发布一个独立资源

覆盖：主题、插件、package、普通单文件、普通目录 zip。

| checkpoint | 用户看到 | 写入 |
|---|---|---|
| 选择资源语义 | 主题 / 插件 / package / 文件 / 目录 | 无 |
| 选择平台类型 | 类型树 leaf、能力摘要 | 无 |
| 填资源身份 | 标题、资源名、唯一性检查 | 可写 manifest |
| 准备产物 | build、zip、sha1、大小、格式 | 本地 |
| 补版本信息 | 版本号、描述、属性、依赖、授权排除 | manifest |
| 发布预检 | create + createVersion 摘要 | 无 |
| 平台写入 | create resource、createVersion | 平台 + state |
| 策略和上线 | 策略模板 Builder、online 门禁 | 平台 |

关键约束：

- 首版默认 `1.0.0`。
- 策略新增必须模板优先。
- online 前必须有正式版本和启用策略。
- 主题/插件发布成功后可提示添加到节点或去 Console 激活。

### 5.2 更新当前本地工程

| 用户目标 | CLI 引导 |
|---|---|
| 改代码发新版 | status → build → bump/version → publish → policy/online |
| 只改版本说明/属性 | version edit，不重新上传文件 |
| 只改标题/简介/封面/标签 | listing update，不发新版本 |
| 平台被别人改过 | diff/pull/apply-listing，不能静默覆盖 |

版本恢复必须比较完整发布意图，不只看 sha1。

### 5.3 维护已有线上资源

```text
搜索或输入 resourceId
  → 读取 Resource.info
  → 检查 owner / env / frozen / latestVersion / policy
  → 选择维护动作
  → 每个动作独立 preflight
```

维护动作包括：

- listing。
- 新版本。
- 已发布版本可编辑字段。
- 依赖授权。
- 策略模板新增。
- 策略启停。
- online/offline。

### 5.4 批量发布本地目录

```text
选择目录
  → 扫描和 ignore
  → 选择统一类型或逐项类型
  → 预览处理/跳过/拒绝项
  → 分批写平台
  → NDJSON 进度
  → report / retry / resume
```

关键约束：

- Console 单批最多 20 个文件；CLI 可自动分批。
- 批量不是 `init N 个工程`。
- 每项状态独立：passed、failed、skipped、remote_succeeded_local_pending、remote_outcome_unknown。
- unknown 不能自动重试，必须先对账。

### 5.5 创建或维护合集

```text
选择合集类型
  → 创建或绑定合集
  → 选择条目来源：已有资源 / 本地目录 / RSS
  → 编辑目录草稿
  → 发布合集版本
  → 策略模板
  → collect-rules
  → online
```

关键约束：

- 合集类型来自 subjectType=4 类型树，不支持自定义类型。
- 条目草稿和正式合集版本要分清。
- 从本地目录创建合集时，子资源失败不能让合集显示完成。
- RSS 相关合集锁定 Console 锁定的字段。

### 5.6 RSS 与 collect-rules

RSS：

```text
输入 feed URL
  → preview
  → ownerEmail / 已绑定检查
  → send-code
  → 输入验证码
  → 超 1000 条则选择日期范围
  → bind
  → status/sync/failed-items
```

collect-rules：

```text
读取现有规则
  → 是否持续更新
  → 是否启用自动收集
  → all / any
  → 条件：标题 / 授权身份 / 资源类型
  → setCollectRules
```

RSS 和 collect-rules 是一期能力，不是旧实现缺了就删掉。

### 5.7 策略和上下架

```text
policy
  → 新增策略：模板 Builder
  → 启停策略：已有策略列表
  → 防止禁用最后一条启用策略

online
  → latestVersion
  → 启用策略
  → 非 frozen
  → owner/env 一致
  → status=1

offline
  → 展示影响
  → confirm
  → 下线
```

## 6. 命令面

### 6.1 面向普通用户

| 入口 | 用途 |
|---|---|
| `freelog-cli start` | 主向导，优先入口 |
| `freelog-cli session` | 一个临时终端会话内连续完成 |
| `freelog-cli studio` | 多账号、多文件工作台 |

### 6.2 面向专家和 AI/CI

| 用户目标 | 命令形态 |
|---|---|
| 初始化工程 | `init theme/widget/package/other/collection` |
| 创建资源壳 | `create` |
| 发布版本 | `publish` / `release` |
| 管理策略 | `policy template list/render/apply`、`policy apply --template`、`policy set`、`policy list` |
| 上下架 | `online`、`offline` |
| 批量 | `resource import-dir` |
| 合集 | `collection create/item/publish/rss/collect-rules` |
| 临时线上维护 | `--session --resource-id <id>` |

非 TTY 必须支持：

- `--json`
- `--json-lines`
- `--yes`
- `--env`
- 稳定退出码
- report 路径

## 7. 输出和错误

| code | 含义 | 用户下一步 |
|---|---|---|
| 0 | 成功 | 看下一步 |
| 1 | 未分类失败 | 看错误和 report |
| 2 | 网络或平台不可达 | 重试只读检查 |
| 3 | 认证失败 | 重新登录或切换账号 |
| 4 | 用户输入或业务校验失败 | 修改参数 |
| 5 | 需要 Console/handoff | 打开链接后运行 nextCommand |
| 6 | 远端结果未知 | 人工对账后 resume |

机器输出里不能混人类日志；人类解释放 stderr 或 report。

## 8. 代码结构要求

后续实现按流程阅读，而不是在 command 文件里拼 API。

| 层 | 责任 |
|---|---|
| `commands/*` | 参数解析、模式选择、输出协议；不拼平台业务 payload |
| `services/interactive/*` | `start`、本地工程、session、studio、合集连续菜单与 TTY prompt 编排 |
| `services/init/*` | 类型选择、模板选择、脚手架 scaffold 与初始化字段 prompt |
| `services/resourceType*.ts` | 类型树、搜索、leaf、能力摘要 |
| `services/artifactPipeline.ts` / `processFile.ts` | build 结果、zip、ignore、sha1、大小 |
| `services/policyTemplate/*` | 模板列表、参数、编译、翻译、重复检测、preview/apply |
| `services/resource/*` / `services/collection/*` | resource、version、collection、rss、policy 业务写入 |
| `services/store/*` / `config/project/*` | manifest/state/session/studio/report 持久化与恢复 |
| `platform/*` | Freelog API adapter |

实现时若发现流程和本文冲突，先回到 Console 总账或场景文档修正设计，再写代码。
