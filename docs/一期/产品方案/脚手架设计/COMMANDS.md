# 命令速查

二进制 `freelog-cli`。写操作：`--env` `--yes` `--cwd` `--json`。省略 `--env` = prod。  
合集命令本期不做，见 [archive 合集备份](../../archive/2026-09-04-脚手架设计-合集备份/README.md)。  
本文只指路，交互真源在右边的文档。

## 账号 · 工程

| 命令 | 说明 |
|------|------|
| `login` / `logout` | [01-账号](./ARCHITECTURE/01-账号.md) |
| `init` / `template list` / `type *` | [03-init](./ARCHITECTURE/03-init.md) |
| `bind <id\|username/name> [--file]` | [04-bind](./ARCHITECTURE/04-bind.md) |

## 创建

| 命令 | 说明 |
|------|------|
| `create --title --type --name [--file]` | [Step1](./PHASE/单资源/创建/01-Step1-创建授权条目.md) |
| `create-version` | 首版，无上一版。[发行版本](./PHASE/单资源/创建/02-Step2-发行版本.md)；`--reset` 丢掉工作稿 |
| `update-version` | 基于上一版发新号。[更新版本](./PHASE/单资源/更新版本/01-更新版本.md)；`--reuse-version` 回显源；`--file` 换文件；`--reset` 重拉 |
| `policy template apply` | [Step3](./PHASE/单资源/创建/03-Step3-添加授权策略.md) |
| `update`（listing） | [Step4](./PHASE/单资源/创建/04-Step4-完善资源信息.md) |
| `online` | [上下架](./PHASE/单资源/管理/05-上下架.md) |

## 管理

| 命令 | 说明 |
|------|------|
| `version show` / `version show --local` | 看线上已发号 / 看本地工作稿。`--local` 不写盘、不拉表单 |
| `version description --version <已发版>` | 只改线上描述，见 [版本信息](./PHASE/单资源/管理/01-版本信息.md) |
| `version set --file` | 只改 `N.json.filePath` |
| `update` / `policy *` | [资源信息](./PHASE/单资源/管理/02-资源信息.md) · [策略](./PHASE/单资源/管理/03-授权策略.md) |
| `dep list --tree` / `dep auth` / `init-auth-map` | [依赖补签](./PHASE/单资源/管理/04-依赖及其授权.md) |
| `online` / `offline` / `validate --for online` | [上下架](./PHASE/单资源/管理/05-上下架.md) |

`status` 只打印线上现状。

禁止：`publish` 当发行；顶层 `release`；`update --status`；`version set --reuse-version`；`pull` 当接入；`dep add`；合集命令。
