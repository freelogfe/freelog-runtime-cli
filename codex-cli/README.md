# Freelog Codex CLI

本项目是快捷版 Freelog CLI，实现登录、发布、依赖管理、同步、初始化等常用能力，输出均为中文提示。

## 功能速览
- 账号体系：支持全局 / 工作空间登录、登出、查看状态。
- 发布流程：一次命令完成打包、上传、发布，可选择草稿或正式版本。
- 依赖管理：`add/change/remove/update` 以及 `dep list/dep sync` 均已实现。
- 信息同步：`sync` 可按模块刷新作品信息、依赖、属性、本地配置。
- 构建分析：`analyze` 支持目录或单文件，展示体积与类型。
- 项目初始化：`init` 对接模板目录，可列出模板或直接创建项目。

## 项目结构
```
bin/                    CLI 入口
src/
  cli/                  参数解析、输出、交互
  commands/             登录、发布、依赖、同步、分析、初始化等命令
  services/             调用远端接口和本地文件的核心逻辑
  config/               freelog.json 默认模板
  constants/            目录常量
  utils/                通用工具（文件、语义化版本、选项解析等）
```

## 常用命令
| 命令 | 说明 | 示例 |
|------|------|------|
| `init [name]` | 初始化项目 | `freelog-cli init my-app -t vite-vue` |
| `login` | 用户登录（支持 `-g` 全局） | `freelog-cli login -g` |
| `logout` | 退出登录 | `freelog-cli logout --workspace` |
| `login status` | 查看登录状态 | `freelog-cli login status` |
| `publish` | 发布草稿或正式版本 | `freelog-cli publish --patch -m "修复问题"` |
| `add/change/remove/update` | 依赖增删改查 | `freelog-cli add data-service@latest` |
| `dep list` / `dep sync` | 依赖查看 / 同步 | `freelog-cli dep sync --force` |
| `sync` | 同步作品信息 | `freelog-cli sync my-work@latest` |
| `analyze` | 分析构建产物 | `freelog-cli analyze -f ./dist/bundle.zip` |

隐藏参数：执行时附带 `-t` 会自动切换至 `https://api.testfreelog.com`，否则默认使用正式环境。该参数不会出现在帮助信息中。

## 本地运行
```bash
node ./codex-cli/bin/freelog-cli.js --help
node --test ./codex-cli
```
