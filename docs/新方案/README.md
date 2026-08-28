# Freelog Runtime CLI 文档入口

最后更新：2026-08-28

本目录只保存当前开发版本的有效文档。**唯一产品设计入口是仓库根目录 [DESIGN.md](../../DESIGN.md)。**

## 阅读路径

| 你要做什么 | 只需阅读 |
|---|---|
| 新会话接手项目 | [CLI交接文档](./CLI交接文档.md) |
| 理解产品 | [DESIGN.md](../../DESIGN.md) |
| **一期：改 UX / 实现 / 门禁（consolidated）** | **[一期/02-CLI体验拓扑设计](./一期/02-CLI体验拓扑设计.md)** → [一期/场景](./一期/场景/README.md) → [一期/03-多视角设计审查](./一期/03-多视角设计审查.md) → [一期/01-产品与实现规格](./一期/01-产品与实现规格.md) · [一期/README](./一期/README.md) |
| 理解源码目录、调用链和维护边界 | [CLI 源码架构](../../packages/cli/src/ARCHITECTURE.md) |
| 修改 manifest/state/API 字段 | [CLI字段账本](./开发/CLI字段账本.md) |
| 修改命令、服务、模板或打包 | [CLI脚手架设计](./开发/CLI脚手架设计.md)；**TTY 交互与字段约束** → [CLI交互与字段约束](./开发/CLI交互与字段约束.md)；改共享 flag / `--help` 时先改 [cliArgs.ts](../../packages/cli/src/core/cliArgs.ts)（§4.1） |
| 维护工程/会话双模式 | [CLI双模式设计](./开发/CLI双模式设计.md)（当前模式契约）→ [CLI双模式实现设计](./开发/CLI双模式实现设计.md)（实现参考） |
| Auth × Store 四模式（00/01/10/11） | [CLI双维持久化设计](./开发/CLI双维持久化设计.md) · [交互会话与多账号工作区](./使用/交互会话与多账号工作区.md) |
| 核对 Console 流程和表单限制 | [Console 对齐入口](./对齐/README.md)（源码路径先查 [Console源码证据索引](./对齐/Console源码证据索引.md)） |
| 使用 CLI | [使用文档目录](./使用/README.md)（[快速上手](./使用/快速上手.md) → [选型指南](./使用/普通用户简明手册.md) → 分册） |
| 开始手动测试 | [手动测试](./验证/手动测试.md) · [场景目录](./验证/场景目录.md) · [探索测试清单](./验证/探索测试清单.md)（含 **L3-H 交互壳**、P6、RSS） |
| 查看一次真实环境结果 | [2026-08-18 dev](./验证/reports/2026-08-18-dev.md) · [2026-08-17 dev](./验证/reports/2026-08-17-dev.md) · [2026-08-14 dev](./验证/reports/2026-08-14-dev.md) · [2026-08-13 prod 流程](./验证/reports/2026-08-13-prod.md) |

## 当前产品主线

```text
选择环境并登录（工作区 login 或 login -g 全局）
  → init（模板或已有目录）
  → create / bind
  → 编辑 freelog.manifest.json
  → validate / diff
  → build（工程型资源）
  → publish / collection publish / resource import-dir
  → policy
  → online
  → pull / draft / update / 新版本维护
```

Console UI 中的必填、候选过滤、按钮禁用、确认弹窗和状态门禁，在 CLI 中必须变成字段契约、preflight、确认参数、明确错误码和结构化输出。模板、构建、确定性压缩、批量恢复和 CI 协议属于 CLI 原生能力。

## 文档边界

```text
新方案/
  README.md
  一期/       资源发行 consolidated 设计包（体验拓扑 / 场景分册 / 产品实现规格）
  二期/       节点/市场/展品 设计包
  审计/       一期深度审计报告
  开发/       字段与技术实现
  对齐/       Console 源码事实、字段规则、能力矩阵和调用拓扑
  使用/       当前命令手册（[README](./使用/README.md) 为站点入口，含 sidebar 元数据）
  验证/       手动测试入口与日期化运行报告
```

- 只保留一份随当前实现更新的 [CLI交接文档](./CLI交接文档.md)，不保留并行交接快照、archive、旧方案或兼容入口页。
- 不在产品文档复制某次测试总数；运行数字只写入日期化报告。
- 账号密码、token、cookie、authorization 和密钥不得进入仓库或文档；dev/test 联调凭据只允许
  通过受保护环境变量或已被 `.gitignore` 排除的本地凭据文件提供。
- 修改产品范围只改 `DESIGN.md`；修改字段只改字段账本；Console 变化先更新对齐证据。当前代码只作为实现现状与验证证据，不能反向定义产品契约。
- `使用/` 是可独立复制到官方文档站的公开文档集合：只允许链接该目录内页面或公开网址，不得出现仓库源码路径、内部验证编号、测试账号/密码、dev/test 内部域名或未验收能力。
- 当前 production 尚未开放，官方示例统一使用 `--env <env>` 表示已获授权的环境，不暗示 production 可用。当前暂停验收的 `package` 预设不进入公开使用文档。
