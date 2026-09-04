# Step1 - 创建授权条目

对照业务：创建授权条目。本命令只建壳：类型、标题、授权标识。不上传、不加策略、不上架。

```
freelog-cli create
```

须已 `login`。`--yes` 不进下面任何一步提问，缺 `--type` / `--title` / `--name` 直接失败。

本命令只建**新壳**。壳已经有了（本地或线上）、只是还没 `create-version`：不要再 POST，按 §0 走 `create-version` 或 `bind`。

```
已 login
  → 0. 定哪一份 N.json；文件占用；本地/线上是否已有壳
  → 1. 资源类型     （init 已定稿或已传 --type 则跳过提问）
  → 2. 资源标题
  → 3. 资源授权标识 （默认用标题前 60 字，可改；规范化 + 查重）
  → 4. 可选：对应文件 --file（只记路径，本步不上传）
  → 5. 立即创建     POST 建壳，写 N.json
```

取消任一步：整次 `create` 结束，不写平台、不写 `resourceId`。

---

## 0. 进入：先对上本地和线上

先定「这一次 create 要对哪一份 `N.json`」，再看这份和 `--file` / 标识有没有已经建过壳。  
`Resource.info`（`GET /v2/resources/{id}`，`isLoadLatestVersionInfo=1`）只在已经有 `resourceId`、或查重命中自己的壳时用。

### 0.1 对上哪一份

| 进入 | 用哪份 |
|------|--------|
| `--file <path>` 已在 `index.json` | 那一份 |
| 工程里只有一份 `N.json` | 那一份 |
| 多份且未 `--file` | 失败。列出各份 `filePath` / 是否已有 `resourceId`，要求 `--file` |
| 还没有 `.freelog/` / 没有 `N.json` | 本命令成功后新建 `max+1`（不必先 `init`） |

路径必须落在当前工程里。本步不要求文件已经存在（不上传；没有文件到 `create-version` 再拦）。

### 0.2 本地这份已经有壳

对上的 `N.json` **已经有 `resourceId`**：禁止再 `create`，不要问类型/标题。先 `Resource.info` 看有没有 `latestVersion`。

| 线上 | 打印 | 去哪 |
|------|------|------|
| 没有这条 / 不是本人 | 失败。身份对不上，不要再 `create`。对得上用 `bind` | `bind` |
| 本人，**还没有** `latestVersion` | 「这个资源已经创建过授权条目，还没有发行版本。」 | `create-version`（有 `filePath` 可带 `--file`） |
| 本人，**已有** `latestVersion` | 「这个资源已经有发行版本。」 | `update-version` 或管理 |

`--yes` 同样失败（退出码非 0），提示里带上下一条命令。不要空 POST。

### 0.3 对应文件已经被另一份占用

`--file` 或将要写入的路径，已经是**另一份** `N.json` 的 `filePath`：

| 那一份 | 行为 |
|--------|------|
| 已有 `resourceId`，线上无版本 | 失败。「文件 {path} 已对应 {username/name}，且还没有发行版本。请对该资源 create-version。」 |
| 已有 `resourceId`，线上有版本 | 失败。「文件 {path} 已对应 {username/name}。不要再 create。」去 `update-version` 或换文件 |
| 没有 `resourceId`（只 init 过） | 可以 `create`，写入**那一份**（这就是 init 之后的正常路） |

同一工作区：一个 `filePath` 一份 `N.json`。不要为同一个文件再建一个壳。

### 0.4 授权标识在线上已经有了（自己的壳，可能还没发行）

第 3 步查重命中时按这个表，不要一律「已被使用，请改名」。先 `info`（`isLoadLatestVersionInfo=1`）看是不是本人、有没有版本。

