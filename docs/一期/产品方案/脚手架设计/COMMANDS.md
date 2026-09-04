# 命令速查

二进制 `freelog-cli`。写操作共用：`--env` `--yes` `--cwd` `--json` `--file`（一夹多条必须指定）。省略 `--env` = prod。  
本期只做**普通单资源**。合集命令不做，见 [archive 合集备份](../../archive/2026-09-04-脚手架设计-合集备份/README.md)。  
本文只指路。交互、门禁、字段真源在右边的文档，不要只按本文实现。  
人要干什么见 [场景/真实场景](./场景/真实场景/README.md)；同一编号怎么敲见 [场景/场景实现](./场景/场景实现/README.md)。

---

## 0. 怎么记

两条产品路径：

```
创建   login → init? → create → create-version → policy? → update? → online
发新号 version draft pull? → 改缓存 → update-version
接入   bind <id|username/name> [--file]
```

版本相关四层，不要搅（[05](./ARCHITECTURE/05-版本工作稿与独立命令.md)）：

| 层 | 命令 | POST 版本？ |
|----|------|-------------|
| 看 | `version show` / `version show --local` | 否 |
| 管缓存 | `version draft pull` / `version draft discard` | 否 |
| 改稿 | `version attr` / `option` / `dep` / `draft description`；或发行会话 | 否（签约当场打平台，树只进稿） |
| 提交 | `create-version` / `update-version` | 是 |

本地两份文件：[02](./ARCHITECTURE/02-本地状态.md)

| 文件 | 记什么 |
|------|--------|
| `.freelog/N.json` | 不可变身份 + 对应文件。`version set --file` 只改这里 |
| `.freelog/N.version.json` | 未提交的下一版。成功 POST 后删除 |

`create-version` 与 `update-version` 不是同一条 CLI，不要自动改口。上架只用 `online`。

---

## 1. 账号 · 工程

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `login` [`--global`] [`--login-name` `--password-stdin --yes`] | 写入工作区 `.freelog/auth`（默认）或 `~/.freelog-auth` | [01-账号](./ARCHITECTURE/01-账号.md) |
| `logout` [`--global`] | 只清凭据，不调平台注销，不删 manifest | 同上 |
| `init` [`<dir>`] `--scaffold runtime\|package\|none` | 只建本地工程，不 POST。`collection` 本期失败 | [03-init](./ARCHITECTURE/03-init.md) |
| `init theme` / `init widget` / `init package` | 快捷大类 | 同上 |
| `template list --scaffold runtime\|package` | 列可用模板 | 同上 |
| `type list` / `type search` / `type pick` / `type info` | 先查叶子类型。**不**代替 `create` 里选类型 | [Step1 §1.6](./PHASE/单资源/创建/01-Step1-创建授权条目.md) |
| `bind <id\|username/name>` [`--file`] [`--force --yes`] | 线上身份接到 `N.json`。不是 `pull`。合集失败 | [04-bind](./ARCHITECTURE/04-bind.md) |
| `status` | 只打印线上现状。不改文件、不接续 | [02](./ARCHITECTURE/02-本地状态.md) |
| `version set --file <path>` | 只改 `N.json.filePath`。不发版、不拉稿 | [02](./ARCHITECTURE/02-本地状态.md) |

`session` / `studio` / `--session` 不是账号，主路径不写。

---

## 2. 建壳

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `create` [`--title` `--type` `--name`] [`--file`] | 只建新壳。不上传、不加策略、不上架。本地/线上已有壳：失败，去 `create-version` 或 `bind` | [Step1](./PHASE/单资源/创建/01-Step1-创建授权条目.md) |

`--yes` 必须带齐 `--type` / `--title` / `--name`，否则失败。`--file` 本步只记路径。

---

## 3. 版本

### 3.1 看（不写盘）

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `version show` [`--version <已发号>`] | 只读线上。有本地稿时打一行提示，**不要**盖缓存 | [版本信息](./PHASE/单资源/管理/01-版本信息.md) |
| `version show --local` | 只读工作稿。不与 `--version` 一起用。没有稿：失败 | 同上 |

