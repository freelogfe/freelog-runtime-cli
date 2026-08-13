# CLI 字段账本

> 文档角色：字段与存储契约。产品目标和范围以仓库根目录 [DESIGN.md](../../../DESIGN.md) 为准；实现完成度和某次测试结果不应在本账本中定义。

最后更新：2026-08-13

本文是 manifest/state/API **字段契约真源**。用户操作流程与排错见 [CLI 使用文档目录](../使用/README.md)；citty 参数定义与 `--help` 文案见 [CLI脚手架设计 §4.1](./CLI脚手架设计.md#41-命令参数与--helpcliargsts) 与 [`packages/cli/src/core/cliArgs.ts`](../../../packages/cli/src/core/cliArgs.ts)。

Console 表单的必填、长度、提示、条件显示和禁用规则不在本账本重复定义，见 [Console表单字段与交互规则](../对齐/Console表单字段与交互规则.md)。

**Console 业务 → API → CLI 操作级对照**（请求体字段、草稿分类、策略语法、dev 实测）见 [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md)。

## 1. 总原则

| 项 | 结论 |
|---|---|
| 产品目标 | 没有 Console UI，也能用 CLI 完成资源生命周期操作 |
| 对齐对象 | Console 调用接口后的平台最终状态 |
| 不对齐对象 | Console 页面向导、弹窗、防抖保存、鼠标交互、微应用 UI |
| CLI 输入方式 | 简单字段用 flag；长期项目意图用 manifest；批量/策略/授权映射用 JSON/YAML |
| 平台事实 | 只写 `.freelog/state.json`，不写 manifest |
| 用户意图 | 写 `freelog.manifest.json`，可提交 git |
| 上架门禁 | `online` 必须满足 latestVersion + 至少一条启用策略（对齐 sidebar **硬路径** `resourceOnline()`，**不对齐** creator Step4 软 `status:1`） |
| 复杂人机能力 | 支付、验证码、不可自动确认的授权必须显式失败；支付/签约返回 `reason/actionUrl/contractsUrl/nextCommand` 完成 Console 接力 |

## 2. CLI 基础字段

| 业务 | 字段/输入 | 存储/输出 | 当前状态 |
|---|---|---|---|
| 环境选择 | `--env` → `FREELOG_ENV` → 项目 `defaultEnv` → production fallback | 运行时环境；state.env；auth.environment | 非交互写操作不得使用 fallback；交互 production 写入需二次确认 |
| 登录 | `login [--global|-g] [--cwd] …` | 工作区：`<cwd>/.freelog-auth`；全局：`~/.freelog-auth`；读时自 cwd 向上查找 | 已实现，敏感值加密 |
| 登出 | `logout [--global|-g] [--cwd]` | 默认删当前上下文命中的凭据；`-g` 仅删全局 | 已实现，不动 manifest/state |
| 当前状态 | `status --cwd --json` | 只读输出环境、登录态、owner、平台状态、同步和草稿建议 | 已实现 |
| 显式同步 | `pull --apply-listing --force --collection --all --version --no-auto-pull`（后者为写命令全局 flag） | 刷新 state；仅 `--apply-listing` 写 manifest listing | 已实现 |
| 类型查询 | `type list/search/info` | 输出平台资源类型、上传限制、配置能力 | 已实现 |
| 模板查询 | `template list` | 输出本地兼容模板 | 已实现 |
| 项目初始化 | `init`；非交互 `scaffold none` 必须给 `--artifact-mode file|directory-zip` | 写 `freelog.manifest.json`、`.gitignore`；必要时复制模板 | 已实现；不按类型展示名猜发行物模式 |
| 非交互确认 | `--yes` / `-y` | 跳过确认；缺失时非交互写入必须失败 | 已实现 |
| JSON 输出 | `--json` | 目标 envelope 由 DESIGN 定义（schemaVersion/ok/command/data/warnings/meta） | 已实现；verify 脚本通过 unwrapCliJson 兼容 |
| 调试输出 | `--debug` / `FREELOG_DEBUG` | 输出脱敏 debug 信息 | 已实现 |

环境值：

| CLI 值 | API |
|---|---|
| `production` / `prod` | `https://api.freelog.cn` |
| `test` | `https://api.testfreelog.com` |
| `dev` / `development` | `https://api.devfreelog.com` |

auth 文件规则（产品契约，见 [DESIGN.md](../../../DESIGN.md)「身份与凭据」）：

1. **读（解析）**：自命令有效 `cwd`（`--cwd` 或 `process.cwd()`）起，向父目录逐级查找 `.freelog-auth`，直至文件系统根；**第一份有效凭据**为工作区凭据（scope=`workspace`）。
2. **读（回退）**：整条路径未命中 → 读 `~/.freelog-auth`（scope=`global`）。
3. **写（login 默认）**：在当前有效 `cwd` 创建/更新 `./.freelog-auth`。
4. **写（login --global / -g）**：创建/更新 `~/.freelog-auth`。
5. **删（logout 默认）**：删除当前上下文解析命中的那一份凭据。
6. **删（logout --global / -g）**：仅删除全局凭据。
7. auth 只保存凭据和账号事实，不保存密码；敏感值本地加密。
8. auth.environment 与当前 `--env` 不一致时写操作必须失败（code 2）。
9. dev 环境资源接口依赖 Cookie，login 必须保存 `Set-Cookie`。
10. `.freelog-auth` 不得进入 manifest/state；`init` 生成的 `.gitignore` 必须包含 `.freelog-auth`。
11. **测试专用**：`FREELOG_AUTH_PATH_GLOBAL` / `FREELOG_AUTH_PATH_WORKSPACE` 可覆盖路径，仅供自动化测试隔离，不是用户工作流。

错误码：

| code | 含义 |
|---|---|
| `1` | 未分类错误或平台异常 |
| `2` | 未登录、凭据过期、凭据环境不一致 |
| `3` | 本地/远端冲突 |
| `4` | 用户输入、参数、状态门禁不满足 |
| `5` | 发布前依赖授权未完成 |

## 3. 本地文件模型

### `freelog.manifest.json`

manifest 是用户意图：

```json
{
  "schemaVersion": 1,
  "subject": "resource",
  "identity": {
    "name": "my-resource"
  },
  "resource": {
    "typeCode": "<resourceTypeCode>",
    "typeName": "自定义类型名",
    "title": "资源标题",
    "intro": "",
    "coverImages": [],
    "tags": []
  },
  "version": {
    "version": "1.0.0",
    "filePath": "dist",
    "artifactMode": "directory-zip",
    "description": "",
    "videoCover": "",
    "runtimeVersion": "0.5",
    "dependencies": [],
    "baseUpcastResources": [],
    "authExcludedItems": [],
    "batchSignContracts": [],
    "inputAttrs": [],
    "customPropertyDescriptors": []
  },
  "policies": []
}
```

合集 manifest 使用同一顶层结构，差异字段如下：

```json
{
  "schemaVersion": 1,
  "subject": "collection",
  "version": null,
  "collection": {
    "version": "1.0.0",
    "description": "",
    "display": {},
    "items": [],
    "dependencies": [],
    "baseUpcastResources": [],
    "authExcludedItems": [],
    "inputAttrs": [],
    "customPropertyDescriptors": []
  }
}
```

manifest 的用户字段名固定为 `collection.display`；`catalogueProperty` 是平台 API/state 语义，不是第二个 manifest 字段名。

`version.artifactMode` 仅允许 `file` 或 `directory-zip`。它由平台资源类型能力或 init 模板能力定稿；两者缺失或冲突时必须失败，不按资源类型展示名猜测。

禁止写入 manifest：`resourceId`、`userId`、`username`、`latestVersion`、`policyId`、`fileSha1`、`filename`、`versionId`、`draftSync`、token、cookie、password。

### `.freelog/state.json`

state 是平台事实缓存：

| 字段 | 作用 |
|---|---|
| `env` | 当前 state 所属环境，防止 dev/test/prod 串资源 |
| `resource.resourceId/resourceName/owner/status/latestVersion/policies` | 平台资源事实 |
| `version.fileSha1/filename/lastPublishedVersionId/draftSync` | 已发布版本事实和草稿同步信息 |
| `collection.catalogueDraft/catalogueProperty/collectRules/rss/draftSync` | 合集目录草稿缓存、合集展示/RSS/规则事实、合集发版表单草稿同步事实 |
| `sync.listingFingerprint/platformUpdateDate` | listing 同步冲突判断 |

## 4. 草稿对象账本

术语：合集目录里的一行称为**目录项**（见 [CLI脚手架设计 §0.1](./CLI脚手架设计.md#01-术语必读勿混用)）。下文「资源发版表单草稿」指**独立资源**的发版表单，不是目录项。

草稿不是一个泛称，CLI 里按平台对象拆成三类：

| 对象 | 接口 | 本地入口 | 本地状态 | 字段范围 |
|---|---|---|---|---|
| **独立资源**发版表单草稿 | `saveVersionsDraft/lookDraft/deleteResourceDraft` | `draft push/pull/discard` | `state.version.draftSync` | `versionInput`、`selectedFileInfo`、… |
| **合集**发版表单草稿 | 同上 | `draft push/pull/discard --collection` | `state.collection.draftSync` | `versionInput`、`collectionItemsSetting`、… |
| **合集目录**（目录项列表） | `add/get/delete/update/reorder CollectionItems_Draft` | `collection item *` | `state.collection.catalogueDraft` | 目录项 resourceId、itemTitle、排序、… |

规则：

1. `draft *` 永远只处理发版表单草稿。
2. `collection item *` 永远只处理合集目录草稿。
3. `draft push/pull/discard --collection` 不是 `collection item *` 的别名。
4. `collection publish` 才把合集目录草稿合并为正式合集版本。
5. `draft discard` / `draft discard --collection` 不删除合集目录草稿。
6. `collection item remove/reorder/update` 不修改发版表单草稿。
7. 远端发版表单草稿和本地 manifest 冲突时，默认失败；只有 `--force --yes` 才覆盖。

## 5. 独立资源字段

Listing 的当前硬限制：`resourceTitle` 非空且最多 100 字；`intro` 最多 200 字；`tags` 最多 20 个且单项最多 20 字。限制证据使用 `FORM-RES-TITLE`、`FORM-LIST-INTRO`、`FORM-LIST-TAGS`。

（`subjectType=1` 的资源：主题、插件、图片、视频等，可单独发布。与合集**目录项**不同。）

| 业务 | Console / API 字段 | CLI 输入 | Console 源码 | 当前状态 |
|---|---|---|---|---|
| 创建资源壳 | `Resource.create`: `name`, `resourceTitle`, `resourceTypeCode`, `resourceTypeName?` | `init` + `create` | `resourceCreatorPage/step1Effects.ts` | 已实现 |
| 更新基础信息 | `Resource.update`: `resourceTitle`, `intro`, `coverImages`, `tags` | `update --title --intro --cover --tags` | `resourceInfoPage.ts` | 已实现，本地封面会先上传 |
| 设置下一版 | 本地意图，不调平台 | `version set --version --file --description --video-cover --runtime` | — | 已实现 |
| 发布版本 | `Resource.createVersion`: `version`, `fileSha1`, `filename`, … | `publish` | creator Step2 / `resourceVersionCreatorPage` | 已实现；creator 首版 Console 固定 `1.0.0` |
| **独立资源**发版表单草稿 | `saveVersionsDraft/lookDraft/deleteResourceDraft` | `draft push/pull/discard` | Step2 / versionCreator 300ms 防抖 | 已实现，CLI 显式操作 |
| 修改已发布版本说明 | **`updateResourceVersionInfo`**: `description`, … | `version edit --version --description` | `resourceVersionEditorPage.ts` | 已实现，**不是** `createVersion` |
| 新增策略 | `Resource.update.addPolicies` | `policy apply --from-file policy.json` | 已实现，`policyText` 提交前编码 |
| 策略启停 | `Resource.update.updatePolicies` | `policy set <policyId> <0|1>` | 已实现，已上架资源禁止停用最后一条启用策略 |
| 上下架 | `Resource.update.status` | `online/offline` | 已实现，`online` 严格门禁 |

## 6. 文件处理字段

| 资源类型 | `filePath` 输入 | CLI 行为 |
|---|---|---|
| 主题、插件、软件库 | 构建产物目录，如 `dist` | 压缩为临时 zip，计算 SHA1，上传，发布版本 |
| 图片、视频、普通文件 | 文件路径 | 原文件计算 SHA1，上传，发布版本 |
| 非压缩类型但 `filePath` 是目录 | 目录 + `filename` | 只发布目录内指定文件；缺 `filename` 时失败 |

校验来自平台资源类型配置：本地上传能力、格式、文件大小、可选配置支持情况。

压缩读取 `.freelogignore`，采用项目根相对 POSIX 路径；支持注释、`*`、`?`、`**` 和目录后缀 `/`，不支持 `!` 反选。`.freelog/`、凭据、VCS 与系统临时文件始终排除。相同输入、配置和 CLI 版本必须生成字节级一致的 zip。

## 7. 批量独立资源字段

**数据模型：** 一文件夹 → N 个**独立资源**（不生成合集目录项）。见 [CLI脚手架设计 §2.7](./CLI脚手架设计.md#27-批量工作区一文件夹--多个独立资源manifeststate-模型)。

`resource import-dir` 有两种输入：

| 模式 | 命令 | 行为 |
|---|---|---|
| 零配置 | `resource import-dir <dir> --resource-type <typeCode>` | 扁平目录内每个文件创建一个资源，标题来自文件名，版本固定默认 `1.0.0` |
| 声明式 | `resource import-dir <dir> --config freelog.batch.json` | 每个文件的资源字段、版本字段、策略字段都由配置声明 |

`freelog.batch.json`：

```json
{
  "defaults": {
    "resourceTypeCode": "<imageTypeCode>",
    "resourceTypeName": "图片",
    "version": "1.0.0",
    "description": "",
    "intro": "",
    "coverImages": [],
    "tags": [],
    "policyFile": "policy.free.json",
    "dependencies": [],
    "baseUpcastResources": [],
    "authExcludedItems": [],
    "inputAttrs": [],
    "customPropertyDescriptors": []
  },
  "items": [
    {
      "filePath": "a.png",
      "name": "image-a",
      "resourceTitle": "图片 A",
      "description": "首版说明",
      "skip": false
    }
  ]
}
```

规则：

1. `items[].filePath` 必填。
2. `resourceTypeCode` 可以写在 defaults，也可以写在 item；命令 `--resource-type` 是兜底。
3. `policies` 可直接写最终策略文本；`policyFile` 可引用 JSON 策略文件。
4. `createBatch` 按资源类型和自定义类型名分组，20 个一批提交。
5. `createBatch` 当前不承接 `authExcludedItems`，带该字段的 item 自动走逐个 `create + createVersion`。
6. 带 `authExcludedItems` 的 batch item：仍须在 `freelog.batch.json` 声明 `batchSignContracts` 通过 CLI 预检；`createVersion` **不传** `batchSignContracts`（合同由 `dep auth` / 平台侧处理，与 Console 独立资源路径一致）。
7. 每个成功项写出子目录 manifest/state，后续可单独维护。
8. **批量工作区根目录没有 manifest**；勿对根目录 `create`/`publish`。
9. 子目录 manifest 的 `version.filePath` 指向子目录内的媒体文件副本；state 在 import 时已写入 resourceId、versionId、fileSha1。
10. 混类型文件夹（image + video）须用 `items[].resourceTypeCode` 逐项声明，或分多次 import。
11. `resource import-dir` 的 batch item 不包含合集 `itemTitle`；合集标题属于 `collection item import-dir` 的独立配置映射。

批量运行报告写入 `.freelog/reports/<runId>.json`，字段至少包括：

```json
{
  "schemaVersion": 1,
  "runId": "...",
  "command": "resource import-dir",
  "env": "dev",
  "input": { "directory": "...", "fingerprint": "..." },
  "config": { "path": "freelog.batch.json", "fingerprint": "..." },
  "startedAt": "...",
  "finishedAt": "...",
  "items": [
    {
      "idempotencyKey": "...",
      "relativePath": "a.png",
      "stage": "local-written",
      "result": "passed",
      "resourceId": "...",
      "versionId": "...",
      "attempts": 1,
      "cleanup": { "status": "complete" }
    }
  ]
}
```

`--resume <report>` 从安全阶段继续，`--retry <report>` 只执行失败项；两者互斥，恢复时拒绝跨环境、配置变化和已登记输入内容变化。平台成功、本地回写失败记录为 `remote_succeeded_local_pending`，恢复时不得重复创建远端资源；远端请求已经发出但结果无法确认时记录为 `remote_outcome_unknown`，自动恢复必须停止并要求人工对账。`latest.json` 只保存最近报告指针，所有恢复操作都以正式报告为输入。

## 8. 合集字段

| 业务 | Console / API 字段 | CLI 输入 | 当前状态 |
|---|---|---|---|
| 创建合集壳 | `Resource.create` + `subjectType: 4` | `init --scaffold collection`；`collection create --name --title --type --type-name` | 已实现 |
| 更新合集基础信息 | `Resource.update`: `resourceTitle`, `intro`, `coverImages`, `tags` | `collection update --title --intro --cover --tags` | 已实现 |
| 更新展示设置 | `updateCollection.catalogueProperty` | `collection update --display-*`；manifest `collection.display` | 已实现 |
| 添加已有**子资源**为**目录项** | `addResourceItems_Draft` | `collection item add <resourceId|path> --title` | 已实现 |
| 文件夹 → **子资源** + 写入**目录项** | `create/createVersion/update(status=1)/addResourceItems_Draft` | `collection item import-dir` | 已实现 |
| 目录标题/排序/删除 | draft item APIs | `collection item update/reorder/remove` | 已实现 |
| 合集发布 | `updateCollection`: `description`, `catalogueProperty`, `dependencies`, `baseUpcastResources`, `authExcludedItems`, `inputAttrs`, `customPropertyDescriptors`, `isMergeCatalogueDraft` | manifest `collection.*` + `collection publish` | 已实现 |
| 合集策略/上下架 | 与独立资源相同 | `collection policy *`；`online/offline` | 已实现 |
| RSS 合集 | RSS 绑定/同步接口 | `collection rss *` | ADVANCED；对齐同步状态和平台编辑限制 |
| 自动收录规则 | `serializeStatus/status/conditionType/filterConditions` | `collection collect-rules *` | ADVANCED；完整字段契约，不只布尔开关 |

规则：

1. 合集本身不是上传文件夹；文件夹合集 = N **子资源** + N **目录项** + 合集发布。
2. 条目可以来自本地创建的子资源或已有平台资源；目标须 online、未在当前合集重复使用，并满足加入所需的授权条件。
3. `collection item *` 操作目录草稿，`collection publish` 才合并为正式合集版本。
4. 合集官方接口固定版本号，CLI 不允许设置合集版本号，只允许设置发布说明。
5. 合集目录草稿项读取必须分页，不能只看前 500 条。
6. **RSS / collect-rules** 是高级平台维护能力，不计入本地文件发行核心链路分母，但属于完整产品 mandatory parity；不得以 `ADVANCED` 为由跳过专项验收。

## 9. 模板字段

| 业务 | CLI 输入 | 当前状态 |
|---|---|---|
| 查看模板 | `template list` | 已实现 |
| 创建主题/插件项目 | `init theme <dir>` / `init widget <dir>` + `--template` | API 定稿展示名「主题/插件」，不问类型树 |
| 创建前端包模板 | `init package <dir>` + `--template package-*` + `--namespace` | API 定稿「前端库/软件库」，不问类型树 |
| 通用 init | `init <dir>` | **五选一**工程立项（§脚手架设计 1.6）；方案 A：发行模式由命令区分 |

模板只创建项目和 manifest，不创建平台资源。主题/插件发布时，`publish` 根据资源类型把构建目录压缩为 zip。

## 10. 依赖授权边界

| 场景 | CLI 行为 |
|---|---|
| 声明依赖 | `dep add/update/remove/list` 修改本地版本意图；**`dep add` 未传 range 时默认 `^latestVersion`（batchInfo，无 latest 回退 `*`）** |
| 免费策略签约 | `dep auth --policy-map auth-map.yaml` 按 manifest subject 读取 **`dependencies` + `baseUpcastResources`**，通过 owner/sync 门禁后调用 `Contract.batchCreateContracts` + 可选 `Resource.batchSetContracts`（`subjects[].subjectType=1`；首版发行前 batchSet 可能 invalidVersions，以 contracts 列表验证；**含同账号自有依赖/上抛，不豁免**） |
| 付费策略 | CLI 不执行支付；失败结果包含当前环境的 Console 依赖页、合约页和重试命令 |
| 策略不可验证 | CLI 不假装成功；使用相同浏览器接力 envelope |
| 发布前授权未完成 | `publish` / `collection publish` 阻断（检查 `dependencies` + `baseUpcastResources`） |
| 合集加条目上抛未签 | `collection item add/import-dir` 阻断（≅ `FAddResourcesHandleAuth`：`batchInfo` + `batchContracts(contractStatus=0)`） |
| 批量 import-dir 授权 | 每项 `dependencies`/`baseUpcastResources` 须在 `batchSignContracts` 中完整列出（≅ creatorBatch `isCompleteAuthorization`） |
| Console 接力 URL | 失败 envelope 含 `actionUrl` / `contractsUrl` / `nextCommand`；URL 规则见使用说明 §12 |

`auth-map.yaml`：

```yaml
contracts:
  - resourceId: <dependencyResourceId>
    policyIds:
      - <policyId>
```

## 11. 特殊流程字段

| 业务 | CLI | 状态 |
|---|---|---|
| Console 已有资源 | `bind <resourceId\|username/name>` | 已实现 |
| 换环境 | 删 state → `bind` | manifest 保留 |
| 批量重试 | `.freelog/reports/<runId>.json` → `--resume/--retry` | 勿整目录重跑；只使用正式报告 |
| 高级版本字段 | manifest `version.*` → publish | 声明式已实现 |
| 上传后文件属性解析（**全文件类型**） | publish / import-dir / collection item import-dir 自动解析并合并 manifest 属性 | 字段契约已定义；实现证据见对齐矩阵 |

## 12. 代码任务

代码任务与完成状态不在字段账本维护；见 [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md) 和日期化验收证据。

## 13. 不在脚手架范围

云存储浏览器、付费 dep 收银台、浏览器微应用、运营消费侧 — 见产品设计 `OUT` 分类。RSS/collect-rules 属 `ADVANCED`，不是范围外。
