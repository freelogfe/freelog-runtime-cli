# CLI 交接文档

最后更新：2026-08-05

本文用于新会话快速接手。详细设计看 [CLI字段账本](./CLI字段账本.md)，使用和测试步骤看 [CLI使用说明与Console差异](./CLI使用说明与Console差异.md)。

## 1. 一屏结论

1. 当前只开发 `D:\appinside\freelog-runtime-cli` 的新 CLI。
2. 浏览器端项目不改。
3. CLI 的核心目标是：没有 Console UI，也能完成资源生命周期操作。
4. CLI 对齐 Console 的平台最终状态，不复刻 Console 页面交互。
5. 新 CLI 没有旧代码兼容负担，不恢复旧配置和旧命令。
6. 平台接口统一走 `@freelog/tools-lib2/node`。
7. 本地项目只认 `freelog.manifest.json` 和 `.freelog/state.json`。
8. `publish` 可以没有策略；`online` 必须有 latestVersion 和启用策略。
9. 主题/插件/软件库发布构建目录时压缩为 zip。
10. 图片/视频文件夹既可批量生成独立资源，也可生成子资源后发布为合集。
11. 草稿分三类：单品发版表单草稿、合集发版表单草稿、合集目录草稿，不能混用命令或接口。
12. 基础流程先于资源业务：`login -> status -> type/template -> init -> create -> publish -> policy -> online -> status/pull`。

## 2. 关键路径

| 用途 | 路径 |
|---|---|
| CLI 仓库 | `D:\appinside\freelog-runtime-cli` |
| CLI 包 | `D:\appinside\freelog-runtime-cli\packages\cli` |
| 本仓 tools-lib2 | `D:\appinside\freelog-runtime-cli\tools-lib` |
| 新方案文档 | `D:\appinside\freelog-runtime-cli\docs\新方案` |
| Console 资源页参考 | `D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource` |
| Console tools-lib 原始位置 | `D:\appinside\freelogfe-web-repos\packages\@freelog\tools-lib` |
| 旧脚手架参考，只能参考 | `D:\appinside\freelog-runtime-cli\backup\freelog-cli-ts-copy` |
| 主题发布测试项目 | `D:\appinside\freelog-runtime-cli\test\my-freelog-project` |
| 单图片测试文件 | `D:\appinside\freelog-runtime-cli\test\abcdef.png` |

## 3. 必读文档

| 顺序 | 文档 |
|---|---|
| 1 | [README](./README.md) |
| 2 | [CLI字段账本](./CLI字段账本.md) |
| 3 | [CLI脚手架设计](./CLI脚手架设计.md) |
| 4 | [CLI使用说明与Console差异](./CLI使用说明与Console差异.md) |
| 5 | [用户场景与问题清单](./用户场景与问题清单.md) |
| 6 | [产品与测试简明说明](./产品与测试简明说明.md) |

不要再参考已删除的旧产品设计/开发设计/API 对照文档。后续设计内容必须合并进以上文档。

## 4. 环境和账号

| 环境 | CLI 值 | API |
|---|---|---|
| 生产 | `production` / `prod` | `https://api.freelog.cn` |
| 测试 | `test` | `https://api.testfreelog.com` |
| 开发 | `dev` / `development` | `https://api.devfreelog.com` |

当前联调环境：

| 项 | 值 |
|---|---|
| 站点 | `devfreelog.com` |
| CLI 环境 | `dev` |
| 账号 | `freelog-test11` |
| 密码 | `freelog-test1111` |

登录：

```bash
freelog-cli login --env dev --login-name freelog-test11 --password freelog-test1111 --yes
```

注意：密码只允许出现在交接文档，不得写入 manifest、state、测试快照或普通 README。

## 5. 当前命令面

| 类型 | 命令 |
|---|---|
| 全局 | `login`、`logout`、`status`、`pull` |
| 类型 | `type list/search/info` |
| 模板 | `template list` |
| 初始化 | `init` |
| 单品 | `create`、`update`、`version set/edit`、`publish`、`draft push/pull/discard`、`dep *`、`policy apply/list/set`、`online/offline` |
| 批量单品 | `resource import-dir` |
| 合集 | `collection create/update/version/policy/publish/item/collect-rules/rss/logs`；合集发版表单草稿用 `draft push/pull/discard --collection` |

## 6. 本地包关系

根仓库使用 workspace/link：

```yaml
packages:
  - tools-lib
  - packages/*
  - packages/templates/*

overrides:
  '@freelog/tools-lib2': link:./tools-lib
```

含义：