### 3.2 管缓存（不 POST 版本）

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `version draft pull` | 拉 **latest** 写入 `N.version.json` | [05 §2](./ARCHITECTURE/05-版本工作稿与独立命令.md) |
| `version draft pull --version <已发号>` | 拉指定已发号。没有这个号：失败，不写盘 | 同上 |
| `version draft pull --yes` | 有稿也整份覆盖。盖之前先打将丢掉的摘要。TTY 默认不盖 | 同上 |
| `version draft discard` [`--yes`] | 丢掉工作稿。没有稿：打一句退出 0 | 同上 |

无 `latestVersion`：`draft pull` 失败，去 `create-version`。首版不要 pull。  
没有 `update-version --prepare`。

### 3.3 改稿（不提交版本）

问法真源：[版本表单](./PHASE/单资源/版本表单/README.md)。校验同一套；落盘前打格式化预览，确认才写（`--yes` 仍打印、跳过确认）。**键不能改**（Console 能改，CLI 不跟随）。

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `version attr add` [`一行式` 或 `--name --key` …] | 加自定义。TTY 没带齐则逐项问 | [属性](./PHASE/单资源/版本表单/01-属性.md) |
| `version attr set` | 改名称/说明/值（键只定位）。系统附加改 value 走 §2，须已有 `fileSha1` | 同上 |
| `version attr rm` / `list` | 删自定义 / 列稿上的属性 | 同上 |
| `version option add` [`一行式` 或同义参数] | 加可选配置。类型不允许则失败 | [可选配置](./PHASE/单资源/版本表单/02-可选配置.md) |
| `version option set` / `rm` / `list` | 改（键不改）/ 删 / 列 | 同上 |
| `version dep add <id\|username/name>` [`--range`] | 加一条 + 当场免费签，须 `authStatus` 1/2。对方有基础上抛：不加 | [依赖](./PHASE/单资源/版本表单/03-依赖.md) |
| `version dep range` / `rm` / `list` | 改范围 / 删 / 列。无 `dep auth` | 同上 |
| `version draft description` | 只改**工作稿**描述。仅有 `fromVersion` 的更新稿；首版稿失败 | [05 §3](./ARCHITECTURE/05-版本工作稿与独立命令.md) |

无稿且已有 `latestVersion`：改稿命令失败，「请先 version draft pull」。  
无稿且无版本：可建空首版稿再改自定义/依赖；改附加须先 `create-version --prepare`。

一行式例子：

```
version attr add "名称=作者 键=author 说明=作品作者 值=张三"
version option add "名称=主题 键=theme 方式=文本 默认=dark"
version option add "名称=语言 键=lang 方式=下拉 选项=中文|English|日本語"
```

### 3.4 提交（只有这两条 POST 版本）

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `create-version` | 必须**无** `latestVersion`。号写死 `1.0.0`。默认：准备 + 会话 | [发行版本](./PHASE/单资源/创建/02-Step2-发行版本.md) |
| `create-version --prepare` | 只建空首版稿（定文件 + SHA1 + 解析），不进会话、不 POST | 同上 |
| `create-version --yes` | 提交缓存（或只交系统解析）。有 latest：**失败** | 同上 |
| `create-version --reset` | 丢掉工作稿，空表重来 | 同上 |
| `update-version` | 必须**有** `latestVersion`。定新号 + 提交。无稿才按回显源拉 | [更新版本](./PHASE/单资源/更新版本/01-更新版本.md) |
| `update-version --reuse-version <已发号>` | 这次提交认的底（默认 latest）。稿的 `fromVersion` 必须对得上 | 同上 |
| `update-version --version <semver>` / `--bump patch\|minor\|major` | 新号。二者不能一起用。`--bump` 必须带方向 | 同上 |
| `update-version --yes` | 不进会话。须带 `--version` 或带方向 `--bump`。稿对不上：**失败**（不重拉）。新号 ≤ 当时 latest：**失败** | 同上 |
| `update-version --reset` | 丢掉再按回显源拉（一次会话）。分步用 `draft discard` + `pull` | 同上 |
| `update-version --file <path>` | 先选份；路径不同才换文件。可与 `--reuse-version` 一起用 | 同上 |

