# 脚手架设计

本期只做**普通单资源**。合集暂缓，见 [archive/2026-09-04-脚手架设计-合集备份](../../archive/2026-09-04-脚手架设计-合集备份/README.md)。

真源只认下面「怎么读」里的现行文件。`ARCHITECTURE/05-共用管理.md` 只是跳转；`05-版本工作稿与独立命令.md` 是工作稿分层的真源。合集旧稿在 [archive](../../archive/2026-09-04-脚手架设计-合集备份/README.md)，不是本期真源。

```
login
  创建       init? → create → create-version（发行版本，无上一版）→ policy? → update? → online
  更新版本   version draft pull? → 改缓存 → update-version（定新号 + 提交）
  接入       bind <id|username/name> [--file]
```

不用 `publish`（像上架）。不用顶层 `release`。上架只用 `online`。`bind` 不是 `pull`。

## 怎么读

按这个顺序看。不要把合集备份当本期正文。

| 顺序 | 读什么 | 答什么 |
|------|--------|--------|
| 1 | 本文「已敲定」 | 不许再改的产品决定 |
| 1.5 | [场景/真实场景](./场景/真实场景/README.md) | 人要干什么（不提命令）。改命令前先对场景 |
| 1.6 | [场景/场景实现](./场景/场景实现/README.md) | 用现行命令把同一编号走完 |
| 2 | [01 账号](./ARCHITECTURE/01-账号.md) · [07 环境](./ARCHITECTURE/07-环境.md) · [02 本地状态](./ARCHITECTURE/02-本地状态.md) · [03 init](./ARCHITECTURE/03-init.md) · [04 bind](./ARCHITECTURE/04-bind.md) · [05 工作稿与独立命令](./ARCHITECTURE/05-版本工作稿与独立命令.md) · [06 发行物与压缩](./ARCHITECTURE/06-发行物与压缩.md) | 凭据、三套环境、`N.json` / 工作稿、立项、接入、多次改缓存再提交、主题/插件打 zip |
| 3 | [创建总览](./PHASE/单资源/创建/00-总览.md) → [Step1](./PHASE/单资源/创建/01-Step1-创建授权条目.md) | 建壳 |
| 4 | [发行版本](./PHASE/单资源/创建/02-Step2-发行版本.md) | 创建 Step2：无上一版，空表，`1.0.0` |
| 5 | [更新版本](./PHASE/单资源/更新版本/01-更新版本.md) | `update-version`：定新号 + 提交。拉缓存见 05 `version draft pull` |
| 6 | [属性](./PHASE/单资源/版本表单/01-属性.md) · [可选配置](./PHASE/单资源/版本表单/02-可选配置.md) · [依赖](./PHASE/单资源/版本表单/03-依赖.md) | 两套会话共用问法。依赖业务事实：[P0-D](../业务梳理/依赖与签约/P0-D-依赖管理与签约.md) |
| 7 | [Step3](./PHASE/单资源/创建/03-Step3-添加授权策略.md) · [Step4](./PHASE/单资源/创建/04-Step4-完善资源信息.md) | 策略、listing |
| 8 | [管理](./PHASE/单资源/管理/00-总览.md) | 版本信息（只改描述）、listing、策略开关、上下架 |
| — | [COMMANDS](./COMMANDS.md) | 命令速查，不是真源 |
| — | [开发](../开发/README.md) | 代码放哪。发布前拦 prod，不要写进「已敲定」 |

改任何一份之前先对「已敲定」。只改对应文档。属性和依赖的问法只写在版本表单，不要抄回发行版本 / 更新版本 / 版本信息。

| | 文档 |
|--|------|
| 架构 | [01 账号](./ARCHITECTURE/01-账号.md) · [07 环境](./ARCHITECTURE/07-环境.md) · [02 本地状态](./ARCHITECTURE/02-本地状态.md) · [03 init](./ARCHITECTURE/03-init.md) · [04 bind](./ARCHITECTURE/04-bind.md) · [05 工作稿与独立命令](./ARCHITECTURE/05-版本工作稿与独立命令.md) · [06 发行物与压缩](./ARCHITECTURE/06-发行物与压缩.md) |
| 创建 | [总览](./PHASE/单资源/创建/00-总览.md) · [Step1](./PHASE/单资源/创建/01-Step1-创建授权条目.md) · [发行版本](./PHASE/单资源/创建/02-Step2-发行版本.md) · [Step3](./PHASE/单资源/创建/03-Step3-添加授权策略.md) · [Step4](./PHASE/单资源/创建/04-Step4-完善资源信息.md) |
| 更新版本 | [01](./PHASE/单资源/更新版本/01-更新版本.md) |
| 版本表单 | [README](./PHASE/单资源/版本表单/README.md) · [属性](./PHASE/单资源/版本表单/01-属性.md) · [可选配置](./PHASE/单资源/版本表单/02-可选配置.md) · [依赖](./PHASE/单资源/版本表单/03-依赖.md) |
| 场景 | [README](./场景/README.md) · [真实场景](./场景/真实场景/README.md) · [场景实现](./场景/场景实现/README.md) |
| 管理 | [总览](./PHASE/单资源/管理/00-总览.md) · [版本信息](./PHASE/单资源/管理/01-版本信息.md) · [listing](./PHASE/单资源/管理/02-资源信息.md) · [策略](./PHASE/单资源/管理/03-授权策略.md) · [依赖对照](./PHASE/单资源/管理/04-依赖及其授权.md) · [上下架](./PHASE/单资源/管理/05-上下架.md) |

