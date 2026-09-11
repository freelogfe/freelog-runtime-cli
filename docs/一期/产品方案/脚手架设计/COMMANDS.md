# 命令速查

二进制 `freelog-cli`。写操作共用：`--env` `--yes` `--cwd` `--json`。省略 `--env` = prod。环境真源：[07](./ARCHITECTURE/07-环境.md)。产物路径与多资源选择规则见 [08](./ARCHITECTURE/08-多资源本地状态、选择与产物路径.md)。
顶层 `freelog-cli --help` 必须打印发布包内使用手册入口的**本机绝对路径**；发布包将 [使用](../使用/README.md) 整目录复制到 `dist/docs/`，不要求联网，也不从工程目录读取文档。
本期只做**独立单资源**：普通文件资源、主题和插件。一个工程可保存多份独立身份，但除 `resource sync` 外一次命令只操作一份；合集命令不做，见 [archive 合集备份](../../archive/2026-09-04-脚手架设计-合集备份/README.md)。
本文只指路。交互、门禁、字段真源在右边的文档，不要只按本文实现。  
人要干什么见 [场景/真实场景](./场景/真实场景/README.md)；同一编号怎么敲见 [场景/场景实现](./场景/场景实现/README.md)。

---

## 0. 怎么记

两条产品路径：

