# CLI 交接文档

最后更新：2026-08-06

本文用于新会话快速接手。详细设计看 [CLI字段账本](./CLI字段账本.md)，**数据操作与 Console 对照**看 [CLI数据操作与Console对照](./CLI数据操作与Console对照.md)，使用和测试步骤看 [CLI使用说明与Console差异](./CLI使用说明与Console差异.md)。

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
11. 草稿分三类：**独立资源**发版表单、合集发版表单、合集目录（**单品**列表），不能混用命令或接口。
12. 基础流程先于资源业务：`login -> status -> type/template -> init -> create -> publish -> policy -> online -> status/pull`。
13. **方案 A（已定稿）：** init 仅五选一工程立项；批量 → `resource import-dir`；文件夹合集 → `collection init-from-folder`。
14. **parity 真源：** [CLI数据操作与Console对照 §2](./CLI数据操作与Console对照.md#2-业务操作-parity-总表)（81 项逐项状态）；**未对齐**，P0=PropertyParser。

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
| 场景验证脚本 | `D:\appinside\freelog-runtime-cli\packages\cli\scripts\verify-scenarios.mjs` |

## 3. 必读文档

| 顺序 | 文档 |
|---|---|
| 1 | [README](./README.md) |
| 2 | [CLI字段账本](./CLI字段账本.md) |
| 3 | [CLI数据操作与Console对照](./CLI数据操作与Console对照.md) |
| 4 | [CLI脚手架设计](./CLI脚手架设计.md) |
| 5 | [CLI使用说明与Console差异](./CLI使用说明与Console差异.md) |
| 6 | [用户场景与问题清单](./用户场景与问题清单.md) |
| 7 | [产品与测试简明说明](./产品与测试简明说明.md) |

不要再参考已删除的旧产品设计/开发设计/API 对照文档。数据操作细节以 [CLI数据操作与Console对照](./CLI数据操作与Console对照.md) 为准；其余设计内容合并进以上文档。

## 4. 环境和账号

### 4.1 环境对照

| 环境 | CLI 值 | API | Console 站点 |
|---|---|---|---|
| 生产 | `production` / `prod` | `https://api.freelog.cn` | `freelog.cn` |
| 测试 | `test` | `https://api.testfreelog.com` | `testfreelog.com` |
| 开发 | `dev` / `development` | `https://api.devfreelog.com` | `devfreelog.com` |

### 4.2 当前联调环境（dev）

| 项 | 值 |
|---|---|
| Console 站点 | `https://devfreelog.com` |
| API | `https://api.devfreelog.com` |
| CLI 环境参数 | `--env dev` |
| 联调账号 | `freelog-test11` |
| 联调密码 | `freelog-test1111` |
| 账号用途 | CLI 自动化场景验证、dev 冒烟、类型树/API 定稿复验 |
| 测试图片 | `test/abcdef.png`（单图片 publish 链路） |
| 主题样例工程 | `test/my-freelog-project`（已有 resourceId，可 bind/发新版） |

登录：

```bash
cd packages/cli
pnpm build
node dist/bin/index.js login --env dev --login-name freelog-test11 --password freelog-test1111 --yes
```

或全局安装后：

```bash
freelog-cli login --env dev --login-name freelog-test11 --password freelog-test1111 --yes
```

验证登录与 API：

```bash
pnpm verify:scenarios   # 含 dev 登录、type pick、非交互 init、端到端 publish
```

注意：

1. **密码只允许出现在本文 §4.2**，不得写入 manifest、state、测试快照或普通 README。
2. dev 后续资源接口依赖 **Cookie + token**；401 时先重新 `login`。
3. auth 与 `.freelog/state.json` 均绑定环境；同目录换环境须重新 login 并清理 state。

## 5. 当前命令面

| 类型 | 命令 |
|---|---|
| 全局 | `login`、`logout`、`status`、`bind`、`pull` |
| 类型 | `type list/search/info/pick` |
| 模板 | `template list` |
| 初始化 | `init`；定稿脚手架：`init theme\|widget\|package <dir>`；通用交互：`init <dir>` |
| 独立资源 | `create`、`update`、`version set/edit`、`publish`、`draft push/pull/discard`、`dep *`、`policy apply/list/set`、`online/offline` |
| 批量独立资源 | `resource import-dir` |
| 合集 | `collection create/update/version/policy/publish/item/collect-rules/rss/logs`；文件夹合集：`collection init-from-folder`；合集发版表单草稿用 `draft push/pull/discard --collection` |

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

1. **init 五选一（方案 A）：** 主题 / 插件 / 前端库·软件库 / 其余资源 / 合集；`init theme|widget|package <dir>` 定稿类型+模板；`init <dir>` 交互选大类。
2. 批量独立资源不进 init：`resource import-dir`；文件夹合集不进 init：`collection init-from-folder`。
3. `resource.typeName/resourceTypeName` 已打通 init、manifest、state、create、collection create；标准叶子类型 create 不传 `resourceTypeName`（防平台拒创建）。
4. `template list` 已实现，读取 `packages/cli/compat/template-compat.json`。
5. `resource import-dir` 支持零配置和 `freelog.batch.json/yaml`。
6. `collection item import-dir` 复用批量配置，可把图片/视频文件夹发布为合集。
7. 批量创建按 20 个一批；含 `authExcludedItems` 的 item 自动逐个创建。
8. 合集目录草稿项读取已分页。
9. 主题/插件/软件库发布时目录压缩为 zip。
10. 视频封面通过 `version.videoCover` / `version set --video-cover` 承接。

## 8. 关键边界

| 边界 | 结论 |
|---|---|
| 环境 | 默认 production；联调/测试显式 `--env dev`；auth 和 state 都绑定环境 |
| 登录 | 保存 token/authorization/cookie/userId/username/environment；敏感值加密；dev 后续接口依赖 Cookie |
| 登出 | 只清 auth，不删除 manifest/state |
| status | 只读诊断命令，不改本地文件、不写平台 |
| pull | 默认只刷新 state；只有 `--apply-listing` 写 manifest |
| JSON/错误码 | 脚本用 `--json`；失败包含 code/message/hint |
| **独立资源**发版表单草稿 | `draft push/pull/discard`，同步版本号、文件信息、版本说明、依赖、属性、视频封面 |
| 合集发版表单草稿 | `draft push/pull/discard --collection`，同步合集发版表单，不维护目录 |
| 合集目录草稿 | `collection item *` 维护，`collection publish` 合并；`draft discard --collection` 不删除目录草稿 |
| creator Step4 软上架 | Console `step4Effects` 仅 `update status:1`；CLI **不对齐**，须严格 `online`（见 [§0.5.5](./CLI脚手架设计.md#055-console-与-cli-的明确差异有源码不是猜测)） |
| Console 自动存草稿 | 300ms 防抖 `saveVersionsDraft`；CLI 须显式 `draft push` |
| 旧配置 | 不恢复 `freelog.resource.config.*` 等旧配置 |
| 修改已有策略正文/名称 | 不做，新增策略后切换启用，或回 Console |
| 付费授权 | 不做 CLI 支付流程 |
| 视频转码 | 不做，CLI 上传原文件 |
| 浏览器项目 | 不改 |
| Console 对齐 | 对齐平台最终状态，不对齐 UI 步骤 |
| init 路由 | citty 子命令与 `init <dir>` 冲突；`theme\|widget\|package` 用手动路由，不用 citty subCommands |

## 9. 最近验证

### 9.1 本地自动化

```bash
cd packages/cli
pnpm verify              # 单元 + typecheck + compat + build + pack
pnpm verify:scenarios    # 方案 A 场景 + dev 账号 + 端到端 publish
```

**`pnpm verify`（2026-08-06）：** 27 个测试文件、**128** 个测试通过。

**`pnpm verify:scenarios --env dev`（2026-08-06，账号 `freelog-test11`）：42/42 通过**

| 场景 | 内容 | 说明 |
|---|---|---|
| S1 | `initFiveChoice` 单元 | 五选一常量/meta |
| S2 | 命令面 | `init` / `collection init-from-folder` / `resource import-dir` |
| S3 | dev 登录 + API | `status`、`type pick theme→RT001`、`package→RT029`、`type info RT001` |
| S4 | 非交互 `init theme` | 本地脚手架 + manifest 与 RT001 一致 |
| S5 | 维护期入口 | `version` / `draft` / `update` help |
| S6 | 单图片首发 + 维护 | `create`→`publish`→`policy`→`online`；`update`/`offline`/bump/draft |
| S7 | 主题 zip 发版 | `my-freelog-project` bump 发版 + `version edit` |
| S8–S9 | 插件 | `init widget`、RT002 定稿 |
| **S10** | **单视频链路** | RT006003：原文件上传 + `--video-cover` + publish + online |
| **S11** | **图片合集** | RT003006 壳 + RT005001 条目 import-dir → publish → policy → online |
| **S12** | **视频合集** | RT003006 壳 + RT006003 视频条目 → 同上 |
| **S13** | **批量独立资源** | `resource import-dir` 零配置 2 图 → 2 个独立资源 |

### 9.2 类型定稿（dev API 快照，非硬编码）

| 展示名 | dev code | scaffold |
|---|---|---|
| 主题 | RT001 | runtime |
| 插件 | RT002 | runtime |
| 前端库 | RT029 | package |

复验：`type pick --category theme|widget|package --json --env dev`。详见 [CLI脚手架设计 §0.5.3](./CLI脚手架设计.md#053-dev--test-实测-resourcetypecode2026-08-06可复验)。

**代码债：** 无。

### 9.3 对齐状态

**唯一清单：** [CLI数据操作与Console对照 §0–§2](./CLI数据操作与Console对照.md) — 81 项（38✅ / 12⚠️ / 5❌）→ **未对齐**。代码任务：对照表 §3 P0 PropertyParser。

## 10. dev 冒烟记录

### 10.1 本轮自动化已覆盖（2026-08-06，`pnpm verify:scenarios` 42/42）

| 链路 | 覆盖命令 | 结果 |
|---|---|---|
| 登录 / 类型 API | `login`、`type pick/info` | ✅ S3、S9 |
| init 脚手架 | `init theme/widget`、none+图片/视频类型 | ✅ S4、S8、S10 |
| 单图片首发 + 维护 | S6 全链 + draft | ✅ |
| 主题 zip 发版 | `publish --bump`、`version edit` | ✅ S7 |
| **单视频** | `version set --file mp4 --video-cover` → publish → online | ✅ **S10** |
| **图片合集** | collection create → item import-dir → publish → policy → online | ✅ **S11** |
| **视频合集** | 同上，条目为 mp4（RT006003） | ✅ **S12** |
| **批量独立资源** | `resource import-dir` 多图 → 多个 resourceId | ✅ **S13** |

dev 账号 `freelog-test11` 可随意创建/发布/更新；E2E 每次用唯一文件内容避免 sha1 冲突。

**策略文件差异（dev 实测）：**

| 资源 | policyText 语法 |
|---|---|
| 单品（图片/视频/主题） | `for public` + `initial[active]:`（见 `policy.free.json` 示例） |
| 合集壳（RT003006） | `FOR PUBLIC` + `Initial:`（**不是** `Initial Permit:`） |

### 10.2 什么是「视频链路」？

指 **单个视频资源** 或 **视频合集** 在 CLI 上的完整发行路径（与 Console 业务结果对齐，不做转码）：

**单视频（S10）：**

```text
init（RT006003 短视频）→ create → version set --file clip.mp4 [--video-cover cover.png]
  → publish → policy apply → online
```

**视频合集（S12）：**

```text
init collection（RT003006）→ collection create
  → collection item import-dir ./clips --resource-type RT006003
  → collection publish → collection policy apply → online
```

要点：

1. CLI **上传原 mp4**，不压缩、不转码（与 Console 一致）。
2. 视频**版本封面**用 `version set --video-cover`（listing 封面仍用 `update --cover`）。
3. 合集 = 每个视频先变成**独立子资源**（有自己的版本+策略+上架），再写入合集目录草稿，最后 `collection publish` 合并为合集版本。
4. 格式/大小限制由平台资源类型配置决定；详情页播放需在 Console/站点侧验证。

### 10.3 历史手动冒烟（未每轮自动跑）

1. `collection init-from-folder` 交互向导（需 TTY；自动化用 S11/S12 分步命令等价覆盖）。
2. `init package` + namespace 前端库发版。
3. `pull --apply-listing` Console 协作冲突处理。

注意：视频实测主要证明 CLI 上传、发版、策略、上下架链路；真实视频素材仍需专项验证平台格式/大小限制和资源详情页访问。CLI 不负责转码。

## 11. 常见坑

| 现象 | 处理 |
|---|---|
| dev 登录后资源接口 401 | 确认 login 保存并注入 Cookie，不只依赖 tokenSn |
| `init mydir` 报 Unknown command | 已修复：勿用 citty subCommands，改用手动 preset 路由 |
| 叶子类型 create 报「自定义资源类型」 | 标准 `RT*` 类型 create 不传 manifest 展示名；见 `resolveCreateApiResourceTypeName` |
| 合集 policy apply 报 FOR/Initial 语法错 | 合集壳用 `FOR PUBLIC` + `Initial:\n\tterminate`，单品用 `for public` 语法 |
| `--from-file policy.free.json` 找不到 | 已修复：相对路径按 `--cwd` 解析 |
| `online` 失败 | 先确认 latestVersion 和启用策略 |
| `publish` 版本冲突 / 重复文件 | 升版本或改文件内容（平台拒重复 fileSha1）；可用 `publish --bump` |
| `collection item import-dir` 失败 | 确认子资源有版本、启用策略、可上架 |
| `policy set` 写成 `--status` | 当前语法是 `policy set <policyId> <0|1>` |
| Console 已有资源不能 create | `bind <resourceId>` |
| import-dir 部分失败 | retry.batch.json 只含失败项，勿整目录重跑 |
| 同目录换环境失败 | login → 删 state → bind |
| 模板 runtime 0.4 失败 | 当前主推 runtime 0.5 |

## 12. 接手原则

1. 改资源业务前先更新 `CLI字段账本.md`；改 Console/API/CLI 数据操作对照时同步 `CLI数据操作与Console对照.md`。
2. 改模块分层、命令拓扑、文件处理、批量/合集实现策略前先更新 `CLI脚手架设计.md`。
3. 改命令和使用流程后同步 `CLI使用说明与Console差异.md`。
4. 改用户场景、异常问题、测试维度后同步 `用户场景与问题清单.md`。
5. 改验收口径后同步 `产品与测试简明说明.md`。
6. 改环境、账号、路径、验证状态后同步本文。
7. 所有完成声明必须有验证证据（`pnpm verify` / `pnpm verify:scenarios` 输出或 dev 实测记录）。
