# 发行版本（创建流程 Step2）

对照业务：[P0-F0-Step2](../../../业务梳理/创建流程%20-%20发行单个资源/P0-F0-Step2-提交资源文件.md)。  
**只有还没有 `latestVersion` 才走本文。** 没有上一版，不回显、不 inherit。

已有版本要发新号：走 [更新版本](../更新版本/01-更新版本.md) 的 `update-version`，不要读本文、不要把 `create-version` 改口成更新版本。  
只改某一已发号的描述：`version description`，见 [版本信息](../管理/01-版本信息.md)。

```
freelog-cli create-version
freelog-cli create-version --prepare  # 只建首版稿：定文件 + SHA1 + 解析，不进会话、不 POST
freelog-cli create-version --reset    # 通过预检后确认丢稿，空表重来；脚本加 --yes
```

属性 / 可选配置 / 依赖的每一问见 [版本表单](../版本表单/README.md)。  
首版没有上一号可拉：**不要**跑 `version draft pull`。分多次改：先 `--prepare`，再 `version attr` / `dep`，再 `create-version --yes`。

须已 `login`，已有 `resourceId`。本人、未冻结。版本号写死 `1.0.0`，`description=''`。  
文件 sha1、属性、可选配置、依赖每改一项写 `N.version.json`。不做平台草稿。不写 `N.json`。不用 `publish`。只做本地上传。