| 线上 | 本地 | 行为 |
|------|------|------|
| 没有这条 | — | 通过，继续 create |
| 别人的，或不是本人 | — | 「资源授权标识 {authID} 已被使用，请重新输入。」TTY 改短标识；`--yes` 失败 |
| 本人，无 `latestVersion`，本地**这份**已是这个 `resourceId` | 走 §0.2，本不该问到标识 | 去 `create-version` |
| 本人，无 `latestVersion`，本地没有这份 / 对不上 | 「这个标识已经创建过授权条目，还没有发行版本。」 | **禁止再 POST**。`bind <id\|username/name> --file <path>`，再 `create-version` |
| 本人，有 `latestVersion` | 「这个标识已经有发行版本。」 | **禁止再 POST**。`bind` 后 `update-version` |
| `create` 曾经成功但 `N.json` 没写成 `resourceId` | 同「本人、无版本、本地对不上」 | `bind` 同一 id，不要再 `create` |

不要把「自己的壳、还没发行」当成创建成功，也不要当成「换个名字再 create」。

### 0.5 和本命令无关

| 情况 | 谁管 |
|------|------|
| 有 `N.version.json`、这份已有壳、还没发行 | 不挡 `create`（`create` 在 §0.2 已经失败）。去 `create-version`，那边提醒工作稿 |
| 有工作稿、这份还没有 `resourceId` | 不挡 `create`。工作稿等有壳之后由 `create-version` 处理 |

### 本步 tools-lib

| 何时 | 函数 | HTTP | 参数 |
|------|------|------|------|
| 本地已有 `resourceId`；查重命中自己的壳 | `Resource.info` | `GET /v2/resources/{id}` | `isLoadLatestVersionInfo=1`（看有没有 `latestVersion`） |

对哪一份、文件占用：只读本地 `index.json` / `N.json`，不打平台。

---

## 1. 选择资源类型

用户要选的是平台**叶子**类型。有子节点的只能往下走，不能定稿。终端里**一级一级问**，不要做成网页级联。

帮助（先打一行，再出菜单）：

> 资源类型  
> 选择最贴切描述此资源的类型，其他用户会通过资源类型在资源市场中寻找他们想要的资源。

### 1.1 什么时候问、什么时候不问

| 进入时 | 行为 |
|--------|------|
| 已传 `--type <code>` | 不问。校验必须是启用中的叶子；不是则失败并提示用下面交互或 `type search` |
| `N.json.typeCode` 已有（`init` 定稿）且未传 `--type` | 不问。打印「已使用工程类型：{路径名}（{code}）」 |
| 上面都没有，且是 TTY | 走 §1.2 起的交互 |
| `--yes` 且没有类型 | 失败：「请选择资源类型」 |

`--type` 与工程里已有 `typeCode` 不一致：以**当次 `--type`** 为准，通过后写回 `N.json.typeCode`。

### 1.2 拉树之后的第一屏

先取类型树，再取最近用过的（最多 6 条）。第一屏选项从上到下：

1. **建议**（有才出现）：最近 6 条，每条显示「名称（code）」。选中一条且它是叶子 → 本步结束。若不是叶子（极少）→ 从它往下继续 §1.3。
2. 当前一级的每个节点：  
   - 叶子：选中即定稿。hint 带 `code`。  
   - 非叶子：选中进入下一屏。hint：`{code} → 还有 N 个子类型`。
3. **搜索资源类型**
4. 若当前停在某一父级下（不是树根）：**添加新类型**（见 §1.5）
5. 不是树根时：**返回上一级**

提示语：树根用「请选择资源类型（一级）」；进入子级用「请选择子类型（{已选路径}）」，例如 `请选择子类型（视频 > 短视频）`。

Ctrl+C / 取消：整次退出。

### 1.3 逐级往下

```
选中非叶子
  → 新一屏只列出它的子节点
  → 仍按 §1.2：叶子定稿 / 非叶子再往下 / 搜索 / 返回 /（父级下可添加新类型）
选中叶子
  → 记下 code、名称、从根到叶的路径
  → 结束本步，去标题
```

不能在非叶子上「确定」。没有「清空已选还留在本命令里」；要换大类用「返回上一级」或重新跑 `create`。

### 1.4 搜索

选「搜索资源类型」后：

1. 问：「搜索资源类型（名称或 code）」。空关键词不让过。
2. 只在**叶子**里搜（`isTerminate=true`，`status=1`，`subjectType=1`）。
3. 0 条：提示「未找到匹配的资源类型」，回到当前这一屏，不退出 `create`。
4. 1 条：直接定稿该叶子。
5. 多条：再出一屏「找到 N 个匹配，请选择」，列出 `名称 (code)`。取消搜索回到当前这一屏。