`create-version` 禁止 `--version` / `--bump` / `--reuse-version`。  
成功 POST 必须删工作稿；失败留下。

### 3.5 只改线上已发号描述

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `version description --version <已发号>` [`--description`] | **线上唯一的 PUT**。不写工作稿、不发新号 | [版本信息](./PHASE/单资源/管理/01-版本信息.md) |

---

## 4. listing · 策略 · 上下架

创建和维护是同一组命令，不接续。

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `update` [`--title` `--intro` `--cover` `--tags`] | 只改 listing，**不上架**。不传 `status`。标识只读。`--yes` 且无 flag：失败 | [资源信息](./PHASE/单资源/管理/02-资源信息.md) · [Step4](./PHASE/单资源/创建/04-Step4-完善资源信息.md) |
| `policy list` | 看已有策略 | [策略](./PHASE/单资源/管理/03-授权策略.md) |
| `policy template list` | 列推荐免费模板 | 同上 · [Step3](./PHASE/单资源/创建/03-Step3-添加授权策略.md) |
| `policy template apply <templateId>` [`--name`] | 加一条免费策略并启用。`--yes` 必须带 id | 同上 |
| `policy apply --from-file <path>` | 本地策略文本；仍禁止付费 | 同上 |
| `policy set --id <policyId> --on\|--off` | 启用 / 停用。已上架时不能关到 0 条启用 | 同上 |
| `validate --for online` | 只预检：有版本 + 至少一条启用策略 | [上下架](./PHASE/单资源/管理/05-上下架.md) |
| `online` | 上架。缺版本或缺启用策略：失败，不打开策略编辑 | 同上 |
| `offline` | 下架 | 同上 |

---

## 5. 推荐用法

首版一次做完：

```
login → init? → create → create-version → policy template apply? → update? → online
```

首版分多次改缓存：

```
create-version --prepare
version attr add "名称=作者 键=author 值=张三"
version dep add someone/lib --range ^1.0.0
create-version --yes
```

发新号（推荐：缓存先管好）：

```
version draft pull                          # 或 --version 1.0.0
version draft pull --yes                    # 有稿要盖
version attr add / version option add / version dep add
version show --local
update-version --yes --bump patch
```

发新号一次会话（无稿则顺带拉 latest）：

```
update-version
```

脚本续用旧底：必须 `--reuse-version <稿的 fromVersion>`，否则 `--yes` 按 latest，对不上会失败。

---

## 6. 禁止

| 不要 | 用这个 |
|------|--------|
| `publish` / 顶层 `release` | `create-version` / `update-version`；上架 `online` |
| `update --status` | `online` / `offline` |
| `update-version --prepare` | `version draft pull` |
| `version set --reuse-version` | `update-version --reuse-version`；拉缓存 `draft pull --version` |
| `pull` 当接入 | `bind` |
| 顶层 `attr` / `option` / `dep`（含 `dep add` / `auth` / `list`） | `version attr` / `option` / `dep` |
| 用 `version dep` 改已发版树 | 先 `draft pull`，再改稿，再 `update-version` |
| 用 `version draft pull` 发首版 | `create-version`（可 `--prepare`） |
| 独立命令里 `--bump` / `--version`（除 `draft pull --version`） | 新号只在 `update-version` |
| `session` / `studio` 当主路径账号 | `login` / `logout` |
| 合集命令 / F1 / `import-dir` / RSS | 本期不做 |

分层见 [05](./ARCHITECTURE/05-版本工作稿与独立命令.md)。已敲定见 [README](./README.md)。
