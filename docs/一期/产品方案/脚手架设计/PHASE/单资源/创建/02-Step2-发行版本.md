# 发行版本（创建流程 Step2）

对照业务：[P0-F0-Step2](../../../业务梳理/创建流程%20-%20发行单个资源/P0-F0-Step2-提交资源文件.md)。  
**只有还没有 `latestVersion` 才走本文。** 没有上一版，不回显、不 inherit。

已有版本要发新号：走 [更新版本](../更新版本/01-更新版本.md) 的 `update-version`，不要读本文、不要把 `create-version` 改口成更新版本。  
只改某一已发号的描述：`version description`，见 [版本信息](../管理/01-版本信息.md)。

```
freelog-cli create-version
freelog-cli create-version --reset    # 丢掉工作稿，空表重来
```

属性 / 可选配置 / 依赖的每一问见 [版本表单](../版本表单/README.md)。

须已 `login`，已有 `resourceId`。本人、未冻结。版本号写死 `1.0.0`，`description=''`。  
文件 sha1、属性、可选配置、依赖每改一项写 `N.version.json`。不做平台草稿。不写 `N.json`。不用 `publish`。只做本地上传。

`--yes`：不进会话；有**首版**工作稿（无 `fromVersion`）就带上，没有只交系统解析。缺文件仍失败。一夹多条必须 `--file`。  
`--reset`：丢掉工作稿，空表重来。  
本文禁止 `--version` / `--bump` / `--reuse-version`（那是 `update-version`）。

看缓存：`version show --local`。看线上：`version show`（不写工作稿）。

| # | 功能 | 怎么进 |
|---|------|--------|
| 0 | 门禁：必须还没有版本 | 有 `latestVersion` → 失败，去 `update-version` |
| 0.1 | 工作稿提醒 | 有首版稿：TTY 默认继续；放弃则清空 |
| 1 | 定文件 | `--file` / 已有 `filePath` / 稿里已有 sha1 可续 |
| 2 | SHA1，没有才上传 | 成功立刻写入工作稿 `fileSha1` / `filename` |
| 3 | 解析系统属性 | `filesListInfo` 轮询。raw 不写盘 |
| 4 | 会话菜单 1–6 | 进版本表单。**没有**描述项 |
| 5 | 提交 `1.0.0` | `createVersion`，`description=''`。成功**删掉**工作稿 |

```
0 门禁（无 latestVersion）
  → 0.1 有首版工作稿？提醒（默认继续 / 放弃重来）
  → 1 确定文件
  → 2 SHA1，没有才上传 → 写进 N.version.json
  → 3 解析系统属性
  → 4 会话菜单 1–6（每项写盘）
  → 5 POST createVersion（1.0.0）→ 成功清空工作稿
```

没有文件 → 不进会话、不发行。可先改工作稿。视频可以一次都不选菜单直接提交。  
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
| `--file` 对不上 | 失败 |
| 非本人、冻结 | 失败 |

`Resource.getResourceTypeInfoByCode`（`GET /v2/resources/types/getInfoByCode`）：

| 配置 | 用法 |
|------|------|
| `fileCommitMode` 含 `2^0` | 本地上传；其它提交方式本期不做 |
| `fileMaxSize` + `fileMaxSizeUnit` | 上限 = `fileMaxSize * 1024 * (1024 ** fileMaxSizeUnit)` |
| `supportOptionalConfig === 2` | 菜单才有「可选配置」 |
| 类型名含「视频」 | 上传后**可问**版本封面；**不传** `videoCover` |

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

读 `N.json.filePath`。`--file` 覆盖并写回路径和 index（与 `version set --file` 相同，本步仍不上传）。

未传 `--file`：工作稿已有 `fileSha1` 则可续用（**不重读**当前 `filePath` 的文件内容）。仍可用 `--file` 换或按磁盘重算。否则用当前 `filePath`。没有 `filePath` 且没有稿里的 sha1：TTY 问一次路径。仍空则退出。`--yes` 没有路径也没有稿里 sha1：失败。

| 情况 | |
|------|--|
| 文件在（或 `directory-zip` 的目录） | 继续 |
| 超大小 | 失败，不上传 |
| `directory-zip` | 先打 zip 再当文件 |

打印：`将使用文件：{相对路径}`。无 tools-lib。

---

## 2. SHA1，没有才上传