### 1.5 在父级下添加新类型

只出现在**已经进入某个父级**的那一屏，和 Console 一样：不会单独调用「创建类型」接口。

1. 选「添加新类型」。
2. 问：「输入新资源类型名称」。
3. 过 `RESOURCE_TYPE`：`^[\u4e00-\u9fefa-zA-Z0-9\\-&.,]{1,40}$`。不过就当场提示，重新问。
4. 定稿：`resourceTypeCode` = **当前父级**的 code（不是新叶子自己的 code）；`resourceTypeName` = 刚输入的名称。创建时两个一起交给 `Resource.create`。
5. 标准 `RT*` 叶子定稿时**不要**带 `resourceTypeName`。

命令行等价：`--type <父级code> --type-name <新名称>`。TTY 走完本节后不要再问一遍 `--type-name`。

### 1.6 `--type` / `type info`（不进菜单时）

`--type` 必须是叶子。实现上先 `getResourceTypeInfoByCode`，再确认树上 `isTerminate`。非叶子、停用、不存在：失败，提示 `type search <关键词>` 或去掉 `--type` 走交互。

`type list` / `type search` / `type pick` 是独立命令，供人先查；**不**代替 `create` 里本节。`create` 缺类型时自己开会话，不要叫用户先跑 `type pick`。

### 本步字段

| 字段 | 约束 | 必填 | 默认 |
|------|------|------|------|
| `resourceTypeCode` | 启用中的叶子 code；新类型时为**父级** code | 是 | `init` 已写则用它 |
| `resourceTypeName` | 仅「添加新类型」；1–40，中英数字与 `-&.,` | 仅新类型 | 不传 |
| 展示路径 | 从根到叶的名称，只打印 | — | — |

未选就提交：`请选择资源类型`。

### 本步 tools-lib

`packages/tools-lib/src/service-API/resources.ts`、`utils/regexp.ts`。

| 何时 | 函数 | HTTP | 参数 |
|------|------|------|------|
| 进交互、拉整树 | `Resource.resourceTypes` | `GET /v2/resources/types/listSimpleByGroup` | `category=1`，`status=1`，`subjectType=1` |
| 第一屏「建议」 | `Resource.listSimple4Recently` | `GET /v2/resources/types/listSimple4Recently` | `subjectType=1`；只用前 6 条 |
| 搜索叶子 | `Resource.ListSimpleByParentCode` | `GET /v2/resources/types/listSimpleByParentCode` | `nameChain` 或 `name`，`isTerminate=true`，`status=1`，`subjectType=1` |
| 校验 `--type` / 叶子能力 | `Resource.getResourceTypeInfoByCode` | `GET /v2/resources/types/getInfoByCode` | `code` |
| 新类型名 | `FUtil.Regexp.RESOURCE_TYPE` | 本地 | 无单独创建类型 API |

---

## 2. 资源标题

类型定稿之后问标题。已传 `--title` 且非空：不问，只做校验。

### 2.1 问什么

先打帮助，再输入：

> 资源标题  
> 标题直接影响资源的搜索曝光机会，建议在标题中加入品牌/内容主旨；标题长度不超过100个字符。

提问：「资源标题（展示名）」。hint：不可为空，最多 100 字。placeholder 语义：「输入标题」。

### 2.2 当场校验

| 输入 | 行为 |
|------|------|
| 空 / 只空白 | 不让过：「请输入资源标题」 |
| 超过 100 字 | 不让过：「不超过100个字符」。不要截断后偷偷提交 |
| `trim` 后 1–100 | 通过。提交用 `trim()` 后的值 |

标题**不写** `N.json`。改标题**不**单独打平台。

### 2.3 和授权标识的关系（先记住，下一问才用）

和 Console 同一条「未分叉才跟着改」：

