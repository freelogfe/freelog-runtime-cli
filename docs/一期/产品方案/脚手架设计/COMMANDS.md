# 命令速查

二进制 `freelog-cli`。写操作：`--env` `--yes` `--cwd` `--json`。省略 `--env` = prod。

## 账号 · 工程

| 命令 | 说明 |
|------|------|
| `login` / `logout` | [01-账号](./ARCHITECTURE/01-账号.md) |
| `init` / `template list` / `type *` | [03-init](./ARCHITECTURE/03-init.md) |
| `bind <id\|username/name> [--file]` | [04-bind](./ARCHITECTURE/04-bind.md) |

## 单资源

| 命令 | 说明 |
|------|------|
| `create --title --type --name [--file]` | [F0](./PHASE/01-F0-单资源发行.md) |
| `publish` / `--reuse-version` | 上传后保持会话，反复改属性/配置/依赖/描述，提交才发行。`--yes` 不进会话 |
| `version set --file` | 只改 `N.json.filePath` |
| `dep list --tree` | 读平台已发版依赖树 |
| `dep auth` / `init-auth-map` | 已发版免费补签。添加 / 管理依赖只在 `publish` 菜单 5 / 6 |
| `version show` / `version edit --sync-properties` | 已发版属性 value |
| `update` / `policy template *` / `online` / `offline` | [共用管理](./ARCHITECTURE/05-共用管理.md) |

## 合集

| 命令 | 说明 |
|------|------|
| `collection create` | [C0](./PHASE/03-C0-合集创建.md) |
| `collection item add <resourceId\|username/name>` | 只认 id/标识 |
| `collection publish` | merge 目录草稿 |
| `collection update` / `collection policy *` / `online` | [共用管理](./ARCHITECTURE/05-共用管理.md) |
| `item remove\|update\|reorder` / `collect-rules` / `properties sync` | [合集维护](./PHASE/05-合集维护.md) |

`status` 只打印线上现状；合集无 `--file` 时列出草稿 `itemId`。

禁止：`update --status`；`item add` 传本地路径；`version set --reuse-version`；合集上用资源 `policy`；`pull` 当接入；`dep add` 预写本地。