1. 本地算 SHA1（小写 hex，与平台同一套，不要自造）。
2. `Storage.fileIsExist`（`GET /v2/storages/files/fileIsExist`）。
3. 已有：跳过上传，记下 `fileSha1`、`filename`。
4. 没有：`Storage.uploadFile`（`POST /v2/storages/files/upload`，带文件 + `resourceType`）。进度；取消 = 失败；中断整文件再传。
5. 失败：平台 `msg`，不进会话。

得到 `fileSha1` / `filename` 后**立刻写入** `N.version.json`（没有这份就新建，不要写 `fromVersion`）。不写 `N.json`。工作稿已有相同 sha1：不必再传。

---

## 3. 解析系统属性

打印「属性正在解析...」。

1. `Storage.filesListInfo`（`GET /v2/storages/files/list/info`，`sha1` + `resourceTypeCode`）轮询，直到 `metaAnalyzeStatus` 为 2 或 3。0/1 继续等。失败或完不成：不进会话。
2. `metaInfoArray`：`insertMode===1` → 系统 `raw`（空值不展示）；`insertMode===2` → 系统附加。
3. 附加的 key 逐个 `Resource.getAttrsInfoByKey`，得到 `format` / `valueConfig`。怎么填见 [属性 §2](../版本表单/01-属性.md)。

不要用 `Storage.fileProperty` 代替这条链。raw 不进工作稿。工作稿已有的 additional value **本地优先**。本文没有上一版，禁止 inherit。不要对接 `lookDraft`。

---

## 4. 会话菜单

每次先打快照：文件名、sha1 前 8 位、raw、附加、自定义 `n/30`、可选配置 `n/30`、依赖（范围 / 是否已签 / 是否上抛）。再问「下一步？」

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
签约若平台要 `licenseeVersion`：用 `1.0.0`，见 [依赖 §1.5](../版本表单/03-依赖.md)。

---

## 5. 提交

再拦：无 sha1；有依赖未签完；不该有的可选配置；自定义/可选 >30。  
提交前再 `Resource.info`（`isLoadLatestVersionInfo=1`）：已经有 `latestVersion` → 失败，「已有发行版本，请使用 update-version」。工作稿留下（下次 `update-version` 按首版残留覆盖）。

TTY 摘要（`1.0.0`、文件、条数）。确认。「否」回菜单。

`Resource.createVersion`（`POST /v2/resources/{resourceId}/versions`）：

| 字段 | 值 |
|------|----|
| `version` | `1.0.0` |
| `fileSha1` / `filename` | 工作稿，没有则用 §2 |
| `description` | `''` |
| `inputAttrs` | 系统附加，工作稿优先 |
| `customPropertyDescriptors` | 自定义 `readonlyText` + 可选配置，见版本表单 |
| `dependencies` / `baseUpcastResources` / `batchSignContracts` / `authExcludedItems` | [依赖 §3](../版本表单/03-依赖.md) |
| `videoCover` | **不传** |

失败：`msg`，工作稿留下。成功：打印 `1.0.0`，**删掉** `N.version.json`，不串 policy / online。

`--yes` 未签依赖：按依赖文档自动签的限制来。

---

## tools-lib

| 何时 | 函数 | HTTP |
|------|------|------|
| 门禁 | `Resource.info` | `GET /v2/resources/{id}` |
| 类型配置 | `Resource.getResourceTypeInfoByCode` | `GET /v2/resources/types/getInfoByCode` |
| 是否已有文件 | `Storage.fileIsExist` | `GET /v2/storages/files/fileIsExist` |
| 上传 | `Storage.uploadFile` | `POST /v2/storages/files/upload` |
| 解析 | `Storage.filesListInfo` | `GET /v2/storages/files/list/info` |
| 附加格式 | `Resource.getAttrsInfoByKey` | `GET /v2/resources/attrs/getInfoByKey` |
| 签约 / 发行 | 见版本表单、`Resource.createVersion` | `POST .../contracts/batchSign`，`POST .../versions` |

不用 `Resource.resourceVersionInfo1`（没有上一版）。不用 `updateResourceVersionInfo`。不用 `publish`。

---

## 禁止

已有 `latestVersion` 还走本文。`--reuse-version` / `--version` / `--bump`。从已发版带字段。把带 `fromVersion` 的更新稿拿来发 1.0.0。没文件就提交。成功后还留着工作稿。有首版稿不提醒、默默续或默默丢。未传 `--file` 却按磁盘重算 sha1。存储空间 / Markdown / 漫画。`lookDraft` / `saveVersionsDraft`。属性写进 `N.json`。`publish`。付费签约。一次必须加完才能退出。
