# 一期 CLI 体验拓扑设计

> **文档角色：** 一期脚手架体验的核心设计入口。本文只回答三件事：Console 业务流程是什么、CLI 应该怎样翻译成好用流程、每类用户场景应该落到哪里。  
> **重要原则：** 旧 CLI 实现和旧文档只能作为“现状证据”，不能反向决定产品设计。若旧实现与本文冲突，以本文为重构目标。

最后更新：2026-08-28

---

## 0. 先把问题说清楚

Freelog CLI 的目标不是复刻 Console 页面，也不是把 API 参数暴露成一堆命令。它要让用户或 AI 快速、安全、可恢复地管理本地电脑上的资源：

- 发布或更新本地文件、目录、主题、插件、前端库；
- 批量整理本地目录并发布成多个资源；
- 创建和维护合集、RSS 合集和自动收录规则；
- 管理线上资源的策略、依赖签约、上架和下架；
- 在 CI / AI Agent 中用稳定 JSON、退出码和报告恢复自动执行。

所以设计顺序必须是：

```text
Console 真实业务流程
  → 提取字段约束、API 写入、状态门禁
  → 翻译成 CLI 的连续任务体验
  → 再拆成命令、模块、测试和文档
```

不能反过来从旧命令猜产品。

---

## 1. Console 业务流程真源

本节只描述 Console 的业务结果，不描述 CLI 怎么实现。源码锚点见 [对齐/Console源码证据索引.md](./对齐/Console源码证据索引.md)。

### 1.1 独立资源首次发行

```text
Step1 资源身份
  选资源类型 leaf
  填标题 resourceTitle
  填授权标识 name
  → Resource.create

Step2 版本与文件
  选本地文件/云文件
  上传得到 fileSha1
  填版本说明、依赖、属性、授权排除
  → Resource.createVersion

Step3 授权策略
  打开 fPolicyBuilder3
  拉取策略模板
  选择模板
  填参数和策略名
  编译 policyText
  生成译文预览
  → Resource.update.addPolicies

Step4 listing 与上架
  填简介、封面、标签
  可直接写 status=1
```

CLI 对齐重点：

- 类型、标题、授权标识、文件、版本、依赖、属性、策略、listing 字段都要同约束。
- Step3 策略不是手写 policyText，而是模板 Builder。
- Step4 的直接上架是 Console 向导便利路径；CLI 不复制这个弱门禁，必须拆成“策略就绪 → online 严格门禁”。

### 1.2 独立资源维护

```text
进入 sidebar
  → info：改标题、简介、封面、标签
  → versionInfo：改已发版说明/属性
  → versionCreator：发新版本，或复用上一版文件
  → dependency/contract：看依赖授权并签约
  → policy：新增策略、启停策略
  → Sider：online/offline
```

CLI 对齐重点：

- 改已发布版本说明/属性 ≠ 发新版本；改依赖必须发新版本。
- 新增策略仍走模板 Builder；启停已有策略才是 `policy set`。
- online 使用 sidebar 严格门禁：必须有正式版本、至少一条启用策略、非冻结、owner/env 一致。
- 依赖和付费动作如果需要浏览器、验证码或收银台，CLI 只能 handoff，不能假装完成。

### 1.3 批量独立资源

```text
creatorBatch
  选多个文件
  每项生成标题、授权标识、版本、上传任务
  按资源类型和限制分批
  → createBatch / 逐项 create + createVersion
  → Finish 页可继续加入合集或节点
```

CLI 对齐重点：

- Console 单批限制约束必须被理解；CLI 可以处理更大目录，但写平台时要分批并报告。
- 批量不是合集；一批文件会变成多个独立资源和多个子工程。
- 失败不能靠屏幕文字丢给用户，要有 report、retry、resume 和 remote unknown 停损。

### 1.4 合集

```text
collectionCreator
  Step1 创建合集壳
  Step2 添加目录项：已有资源 / 本地上传 / RSS
  Step3 策略 Builder
  Step4 listing、display、collect-rules
  → collection publish
  → online/offline
```

CLI 对齐重点：

- 合集不是压缩一个文件夹。它有四层：合集壳、子资源、目录草稿、合集版本。
- `collection item *` 改的是目录草稿；`collection publish` 才生成正式合集版本。
- display / catalogueProperty、collect-rules、RSS 锁定字段都要同 Console。
- RSS 绑定后，标题、封面、简介、标签、display、目录项、同步状态等 feed 托管字段不能被 CLI 放开。

### 1.5 RSS 与 collect-rules

```text
RSS
  inspect feed
  send-code / verify
  bind feed to collection
  status / sync
  锁定 feed 托管字段

collect-rules
  get current rules
  edit rules
  setCollectRules
```