1. 本地开发使用仓库内 `tools-lib`。
2. CLI 发布到 npm 后使用 npm 上的 `@freelog/tools-lib2`。
3. tools-lib2 有改动时，先发布 tools-lib2，再发布 CLI。
4. 不长期 link 到 `freelogfe-web-repos`，避免发布边界混乱。

## 7. 已实现重点

1. `resource.typeName/resourceTypeName` 已打通 init、manifest、state、create、collection create。
2. `template list` 已实现，读取 `packages/cli/compat/template-compat.json`。
3. `resource import-dir` 支持零配置和 `freelog.batch.json/yaml`。
4. `collection item import-dir` 复用批量配置，可把图片/视频文件夹发布为合集。
5. 批量创建按 20 个一批；含 `authExcludedItems` 的 item 自动逐个创建。
6. 合集目录草稿项读取已分页。
7. 主题/插件/软件库发布时目录压缩为 zip。
8. 视频封面通过 `version.videoCover` / `version set --video-cover` 承接。

## 8. 关键边界

| 边界 | 结论 |
|---|---|
| 环境 | 默认 production；联调/测试显式 `--env dev`；auth 和 state 都绑定环境 |
| 登录 | 保存 token/authorization/cookie/userId/username/environment；敏感值加密；dev 后续接口依赖 Cookie |
| 登出 | 只清 auth，不删除 manifest/state |
| status | 只读诊断命令，不改本地文件、不写平台 |
| pull | 默认只刷新 state；只有 `--apply-listing` 写 manifest |
| JSON/错误码 | 脚本用 `--json`；失败包含 code/message/hint |
| 单品发版表单草稿 | `draft push/pull/discard`，同步版本号、文件信息、版本说明、依赖、属性、视频封面 |
| 合集发版表单草稿 | `draft push/pull/discard --collection`，同步合集发版表单，不维护目录 |
| 合集目录草稿 | `collection item *` 维护，`collection publish` 合并；`draft discard --collection` 不删除目录草稿 |
| 旧配置 | 不恢复 `freelog.resource.config.*` 等旧配置 |
| 策略 Builder | 不做，CLI 只接收最终策略文本 |
| 修改已有策略正文/名称 | 不做，新增策略后切换启用，或回 Console |
| 付费授权 | 不做 CLI 支付流程 |
| 视频转码 | 不做，CLI 上传原文件 |
| 浏览器项目 | 不改 |
| Console 对齐 | 对齐平台最终状态，不对齐 UI 步骤 |

## 9. 最近验证

最近一次本地完整验证：

```bash
pnpm verify
```

通过范围：

1. `@freelog/tools-lib2` build。
2. CLI 全量测试。
3. TypeScript typecheck。
4. 模板 compat 检查。
5. CLI build。
6. npm pack dry-run。

最近一次结果：21 个测试文件、103 个测试通过。

## 10. dev 冒烟记录

已验证过的 dev 流程：

1. 登录 dev。
2. `type list/search/info`。
3. 主题测试项目发布、策略、上下架。
4. 图片合集从零创建、子资源导入、合集发布、策略、上下架。
5. 单视频、视频合集链路。
6. React 主题模板、Vue 插件模板创建、构建、发布。
7. Console listing 协作：`status` 发现差异，`pull --apply-listing` 采纳远端，冲突时需 `--force`。

注意：视频实测主要证明 CLI 上传、发版、策略、上下架链路；真实视频素材仍需专项验证平台格式/大小限制和资源详情页访问。CLI 不负责转码。

## 11. 常见坑

| 现象 | 处理 |
|---|---|
| dev 登录后资源接口 401 | 确认 login 保存并注入 Cookie，不只依赖 tokenSn |
| `online` 失败 | 先确认 latestVersion 和启用策略 |
| `publish` 版本冲突 | 使用大于平台 latestVersion 的版本号 |
| `collection item import-dir` 失败 | 确认子资源有版本、启用策略、可上架 |
| `policy set` 写成 `--status` | 当前语法是 `policy set <policyId> <0|1>` |
| 同目录换环境失败 | state 绑定环境，切回原 env 或确认后清理 state |
| 模板 runtime 0.4 失败 | 当前主推 runtime 0.5 |

## 12. 接手原则

1. 改资源业务前先更新 `CLI字段账本.md`。
2. 改模块分层、命令拓扑、文件处理、批量/合集实现策略前先更新 `CLI脚手架设计.md`。
3. 改命令和使用流程后同步 `CLI使用说明与Console差异.md`。
4. 改用户场景、异常问题、测试维度后同步 `用户场景与问题清单.md`。
5. 改验收口径后同步 `产品与测试简明说明.md`。
6. 改环境、账号、路径、验证状态后同步本文。
7. 所有完成声明必须有验证证据。
