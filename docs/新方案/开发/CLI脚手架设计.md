# Freelog Runtime CLI 技术架构

> 文档角色：技术实现说明。产品目标与业务规则只由仓库根目录 [DESIGN.md](../../../DESIGN.md) 定义；字段只由 [CLI字段账本](./CLI字段账本.md) 定义；Console 事实只由 [对齐目录](../对齐/README.md) 记录。

最后更新：2026-08-18

## 1. 架构目标

CLI 将同一套 Freelog 业务规则提供给三种表面：交互终端、声明式 manifest、非交互自动化；并支持 **工程模式** 与 **会话模式** 两种 Store（见 [CLI双模式设计](./CLI双模式设计.md)）。技术架构必须保证：

1. 命令只处理参数、TTY 和输出，业务规则进入 service。
2. manifest 用户意图与 state 平台事实分离。
3. 平台写入在 service 入口统一执行环境、owner、同步和业务门禁。
4. Console UI 中的隐性约束转换为显式校验，不复制页面组件；**TTY 交互须在输入前披露约束**（见 [CLI交互与字段约束](./CLI交互与字段约束.md)）。
5. 模板、构建产物、压缩和批量恢复作为独立管线，不混进平台 DTO。

源码目录和依赖方向的权威说明见 [packages/cli/src/ARCHITECTURE.md](../../../packages/cli/src/ARCHITECTURE.md)。

## 2. 运行时分层

```text
bin/index
  → commands：参数 / TTY / 输出
  → services：用例编排与业务门禁
      → adapters：本地 DTO ↔ 平台 DTO、fingerprint
      → config/project：manifest / state / config
      → platform：tools-lib 与 API envelope
  → core：env / auth / error / tty / command infrastructure
```

强制方向由 `tests/architectureBoundary.test.ts` 检查。除 `login` 建立认证上下文外，command 不得直接导入 platform。

## 3. 本地存储

| 文件 | owner | 内容 | 写入者 |
|---|---|---|---|
| `freelog.manifest.json` | 用户 | 资源/合集长期意图 | init、version、dep、policy 等本地意图命令 |
| `.freelog/state.json` | CLI | 平台 ID、owner、状态、版本、策略、同步基线 | create/bind/pull/publish 等平台流程 |
| `.freelog/config.json` | 用户/CLI | 项目默认环境等 CLI 偏好 | config 命令 |
| `.freelog/reports/*` | CLI | 批量与 Studio 执行、恢复和人工对账证据 | batch / Studio runner |
| `.freelog-auth`（工作区） | CLI | 目录树中的 token/cookie/authorization（**落盘加密**） | login/logout；自 cwd 向上解析 |
| `.freelog-auth`（全局） | CLI | 用户主目录默认凭据（**落盘加密**） | login --global / logout -g |

规则：

- state 可以通过平台重新获取，不能成为用户配置入口。
- 普通 pull 不覆盖 manifest；`--apply-listing` 才采用平台展示字段。
- manifest/state 分别使用原子写；涉及二者的复合事务必须记录可恢复阶段。
- 凭据不得写入 manifest/state，不得提交 Git；工作区凭据位于目录树（`.freelog-auth`），全局凭据位于用户主目录。**`token` / `authorization` / `cookie` 写入加密、读取解密**（DESIGN「本地加密」）。解析与写入规则见 [DESIGN.md](../../../DESIGN.md)「身份与凭据」与 [CLI字段账本](./CLI字段账本.md)。

完整字段见 [CLI字段账本](./CLI字段账本.md)，本文不复制 JSON schema。

## 4. 命令执行模板

平台写命令遵循统一顺序：

```text
解析参数
  → applyWriteCommandFlags（含交互式写操作前的当前登录提示）
  → resolveCurrentAuth(cwd)：cwd 向上找 .freelog-auth → 回退全局
  → 加载工程和身份
  → service 入口环境保护
  → owner 校验
  → 同步/冲突检查
  → 业务 preflight
  → 生成执行计划或 dry-run 结果
  → 平台写入
  → 本地 state 回写
  → 人类或机器输出
```

读命令使用 `applyCommandFlags`。只修改 manifest 的 L1 命令可以不要求平台登录，但必须明确报告修改的本地文件。

### 4.1 命令参数与 `--help`（`cliArgs.ts`）

