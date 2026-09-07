# 开发计划（一期 · 普通单资源）

新会话先读 [交接文档](../交接文档.md)。产品真源只认 [脚手架设计](../脚手架设计/README.md)。本文只答：**代码放哪、按什么顺序写、写的时候不许临场改产品。**

规格（四层、门禁、场景、tools-lib）已经够按切片实现。**技术选型已定**：见 [02-技术选型](./02-技术选型.md)（commander / inquirer / tsup / 中文硬编码）。按当前最佳选，不跟旧 CLI。

旧实现（`packages/cli` 和 [archive/cli](../../archive/cli/00-备份说明.md)）**只供参考**。随时可以打开备份对照函数或交互，不要当模板整份搬回来。现行 `packages/cli` 可以按需清空或删除，按 00 + 02 重铺。

按 [01](./01-实现顺序.md) 的任务编号写。一次一个任务，验证过了再往下。不要一边写一边重新设计命令。

```
规格（不许改产品）          实现（只问放哪）
脚手架设计/ARCHITECTURE  →  local/ + domain/account|init|bind
脚手架设计/PHASE         →  domain/ + commands/
脚手架设计/场景/场景实现   →  tests/scenes/
COMMANDS.md              →  bin/program.ts 注册表
```

## 怎么读

| 顺序 | 读什么 | 答什么 |
|------|--------|--------|
| 1 | [脚手架设计 README「已敲定」](../脚手架设计/README.md) | 产品不许再改 |
| 2 | [00-文件分类](./00-文件分类.md) · [02-技术选型](./02-技术选型.md) | 目录职责；框架 / 测试 / 文案 |
| 3 | [01-实现顺序](./01-实现顺序.md) | 任务编号、验证栏。上一号绿了才开下一号 |

写某一片时：只打开该片「规格」列里的文档 + `00` 里对应目录。不要翻旧 `services/publish*` / `ManifestStateStore` 当模板。

## 已锁定（开发侧，不是产品）

| 条 | |
|----|--|
| 不改 `packages/tools-lib` | 本期 CLI 要用的接口都已有，见上次对照 |
| 技术选型 | [02](./02-技术选型.md)。commander、@inquirer/prompts、zod、archiver、vitest、tsup。文案中文硬编码，上一行 `// i18n: key` |
| 旧 CLI 只供参考 | 随时看 [archive/cli](../../archive/cli/00-备份说明.md)。不要当地基，不要整份搬回 |
| 不在旧 `config/project`（`FreelogManifest` / `FreelogState`）上长 `N.json` | 另开 `local/` |
| 不把 `create-version` 和 `update-version` 写进同一个编排文件 | 规格禁止自动改口 |
| 版本表单只实现一套 | 会话菜单和 `version attr` / `option` / `dep` 调同一组 `domain/version/form/` |
| 命令层不打平台、不写盘规则 | `commands/` 只解析参数、TTY、调一个 domain 入口、打印 |
| 根程序只注册 [COMMANDS.md](../脚手架设计/COMMANDS.md) 里的命令 | 用 commander。旧命令不要注册 |
| **发布前屏蔽 prod** | 算定环境是 `prod`（省略 `--env`、`--env prod` / `production`、`FREELOG_ENV=prod`）时：**所有打平台的命令失败**，「prod 暂未开放，请用 `--env test` 或 `--env dev`」。不要默默改到 test。门禁只放 `domain/env.ts` 一处。**正式发布前再撤。** 产品默认仍是省略 = prod，见 [07](../脚手架设计/ARCHITECTURE/07-环境.md) |

## 不要

- 把本文写成第二份产品规格（字段、门禁、文案仍在脚手架设计）
- 在旧 `packages/cli` 上改（备份随时可看；按 00 + 02 重铺）
- 把 archive 的 citty / clack / adm-zip / `t(key)` 搬回来
- 为国际化先做运行时查表（审查要直接看见中文）
- 合集 / F1 / `import-dir` / RSS / 支付 / 上抛 / 平台草稿
- 改 tools-lib 补 P0-D §7.2 那些本期不调的接口
- 为了「能联调」把省略 `--env` 改成默认 test（和 07 相反；联调用 `--env test`）
- 没撤门禁就让 prod 写出去
