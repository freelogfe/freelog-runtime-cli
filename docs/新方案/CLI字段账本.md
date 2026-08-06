# CLI 字段账本

最后更新：2026-08-06

本文是 Freelog Runtime CLI 的唯一设计源。代码、测试和使用说明都必须能回到本账本解释。若 Console、tools-lib 接口、CLI 行为三者出现冲突，以 Console 源码和 tools-lib 当前类型为证据，先更新本账本，再改代码。

**Console 业务 → API → CLI 操作级对照**（请求体字段、草稿分类、策略语法、dev 实测）见 [CLI数据操作与Console对照](./CLI数据操作与Console对照.md)。

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
| 复杂人机能力 | 支付、验证码、不可自动确认的授权必须显式失败并说明边界 |

## 2. CLI 基础字段

| 业务 | 字段/输入 | 存储/输出 | 当前状态 |
|---|---|---|---|
| 环境选择 | `--env production/prod/test/dev`；`FREELOG_ENV`；`--test` 快捷入口 | 运行时环境；state.env；auth.environment | 已实现，默认 production |
| 登录 | `login --login-name --password --yes` 或交互输入 | 用户级 `.freelog-auth`；保存 token/authorization/cookie/userId/username/environment | 已实现，敏感值加密 |
| 登出 | `logout` | 删除用户级 auth；若设置 workspace auth 也删除 | 已实现，不动项目文件 |
| 当前状态 | `status --cwd --json` | 只读输出环境、登录态、owner、平台状态、同步和草稿建议 | 已实现 |
| 显式同步 | `pull --apply-listing --force --collection --all` | 刷新 state；仅 `--apply-listing` 写 manifest listing | 已实现 |
| 类型查询 | `type list/search/info` | 输出平台资源类型、上传限制、配置能力 | 已实现 |
| 模板查询 | `template list` | 输出本地兼容模板 | 已实现 |
| 项目初始化 | `init` | 写 `freelog.manifest.json`、`.gitignore`；必要时复制模板 | 已实现 |
| 非交互确认 | `--yes` / `-y` | 跳过确认；缺失时非交互写入必须失败 | 已实现 |
| JSON 输出 | `--json` | 成功 `{ ok:true, ... }`；失败 `{ ok:false, code, message, hint, details? }` | 已实现 |
| 调试输出 | `--debug` / `FREELOG_DEBUG` | 输出脱敏 debug 信息 | 已实现 |

环境值：

| CLI 值 | API |
|---|---|
| `production` / `prod` | `https://api.freelog.cn` |
| `test` | `https://api.testfreelog.com` |
| `dev` / `development` | `https://api.devfreelog.com` |

auth 文件规则：

