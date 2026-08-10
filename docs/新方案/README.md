# Freelog Runtime CLI 新方案

最后更新：2026-08-10

本目录保存产品设计的下游文档：字段契约、技术实现、Console 证据、使用说明和验证场景。

**唯一产品设计入口是仓库根目录 [DESIGN.md](../../DESIGN.md)。**

## 1. 先确定文档角色

| 层级 | 回答的问题 | 权威文档 | 是否定义产品 |
|---|---|---|---|
| 产品规范 | 为什么做、为谁做、做什么、不做什么、交互原则是什么 | [DESIGN.md](../../DESIGN.md) | **是，唯一** |
| 字段契约 | manifest/state/API 字段叫什么、归属哪里 | [CLI字段账本](./开发/CLI字段账本.md) | 只定义数据契约 |
| 技术设计 | 代码如何分层、文件如何处理、命令如何实现 | [CLI脚手架设计](./开发/CLI脚手架设计.md) | 否 |
| Console 证据 | Console 当前写了哪些 API、平台结果如何 | [CLI数据操作与Console对照](./对齐/CLI数据操作与Console对照.md) | 否，是业务证据 |
| 用户说明 | 当前版本怎样操作 | [普通用户简明手册](./使用/普通用户简明手册.md) | 否 |
| 验证证据 | 哪个版本、环境和场景验证过 | [场景目录](./场景/README.md) · 日期化运行报告 | 否 |

发生冲突时，不再让多份文档投票：产品问题回到 `DESIGN.md`，字段问题回到字段账本，实现问题回到脚手架设计，验证结果只进入验证文档。

## 2. 一句话定位

Freelog Runtime CLI 是以本地工程为工作面的资源发行与生命周期工具：

> 本地文件和 manifest 表达意图，CLI 将 Console UI 中的隐性约束显式化，经校验、构建、压缩、上传和平台写入完成可重复发行。

CLI 不复制 Console UI。它对齐平台业务语义，同时提供模板、构建、目录压缩、Git/CI、批量目录和结构化输出等原生能力。

## 3. 产品主线

```text
环境与身份
  → 工程立项（模板或已有目录）
  → 创建/绑定平台对象
  → 编辑 manifest 发版意图
  → validate / diff
  → 构建与准备发行物
  → publish / collection publish / import-dir
  → policy
  → online
  → pull / draft / update / 新版本维护
```

三种发行模式必须保持清楚：

| 目标 | 主入口 | 本地结果 |
|---|---|---|
| 发行单资源 | `init` → `create` → `publish` | 一套 manifest/state |
| 批量发行独立资源 | `resource import-dir` | N 个可独立维护的子工程 |
| 发行合集 | `init collection` → `collection *` | 一个合集工程和有序条目 |

## 4. Console UI 约束如何进入 CLI

| Console | CLI |
|---|---|
| 下拉框、必填控件 | 动态枚举、schema 与业务校验 |
| 分步向导、禁用按钮 | 状态机、前置条件和明确失败 |
| 当前账号和环境 | 每次写操作验证 env 与 owner |
| 确认弹窗 | TTY 确认；非交互要求 `--yes` |
| 自动保存草稿 | 显式 `draft push` |
| 页面内存 | manifest 持久化并可进入 Git |
| 进度条 | 人类进度或 NDJSON 事件流 |
| 支付/微应用 | 明确边界并失败，不伪造成功 |

完整原则见 [DESIGN.md：Design principles](../../DESIGN.md#design-principles)。

## 5. CLI 原生能力

### 模板

- 主题、插件：生成 runtime 工程和 manifest。
- 前端库/软件库：生成 package 工程和 manifest。
- 其余资源：可只初始化 manifest。
- 合集：初始化合集工程，不生成无关前端模板。

`init` 只建立本地工程；`create` / `collection create` 才创建平台对象。

### 构建与压缩

- 单文件资源校验后直接上传原文件。
- 工程型资源以构建产物目录为输入，发布前生成临时 zip。
- `publish` 消费已准备好的产物；`release` 可以编排 validate → build → package → publish → online。
- `dry-run` 的产品定义是零副作用，只输出计划。

完整规则见 [DESIGN.md：CLI-native capabilities](../../DESIGN.md#cli-native-capabilities)。

## 6. 按角色阅读

| 你是… | 阅读顺序 |
|---|---|
| 产品经理 | [DESIGN.md](../../DESIGN.md) → [产品经理简明手册](./使用/产品经理简明手册.md) → [Console 对齐证据](./对齐/README.md) |
| 开发 | [DESIGN.md](../../DESIGN.md) → [CLI字段账本](./开发/CLI字段账本.md) → [CLI脚手架设计](./开发/CLI脚手架设计.md) |
| 测试 / QA | [DESIGN.md：Verification contract](../../DESIGN.md#verification-contract) → [测试人员简明手册](./使用/测试人员简明手册.md) → [场景目录](./场景/README.md) |
| 普通用户 | [普通用户简明手册](./使用/普通用户简明手册.md) → [CLI 使用说明](./使用/CLI使用说明与Console差异.md) |
| 新会话接手 | [DESIGN.md](../../DESIGN.md) → 本 README → 当前代码与测试；交接文档仅作历史快照 |

## 7. 文档维护规则

- 改产品目标、范围、领域概念、交互原则：只改根目录 `DESIGN.md`，再同步下游文档。
- 改 manifest/state/API 字段：改 `CLI字段账本.md`。
- 改架构、文件处理或命令实现：改 `CLI脚手架设计.md`。
- Console 新增或变化：改 `对齐/`，作为产品决策输入，不自动扩大 CLI 范围。
- 改用户操作：改 `使用/`。
- 改场景、问题或生产踩坑：改 `场景/`，并更新 `04-问题矩阵.md`。
- 测试通过数、环境、账号角色和日期：只进入验证报告，不写进产品设计或本 README。
- 密码、token、cookie、authorization 不得进入任何仓库文档、脚本、manifest 或 state。

## 8. 当前目录

```text
新方案/
  README.md       本索引，不定义第二套产品设计
  开发/           字段契约与技术实现
  对齐/           Console 源码、API 与平台行为证据
  使用/           当前版本操作手册
  场景/           验收场景、问题矩阵和运行说明
  交接/           历史交接快照，不定义当前设计或完成状态
  archive/        历史计划与已失效结论
```

历史文档可以保留用于溯源，但不得继续作为产品决策依据。
