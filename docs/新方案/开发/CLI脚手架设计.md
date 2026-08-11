# Freelog Runtime CLI 技术架构

> 文档角色：技术实现说明。产品目标与业务规则只由仓库根目录 [DESIGN.md](../../../DESIGN.md) 定义；字段只由 [CLI字段账本](./CLI字段账本.md) 定义；Console 事实只由 [对齐目录](../对齐/README.md) 记录。

最后更新：2026-08-11

## 1. 架构目标

CLI 将同一套 Freelog 业务规则提供给三种表面：交互终端、声明式 manifest、非交互自动化。技术架构必须保证：

1. 命令只处理参数、TTY 和输出，业务规则进入 service。
2. manifest 用户意图与 state 平台事实分离。
3. 平台写入在 service 入口统一执行环境、owner、同步和业务门禁。
4. Console UI 中的隐性约束转换为显式校验，不复制页面组件。
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
| `.freelog/reports/*` | CLI | 批量执行和恢复证据 | 批量 runner（目标契约） |
| `.freelog-auth`（工作区） | CLI | 目录树中的 token/cookie/authorization | login/logout；自 cwd 向上解析 |
| `.freelog-auth`（全局） | CLI | 用户主目录默认凭据 | login --global / logout -g |

规则：

- state 可以通过平台重新获取，不能成为用户配置入口。
- 普通 pull 不覆盖 manifest；`--apply-listing` 才采用平台展示字段。
- manifest/state 分别使用原子写；涉及二者的复合事务必须记录可恢复阶段。
- 凭据不得写入 manifest/state，不得提交 Git；工作区凭据位于目录树（`.freelog-auth`），全局凭据位于用户主目录。解析与写入规则见 [DESIGN.md](../../../DESIGN.md)「身份与凭据」与 [CLI字段账本](./CLI字段账本.md)。

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

## 5. Console 约束适配

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

## 9. 输出与错误

- 人类输出：consola + 稳定中文术语；失败给出原因和下一步。
- `--json`：目标是 DESIGN 定义的 versioned envelope。
- `--json-lines`：长任务事件流，stdout 只输出协议数据。
- debug：递归脱敏 token/password/cookie/authorization。
- exit code：`0` 成功；`1` 平台/网络；`2` 认证/owner；`3` 冲突；`4` 输入/门禁；`5` 依赖授权。

当前部分命令仍使用旧 success JSON，对 envelope 的迁移属于明确技术债；不得把目标协议描述为已经全面落地。

## 10. 批量恢复

批量执行复用单资源门禁，每项独立记录成功、失败和跳过。当前已有 SHA1 复用、NDJSON 进度和失败 retry 文件；正式产品目标是 DESIGN 中的 `.freelog/reports/<runId>.json`、`--resume` 与 `--retry` 协议。

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

## 12. 实现优先级

1. 完成所有写 service 的统一安全入口与 dry-run 无副作用。
2. 将 `artifactMode` 收敛为唯一判定并移除展示名兼容回退；统一 ignore 和确定性 zip 已落地。
3. 迁移统一 JSON/NDJSON schema。
4. 落地批量 report/resume/retry。
5. 为 manifest、batch 和机器输出增加机器 schema。
