# 开发计划（一期 · 普通单资源）

产品真源只认 [脚手架设计](../脚手架设计/README.md)。本文只答：**代码放哪、按什么顺序写、写的时候不许临场改产品。**

可以开工。规格（四层、门禁、场景、tools-lib）已经够按切片实现。**不够的是现有 `packages/cli` 的文件分类**：它还按旧模型（`manifest`/`state`、`publish`、顶层 `dep`、session/studio、平台草稿）切。若在旧文件上改，每一行都要先判断「这是旧语义还是新规格」，写代码就会一直在想。

所以开发计划的第一份是 [00-文件分类](./00-文件分类.md)。第二份是 [01-实现顺序](./01-实现顺序.md)。按切片打开右边的规格，对着左边的文件写。不要一边写一边重新设计命令。

```
规格（不许改产品）          实现（只问放哪）
脚手架设计/ARCHITECTURE  →  local/ + domain/account|init|bind
脚手架设计/PHASE         →  domain/ + commands/
脚手架设计/场景/场景实现   →  tests/scenes/
COMMANDS.md              →  bin/subCommands.ts 注册表
```

## 怎么读

| 顺序 | 读什么 | 答什么 |
|------|--------|--------|
| 1 | [脚手架设计 README「已敲定」](../脚手架设计/README.md) | 产品不许再改 |
| 2 | [00-文件分类](./00-文件分类.md) | 目录职责、依赖方向、旧代码怎么处理 |
| 3 | [01-实现顺序](./01-实现顺序.md) | 切片、每片打开哪份规格、写哪几个文件、过哪条场景 |

写某一片时：只打开该片「规格」列里的文档 + `00` 里对应目录。不要翻旧 `services/publish*` / `ManifestStateStore` 当模板。

## 已锁定（开发侧，不是产品）

| 条 | |
|----|--|
| 不改 `packages/tools-lib` | 本期 CLI 要用的接口都已有，见上次对照 |
| 不在旧 `config/project`（`FreelogManifest` / `FreelogState`）上长 `N.json` | 另开 `local/` |
| 不把 `create-version` 和 `update-version` 写进同一个编排文件 | 规格禁止自动改口 |
| 版本表单只实现一套 | 会话菜单和 `version attr` / `option` / `dep` 调同一组 `domain/version/form/` |
| 命令层不打平台、不写盘规则 | `commands/` 只解析参数、TTY、调一个 domain 入口、打印 |
| `bin/subCommands` 只注册 [COMMANDS.md](../脚手架设计/COMMANDS.md) 里的命令 | 旧命令先不注册；文件可暂留，不要继续改 |

## 不要

- 把本文写成第二份产品规格（字段、门禁、文案仍在脚手架设计）
- 为「完美」先重构整个旧 CLI 再开工
- 合集 / F1 / `import-dir` / RSS / 支付 / 上抛 / 平台草稿
- 改 tools-lib 补 P0-D §7.2 那些本期不调的接口