CLI 对齐重点：

- RSS / collect-rules 不是本地文件发行主链路，但属于一期完整产品要覆盖的维护能力。
- 验证码、邮箱、重复绑定、换源、同步中和失败项都要有明确处理。
- 如果真实环境暂时无法签字，文档要写成 ENV 缺口，不能把能力从产品里删掉。

---

## 2. CLI 应该怎样翻译业务

CLI 的主体验按“用户手上有什么”组织，而不是按 API 名称组织。

### 2.1 CLI 运行环境与执行表面

CLI 和 Console 最大的差异不是“有没有按钮”，而是 CLI 有本地文件、凭据来源、Store 落盘、非交互脚本和单进程会话。所有体验设计都必须先选运行表面：

| 表面 | 入口 | Auth | Store | 适合 | 禁止误导 |
|---|---|---|---|---|---|
| 工程模式 `00` | 工程目录中的显式命令 / `start` | 工作区或全局凭据落盘 | `freelog.manifest.json` + `.freelog/state.json` | 长期维护、Git/CI、主题/插件/package 工程 | 不能把 state 当用户意图提交 |
| 单命令会话 `01` | `xxx --session --resource-id ...` | 可读工作区/全局凭据 | 内存，命令结束销毁 | 临时维护一个线上资源的一次动作 | 不能承诺下一条命令还能记住刚才输入 |
| 多账号工作区 `10` | `freelog-cli studio` | 进程内临时凭据，不落盘 | 子工程落盘 | 同一台电脑多账号管理多份文件 | 不能读取/复用磁盘 auth；不能把敏感文件列为候选 |
| 交互会话 `11` | `freelog-cli session` | 进程内临时凭据，不落盘 | 内存，退出销毁 | 一次终端会话内连续完成临时发布/维护 | 退出前不导出就不能假装已保存 |
| AI/CI 表面 | 显式命令 + `--json --yes --env` | 通常工程/全局凭据或安全注入 | 优先工程模式；长任务用 report | 自动化、Agent 代执行 | 不能 prompt；stdout 不能混人类日志 |

选择规则：

```text
我要长期维护一个资源 / 放进 Git / 给 CI 跑
  → 工程模式 00

我只想对已有 resourceId 做一次动作
  → 单命令会话 01

我想在一个终端里临时连续做完，退出后不留痕
  → 交互会话 11

我有多个账号、多份本地文件，要边切账号边发布
  → studio 10

我是 AI/CI，要可复制、可恢复、可解析
  → 工程模式 00 + 全参数 + JSON/NDJSON/report
```

### 2.2 产品形态裁决：TTY 连续向导优先

```text
freelog-cli / freelog-cli start
  → 你要做什么？
      1. 发布主题工程
      2. 发布插件工程
      3. 发布前端库 / 软件库
      4. 发布一个普通文件
      5. 发布一个普通目录 zip
      6. 批量发布一个文件夹
      7. 创建或维护合集
      8. 维护已有线上资源
      9. 只管理策略 / 上下架
      10. session / studio 临时工作
  → 按场景连续引导
  → 每次写平台前 preflight
  → confirm 后写平台
  → 成功后给下一步
```

显式命令仍然存在，但它们是 checkpoint、专家快捷入口和 AI/CI 接口；普通 TTY 用户不应该背完整命令链。

### 2.3 每个 TTY 流程必须有同一骨架

| 阶段 | 用户问题 | 副作用 |
|---|---|---|
| 选择任务 | 我手上是什么，要完成什么？ | 无 |
| 环境与身份 | 用哪个 env、哪个账号、哪个 owner？ | 可能登录；不写平台 |
| 选择对象 | 新建、绑定已有，还是维护当前工程？ | 可能写本地 manifest/state |
| 补本地意图 | 标题、类型、文件、版本、策略等 | 只写本地，或无写入 |
| preflight | 即将写什么平台对象？风险是什么？ | 只读平台 |
| confirm 写入 | 用户确认后执行 API | 写平台和 state |
| 下一步 | 继续策略、签约、上架、加入合集，或退出 | 仅确认后继续写 |

### 2.4 一次会话完成所有事项

普通 TTY 的理想体验是输入一次入口命令后，在同一个会话里完成完整事项，而不是每成功一步就把用户踢回命令文档。

一次会话里必须持续保留的上下文：

| 上下文 | 用途 | 落盘规则 |
|---|---|---|
| env、账号、凭据来源 | 每次写前展示和 owner 校验 | 工程模式可落凭据；session/studio 不落凭据 |
| 当前对象 | resourceId / collectionId / title / type / status | 工程模式写 state；session 内存；studio 子工程写 state |
| 本地意图 | 文件、版本、依赖、策略、listing、display | 工程模式写 manifest；session 内存或导出；studio 子工程 |
| 风险与恢复 | 待签约、待支付、remote unknown、report path | report 或错误 JSON；TTY 成功页也展示 |