1. 默认写 `%USERPROFILE%\.freelog-auth`。
2. `FREELOG_AUTH_PATH_GLOBAL` 可覆盖用户级 auth 路径。
3. `FREELOG_AUTH_PATH_WORKSPACE` 用于测试隔离；存在时优先读取 workspace auth。
4. auth 只保存凭据和账号事实，不保存密码。
5. auth.environment 与当前 `--env` 不一致时必须失败。
6. dev 环境资源接口依赖 Cookie，login 必须保存 `Set-Cookie`。

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
    "description": "",
    "videoCover": "",
    "runtimeVersion": "0.5",
    "dependencies": [],
    "baseUpcastResources": [],
    "authExcludedItems": [],
    "inputAttrs": [],
    "customPropertyDescriptors": []
  },
  "policies": []
}
```

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

术语：**单品** = 合集目录里的一行（见 [CLI脚手架设计 §0.1](./CLI脚手架设计.md#01-术语必读勿混用)）。下文「资源发版表单草稿」指**独立资源**的发版表单，不是单品。

草稿不是一个泛称，CLI 里按平台对象拆成三类：

| 对象 | 接口 | 本地入口 | 本地状态 | 字段范围 |
|---|---|---|---|---|
| **独立资源**发版表单草稿 | `saveVersionsDraft/lookDraft/deleteResourceDraft` | `draft push/pull/discard` | `state.version.draftSync` | `versionInput`、`selectedFileInfo`、… |
| **合集**发版表单草稿 | 同上 | `draft push/pull/discard --collection` | `state.collection.draftSync` | `versionInput`、`collectionItemsSetting`、… |
| **合集目录**（**单品**列表） | `add/get/delete/update/reorder CollectionItems_Draft` | `collection item *` | `state.collection.catalogueDraft` | 单品 resourceId、itemTitle、排序、… |

规则：

1. `draft *` 永远只处理发版表单草稿。
2. `collection item *` 永远只处理合集目录草稿。
3. `draft push/pull/discard --collection` 不是 `collection item *` 的别名。
4. `collection publish` 才把合集目录草稿合并为正式合集版本。
5. `draft discard` / `draft discard --collection` 不删除合集目录草稿。
6. `collection item remove/reorder/update` 不修改发版表单草稿。
7. 远端发版表单草稿和本地 manifest 冲突时，默认失败；只有 `--force --yes` 才覆盖。

## 5. 独立资源字段

（`subjectType=1` 的资源：主题、插件、图片、视频等，可单独发布。与合集**单品**（目录行）不同。）

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

## 7. 批量独立资源字段

**数据模型：** 一文件夹 → N 个**独立资源**（无单品）。见 [CLI脚手架设计 §2.7](./CLI脚手架设计.md#27-批量工作区一文件夹--多个独立资源manifeststate-模型)。

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
      "itemTitle": "合集单品在目录中的展示标题",
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
6. 每个成功项写出子目录 manifest/state，后续可单独维护。
7. **批量工作区根目录没有 manifest**；勿对根目录 `create`/`publish`。
8. 子目录 manifest 的 `version.filePath` 指向子目录内的媒体文件副本；state 在 import 时已写入 resourceId、versionId、fileSha1。
9. 混类型文件夹（image + video）须用 `items[].resourceTypeCode` 逐项声明，或分多次 import。

## 8. 合集字段

| 业务 | Console / API 字段 | CLI 输入 | 当前状态 |
|---|---|---|---|
| 创建合集壳 | `Resource.create` + `subjectType: 4` | `init --scaffold collection`；`collection create --name --title --type --type-name` | 已实现 |
| 更新合集基础信息 | `Resource.update`: `resourceTitle`, `intro`, `coverImages`, `tags` | `collection update --title --intro --cover --tags` | 已实现 |
| 更新展示设置 | `updateCollection.catalogueProperty` | `collection update --display-*`；manifest `collection.display` | 已实现 |
| 添加已有**子资源**为**单品** | `addResourceItems_Draft` | `collection item add <resourceId|path> --title` | 已实现 |
| 文件夹 → **子资源** + 写入**单品** | `create/createVersion/update(status=1)/addResourceItems_Draft` | `collection item import-dir` | 已实现 |
| 目录标题/排序/删除 | draft item APIs | `collection item update/reorder/remove` | 已实现 |
| 合集发布 | `updateCollection`: `description`, `catalogueProperty`, `dependencies`, `baseUpcastResources`, `authExcludedItems`, `inputAttrs`, `customPropertyDescriptors`, `isMergeCatalogueDraft` | manifest `collection.*` + `collection publish` | 已实现 |
| 合集策略/上下架 | 与独立资源相同 | `collection policy *`；`online/offline` | 已实现 |
| RSS 合集 | RSS 绑定/同步接口 | `collection rss *` | **不在脚手架范围**（历史命令保留） |
| 自动收录规则 | collectRules API | `collection collect-rules *` | **不在脚手架范围** |

规则：

1. 合集本身不是上传文件夹；文件夹合集 = N **子资源** + N **单品**（目录）+ 合集发布。
2. **子资源**（独立 resource）须已发布、有启用策略、可上架，才能作为**单品**加入目录。
3. `collection item *` 操作目录草稿，`collection publish` 才合并为正式合集版本。
4. 合集官方接口固定版本号，CLI 不允许设置合集版本号，只允许设置发布说明。
5. 合集目录草稿项读取必须分页，不能只看前 500 条。
6. **RSS / collect-rules** 不在本地脚手架范围（§脚手架设计 1.9.5）。

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
| 声明依赖 | `dep add/update/remove/list` 修改本地版本意图 |
| 免费策略签约 | `dep auth --policy-map auth-map.yaml` 调用合同接口 |
| 付费策略 | CLI 不执行支付，必须失败并提示 |
| 策略不可验证 | CLI 不假装成功，必须失败并提示 |
| 发布前授权未完成 | `publish` / `collection publish` 阻断 |

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
| 批量重试 | `details.failures` → retry.batch.json | 勿整目录重跑 |
| 高级版本字段 | manifest `version.*` → publish | 声明式已实现 |
| 上传后 PropertyParser（**全文件类型**） | — | **未对齐 Console**（§1.9.6） |

## 12. 代码任务

见 [CLI数据操作与Console对照 §3](./CLI数据操作与Console对照.md#3-未对齐项--代码任务按优先级)。P0 = PropertyParser 全文件属性链路。

## 13. 不在脚手架范围

云存储、RSS/collect-rules、付费 dep、contract 只读 — 见对照表「—」行。