## 已敲定

| 条 | 在哪 |
|----|------|
| **合集本期不实现** | [archive 合集备份](../../archive/2026-09-04-脚手架设计-合集备份/README.md) |
| 账号只有 `login` / `logout`；工作区 `.freelog/auth` 往上找，没有才全局；坏文件不准回退；省略 `--env` = prod | [01-账号](./ARCHITECTURE/01-账号.md) |
| 三套环境 `prod` / `test` / `dev`；CLI 覆盖 tools-lib `getEnv`，不要靠空的 `FREELOG_ENV`（会落到 test） | [07-环境](./ARCHITECTURE/07-环境.md) |
| `session` / `studio` / `--session` 不是账号；主路径不写 | 同上 |
| `init` 不登录、不打平台；`collection` scaffold 本期失败 | [03-init](./ARCHITECTURE/03-init.md) |
| `N.json` 只记不可变身份 + 对应文件 | [02-本地状态](./ARCHITECTURE/02-本地状态.md) |
| `N.version.json` 是未提交的下一版：含文件 sha1、属性、配置、依赖、描述；每项写盘；成功 POST 后删除。看线上 `version show`，看缓存 `version show --local`，拉 / 盖缓存用 `version draft pull`，丢掉用 `version draft discard` | [02](./ARCHITECTURE/02-本地状态.md)、[05](./ARCHITECTURE/05-版本工作稿与独立命令.md) |
| 一夹一个 `.freelog/`：`N.json` 编号 + `index.json`；编号不是排序 | 02 |
| `status` 只打印；接续只有「有壳、无版本」；策略 / listing / 上架不接续 | 02、创建总览 |
| 同名已存在必须改 `name`；自己的壳禁止再 `create` | [Step1](./PHASE/单资源/创建/01-Step1-创建授权条目.md) |
| 一夹多视频 = 多条单资源，用 `--file`；**不做** F1 / `import-dir` / RSS | — |
| `bind` 只写身份和 `filePath`；不是 `pull`；合集 bind 本期失败 | [04-bind](./ARCHITECTURE/04-bind.md) |
| 发行版本（创建 Step2）没有上一版，禁止 inherit | [发行版本](./PHASE/单资源/创建/02-Step2-发行版本.md) |
| 发行版本命令是 `create-version`；更新版本命令是 `update-version`。不是同一条 CLI，不要自动改口 | [发行版本](./PHASE/单资源/创建/02-Step2-发行版本.md)、[更新版本](./PHASE/单资源/更新版本/01-更新版本.md) |
| 拉缓存不绑在发新号上。`version draft pull [--version]` 只写稿、不 POST。`update-version` 管定新号 + 提交；无稿才顺带拉。`--reuse-version` = 这次提交认的底。稿对不上：TTY 默认仍用这份；`--yes` **失败**。`--file` 先选份。两边都不看平台草稿 | [05](./ARCHITECTURE/05-版本工作稿与独立命令.md)、[更新版本](./PHASE/单资源/更新版本/01-更新版本.md) |
| 版本信息只改描述（`version description`）；要改文件/属性/配置/依赖走 `update-version` | [版本信息](./PHASE/单资源/管理/01-版本信息.md) |
| 属性 / 可选配置 / 依赖：只在发行版本 / 更新版本管理（会话或 `version attr` / `option` / `dep`）；独立命令只写工作稿；只有那两条提交。没有顶层 `dep` | [05](./ARCHITECTURE/05-版本工作稿与独立命令.md) |
| **不解决上抛**；只接受签依赖本身就能拿到 `authStatus` 1/2 | [版本表单/依赖](./PHASE/单资源/版本表单/03-依赖.md) |
| 已发版不单独补签；看依赖用 `version show`；授权合约列表不做 | [管理-依赖](./PHASE/单资源/管理/04-依赖及其授权.md) |
| 上架只用 `online`；禁止 `update --status` | [上下架](./PHASE/单资源/管理/05-上下架.md) |
| 上传中断整文件再传；解析走 `filesListInfo` 轮询（最长 120s），不用 `fileProperty` | Step2 §2–3 |
| 主题 `RT001` / 插件 `RT002` 写死；发版仅这两类 + 路径是目录才打 zip；其余类型不支持文件夹；`filePath` 只是记录，发版要确认或 `--file` | [06](./ARCHITECTURE/06-发行物与压缩.md) |