连续链路示例：

```text
start
  → 选择“发布普通文件”
  → 逐级选资源类型
  → 填标题/name/版本/文件
  → create
  → publish
  → dep auth（需要浏览器则 handoff，完成后回到同一 checkpoint）
  → 策略模板 Builder
  → online
  → status summary / 复制命令 / 结束
```

退出规则：

- 工程模式：每个已确认 checkpoint 都有本地状态，可用 `start` / `status` 继续。
- `freelog-cli session`：退出前必须提示“未导出则丢失”，可显式 `export-project` 转工程模式。
- `freelog-cli studio`：子工程和 studio report 保留，凭据清空；下次可从子工程继续。
- AI/CI：没有会话记忆；靠 JSON、NDJSON 和 report 串联下一步。

### 2.5 资源类型选择拓扑（必须保留旧式逐级选择）

资源类型不能只做搜索框。搜索可以有，但默认必须保留逐级选择：

```text
一级类型
  → 子类型
  → leaf
  → 展示完整路径、code、上传能力、大小/格式限制
  → 确认
```

主题、插件、package 也不是让用户碰运气搜索：

| 入口 | 类型处理 |
|---|---|
| 主题 | 第一屏独立入口；最终落到平台“主题” leaf；模板只是本地工程模板 |
| 插件 | 第一屏独立入口；最终落到平台“插件” leaf；不能复用主题文案 |
| package | 第一屏独立入口；模板映射到平台 JS 工具包 / 组件库 leaf；需要 namespace |
| 普通文件/目录 | 从平台类型树逐级选 leaf；搜索只是快捷入口 |
| 合集 | 使用合集 subjectType/合集类型树；子资源另选独立资源类型 |

### 2.6 策略拓扑（必须模板优先）

策略新增的普通路径必须是模板 Builder：

```text
policy template list
  → 选择模板
  → 填参数和策略名
  → policyReCompile
  → policyTranslation
  → 预览确认
  → addPolicies
```

`policy apply --from-file` 只保留给 advanced / AI / CI / 迁移，不是普通用户主体验。

CLI 至少要覆盖 Console 模板族：永久免费、限时免费、等待免费、永久解锁、限时特价永久解锁、免费试用后订阅、借阅解锁、付费订阅。

### 2.7 文件、构建和打包

这是 CLI 的原生价值，不是 Console parity：

| 对象 | CLI 体验 |
|---|---|
| 主题 / 插件 | 选择技术模板 → build dist → directory zip → publish |
| package | 选择 package 模板和 namespace → build → directory zip → publish |
| 普通文件 | 原文件上传；展示格式、大小、SHA |
| 普通目录 | 明确选择 `directory-zip`；展示 ignore、zip 文件名、大小、SHA |
| 批量目录 | 不压成一个资源；扫描成多个独立资源，生成 report |
| 合集目录 | 子资源先创建/发布，再加入合集目录草稿 |

### 2.8 浏览器接力

CLI 可以给链接，但不能越权：

| 事情 | CLI 处理 |
|---|---|
| 付费收银台 | code 5 + actionUrl + nextCommand |
| 验证码 | code 5；说明必须去 Console |
| 手动签约 | contractsUrl / actionUrl；完成后重跑命令 |
| 免费且可判定签约 | CLI 可直接签 |

---

## 3. 场景覆盖

场景文档只写该场景遇到的具体情况；重复规则回收到本文。

| ID | 场景 | 必须覆盖 |
|---|---|---|
| S01 | 主题工程首次发布 | 主题入口、runtime 模板、dist zip、策略模板、online |
| S02 | 插件工程首次发布 | 插件入口、插件 leaf、模板文案不混主题 |
| S03 | 前端库 / 软件库发布 | package 模板、namespace、JS 工具包 / 组件库 leaf |
| S04 | 普通单文件资源发布 | 逐级类型选择、格式/MIME/大小/SHA、属性解析 |
| S05 | 普通目录资源发布 | directory-zip、ignore、确定性 zip、不是批量/合集 |
| S06 | 已有线上资源维护 | search/bind/pull、listing、version edit、新发版、策略、online |
| S07 | 批量本地目录发布 | scan、preview、分批、report、retry/resume/unknown |
| S08 | 合集从本地目录创建 | 合集壳、子资源、目录草稿、合集版本 |
| S09 | RSS 合集维护 | inspect/code/bind/status/sync、锁定字段 |
| S10 | AI/CI 代执行 | `--json --yes --env`、退出码、schema、无交互 |
| S11 | session/studio 临时与多账号 | 临时凭据、临时 store、多账号 owner 不串 |
| S12 | 已有本地工程更新版本 | status/start、bump/build/publish、version edit 分叉 |
| S13 | 只管理线上策略与上下架 | 策略模板、启停策略、online/offline、dep auth |
| S14 | 策略模板选择与应用 | 模板列表、参数、编译、译文预览、文件 fallback |

