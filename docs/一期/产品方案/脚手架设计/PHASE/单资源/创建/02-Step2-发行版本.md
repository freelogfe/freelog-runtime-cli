# 发行版本（创建流程 Step2）

对照业务：[P0-F0-Step2](../../../业务梳理/创建流程%20-%20发行单个资源/P0-F0-Step2-提交资源文件.md)。  
**只有还没有 `latestVersion` 才走本文。** 没有上一版，不回显、不 inherit。

已有版本要发新号：走 [更新版本](../更新版本/01-更新版本.md) 的 `update-version`，不要读本文、不要把 `create-version` 改口成更新版本。  
只改某一已发号的描述：`version description`，见 [版本信息](../管理/01-版本信息.md)。

```
freelog-cli create-version
freelog-cli create-version --prepare  # 只建首版稿：定文件 + SHA1 + 解析，不进会话、不 POST
freelog-cli create-version --reset    # 丢掉工作稿，空表重来
```

属性 / 可选配置 / 依赖的每一问见 [版本表单](../版本表单/README.md)。  
首版没有上一号可拉：**不要**跑 `version draft pull`。分多次改：先 `--prepare`，再 `version attr` / `dep`，再 `create-version --yes`。

须已 `login`，已有 `resourceId`。本人、未冻结。版本号写死 `1.0.0`，`description=''`。  
文件 sha1、属性、可选配置、依赖每改一项写 `N.version.json`。不做平台草稿。不写 `N.json`。不用 `publish`。只做本地上传。

`--prepare`：走 0 → 0.1 → 1 → 2 → 3，然后结束。工作稿留下。不进菜单、不 POST。没有可用 sha1 仍失败。有 latest → 本命令整条失败（§0），不要改口。  
`--yes`：不进会话；有**首版**工作稿（无 `fromVersion`）就带上，没有只交系统解析。缺文件仍失败。一夹多条必须 `--file`。  
`--reset`：丢掉工作稿，空表重来。  
本文禁止 `--version` / `--bump` / `--reuse-version`（那是 `update-version`）。

看缓存：`version show --local`。看线上：`version show`（不写工作稿）。

| # | 功能 | 怎么进 |
|---|------|--------|
| 0 | 门禁：必须还没有版本 | 有 `latestVersion` → 失败，去 `update-version` |
| 0.1 | 工作稿提醒 | 有首版稿：TTY 默认继续；放弃则清空 |
| 1 | 定文件 | `--file` 先落到哪一份；只有**首版稿**的 sha1 可续 |
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
| 一夹多条未 `--file` | 列出 `filePath`，要求指定 |
| `--file` 对不上（多份且路径不在任何 `N.json`） | 失败 |
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

`--reset`：删掉 `N.version.json`，当没有。坏文件失败。

| 盘上 | 行为 |
|------|------|
| 没有 | 继续。还不必建文件 |
| 有，且**没有** `fromVersion` | **首版续改稿**。TTY 提醒，**默认继续**。`--yes` 续用，不问 |
| 有，且有 `fromVersion` | 更新版本的稿。**不读、不拿来发 1.0.0**。打印「这是更新版本的稿，发行版本不用」。本命令一旦写盘，整份按首版重写（不要留 `fromVersion` / 上一版字段） |

TTY 有首版稿时打：

```
发现本地版本工作稿  .freelog/N.version.json
  来源：首版
  文件：{filename}  sha1={前8位}…    # 还没有文件则打「尚未上传」
  自定义 n / 可选配置 n / 依赖 n

继续使用这份？ [Y]  放弃，重新开始 [n]
```

选放弃：删掉这份，空表。看内容：先结束，跑 `version show --local`。

---

## 1. 确定文件

`--file` **先落到哪一份**（和 [本地状态](../../../ARCHITECTURE/02-本地状态.md) 一样），不是一律换文件。

| `--file` | 哪一份 / 路径 |
|----------|----------------|
| 路径已在某份 `filePath` | 那一份。不改 `filePath` |
| 仅一份，路径还不在 index | 写入这份 `filePath` 和 index（与 `version set --file` 相同，本步仍不上传） |
| 多份，路径不在任何 `N.json` | 失败 |
| 未传，仅一份 | 那一份 |
| 未传，多份 | §0 已失败 |

**能续用的 sha1**：只有**首版稿**（盘上有 `N.version.json` 且**没有** `fromVersion`）里的 `fileSha1`。有 `fromVersion` 的稿当没有（§0.1），不要拿来续。

| 进入 | 用哪份文件 |
|------|------------|
| 未传 `--file`，首版稿已有 `fileSha1` | **续用**该 sha1。**不重读**磁盘。本地文件可以不在 |
| `--file` 就是这份已有 `filePath`，本地文件**不在**，首版稿已有 sha1 | **只选份，续用** sha1。不要失败 |
| `--file` 就是这份已有 `filePath`，本地文件**在** | 按磁盘重算（§2） |
| `--file` 与当前 `filePath` 不同（或第一次写入路径） | **换文件**。本地必须在 |
| 没有可续用的 sha1，也没有本地文件 | TTY 问一次路径。仍空则退出。`--yes`：失败 |

