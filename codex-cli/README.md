# Freelog Codex CLI

面向 `脚手架设计.md` 的落地实现，使用原生 Node.js + `fs-extra` + `semver`，在离线环境也能完整体验 Freelog CLI 的核心流程。所有命令提示、输出文案均为中文。

## 功能亮点
- **账号体系**：支持全局/工作空间登录、查看状态、退出，凭证按规范写入 `.freelog-cli` 目录。
- **配置管理**：自动生成并校验 `freelog.json`，保留依赖列表、属性、更新说明等核心字段。
- **作品发布**：对接 Freelog 正式接口，支持草稿/正式流程、语义化版本递增、版本说明与构建产物统计。
- **依赖命令**：实现 `add / change / remove / update` 以及 `dep list / dep sync`，内置离线资源库与策略选择。
- **信息同步**：`sync` 命令可按模块刷新作品信息、依赖、属性、本地配置与 changelog。
- **构建分析**：`analyze` 支持目录/单文件分析，输出文件结构和体积，可导出 JSON。
- **项目初始化**：`init` 命令与 `templates/` 同步，支持列出模板、交互式选择、强制覆盖。

## 目录结构
```
bin/                    命令行入口 (`freelog-cli`)
src/
  cli/                  参数解析、终端输出、交互式输入
  commands/             子命令实现（auth、publish、dep、sync、analyze、init）
  config/               freelog.json 默认模板
  constants/            路径等常量定义
  services/             领域服务（登录、发布、依赖、同步、分析、初始化）
  utils/                工具函数（文件、选项解析、语义化版本、输出表格等）
docs/
  architecture.md       架构说明（中文）
```

## 命令总览
| 命令 | 说明 | 常用参数 |
|------|------|----------|
| `init [name]` | 初始化新项目 | `--list` 查看模板，`-t` 指定模板，`-f` 强制覆盖 |
| `login` | 登录（全局/工作空间） | `-g` 全局登录，`--username/--password` 指定凭证 |
| `logout` | 退出登录 | `-g` 或 `--workspace` 指定范围 |
| `login status` | 查看登录状态 | 显示剩余天数、过期提示 |
| `publish` | 发布草稿/正式版本 | `--draft`、`--patch/--minor/--major`、`-m` 版本说明、`-f` 指定文件 |
| `add/change/remove/update` | 依赖管理 | `<资源>@<版本>` 语法，交互式选择策略 |
| `dep list` | 列出依赖 | `--remote` 查看模拟远端清单 |
| `dep sync` | 同步依赖 | `--force` 完全覆盖本地配置 |
| `sync` | 同步作品信息 | `--props/--config/--changelog/-a` 控制同步范围 |
| `analyze` | 构建产物分析 | `-f` 指定文件，`--format json` 输出 JSON，`-o` 导出文件 |

所有命令均支持 `--help` 查看详细用法。

## 本地数据位置
- 全局数据：`%USERPROFILE%/.freelog-cli`（Windows）或 `~/.freelog-cli`（macOS / Linux）。
- 工作空间数据：项目根目录下 `.freelog-cli/`。
- 日志目录：`logs/`（当前提供目录，占位以便后续拓展）。

## 开发/调试
```bash
# 查看帮助
node ./codex-cli/bin/freelog-cli.js --help

# 执行测试（Node.js 原生 test runner）
node --test ./codex-cli
```

## 远端能力说明
`services/remote-service.js` 默认调用 Freelog 接口，若不可达则回退到离线 mock 数据。