- 刚问完标题、还没改过标识：标识的**预填值** = 标题 `trim` 后的前 60 个字符（尚未规范化，规范化在第 3 步做）。
- 用户如果已经用 `--name` 传来，或在第 3 步改过标识：标题和标识分叉，**再改标题也不再覆盖标识**。本命令里标题只问一次，所以实际就是：没传 `--name` 时，第 3 步默认带标题前 60 字。

不要学 Console 创建成功后把标题改写成标识。

### 本步字段

| 字段 | 请求名 | 约束 | 必填 | 落哪 |
|------|--------|------|------|------|
| 标题 | `resourceTitle` | `trim`，非空，≤100 | 是 | 只进当次 `Resource.create` |

### 本步 tools-lib

无。标题不查重、不建壳。

---

## 3. 资源授权标识

展示给用户看的是：当前登录名 + `/` + 短标识。例如 `alice / my-video`。  
说明：

> 资源授权标识  
> 此资源在整个授权系统中的唯一标识符，一旦创建则不能更改。  
> 1-60个字符，不能包含空格、表情符号（emoji）及以下特殊字符：\ / : * ? " < > \| @ # $

提问短标识，**不要**让用户输入 `username/name` 全名。`--name` 里若带了 `/`：失败，提示只传短段。

### 3.1 默认复用标题，可以改

| 进入第 3 步时 | 输入框默认值 |
|---------------|--------------|
| 已传 `--name` | 用 `--name`（先规范化再查重）。不再用标题覆盖 |
| 未传 `--name` | 用第 2 步标题 `trim` 后的**前 60 字**（未分叉） |

用户可以：

- 直接回车：接受默认（标题带过来的，或 `--name`）
- 改成别的短标识
- 不能留空

回车前还要规范化 + 查重，不通过就继续问，不要用坏值去创建。

### 3.2 规范化（改一个字就做，不必等创建）

规则与 Console `resourceNameOptimized` 相同：把 `\ / : * ? " < > |`、空白、`@ $ #`、emoji 换成 `_`。长度 1–60（以规范化后为准）。

| 情况 | 终端 |
|------|------|
| 规范化后是空串 | 「请输入资源授权标识」，重新问 |
| 输入和规范化结果不同 | 打印「您的资源授权标识将自动转换为{authid}」，并以规范化结果继续查重 |
| 已经干净 | 不打转换提示 |

查重和 `create.name` 都用**规范化后**的短标识，不是用户原始输入。

### 3.3 查重

规范化通过后立刻查，TTY 不必做 300ms 防抖（那是网页输入；终端是问完一轮再查）。

1. `Resource.info`，`resourceIdOrName` 传 `username/规范化短标识`（**不要**自己先 `encodeURIComponent`，tools-lib 会编一次），`isLoadLatestVersionInfo=1`（用来分「还没发行」和「已经有版本」）。
2. 命中后按 **§0.4**：别人的才改名重问；自己的壳（有没有版本都一样）**禁止再 POST**，无版本去 `create-version` 或先 `bind`，有版本去 `update-version`。不要一律打「已被使用，请改名」，也不要把同名当成创建成功。

`--yes`：查重失败或命中自己的壳都是命令失败，不改名重试。提示里带上下一条该跑的命令。

### 本步字段

| 字段 | 约束 | 必填 | 说明 |
|------|------|------|------|
| 用户输入 | 最长 60；可含非法字符（会被换成 `_`） | 是 | 可见值 |
| `name`（请求） | 规范化后 1–60，无 `/` | 是 | 短标识，不是 `username/name` |
| 查重键 | `username` + `/` + `name` | — | 仅 GET |

创建成功后 `name` 写进 `N.json.name`，之后只读，不再用 `create --name` 改。

### 本步 tools-lib

| 何时 | 函数 | HTTP | 参数 |
|------|------|------|------|
| 当前用户名 | 登录态里的 username（账号模块，不是资源 API） | — | 展示 `username /` |
| 查重 / 看有没有版本 | `Resource.info` | `GET /v2/resources/{resourceIdOrName}` | 未编码的 `username/name`；`isLoadLatestVersionInfo=1` |

---

## 4. 对应文件（可选）

不是 Console Step1 的字段。CLI 一夹多文件时，本步只把路径记到身份上，**不上传**。写入前先过 **§0.1 / §0.3**（对上哪一份、文件有没有被另一份占用）。

