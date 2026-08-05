# Freelog Runtime CLI 新方案

最后更新：2026-08-05

本目录是 Freelog Runtime CLI 的唯一设计入口。目标是让主题/插件开发者、图片/视频资源作者、产品经理、测试人员和后续开发者都能从少量文档中理解同一套设计。

## 1. 核心思想

CLI 的价值是：即使没有 Console UI，用户也能通过命令、`freelog.manifest.json` 和声明式 JSON/YAML 文件完成资源全生命周期操作。

CLI 对齐的是 Console 调用接口后的平台最终状态，不是强行复制 Console 的页面步骤。Console 的页面输入、弹窗、草稿防抖、策略 Builder 和授权微应用，在 CLI 中必须转成明确的 flag、manifest 字段或文件输入；涉及支付、验证码、复杂人机确认的能力，CLI 应明确失败并给出边界。

所有业务流程必须先经过脚手架基础层：`login -> status -> type/template -> init -> create -> publish -> policy -> online -> status/pull`。登录、登出、环境、状态查看、显式同步、JSON 输出和错误码不是附属功能，是资源发行可靠性的底座。

## 2. 文档结构

| 文档 | 受众 | 内容 |
|---|---|---|
| [CLI字段账本](./CLI字段账本.md) | 开发、测试 | 唯一设计源：字段、接口、CLI 输入、实现状态、边界 |
| [CLI脚手架设计](./CLI脚手架设计.md) | 开发 | 工程架构、模块分层、命令拓扑、文件处理、测试设计 |
| [CLI使用说明与Console差异](./CLI使用说明与Console差异.md) | 使用者、测试 | 端到端命令、场景、和 Console 的差异 |
| [用户场景与问题清单](./用户场景与问题清单.md) | 产品、测试、开发 | 真实用户场景、可能问题、CLI 应对策略、测试维度 |
| [产品与测试简明说明](./产品与测试简明说明.md) | 产品、测试 | 产品目标、主流程、验收重点、负向用例 |
| [CLI交接文档](./CLI交接文档.md) | 新会话、接手开发 | 仓库路径、环境账号、当前实现、验证记录 |

其他旧设计文档已删除，避免重复、过期和互相矛盾。后续新增设计内容必须先判断能否写入以上六份文档，不能再新建散文档。

## 3. 设计硬约束

1. 不动浏览器项目。
2. 不恢复旧 CLI 配置体系和旧命令入口。
3. 不把平台事实写入 manifest；平台事实只进 `.freelog/state.json`。
4. 不把 token、cookie、password 写入项目目录。
5. 不绕过 `online` 门禁。
6. 平台已有稳定字段或 Console 已有业务入口时，CLI 不能因为没有 UI 就放弃承接。
7. 草稿必须按对象区分：单品发版表单草稿、合集发版表单草稿、合集目录草稿。
8. CLI 不自动防抖保存草稿；远端草稿写入必须由显式命令触发。
9. 修改资源业务前，先更新 [CLI字段账本](./CLI字段账本.md)。
10. 修改模块、命令拓扑、文件处理、测试分层前，先更新 [CLI脚手架设计](./CLI脚手架设计.md)。
11. 修改使用流程后，同步 [CLI使用说明与Console差异](./CLI使用说明与Console差异.md)。
12. 修改用户场景、异常问题、测试维度后，同步 [用户场景与问题清单](./用户场景与问题清单.md)。
13. 修改测试口径后，同步 [产品与测试简明说明](./产品与测试简明说明.md)。
14. 修改环境、路径、账号、关键状态后，同步 [CLI交接文档](./CLI交接文档.md)。

## 4. 当前实现范围

| 能力 | 状态 |
|---|---|
| tools-lib2 Node 入口 | 已接入，CLI 使用 `@freelog/tools-lib2/node` |
| 环境选择 | 已有 `--env production/prod/test/dev`，默认 production，联调显式 dev |
| 登录/登出 | 已有 `login/logout`，凭据绑定环境，敏感值加密保存 |
| 状态诊断 | 已有 `status`，只读输出登录态、owner、同步、平台状态、草稿建议 |
| 显式同步 | 已有 `pull`、`pull --apply-listing`、`pull --collection`、`pull --all` |
| 模板发现 | 已有 `template list` |
| 模板初始化 | 已有 `init --scaffold runtime/package/none/collection` |
| 主题/插件压缩发布 | 已有，主题/插件/软件库构建目录发布时压缩为 zip |
| 单品创建、基础信息、版本、草稿、策略、上下架 | 已有 |
| 图片/视频单文件发布 | 已有 |
| 图片/视频文件夹批量独立资源 | 已有 `resource import-dir`，支持 `freelog.batch.json/yaml` |
| 图片/视频文件夹作为合集 | 已有 `collection item import-dir`，复用批量配置 |
| 单品发版表单草稿 | 已有 `draft push/pull/discard` |
| 合集发版表单草稿 | 已有 `draft push/pull/discard --collection` |
| 合集目录草稿与合集发布 | 已有 `collection item *` + `collection publish` |
| 依赖授权 | 支持声明式免费策略签约；复杂/付费授权回 Console |

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