citty 的 flag **名称、类型与 `--help` description** 以代码模块 [`packages/cli/src/core/cliArgs.ts`](../../../packages/cli/src/core/cliArgs.ts) 为真源；用户面向的全局参数语义见 [全局参数与登录](../使用/全局参数与登录.md)（表格与 `cliArgs` 一致，不重复逐 flag）。

| 面 | 路径 / 入口 |
|---|---|
| 代码真源 | `packages/cli/src/core/cliArgs.ts` |
| 命令挂载 | `packages/cli/src/commands/**/*.ts`（`args: { …专有 flag, …cliWriteCommandArgs }`） |
| 根命令 OPTIONS | `packages/cli/src/bin/index.ts` → `mainGlobalArgs` |
| 合集共享 | `packages/cli/src/commands/collection/common.ts` → `collectionCommonArgs` / `collectionEnvArgs` |
| Shell 补全 | `packages/cli/src/core/cliCatalog.ts` 的 `global_flags`（须覆盖 `mainGlobalArgs` 全部 flag） |
| 运行时验证 | `freelog-cli --help`、`freelog-cli <cmd> --help` |

**预组合 export（按场景选用，勿在 command 内重复写 `cwd`/`env`/`json`）：**

| export | 含 `--yes` | 含 `--no-auto-pull` | 典型命令 |
|---|---|---|---|
| `cliReadCommandArgs` | — | — | `pull`、`status`、`validate`、`type *`、`diff` |
| `cliSyncWriteArgs` | — | ✓ | `dep add/remove/update/list`（工程模式改 manifest；会话模式支持 `--resource-id` / `--export-project`） |
| `cliWriteCommandArgs` | ✓ | ✓ | `publish`、`online`、`version set`、`collection *` 写操作 |
| `mainGlobalArgs` | ✓ | ✓ | 根命令 `freelog-cli --help` OPTIONS |
| `cliJsonLinesArg` | — | — | `resource import-dir`、`collection item import-dir`（与 write/read 组合 spread） |

原子 export：`cliEnvArgs`、`cliOutputArgs`（含 `--lang`）、`cliConfirmArgs`、`cliCwdArg`、`cliNoAutoPullArg`、`cliSessionStoreArgs`、`cliReuseArgs`。`cliSyncWriteArgs` 只组合 Store 会话参数，不向 `dep *` 暴露无关的 reuse 参数；`cliWriteCommandArgs` 再组合确认与完整发布参数。仅在需要局部组合或覆盖 description 时直接使用原子 export。

**新增或修改参数时的维护顺序：**

1. 全局或跨命令共享 flag → 改 `cliArgs.ts`，再在相关 command 中 `...spread`。
2. 单命令专有 flag → 写在对应 `commands/*.ts`，**必须**带 `description`（无 description 的 flag 视为 help 未完成）。
3. 若影响用户可见全局语义 → 同步 [全局参数与登录](../使用/全局参数与登录.md) 全局参数表。
4. 若新增根级 flag → 同步 `cliCatalog.ts` 的 bash/zsh `global_flags`。
5. 本地验证：`pnpm build` 后执行 `freelog-cli --help` 与受影响子命令 `--help`。

**已知限制：** `init theme|widget|package <dir>` 由 `init.ts` 手动路由（citty 首个 positional 与子命令名冲突），无独立子命令 help；用法写在 `init --help` 的 `meta.description` 中。`meta` 和 `cover` 都是 dev parity 工具，只能在 `FREELOG_DEV=1` 时挂载，不得进入公开 `--help` 或用户手册。调用这些工具的验证脚本必须为其子 CLI 显式传入该变量，不能依赖测试者的终端全局环境，也不能因此让公开命令面出现研发命令。

### 4.2 TTY 交互与字段约束（`@clack/prompts`）

- **规格真源：** [CLI交互与字段约束](./CLI交互与字段约束.md)（逐步流程 + 输入前 hint + validate 同源要求）。
- **Console 字段事实：** [Console表单字段与交互规则](../对齐/Console表单字段与交互规则.md) `FORM-*`；不得在本层重复发明约束。
- **代码入口（当前）：** `services/init/prompts.ts`、`init/picker.ts`、`batchImportWizard.ts`、`collectionFolderWizard.ts`、`commands/login.ts`；确认类见 `online.ts`、`draft.ts`。
- **实现真源：** `services/shared/fieldConstraints.ts` 包装 `validation.ts` / `resourceName.ts`。
- **维护顺序：** 先改 Console 表单账本 → 改 CLI交互与字段约束 §3/§4 → 再改 prompt / `--help` → 单测 + `verify:console-forms`。