`--prepare`：走 0 → 0.1 → 1 → 2 → 3，然后结束。工作稿留下。不进菜单、不 POST。没有可用 sha1 仍失败。有 latest → 本命令整条失败（§0），不要改口。  
`--yes`：不进会话；有 `draftKind=initial` 的首版工作稿就带上，没有只交系统解析。缺文件、分析未完成或有待确认旧属性仍失败。身份按 [08](../../../ARCHITECTURE/08-多资源本地状态、选择与产物路径.md) 以 `--resource` 或选择器确定；换这次上传的本地路径用 `--artifact`。
`--reset`：先通过本页门禁与产物路径校验；有稿时按 [05 §0](../../../ARCHITECTURE/05-版本工作稿与独立命令.md#0-统一的有损工作稿操作契约) 确认丢弃，再空表重来。校验失败、取消或非 TTY 缺 `--yes` 时旧稿保留。
本文禁止 `--version` / `--bump` / `--reuse-version`（那是 `update-version`）。

看缓存：`version show --local`。看线上：`version show`（不写工作稿）。

| # | 功能 | 怎么进 |
|---|------|--------|
| 0 | 门禁：必须还没有版本 | 有 `latestVersion` → 失败，去 `update-version` |
| 0.1 | 工作稿提醒 | 有 `draftKind=initial` 的首版稿：TTY 默认继续；放弃则清空 |
| 1 | 选身份与定文件 | `--resource` 先落到哪一份；`--artifact` 定本次上传并回写的路径；只有**首版稿**的 sha1 可续 |
| 2 | SHA1，没有才上传 | 成功立刻写入工作稿 `fileSha1` / `filename` |
| 3 | 解析系统属性 | `filesListInfo` 轮询。raw 不写盘 |
| 4 | 会话菜单 1–6 | 进版本表单。**没有**描述项。`--prepare` 跳过 |
| 5 | 提交 `1.0.0` | `createVersion`，`description=''`。成功**删掉**工作稿。`--prepare` 不走本步 |

```
0 门禁（无 latestVersion）
  → 0.1 有首版工作稿？提醒（默认继续 / 放弃重来）
  → 1 确定文件
  → 2 SHA1，没有才上传 → 写进 N.version.json
  → 3 解析系统属性
  → `--prepare`：到此结束，稿留下
  → 4 会话菜单 1–6（每项写盘）
  → 5 POST createVersion（1.0.0）→ 成功清空工作稿
```

没有可用 sha1（稿里没有、本地也没有文件）→ 不进会话、不发行。没有 sha1 时不能靠本命令改属性；人手改 `N.version.json` 之后再跑，仍须先过上传/解析。视频可以一次都不选菜单直接提交。  
成功后不自动加策略；下一步是人自己跑 Step3。

---

## 0. 进入

`Resource.info`（`GET /v2/resources/{id}`，`isLoadLatestVersionInfo=1`）。

| 检查 | 失败 |
|------|------|
| 未登录 / 无 `N.json` / 无 `resourceId` | 先 login / create / bind |
| 已有 `latestVersion` | 失败：「已有发行版本，请使用 update-version」。去 [更新版本](../更新版本/01-更新版本.md) |
| `--version` / `--bump` / `--reuse-version` | 失败。本文没有上一版 |
| `subjectType===4` | 失败（合集暂缓） |
| 多份状态但非交互未传 `--resource` | 失败并列出可用选择器 |
| `--resource` 对不上或有歧义 | 失败，不把产物路径猜成身份 |
| `fileCommitMode` 不含 `2^0` | 失败：「本期只支持本地上传」 |
| 非本人、冻结 | 失败 |

`Resource.getResourceTypeInfoByCode`（`GET /v2/resources/types/getInfoByCode`）：

| 配置 | 用法 |
|------|------|
| `fileCommitMode` 含 `2^0` | 本地上传。不含：上面已失败，不要往下走 |
| `fileMaxSize` + `fileMaxSizeUnit` | 上限 = `fileMaxSize * 1024 * (1024 ** fileMaxSizeUnit)` |
| `supportOptionalConfig === 2` | 菜单才有「可选配置」 |
| 类型名含「视频」 | **不传** `videoCover`，也不问版本封面 |

### 0.1 工作稿提醒

只看本地 `N.version.json` + 线上有没有 `latestVersion`。不看平台草稿。总表见 [本地状态 §2.2](../../../ARCHITECTURE/02-本地状态.md)。

`--reset`：先完成本命令门禁与产物路径预检；有 `N.version.json` 时显示摘要并按统一有损操作契约确认后才删除，当作没有。坏文件仍失败；取消、预检失败或非 TTY 缺 `--yes` 时旧稿保留。

| 盘上 | 行为 |
|------|------|
| 没有 | 继续。还不必建文件 |
| 有，且 `draftKind=initial` | **首版续改稿**。TTY 提醒，**默认继续**。`--yes` 续用，不问 |
| 有，且 `draftKind=update` | 更新版本的稿。**不读、不拿来发 1.0.0**。打印「这是更新版本的稿，发行版本不用」。本命令一旦写盘，整份按首版模型重写 |

TTY 有首版稿时打：

```
发现本地版本工作稿  .freelog/N.version.json
  来源：首版
  文件：{filename}  sha1={前8位}…    # 还没有文件则打「尚未上传」
  自定义 n / 可选配置 n / 依赖 n

继续使用这份？ [Y]  放弃，重新开始 [n]
```

选放弃：删掉这份，空表。看内容：先结束，跑 `version show --local`。新建首版稿必须立即写入 `schemaVersion=1`、`draftKind=initial`、同编号 `resourceId` / `resourceTypeCode`、空数组、`fileSha1=null`、`filename=null`、`analyzedSha1=null` 和 `description=''`；不得依靠缺字段表示空稿。

---

## 1. 确定文件

`--resource` **先落到哪一份**（和 [08](../../../ARCHITECTURE/08-多资源本地状态、选择与产物路径.md) 一样），不是一律换文件。`--artifact` 是本次上传并在确认后回写的路径。

| 参数 | 哪一份 / 路径 |
|------|----------------|
| `--resource` 精确命中一份身份 | 选中那一份。不改 `filePath` |
| 未传 `--resource`，仅一份 | 静默选中唯一一份 |
| 未传 `--resource`，多份 | TTY 选择；非交互在 §0 失败 |
| `--resource` 不存在或有歧义 | 失败；不得把产物路径猜成身份 |
| 已传 `--artifact` | 用作这次上传路径，确认后回写 `filePath` 与 index |
| 未传 `--artifact` | 使用选中身份已记录的 `filePath` |

不保留 `--file` 兼容写法。路径只能由 `--artifact` 指定；它必须在工作区内，`./dist` 规范为 `dist`，绝对路径、空路径和 `..` 越界路径一律失败。

路径怎么确认、打不打 zip：见 [06 §3](../../../ARCHITECTURE/06-发行物与压缩.md)。**不要**在本地文件不在时续用稿里的 sha1。

| 进入 | |
|------|--|
| 已传 `--artifact` | 用这个（并回写 `filePath` 若变了） |
| 未传 `--artifact`，记录的路径本地存在 | TTY 问是否采用，默认是。`--yes` 采用 |
| 未传 `--artifact`，没有记录或本地不在 | TTY 问路径。`--yes`：失败，「请 --artifact」 |

确认后：主题/插件（`RT001`/`RT002`）且是目录 → 打 zip；主题/插件若是文件（包括 zip）直接上传；其余类型若是目录 → 失败「不支持文件夹」。打印「将使用：{相对路径}」。

---

## 2. SHA1，没有才上传

没有「续用稿 sha1、本地可以不在」这一支。路径必须已按 §1 / [06 §3](../../../ARCHITECTURE/06-发行物与压缩.md) 确认且本地存在。

主题/插件 + 目录：先打临时 zip，后面的「文件」就是这份 zip；主题/插件 + 文件（包括用户给出的 zip）：不压缩，后面的「文件」就是原文件。见 [06 §2](../../../ARCHITECTURE/06-发行物与压缩.md)、[06 §4.1](../../../ARCHITECTURE/06-发行物与压缩.md)。

1. 本地算 SHA1（`Tool.getSHA1Hash` / 与平台同一套，小写 hex，不要自造）。对象是 zip 或原文件。
2. `Storage.fileIsExist`。
3. 已有：跳过上传，记下 `fileSha1`、`filename`。
4. 没有：`Storage.uploadFile`（`POST /v2/storages/files/upload`，带文件 + `resourceType`）。进度；取消 = 失败；中断整文件再传。
5. 失败：平台 `msg`，不进会话。

得到 `fileSha1` / `filename` 后**立刻写入** `N.version.json`（没有这份就按 `draftKind=initial` 新建；不是 initial 的整份按首版模型重写）。新 sha 必须先将 `analyzedSha1` 置为 `null`。确认过的路径回写 `N.json.filePath`。工作稿已有相同 sha1：不必再传。
临时 zip：无论上传、解析、写稿或后续步骤成功或失败，都在 `finally` 清理；不得遗留临时包。

---

## 3. 解析系统属性

打印「属性正在解析...」。

1. `Storage.filesListInfo`（`GET /v2/storages/files/list/info`，`sha1` + `resourceTypeCode`）轮询，直到 `metaAnalyzeStatus` 为 2 或 3。0/1 继续等。  
   **从第一次请求起最长 120 秒**。超时仍是 0/1：失败，「属性解析超时」，不进会话。不要调用会空转的 `getFilesSha1Info` 还不加超时。  
   `===3` 或平台错误：失败，不进会话。
2. `metaInfoArray`：`insertMode===1` → 系统 `raw`（空值不展示）；`insertMode===2` → 系统附加。
3. 附加的 key 逐个 `Resource.getAttrsInfoByKey`，得到 `format` / `valueConfig`。怎么填见 [属性 §2](../版本表单/01-属性.md)。

不要用 `Storage.fileProperty` 代替这条链。raw 不进工作稿。解析成功后写 `analyzedSha1=fileSha1`，并按 [本地状态 §2.2.1](../../../ARCHITECTURE/02-本地状态.md#221-工作稿不变量与文件分析) 处理已有 `inputAttrs`：兼容值保留，不兼容 / 消失值转入 `orphanedInputAttrs`，确认后才清除。本文没有上一版，禁止 inherit。不要对接 `lookDraft`。

---

## 4. 会话菜单

每次先打快照：文件名、sha1 前 8 位、raw、附加、自定义 `n/30`、可选配置 `n/30`、依赖（范围 / 是否已签）。再问「下一步？」

| 号 | 选项 | 进哪 | 何时出现 |
|----|------|------|----------|
| 1 | 添加属性 | [属性 §3](../版本表单/01-属性.md) | 自定义 <30 |
| 2 | 删除或修改属性 | [属性 §4](../版本表单/01-属性.md) | 有自定义或可改附加 |
| 3 | 添加可选配置 | [可选配置 §2](../版本表单/02-可选配置.md) | 类型允许且 <30 |
| 4 | 删除或修改可选配置 | [可选配置 §3](../版本表单/02-可选配置.md) | 类型允许且已有 |
| 5 | 添加依赖 | [依赖 §1](../版本表单/03-依赖.md) | 一直有 |
| 6 | 管理依赖 | [依赖 §2](../版本表单/03-依赖.md) | 已有依赖 |
| — | 提交 | §5 | 已有文件（稿里有 sha1 或本进程刚传） |
| — | 取消 | 不 POST；工作稿已写的保留 | 一直有 |

不要出现「编辑版本描述」。首版描述固定空串。  
选 1–6：做完立刻写盘，回到本菜单。`--yes` 跳过本菜单。`orphanedInputAttrs` 非空时不得提交：TTY 必须先确认分析变化，`--yes` 失败。
类型不允许可选配置：菜单 **3、4 不出现**；工作稿若仍带可选配置，§5 失败。  
签约若平台要 `licenseeVersion`：用 `1.0.0`，见 [依赖 §1.6](../版本表单/03-依赖.md)。加依赖先查已有授权，见 [§1.5](../版本表单/03-依赖.md)。

---

## 5. 提交

再拦：身份快照不匹配、`draftKind` 非 initial、无 sha1、`analyzedSha1 !== fileSha1`、`orphanedInputAttrs` 非空、有依赖未授权、不该有的可选配置、自定义/可选 >30。
提交前再 `Resource.info`（`isLoadLatestVersionInfo=1`）：已经有 `latestVersion` → 失败。工作稿留下。

失败必须**点名字段**，`--yes` 同样。不要只回「校验失败」或只回平台 `msg`：

| 拦 | 文案要点 |
|----|----------|
| 无 sha1 | 文件：工作稿没有 fileSha1，请 --artifact |
| 分析未完成 / 有待处理旧值 | 文件：当前文件的系统属性尚未确认，请重新解析并处理属性变更 |
| 对方有基础上抛 | 依赖 {id}：对方存在基础上抛，本期不支持 |
| 类型不允许可选配置 | 可选配置 {key}：当前类型不允许 |
| 条数超 | 自定义属性：已满 30 条 / 可选配置：已满 30 条 |
| 已经有 latest | 版本号：已有发行版本 {latest}，请使用 update-version |

TTY 摘要（`1.0.0`、文件、条数）。确认。「否」回菜单。

`Resource.createVersion`（`POST /v2/resources/{resourceId}/versions`）：

| 字段 | 值 |
|------|----|
| `version` | `1.0.0` |
| `fileSha1` / `filename` | 工作稿，没有则用 §2 |
| `description` | `''` |
| `inputAttrs` | 已由当前 `analyzedSha1` 校验的系统附加值 |
| `customPropertyDescriptors` | 自定义 `readonlyText` + 可选配置，见版本表单 |
| `dependencies` / `baseUpcastResources` / `authExcludedItems` | [依赖 §3](../版本表单/03-依赖.md)。不带 `batchSignContracts`。`authExcludedItems` 传 `[]` |
| `videoCover` | **不传** |

失败：`msg`，工作稿留下。成功：打印 `1.0.0`，**删掉** `N.version.json`，不串 policy / online。

`--yes` 不为已有工作稿依赖重新选策略或补签；授权完成度不是本期客户端提交门禁。添加 / 改范围时的策略选择规则见依赖文档。

---

## tools-lib

| 何时 | 函数 | HTTP |
|------|------|------|
| 门禁 | `Resource.info` | `GET /v2/resources/{id}` |
| 类型配置 | `Resource.getResourceTypeInfoByCode` | `GET /v2/resources/types/getInfoByCode` |
| 本地 SHA1 | `Tool.getSHA1Hash` | 与平台同一套，小写 hex |
| 是否已有文件 | `Storage.fileIsExist` | `GET /v2/storages/files/fileIsExist` |
| 上传 | `Storage.uploadFile` | `POST /v2/storages/files/upload` |
| 解析 | `Storage.filesListInfo` | `GET /v2/storages/files/list/info` |
| 附加格式 | `Resource.getAttrsInfoByKey` | `GET /v2/resources/attrs/getInfoByKey` |
| 签约 / 发行 | 见版本表单、`Resource.createVersion` | `POST .../contracts/batchSign`，`POST .../versions` |

不用 `Resource.resourceVersionInfo1`（没有上一版）。不用 `updateResourceVersionInfo`。不用 `publish`。

---

## 禁止

已有 `latestVersion` 还走本文。用 `version draft pull` 发首版。`--reuse-version` / `--version` / `--bump`。从已发版带字段。把带 `fromVersion` 的更新稿拿来发 1.0.0。用更新稿的 sha1 当首版续用。没文件就提交。`--prepare` 却 POST。成功后还留着工作稿。有首版稿不提醒、默默续或默默丢。多份状态未选中身份却按磁盘重算 sha1。续用 sha1 不先 `fileIsExist`。解析轮询不加 120s 超时。问了版本封面。`fileCommitMode` 不含本地上传还继续。存储空间 / Markdown / 漫画。`lookDraft` / `saveVersionsDraft`。属性写进 `N.json`。`publish`。支付或引导支付。一次必须加完才能退出。主题/插件要求人先打 zip；发行时替人跑构建；把工程根打进 zip。