---

## 4. 不可妥协的设计规则

这些规则用来防止再次被旧设计/旧实现带偏。

1. **业务流程先于命令。** 命令是实现入口，不是产品流程。
2. **Console 对齐看业务语义。** 对齐字段约束、API payload、状态门禁和流程结果；不复制浏览器 UI 外壳。
3. **策略必须模板优先。** 普通用户不能被迫写 policy DSL 或 JSON 文件。
4. **类型选择必须可浏览。** 搜索是加速器，不是唯一入口。
5. **主题、插件、package 是一级入口。** 不能藏在普通搜索或 other 里面。
6. **写平台前必须 preflight。** 用户必须知道将写什么、账号是谁、env 是什么、失败怎么恢复。
7. **CLI 不能偷做软上架。** online 始终采用 sidebar 严格门禁。
8. **目录模型必须讲清。** 目录 zip、批量独立资源、合集是三种产品，不许混。
9. **AI/CI 是一等表面。** 非 TTY 不 prompt；JSON/NDJSON、exit code、report 必须稳定。
10. **会话模式不放宽业务。** 00/01/10/11 只改变 Auth 和 Store 来源，不改变字段约束、授权、策略、online 门禁。
11. **一次会话要能完成完整事项。** TTY `start/session/studio` 必须在成功后给可执行下一步，而不是把用户丢回命令手册。
12. **无法 headless 的动作必须 handoff。** 支付、验证码、浏览器签约要给 URL 和 nextCommand。

---

## 5. 重构实现的最小结构

实现时按能力拆模块，不把体验逻辑塞进 command 文件：

| 层 | 目标 |
|---|---|
| `commands/*` | 参数、模式、输出协议；不拼业务 payload |
| `services/flow/*` | 连续任务编排：start、下一步、checkpoint |
| `services/prompts/*` | 类型选择、策略 Builder、preflight、确认、成功续接 |
| `services/policyTemplate/*` | 拉模板、渲染参数、编译、翻译、重复检测 |
| `services/resourceType/*` | 类型树、leaf 判断、能力摘要、搜索 |
| `services/artifact/*` | build 产物检查、ignore、zip、SHA、大小 |
| `services/*` 业务 service | create、publish、policy、online、collection、rss 等 API 语义 |
| `services/store/*` | manifest/state/session/studio 持久化和恢复 |
| `platform/*` | Freelog API adapter，不泄露 UI/TTY 细节 |

目标是让代码阅读顺序和业务流程一致：先看 flow，再看 prompt，再看 service，再看 store/platform。

---

## 6. 当前设计缺口必须正视

这些不是“用户再忍忍”，而是重构目标：

| 缺口 | 为什么严重 | 目标 |
|---|---|---|
| 策略仍容易被写成文件 apply | 脱离 Console Builder，普通用户体验差 | 补 `policy template` Builder |
| 类型选择若只有搜索 | 新用户不知道平台类型树 | 默认逐级浏览，搜索为快捷入口 |
| 显式命令链太像 API | 用户要记 `create/publish/policy/online` | `start` 串成连续任务 |
| 运行表面混在一起 | 工程、`--session`、`session`、`studio` 的凭据和 Store 规则不同 | 所有入口先选 Auth/Store 表面，再进入同一业务 flow |
| 一次会话无法继续下一步 | 用户发布后还要猜策略、签约、上架命令 | 每个成功 checkpoint 都返回下一步菜单、复制命令和退出/恢复路径 |
| 场景分散后缺总流 | 文档越写越多但业务不清 | 本文只保留总流，场景只补具体情况 |
| 使用文档可能仍写当前命令 | 用户会误以为那就是最终体验 | 公开手册随实现阶段更新，不能反向定义设计 |

---

## 7. 下一步怎么改

```text
先按本文确认业务流
  → 为 S01/S02/S04/S08/S13/S14 写屏幕级 prompt 草案
  → 抽出共享 prompt/flow 模块
  → 实现资源类型逐级选择和策略模板 Builder
  → 再更新公开使用文档和手测清单
```

如果实现阶段发现 Console 源码与本文不一致，先更新 [对齐/](./对齐/) 的 Console 证据，再回到本文修改业务流，不能直接在代码里“顺手改”。