示例：

```typescript
import { cliWriteCommandArgs } from '../core/cliArgs.js';

export const publishCommand = defineCommand({
  args: {
    'dry-run': { type: 'boolean', description: '解析属性并输出 createVersion 请求体，不上传/不写平台' },
    bump: { type: 'boolean', description: '基于平台 latestVersion 自动升 patch 再发行' },
    ...cliWriteCommandArgs,
  },
  // ...
});
```


Console 是业务证据，不是命令树模板：

| Console 机制 | CLI 实现位置 |
|---|---|
| 类型下拉、候选过滤 | `typeService` / `resourceTypeCapabilities` |
| 必填与格式控件 | `validation`、schema、publish guards |
| 按钮禁用 | service preflight + `CliError` |
| 账号上下文 | auth + owner guard |
| 自动草稿 | 显式 `draft push/pull/discard` + fingerprint |
| 上架按钮 | `onlineGates`；正式版本 + 至少一条启用策略 |
| 合集拖拽排序 | `collection item reorder` + 目录草稿 fingerprint |
| 属性解析进度 | fileProperty service 的 REST/SSE 适配 |

逐项业务契约见 [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md)。

## 6. 发行物管线

```text
manifest.filePath
  → 解析 resource type capability
  → artifactMode=file：校验文件 → SHA1
  → artifactMode=directory-zip：校验目录 → ignore → deterministic zip → SHA1
  → 类型格式/大小门禁
  → 存储存在性检查与上传
  → 属性解析
  → createVersion payload
```

当前实现状态必须和目标契约分开：

| 能力 | 当前代码 | 产品目标 |
|---|---|---|
| 单文件校验、SHA1、上传 | 已有 | 保持 |
| 目录临时 zip | 已有 | 改为 `artifactMode` 唯一判定 |
| dry-run 不生成 zip/不上传 | 已有回归测试 | 保持零持久副作用 |
| ignore 统一语义 | 扫描与压缩共用 DESIGN v1 matcher；强制排除 state/auth/VCS/cache；反选明确失败 | 保持，并扩充跨平台路径测试 |
| zip 字节确定性 | 固定排序、时间戳、权限和 POSIX 路径；已有字节级回归测试 | 保持 |

未完成目标不能写成“已支持”。

## 7. 模板与构建

- `init` 根据 scaffold 创建本地工程和 manifest，不创建平台资源。
- 模板使用精确 npmName/version 与 runtime 兼容矩阵。
- 模板包必须提供 manifest；缺失时失败。
- `template-compat.json` 是当前受支持模板的唯一清单；模板从仓库移除时必须同步退出兼容矩阵、
  CLI 选项和校验门禁，不能向用户暴露不可获取的脚手架。当前运行时模板为 Vite React/Vue
  的 JavaScript/TypeScript 四套，包模板为 JavaScript/React/Vue 三套。
- package 模板必须解析到可创建的叶子类型：`package-js` 对应「JS工具包」，
  `package-react` / `package-vue` 对应「组件库」。只按展示名在当前环境类型树中解析 code，
  不把 `RT029` 等环境值写死；父节点、缺失映射和多候选均在 init 阶段失败。用户显式传入
  `--resource-type` 时优先使用该 code，并执行同一叶子校验。Console 证据是
  `FResourceTypeInput4` 搜索请求固定 `isTerminate: true`。
- `type pick --category package --json` 不携带模板上下文；当平台存在多个 package 叶子时必须以
  code 4 拒绝，不能猜测「JS工具包」或「组件库」。只有 `init package --template package-*`、显式
  `--resource-type`，或 TTY 的逐级选择才能完成类型定稿。
- 模板生成的 `package.json` 遵循最小依赖：浏览器运行时依赖与构建/类型依赖分组；未使用包
  必须删除，主题/插件模板不得引入服务端框架依赖。
- `publish` 只消费已有产物，不执行构建。
- `release --build-cmd` 显式编排 validate → build → publish；dry-run 只报告计划。
- CLI 不猜测 package manager 或默认 build script。

