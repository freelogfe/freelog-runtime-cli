# Freelog Runtime CLI 新方案

最后更新：2026-08-06

本目录是 Freelog Runtime CLI 的唯一设计入口。目标是让主题/插件开发者、图片/视频资源作者、产品经理、测试人员和后续开发者都能从少量文档中理解同一套设计。

## 1. 核心思想

脚手架以**本地目录和文件**为工作面：manifest 记录发版意图，`version set` / `publish` 读取本地路径上传，state 缓存平台事实。

**Console 上资源发行与维护的数据操作（写入 API 的字段与状态），CLI 必须能达成同一结果**；差异只在流程（页面向导 vs 命令、策略 Builder vs 本地策略文件）。操作级 parity 见 [CLI数据操作与Console对照 §2 总表](./CLI数据操作与Console对照.md#2-业务操作-parity-总表)（**唯一状态真源**）；架构原则见 [CLI脚手架设计 §1.8](./CLI脚手架设计.md#18-console-两阶段创建creator与维护sidebar)。

**脚手架边界：** 只管 **本地文件** 发版与更新，且须对齐 Console 的 **PropertyParser 属性链路 + createVersion 请求体**（§1.9.6）；云存储、RSS、付费不在范围（§1.9.5）。

| 原则 | 含义 |
|---|---|
| **数据 parity** | creator / creatorBatch / collectionCreator / sidebar 的数据写入，CLI 必须有对应命令或 manifest 字段（§1.9） |
| **脚手架边界** | 本地文件发版工具；**不是** Console 列表、收藏、节点运营、消费详情的 CLI 版 |
| **两层交互（方案 A）** | 发行模式由**选命令**决定（init / import-dir / collection 链）；`init` 内仅**五选一**工程立项 |
| **流程可不同** | 可拆命令、可声明式 JSON/YAML；不要求复刻页面步骤 |
| **平台最终状态一致** | 对齐 resourceId、latestVersion、policies、status，不是 UI 操作路径 |

**发行模式与命令（方案 A）：**

```text
发行单个资源  →  freelog-cli init <dir>           （init 五选一 → create → …）
批量发行资源  →  freelog-cli resource import-dir  （不经过 init）
发行合集      →  init 选「合集」→ collection create → item * → …
```

基础层：`login -> status -> init/import-dir -> create/publish -> policy -> online -> pull`。

## 2. 文档结构

| 文档 | 受众 | 内容 |
|---|---|---|
| [CLI字段账本](./CLI字段账本.md) | 开发、测试 | 唯一设计源：字段、接口、CLI 输入、实现状态、边界 |
| [CLI脚手架设计](./CLI脚手架设计.md) | 开发 | 工程架构、模块分层、命令拓扑、文件处理、测试设计 |
| [CLI使用说明与Console差异](./CLI使用说明与Console差异.md) | 使用者、测试 | 端到端命令、场景、和 Console 的差异 |
| [用户场景与问题清单](./用户场景与问题清单.md) | 产品、测试、开发 | **流程拓扑**：六条主路径、全命令节点、问题矩阵、场景实例 |
| [产品与测试简明说明](./产品与测试简明说明.md) | 产品、测试 | 产品目标、主流程、验收重点、负向用例 |
| [CLI交接文档](./CLI交接文档.md) | 新会话、接手开发 | 仓库路径、环境账号、当前实现、验证记录 |
| [CLI数据操作与Console对照](./CLI数据操作与Console对照.md) | 开发 | **parity 真源**：Console 81 项业务操作 → CLI 状态 → 代码任务 |

其他旧设计文档已删除，避免重复、过期和互相矛盾。后续新增设计内容必须先判断能否写入以上七份文档；**数据操作细节**以 [CLI数据操作与Console对照](./CLI数据操作与Console对照.md) 为主，勿再新建 API 对照散文档。

## 3. 设计硬约束

1. 不动浏览器项目。
2. 不恢复旧 CLI 配置体系和旧命令入口。
3. 不把平台事实写入 manifest；平台事实只进 `.freelog/state.json`。
4. 不把 token、cookie、password 写入项目目录。
5. 不绕过 `online` 门禁。
6. 平台已有稳定字段或 Console 已有业务入口时，CLI 不能因为没有 UI 就放弃承接（**业务要全，流程可不同**）。
7. 草稿必须按对象区分：单品发版表单草稿、合集发版表单草稿、合集目录草稿。
8. CLI 不自动防抖保存草稿；远端草稿写入必须由显式命令触发。
9. 修改资源业务前，先更新 [CLI字段账本](./CLI字段账本.md)。
10. 修改模块、命令拓扑、文件处理、测试分层前，先更新 [CLI脚手架设计](./CLI脚手架设计.md)。
11. 修改使用流程后，同步 [CLI使用说明与Console差异](./CLI使用说明与Console差异.md)。
12. 修改流程拓扑、场景、问题矩阵后，同步 [用户场景与问题清单](./用户场景与问题清单.md)（§1 路径 / §3 节点 / §4 问题 / §5 实例）。
13. 修改测试口径后，同步 [产品与测试简明说明](./产品与测试简明说明.md)。
14. 修改环境、路径、账号、关键状态后，同步 [CLI交接文档](./CLI交接文档.md)。
15. 修改 Console 业务对照、API 写入字段、策略语法、上传链路后，同步 [CLI数据操作与Console对照](./CLI数据操作与Console对照.md)。

## 4. 当前实现范围

| 能力 | 状态 |
|---|---|
| tools-lib2 Node 入口 | 已接入，CLI 使用 `@freelog/tools-lib2/node` |
| 环境选择 | 已有 `--env production/prod/test/dev`，默认 production，联调显式 dev |
| 登录/登出 | 已有 `login/logout`，凭据绑定环境，敏感值加密保存 |
| 状态诊断 | 已有 `status`，只读输出登录态、owner、同步、平台状态、草稿建议 |
| 显式同步 | 已有 `pull`、`pull --apply-listing`、`pull --collection`、`pull --all` |
| 模板发现 / 类型选择 | 已有 `template list`、`type pick`（一级级选类型）、交互 `init` |
| 模板初始化 | 已有 `init --scaffold runtime/package/none/collection` |
| 主题/插件压缩发布 | 已有，主题/插件/软件库构建目录发布时压缩为 zip |
| 单品创建、基础信息、版本、草稿、策略、上下架 | 已有 |
| 图片/视频单文件发布 | 已有 |
| 图片/视频文件夹批量独立资源 | 已有 `resource import-dir`，支持 `freelog.batch.json/yaml` |
| 图片/视频文件夹作为合集 | 已有 `collection item import-dir`，复用批量配置 |
| 单品发版表单草稿 | 已有 `draft push/pull/discard` |
| 合集发版表单草稿 | 已有 `draft push/pull/discard --collection` |
| 合集目录草稿与合集发布 | 已有 `collection item *` + `collection publish` |
| 依赖授权 | 支持声明式免费策略签约；付费支付确认可回 Console，dep 声明 CLI 仍要做 |
| 半路接入 / 环境 / 批量重试 | 见 [用户场景拓扑 §1 P5/P6、§4、§5](./用户场景与问题清单.md) |

## 5. 权威源码路径

| 用途 | 路径 |
|---|---|
| CLI 仓库 | `D:\appinside\freelog-runtime-cli` |
| CLI 包 | `D:\appinside\freelog-runtime-cli\packages\cli` |
| tools-lib2 副本 | `D:\appinside\freelog-runtime-cli\tools-lib` |
| Console 资源页参考 | `D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource` |
| 旧脚手架参考，只能参考 | `D:\appinside\freelog-runtime-cli\backup\freelog-cli-ts-copy` |

## 6. 验证命令

```bash
pnpm verify
```

最近一次通过范围：tools-lib2 build、CLI 全量测试、typecheck、template compat、CLI build、npm pack dry-run。