换文件 / 按磁盘算时：

| 情况 | |
|------|--|
| 文件在（或 `directory-zip` 的目录） | 继续 |
| 超大小 | 失败，不上传 |
| `directory-zip` | 先打 zip 再当文件 |

续用 sha1：打印「续用工作稿文件 {filename} sha1={前8位}…」。按磁盘：打印「将使用文件：{相对路径}」。无 tools-lib。

---

## 2. SHA1，没有才上传

### 2.1 续用首版稿

走 §1 的「续用」：先 `Storage.fileIsExist`（`GET /v2/storages/files/fileIsExist`，稿里的 sha1）。  
已有：不必再传，去 §3。  
没有：「存储上没有这个文件，请 --file 指定本地文件重新上传」。失败，不进会话。

### 2.2 按磁盘

1. 本地算 SHA1（`Tool.getSHA1Hash` / 与平台同一套，小写 hex，不要自造）。
2. `Storage.fileIsExist`。
3. 已有：跳过上传，记下 `fileSha1`、`filename`。
4. 没有：`Storage.uploadFile`（`POST /v2/storages/files/upload`，带文件 + `resourceType`）。进度；取消 = 失败；中断整文件再传。
5. 失败：平台 `msg`，不进会话。

得到 `fileSha1` / `filename` 后**立刻写入** `N.version.json`（没有这份就新建；有 `fromVersion` 的整份按首版重写，不要留 `fromVersion`）。不写 `N.json`。工作稿已有相同 sha1：不必再传。

---

## 3. 解析系统属性

打印「属性正在解析...」。

1. `Storage.filesListInfo`（`GET /v2/storages/files/list/info`，`sha1` + `resourceTypeCode`）轮询，直到 `metaAnalyzeStatus` 为 2 或 3。0/1 继续等。  
   **从第一次请求起最长 120 秒**。超时仍是 0/1：失败，「属性解析超时」，不进会话。不要调用会空转的 `getFilesSha1Info` 还不加超时。  
   `===3` 或平台错误：失败，不进会话。
2. `metaInfoArray`：`insertMode===1` → 系统 `raw`（空值不展示）；`insertMode===2` → 系统附加。
3. 附加的 key 逐个 `Resource.getAttrsInfoByKey`，得到 `format` / `valueConfig`。怎么填见 [属性 §2](../版本表单/01-属性.md)。

不要用 `Storage.fileProperty` 代替这条链。raw 不进工作稿。工作稿已有的 additional value **本地优先**。本文没有上一版，禁止 inherit。不要对接 `lookDraft`。

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
选 1–6：做完立刻写盘，回到本菜单。`--yes` 跳过本菜单。  
类型不允许可选配置：菜单 **3、4 不出现**；工作稿若仍带可选配置，§5 失败。  
签约若平台要 `licenseeVersion`：用 `1.0.0`，见 [依赖 §1.6](../版本表单/03-依赖.md)。加依赖先查已有授权，见 [§1.5](../版本表单/03-依赖.md)。

---

## 5. 提交

再拦：无 sha1；有依赖未授权；不该有的可选配置；自定义/可选 >30。  
提交前再 `Resource.info`（`isLoadLatestVersionInfo=1`）：已经有 `latestVersion` → 失败。工作稿留下。

失败必须**点名字段**，`--yes` 同样。不要只回「校验失败」或只回平台 `msg`：

| 拦 | 文案要点 |
|----|----------|
| 无 sha1 | 文件：工作稿没有 fileSha1，请 --file |
| 依赖未授权 | 依赖 {username/name 或 id}：未获得授权 |
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
| `inputAttrs` | 系统附加，工作稿优先 |
| `customPropertyDescriptors` | 自定义 `readonlyText` + 可选配置，见版本表单 |
| `dependencies` / `baseUpcastResources` / `authExcludedItems` | [依赖 §3](../版本表单/03-依赖.md)。不带 `batchSignContracts`。`authExcludedItems` 传 `[]` |
| `videoCover` | **不传** |

失败：`msg`，工作稿留下。成功：打印 `1.0.0`，**删掉** `N.version.json`，不串 policy / online。

`--yes` 未签依赖：按依赖文档自动签的限制来。

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

已有 `latestVersion` 还走本文。用 `version draft pull` 发首版。`--reuse-version` / `--version` / `--bump`。从已发版带字段。把带 `fromVersion` 的更新稿拿来发 1.0.0。用更新稿的 sha1 当首版续用。没文件就提交。`--prepare` 却 POST。成功后还留着工作稿。有首版稿不提醒、默默续或默默丢。未传 `--file` 却按磁盘重算 sha1。续用 sha1 不先 `fileIsExist`。解析轮询不加 120s 超时。问了版本封面。`fileCommitMode` 不含本地上传还继续。存储空间 / Markdown / 漫画。`lookDraft` / `saveVersionsDraft`。属性写进 `N.json`。`publish`。付费签约。一次必须加完才能退出。