## 8. 草稿与同步

三类远端对象分别维护同步基线：

1. 资源版本表单草稿；
2. 合集版本表单草稿；
3. 合集目录草稿。

资源/合集表单使用 canonical fingerprint 和远端 updateDate 判断 aligned、local-dirty、remote-dirty、both-dirty。both-dirty 默认失败；force 只在用户明确方向后使用。合集目录是否 merge 由已发布 fingerprint 与当前有序条目比较决定。

dry-run 使用只读 owner/sync 路径：发现 listing drift 时停止并提示 pull，不允许自动回写 state。

普通远端写采用以下统一恢复语义：

- Store 对调用方读取基线、当前快照和待写 patch 做三方字段合并；并发无关字段保留，同字段双写 code 3。
- 资源/合集 create 只有在授权标识、owner、typeCode 和 title 均严格匹配时才把既有平台对象判为上次中断并恢复绑定。
- publish 只有在同 version 且远端与本地的完整不可变发布意图（文件 SHA1/filename、说明、封面、依赖、授权排除、属性等）全部一致时补写本地版本事实；任一字段不同都视为冲突，永不覆盖已发布版本。
- 幂等 PATCH/草稿/RSS/collect-rules/目录项在重试前后读取平台对账；多阶段部分成功返回 `REMOTE_WRITE_PARTIAL`，使用相同参数安全重试。
- 请求和写后对账都失败时返回 `REMOTE_OUTCOME_UNKNOWN`。该状态表示 CLI 无法判断平台是否应用，不能改写为普通失败或自动换参数重试。

## 9. 输出与错误

- 人类输出：consola + 稳定中文术语；失败给出原因和下一步。
- `--json`：DESIGN 定义的 versioned envelope（`schemaVersion` / `ok` / `command` / `data` | `error` / `meta`）；机器结构以仓库 schema 和当前自动化门禁为准，运行结果只进入日期化报告。
- `--json-lines`：长任务事件流，stdout 只输出协议数据。
- debug：递归脱敏 token/password/cookie/authorization。
- exit code：`0` 成功；`1` 平台/网络；`2` 认证/owner；`3` 冲突；`4` 输入/门禁；`5` 依赖授权。

人类可读模式（如 `dep list --tree`）仍可直接 pretty-print JSON，不走 envelope。

机器契约随 npm 包发布在 `schemas/`，并通过 `@freelog-cli/cli2/schemas/*` 导出：

- `freelog-manifest.schema.json`
- `batch-config.schema.json`
- `batch-report.schema.json`
- `json-envelope.schema.json`
- `batch-progress.schema.json`

TypeScript 类型、运行时解析和这些 schema 必须由一致性测试共同约束；技术文档只解释语义，不再复制另一份可执行字段定义。

## 10. 批量恢复

批量执行复用单资源门禁，每项独立记录成功、失败和跳过。已实现 SHA1 复用、NDJSON 进度、`.freelog/reports/<runId>.json` 正式报告、`--resume` / `--retry` 协议（ENV：S14/S14b）。

平台成功、本地回写失败必须进入 `remote_succeeded_local_pending`，恢复时先查平台，不能重复创建。

## 11. 验证分层

| 层 | 入口 | 作用 |
|---|---|---|
| 单元/静态 | `pnpm test`、`pnpm typecheck` | 纯逻辑、门禁、架构边界 |
| 兼容/构建/打包 | `check:compat`、`build`、`pack:dry-run` | 模板矩阵与发布产物 |
| 契约 | `verify:parity` | 选定 payload 与 Console/API 契约 |
| dev 场景 | `verify:scenarios` | 指定账号和环境的真实链路 |
| 人工 | 场景手册 | UI 隐性约束和跨端体验 |

动态测试数量只进入日期化报告，不进入产品或技术规范。

## 12. 当前验收边界

- 静态实现、目标环境运行和 Console 契约是三种独立证据；技术架构文档不复制完成状态。
- RSS 专项受控邮箱、真实 frozen fixture 与 `handleData` Console 并排仍需独立环境记录。
- production 当前硬禁用；启用前必须重新确认环境矩阵和发布门禁。
- 普通远端写操作必须在平台成功而本地未确认时提供可恢复状态；不得仅抛出普通失败诱导重复写入。