| 进入 | 行为 |
|------|------|
| 已传 `--file`，路径已是**这份**的 `filePath` | 不改，不问 |
| 已传 `--file`，路径不在任何 `N.json` | 写入这份的 `filePath` 和 `index.json`，不问 |
| 已传 `--file`，路径已是**另一份**的 `filePath` | 按 §0.3：那份只 init 过则改对那份继续 create；那份已有壳则失败 |
| 未传，且工程还没有 `filePath` | TTY 可问一次「本地文件路径（可空，以后 create-version 再指定）」；空则跳过。问完的路径同样过 §0.3 |
| `--yes` 且未传 | 不写 `filePath`（以后 `version set --file` 或 `create-version --file`） |

路径必须落在当前工程里。本步不要求文件已经存在。本步不调 Storage。

---

## 5. 立即创建

前面三问都过了才到这里。TTY 打一行摘要再确认：

```
类型：{路径名}（{code}）
标题：{title}
标识：{username}/{name}
```

确认「立即创建」。否 / 取消：不 POST。`--yes`：不确认，直接 POST。

任一未过不得创建：类型空、标题空或超长、标识空或查重失败。

### 5.1 请求

`Resource.create`，**不传** `subjectType`（默认普通资源 1）。本期只带：

| 请求字段 | 来自 |
|----------|------|
| `name` | 第 3 步规范化短标识 |
| `resourceTitle` | 第 2 步 `trim` |
| `resourceTypeCode` | 第 1 步叶子 code 或新类型的父级 code |
| `resourceTypeName` | 仅第 1 步走了「添加新类型」时 |

不带 `policies`、`coverImages`、`intro`、`tags`。

### 5.2 成功 / 失败

| 平台返回 | 行为 |
|----------|------|
| 失败（`ret`/`errCode`/无 data） | 打印平台 `msg`，停在本命令，不写 `resourceId` |
| 成功 | 打印 `resourceId` 和 `username/name` |

成功后写 `N.json`（只身份）：`subject=resource`，`resourceId`，`name`，`typeCode`，已有则保留 `filePath`。非 prod 写 `env`。标题**不**写入。  
不要把标题改成标识。

成功后再拉一次类型配置，给 `create-version` 用（能否本地上传、大小上限、是否可选配置）。配置可只放内存 / 当次缓存，**不要**写进 `N.json`。

然后结束 `create`。下一步是人自己跑 `create-version`，本命令不串。

### 本步 tools-lib

| 何时 | 函数 | HTTP | 请求 / 使用字段 |
|------|------|------|----------------|
| 建壳 | `Resource.create` | `POST /v2/resources` | 见 §5.1 |
| 拉类型配置 | `Resource.getResourceTypeInfoByCode` | `GET /v2/resources/types/getInfoByCode` | `code` |

类型配置怎么读（给 Step2，本步只拉不解释完）：

| 平台字段 | Step2 要用的 |
|----------|----------------|
| `fileCommitMode` 含 `2^0` | 允许本地上传（本期只做这个） |
| `fileMaxSize` + `fileMaxSizeUnit` | 上传上限 |
| `supportOptionalConfig === 2` | 会话出现可选配置 |
| `supportDownload` / `supportEdit` | 记下即可，本步不展示 |

含存储空间 / Markdown / 漫画的位：本期 `create-version` 不做这些提交方式。

响应里至少用：`resourceId`，`resourceName`，`resourceTypeCode`。

---

## 禁止

- 把 `init` 当 `create`（init 不打 `POST /v2/resources`）
- 一条命令走完四步
- 同名已存在还当创建成功
- 自己的壳再 `create`（本地已有 `resourceId`、线上已有同名壳、`create` 成功但没写成 id：一律禁止再 POST）
- 文件已被另一份占用还再 `create`
- 自己的壳、还没发行，却让用户「换个名字再 create」
- `create.name` 传 `username/name`
- 查重 path 先编码再交给 tools-lib（会编两次）
- 创建成功后改写标题
- 合集 `subjectType=4`（暂缓）
