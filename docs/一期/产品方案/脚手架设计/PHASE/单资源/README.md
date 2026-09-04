# 单资源（本期要实现）

本期只做**普通单资源**（`subjectType=1`）。合集暂缓，见 [archive](../../../../archive/2026-09-04-脚手架设计-合集备份/README.md)。

每份文档都写：用户怎么走、字段约束、`packages/tools-lib` 封装函数。函数名用 tools-lib 导出，不新造。

```
login → init? → create → create-version（发行版本，无上一版）→ policy? → update? → online
更新版本     update-version（回显上一版再发新号）
版本信息     version show / version show --local / version description
已有资源     bind → 管理
```

三条不要混：

| 事 | 命令 | API | 文档 |
|----|------|-----|------|
| 首版（没有上一版） | `create-version` | `POST .../versions` 号 `1.0.0` | [发行版本](./创建/02-Step2-发行版本.md) |
| 更新版本（回显上一版再改） | `update-version` | `POST .../versions` 新号 | [更新版本](./更新版本/01-更新版本.md) |
| 只改某一已发号的描述 | `version description` | `PUT .../versions/{已发号}` **只带 description** | [版本信息](./管理/01-版本信息.md) |

`create-version` 和 `update-version` 不是同一条 CLI。已有版本跑 `create-version`：失败。还没有版本跑 `update-version`：失败。平台都是 `createVersion`，流程完全不同。

谁写什么：

| 层 | 文档 | 只写 |
|----|------|------|
| 创建 Step2 | [发行版本](./创建/02-Step2-发行版本.md) | 无上一版：门禁、文件、空表、提交 `1.0.0` |
| 更新版本 | [更新版本](./更新版本/01-更新版本.md) | 回显哪一号、写入工作稿、改完发新号 |
| 版本信息 | [版本信息](./管理/01-版本信息.md) | 看已发号；只改描述 |
| 表单 | [版本表单](./版本表单/README.md) | 属性 / 可选配置 / 依赖的每一问（两套会话共用） |

| | 文档 |
|--|------|
| 创建 | [00 总览](./创建/00-总览.md) · [Step1](./创建/01-Step1-创建授权条目.md) · [发行版本](./创建/02-Step2-发行版本.md) · [Step3](./创建/03-Step3-添加授权策略.md) · [Step4](./创建/04-Step4-完善资源信息.md) |
| 更新版本 | [01](./更新版本/01-更新版本.md) |
| 版本表单 | [README](./版本表单/README.md) · [属性](./版本表单/01-属性.md) · [可选配置](./版本表单/02-可选配置.md) · [依赖](./版本表单/03-依赖.md) |
| 管理 | [00 总览](./管理/00-总览.md) · [版本信息](./管理/01-版本信息.md) · [资源信息](./管理/02-资源信息.md) · [策略](./管理/03-授权策略.md) · [依赖补签](./管理/04-依赖及其授权.md) · [上下架](./管理/05-上下架.md) |

账号 / 本地身份 / init / bind 仍在 [ARCHITECTURE](../../ARCHITECTURE/README.md)。