```
普通文件 login → init . → create → create-version --prepare → create-version --yes
主题/插件 login → init theme|widget . --template <id> → create → 构建 → create-version --yes
发新号 version draft pull → 改工作稿 → update-version --version|--bump --yes
接入   bind <id|username/name> [--artifact <path>]
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
| `.freelog/N.json` | 不可变身份 + 对应文件。`version set --artifact` 只改这里 |
| `.freelog/N.version.json` | 未提交的下一版。成功 POST 后删除 |

`create-version` 与 `update-version` 不是同一条 CLI，不要自动改口。上架只用 `online`。

资源路由是强制契约，完整规则见 [08 §3.1](./ARCHITECTURE/08-多资源本地状态、选择与产物路径.md#31-命令路由矩阵)：`status`、版本、listing、策略、上下架等是“单资源操作”，省略选择器仅在唯一状态时静默选择；多份时 TTY 选择或非交互失败。`create`、`bind` 是新增/接续状态的专属路由，不能因为工程已有多份状态就被强制选中旧资源；`resource sync` 是唯一省略选择器即批量处理当前环境资源的命令。除非某行另有说明，所有涉及资源的命令均接受 `--resource <selector>`。

`--resource` 的公开显式形式统一为 `id:<资源ID>`、`name:<username/name>`、`artifact:<相对工程的文件或构建目录>`、`file:N.json`。`file:` 是必须保留的 AI/脚本/恢复精确状态选择器；人工主路径优先 `id:`、`name:`、`artifact:`。标题仅是可过期、可重复的展示缓存，不能选择资源。`--resource artifact:video.mp4` 只选择已关联该文件的资源，发行时上传新文件仍传独立 `--artifact video-v2.mp4`。

---

## 1. 账号 · 工程

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `login` [`--global`] [`--login-name` `--password-stdin --yes`] | 秘密写入系统凭据库；工作区或全局只写非秘密选择器 | [01-账号](./ARCHITECTURE/01-账号.md) |
| `logout` [`--global`] | 只清选择器和明确孤立的系统凭据，不调平台注销，不删 manifest | 同上 |
| `init` [`<dir>`] [`--type <leaf-code>`] | 普通单资源只建身份草稿；TTY 统一支持层级、搜索、直接输入 code 三种最终叶子选择 | [03-init](./ARCHITECTURE/03-init.md) |
| `init theme` / `init widget` [`<dir>`] [`--template <id>`] | 从固定版本的线上模板创建工程；TTY 可选择模板；写死 `RT001` / `RT002` 与 `filePath=dist` | 同上 · [06](./ARCHITECTURE/06-发行物与压缩.md) |
| `template list` | 列本期可用的主题/插件模板 | [03-init](./ARCHITECTURE/03-init.md) |
| `type list` / `type search` | 查询可选最终叶子类型；不代替 `init` / `create` 内统一的最终叶子选择器 | [Step1 §1](./PHASE/单资源/创建/01-Step1-创建授权条目.md) |
| `type info <code>` | 复验一个最终叶子的编号、名称链与“可选配置：支持/不支持”。该能力只取详情接口；要做可选配置验收时，仍须为选定类型提供匹配的真实本地产物。 | [可选配置](./PHASE/单资源/版本表单/02-可选配置.md) |
| `bind <id\|username/name>` [`--resource <selector>`] [`--artifact <path>`] [`--force --yes`] | 线上身份接到选定或新建的 `N.json`。不是 `pull`。合集失败 | [04-bind](./ARCHITECTURE/04-bind.md) |
| `status` [`--resource <selector>`] | 只打印线上现状。不改文件、不接续 | [02](./ARCHITECTURE/02-本地状态.md) |
| `resource list` | 只读诊断 `.freelog` 中每份身份、工作稿和未决记录；损坏时也可运行 | [08 §4](./ARCHITECTURE/08-多资源本地状态、选择与产物路径.md#4-已有本地状态冲突与恢复) |
| `resource sync` [`--resource <selector>`] | 按资源 ID 从当前环境平台批量同步本工程的本地资源标题；不传选择器即同步全部匹配环境的身份 | [08](./ARCHITECTURE/08-多资源本地状态、选择与产物路径.md) |
| `resource recover` / `resource recover --apply --yes` | 查看未决版本提交：尚未发送的 `prepared` 可在后者仅清 marker、保留稿；已发送或旧记录须由远端目标版本和 SHA 证明成功，后者才清 marker 和稿 | [02 §2.1.1](./ARCHITECTURE/02-本地状态.md#211-远端结果未知只核验不重发) |
| `version set` [`--resource <selector>`] `--artifact <path>` | 只改记录的本地路径（文件改名、或主题改 `build`）；不打 zip、不发版 | [02](./ARCHITECTURE/02-本地状态.md)、[06](./ARCHITECTURE/06-发行物与压缩.md) |

---

## 2. 建壳

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `create` [`--resource <selector>`] [`--title` `--type` `--name`] [`--artifact <path>`] | 只建新壳。仅一份未绑定状态时接续；无未绑定状态时新增 `N.json`。`--artifact` 只记录默认路径，不上传、不加策略、不上架。本地/线上已有壳：失败，去 `create-version` 或 `bind` | [Step1](./PHASE/单资源/创建/01-Step1-创建授权条目.md) |

`--yes` 在工程没有已验证 `typeCode` 时必须带 `--type`；无论来源如何，提交前都要复验类型仍是启用最终叶子。`--artifact` 本步只记默认路径。

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
| `version draft pull --yes` | 有稿也整份覆盖。盖之前先打将丢掉的摘要；TTY 未给 `--yes` 时默认不盖并确认，非 TTY 有稿须 `--yes` | 同上 |
| `version draft discard` [`--yes`] | 丢掉工作稿。有稿时 TTY 打摘要、默认不删并确认，非 TTY 须 `--yes`；没有稿：打一句退出 0 | 同上 |

无 `latestVersion`：`draft pull` 失败，去 `create-version`。首版不要 pull。  
没有 `update-version --prepare`。

### 3.3 改稿（不提交版本）

问法真源：[版本表单](./PHASE/单资源/版本表单/README.md)。校验同一套；落盘前打格式化预览，确认才写（`--yes` 仍打印、跳过确认）。**键不能改**（Console 能改，CLI 不跟随）。

| 命令 | 做什么 | 真源 |
|------|--------|------|
| `version attr add` [`一行式`] | 加自定义。TTY 未传一行式时逐项问 | [属性](./PHASE/单资源/版本表单/01-属性.md) |
| `version attr set` | 改名称/说明/值（键只定位）。系统附加改 value 走 §2，须已有 `fileSha1` | 同上 |
| `version attr rm` / `list` | 删自定义 / 列稿上的属性 | 同上 |
| `version attr review` / `review discard <key>` | 查看文件分析后待复核的系统附加值 / 经确认逐项丢弃 | 同上 |
| `version option add` [`一行式`] | 加可选配置。类型不允许则失败 | [可选配置](./PHASE/单资源/版本表单/02-可选配置.md) |
| `version option set` / `rm` / `list` | 改（键不改，类型不允许则失败）/ 删（可清遗留项）/ 列 | 同上 |
| `version dep add <id\|username/name>` [`--range`] [`--policy-id <policyId>`] | 加一条；未授权时列出对方**全部启用**策略并由用户选择。非交互必须显式给 `--policy-id` | [依赖](./PHASE/单资源/版本表单/03-依赖.md) |
| `version dep range <id>` [`--range`] [`--policy-id <policyId>`] / `rm` / `list` | 改范围（与 add 同一套校验：范围命中、环检测、未签时选择策略）/ 删 / 列。无 `dep auth` | 同上 |
| `version draft description` | 只改**工作稿**描述。仅 `draftKind=update`；首版稿失败 | [05 §3](./ARCHITECTURE/05-版本工作稿与独立命令.md) |

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
| `create-version` | 必须**无** `latestVersion`。号写死 `1.0.0`。确认本地路径后再上传；`RT001`/`RT002` + 目录才打 zip | [发行版本](./PHASE/单资源/创建/02-Step2-发行版本.md)、[06](./ARCHITECTURE/06-发行物与压缩.md) |
| `create-version --prepare` | 从当前产物上传、分析并保存首版工作稿；不 POST 版本 | 同上 |
| `create-version --yes` | 从当前产物重新上传、分析后提交工作稿。不以授权完成度或 `isAuth` 拦截。有 latest：**失败** | 同上 |
| `create-version --reset` | 先通过首版门禁与产物校验；有稿时确认丢掉，空表重来 | 同上 |
| `update-version` | 必须**有** `latestVersion`。无稿时按回显源拉；仍须 `--version` 或 `--bump` 和 `--yes` 才提交 | [更新版本](./PHASE/单资源/更新版本/01-更新版本.md) |
| `update-version --reuse-version <已发号>` | 这次提交认的底（默认 latest）。稿的 `fromVersion` 必须对得上 | 同上 |
| `update-version --version <semver>` / `--bump patch\|minor\|major` | 新号。二者不能一起用。`--bump` 必须带方向 | 同上 |
| `update-version --yes` | 须带 `--version` 或带方向 `--bump`。不以授权完成度或 `isAuth` 拦截。稿对不上：**失败**（不重拉）。新号 ≤ 当时 latest：**失败** | 同上 |
| `update-version --reset` | 先通过更新门禁、新号与产物校验；有稿时确认丢掉，再按回显源拉并继续。分步用 `draft discard` + `pull` | 同上 |
| `create-version` / `update-version --artifact <path>` | `--artifact` 是本次上传的文件或构建目录，成功后回写默认路径。未传时使用已记录路径 | 同上 |

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
| `update` [`--title` `--intro` `--cover` `--tags`] | 只改 listing，**不上架**。不传 `status`。标识只读。未传字段不改；`--intro ""` / `--tags ""` 显式清空；封面必须是工程内图片，上传后只提交 URL；`--yes` 且无 flag：失败 | [资源信息](./PHASE/单资源/管理/02-资源信息.md) · [Step4](./PHASE/单资源/创建/04-Step4-完善资源信息.md) |
| `policy list` | 看已有策略；页头展示当前最终叶子及其全部上级的类型链，固定每页 50 条，TTY 可上一页/下一页，非 TTY 只输出首页和继续提示 | [策略](./PHASE/单资源/管理/03-授权策略.md) |
| `policy template list` [`--page <n>` `--page-size <n>`] | 当前因后端类型筛选故障列平台返回的全部模板，默认 20 条一页；后端修复后恢复按当前类型请求 | 同上 · [Step3](./PHASE/单资源/创建/03-Step3-添加授权策略.md) |
| `policy template apply [templateId]` [`--name`] | 应用本次模板列表的一条并启用；TTY 可分页选择，`--yes` / 非 TTY 必须带 id；最终适用性由平台编译/写入确认 | 同上 |
| `policy apply --from-file <path>` [`--name`] | 本地策略文本或 JSON；可含交易事件，平台做语义校验 | 同上 |
| `policy set --id <policyId> --on\|--off` | 启用 / 停用。已上架时不能关到 0 条启用 | 同上 |
| `validate --for online` | 只预检：先严格确认资源 ID、本人和未冻结，再检查有版本 + 至少一条启用策略 | [上下架](./PHASE/单资源/管理/05-上下架.md) |
| `online` | 上架。缺版本或缺启用策略：失败，不打开策略编辑 | 同上 |
| `offline` | 下架 | 同上 |

---

## 5. 推荐用法

主题 / 插件（人自己 `pnpm build`，CLI 打 zip）：

```
login → init theme <dir> --template <id> → create → （人构建出 dist）→ create-version --yes
```

目录产物不需要用户先打 zip；已有 zip 或其它文件可直接作为 `--artifact`。产物在 `build`：`version set --artifact build`。见 [06](./ARCHITECTURE/06-发行物与压缩.md)。

首版一次做完（视频等单文件）：

```
login → init . → create → create-version --yes → policy template apply → online
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

发新号（无稿时会先拉 latest，但仍要明确新号和确认）：

```
update-version --yes --bump patch
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
| 合集命令 / F1 / `import-dir` / RSS | 本期不做 |

分层见 [05](./ARCHITECTURE/05-版本工作稿与独立命令.md)。已敲定见 [README](./README.md)。
