# CLI 使用说明与 Console 差异

本文面向脚手架使用者和接手开发者。CLI 的目标不是复刻 Console 页面，而是把“创建资源、发布版本、维护策略、上下架、管理合集目录”拆成可脚本化、可重复、可审计的命令。

## 1. 核心心智模型

CLI 本地只有两个项目文件：

| 文件 | 作用 | 是否提交 git |
|---|---|---|
| `freelog.manifest.json` | 用户意图：短授权名、资源类型、标题、下一版文件、依赖、合集展示等 | 是 |
| `.freelog/state.json` | 平台事实缓存：resourceId、完整 resourceName、owner、status、latestVersion、policies、draftSync 等 | 否 |

关键规则：

1. `create` 只创建资源壳，不创建版本、不创建策略、不上架。
2. `version set` 只改本地下一版意图，不上传、不保存平台草稿。
3. `publish` 创建正式版本；没有本资源策略也可以发布。
4. `policy apply --from-file` 明确提交策略文本；CLI 不猜策略、不内置策略 Builder。
5. `online` 才上架，必须满足 latestVersion + 至少一条启用策略。
6. `status` 只读，不写盘。
7. `pull` 默认只刷新 `.freelog/state.json`；只有 `pull --apply-listing` 才把平台标题/简介/标签/封面写回 manifest。本地和平台相对上次同步都改过时需要 `--force`。
8. manifest 不绑定环境，可以跨 dev/test/prod 复用；`.freelog/state.json` 绑定当前 CLI env，跨环境读取非空 `state.env` 会失败，避免串用平台资源。

## 2. 与 Console 的流程差异

Console 资源页对齐源码：

```text
D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource
```

CLI 要对齐 Console 的业务结果：基础信息、版本、策略、上下架、合集目录在平台上的最终状态必须一致。CLI 不复刻 Console 的页面向导、防抖草稿、策略 Builder 和复杂支付/授权交互。

| Console 流程 | CLI 流程 | 差异原因 |
|---|---|---|
| 四步向导串联创建、发版、策略、上架 | 拆成 `create -> version set -> publish -> policy apply --from-file -> online` | CLI 要可脚本化、可重试，避免一个命令做太多隐式副作用 |
| 资源页打开后加载远端状态 | `status` 查看；`pull` 显式刷新 state | 命令行不能在用户未授权时静默改本地文件 |
| Step2 表单 300ms 防抖保存草稿 | `draft push/pull/discard` 显式操作 | CLI 不做后台自动保存，避免 CI 和本地脚本产生隐式远端草稿 |
| Step4 可能软 `update(status:1)` | `online` 严格门禁后再 `status=1` | 上架必须保证运行时授权闭环，不能绕过 latestVersion 和启用策略 |
| 策略 Builder 由页面交互生成 | CLI 接收 `policy.json` 最终策略文本用于新增策略；已有策略只支持启停 | 策略是业务授权文本；Console/tools-lib 稳定契约只暴露新增与启停 |
| 依赖授权微应用处理复杂签约 | CLI 仅支持声明式免费策略签约；复杂/付费回 Console | 支付和交互确认不适合纯 CLI 自动化 |
| 合集页面有目录草稿和发版表单 | CLI 区分 `collection item *` 目录草稿与 `draft --collection` 发版表单草稿 | 两类草稿 API、冲突和用户心智不同，不能混用 |
| 页面保存基础信息时直接改平台 listing | `update` / `collection update` 显式改 listing | manifest 是用户意图，必须由明确命令修改 |

## 2.1 对齐与分叉清单

必须对齐：

1. `update` / `collection update` 后，Console 看到的 title、intro、coverImages、tags 一致。
2. `publish` / `collection publish` 后，latestVersion、版本描述、文件 SHA1 或合集目录版本结果一致。
3. `policy apply` 和 `policy set` 后，策略新增、启用、停用状态一致。
4. `online` / `offline` 后，平台 status 一致。
5. `collection item *` 和 `collection publish` 后，合集目录项、排序、标题、正式版本一致。

CLI 有意分叉：

1. 不把 `create`、`publish`、`policy`、`online` 合成一个向导命令。
2. 不后台保存草稿。
3. 不内置策略 Builder。
4. 不在 CLI 内完成复杂/付费依赖授权。
5. 不使用 Console 的软上架路径，始终走严格 `online` 门禁。

设计与测试矩阵见：

```text
D:\appinside\freelog-runtime-cli\docs\新方案\场景风险与测试矩阵.md
```

## 3. 准备工作

登录：

```bash
freelog-cli login --env dev
```

查看资源类型：

```bash
freelog-cli type search 主题 --env dev
freelog-cli type search 图片 --env dev
freelog-cli type info <typeCode> --env dev
```

单品/合集自身上架策略文件最小示例：

```json
{
  "policyName": "免费",
  "policyText": "FOR PUBLIC Initial[active]:\n  terminate",
  "status": 1
}
```

`policyText` 必须是平台策略解析器可接受的最终策略文本；CLI 会在提交前做一次 `encodeURIComponent`。
修改已有策略正文/名称请回 Console，或新增一条策略后用 `policy set` 切换启用状态。

合集导入子资源的 `--item-policy-file` 建议使用 Console 内置“永久免费”模板文本：

```json
{
  "policyName": "免费",
  "policyText": "for public\r\n\r\ninitial[active]:\r\nterminate\r\n",
  "status": 1
}
```

dev 平台当前存在一个差异：单品/合集自身策略更新接口接受 uppercase 语法；合集目录添加单品时的免费策略识别更接近 Console 模板产物。CLI 因此允许 `--item-policy-file` 与合集自身 `policy apply --from-file` 使用不同文件。

## 4. 场景一：已有 React 主题项目发布

适用于用户电脑上已有 React 主题工程，CLI 只负责接入 Freelog 和发布构建产物。

```bash
cd my-react-theme
pnpm build
freelog-cli init . --scaffold none --resource-type <themeCode> --runtime 0.5 --yes --env dev
freelog-cli create --yes --env dev
freelog-cli version set --version 1.0.0 --file dist --runtime 0.5 --env dev
freelog-cli publish --yes --env dev
freelog-cli policy apply --from-file ./policy.json --yes --env dev
freelog-cli online --yes --env dev
```

说明：

1. `publish` 不执行 `pnpm build`；构建由用户项目自己负责。
2. 主题/插件这类运行时资源会把 `dist` 压缩成临时 zip 后上传。
3. 临时 zip 上传后会清理。

## 5. 场景二：通过模板新建主题或插件项目

React 主题：

```bash
freelog-cli init my-theme --scaffold runtime --template vite-react-ts --resource-type <themeCode> --runtime 0.5 --yes --env dev
cd my-theme
pnpm install
pnpm build
freelog-cli create --yes --env dev
freelog-cli publish --yes --env dev
```

Vue 插件：

```bash
freelog-cli init my-widget --scaffold runtime --template vite-vue-ts --resource-type <widgetCode> --runtime 0.5 --yes --env dev
cd my-widget
pnpm install
pnpm build
freelog-cli create --yes --env dev
freelog-cli publish --yes --env dev
```

说明：

1. 模板只负责生成项目骨架和 manifest。
2. 类型 code 仍以平台 `type search/info` 为准。
3. 模板技术栈和 Freelog 资源类型是两件事，不能用 React/Vue 猜 resourceTypeCode。

## 6. 场景三：单张图片或单个视频发布

单张图片：

```bash
mkdir photo-resource
cd photo-resource
freelog-cli init . --scaffold none --resource-type <imageCode> --yes --env dev
freelog-cli version set --version 1.0.0 --file ../photo.png --env dev
freelog-cli create --yes --env dev
freelog-cli publish --yes --env dev
freelog-cli policy apply --from-file ./policy.json --yes --env dev
freelog-cli online --yes --env dev
```

单个视频：

```bash
mkdir video-resource
cd video-resource
freelog-cli init . --scaffold none --resource-type <videoCode> --yes --env dev
freelog-cli version set --version 1.0.0 --file ../movie.mp4 --env dev
freelog-cli create --yes --env dev
freelog-cli publish --yes --env dev
```

说明：

1. 图片、视频上传原文件，不压缩。
2. 文件格式、大小、上传能力按平台资源类型配置校验。
3. 视频封面 P0 作为资源 listing cover 处理，不伪造 createVersion 的视频封面字段。

## 7. 场景四：文件夹发布为多个独立资源

适用于“一个图片文件夹，每张图片都是一个资源”或“一个视频文件夹，每个视频都是一个资源”。

```bash
freelog-cli resource import-dir ./photos --resource-type <imageCode> --title-prefix "照片 " --yes --env dev
freelog-cli resource import-dir ./videos --resource-type <videoCode> --title-prefix "视频 " --yes --env dev
```

说明：

1. 每个文件都会创建一个单品资源并发布首版。
2. 文件夹本身不会被压缩成一个资源。
3. 部分失败不回滚成功项，用户根据失败清单重试。

## 8. 场景五：图片或视频文件夹发布为合集

图片合集：

```bash
freelog-cli init photo-album --scaffold collection --resource-type <collectionCode> --yes --env dev
cd photo-album
freelog-cli collection create --yes --env dev
freelog-cli collection item import-dir ../photos --resource-type <imageCode> --title-prefix "照片 " --item-policy-file ./item-policy.json --yes --env dev
freelog-cli collection publish --yes --env dev
freelog-cli policy apply --from-file ./policy.json --yes --env dev
freelog-cli online --yes --env dev
```

视频合集：

```bash
freelog-cli init video-album --scaffold collection --resource-type <collectionCode> --yes --env dev
cd video-album
freelog-cli collection create --yes --env dev
freelog-cli collection item import-dir ../videos --resource-type <videoCode> --title-prefix "视频 " --item-policy-file ./item-policy.json --yes --env dev
freelog-cli collection publish --yes --env dev
freelog-cli policy apply --from-file ./policy.json --yes --env dev
freelog-cli online --yes --env dev
```

说明：

1. 合集资源不是上传整个文件夹。
2. 每个文件先成为独立单品资源，CLI 用 `--item-policy-file` 为子资源添加启用策略并上架，再加入合集目录草稿。
3. `collection publish` 才把目录草稿合并成正式合集版本。
4. 合集 `publish` 不要求合集自身已有策略；合集 `online` 仍要求 latestVersion + 启用策略。
5. 平台要求合集目录项必须是已上架单品；如果不希望 CLI 自动上架子资源，请先用 `resource import-dir` 创建单品，再手动维护策略/上架后用 `collection item add` 加入合集。

## 9. 场景六：更新基础信息

单品：

```bash
freelog-cli status --env dev
freelog-cli update --title "新标题" --intro "介绍" --tags "tag1,tag2" --cover ./cover.png --env dev
```

合集：

```bash
freelog-cli status --env dev
freelog-cli collection update --title "新合集标题" --display-sort asc --env dev
```

说明：

1. `update` 只改 listing，不改版本、策略、上下架状态。
2. Console 上改过标题后，`status` 会显示差异；`pull` 默认只更新 state。
3. 确认要采用 Console 的 listing 时运行：

```bash
freelog-cli pull --apply-listing --env dev
```

如果本地 manifest 和 Console 相对上次同步都改过 listing，同步会失败并提示冲突；确认采用 Console 后再加 `--force`。

## 10. 场景七：发布新版本

```bash
pnpm build
freelog-cli status --env dev
freelog-cli pull --env dev
freelog-cli version set --version 1.1.0 --description "新功能" --file dist --env dev
freelog-cli publish --yes --env dev
```

说明：

1. 新版本必须大于平台 latestVersion。
2. `version set` 会清理上一版的本地 fileSha1/filename/versionId，避免把旧发布产物误显示成当前意图。
3. 已上架资源可以继续发新版；冻结资源不能发布。
4. 已发布版本的说明修改使用 `version edit`，不重新上传文件。

合集发布说明：

```bash
freelog-cli collection version set --description "新增目录项" --env dev
freelog-cli collection publish --yes --env dev
```

官方 `updateCollection` 接口说明：合集目前固定版本，所以无需传递版本号。CLI 因此不支持设置合集版本号；`collection version set` 只保存下一次 publish 的发布说明意图，目录项仍由 `collection item *` 管理。

## 11. 场景八：CLI 与 Console 协作草稿

CLI 推到 Console：

```bash
freelog-cli version set --version 1.2.0 --file dist --description "WIP" --env dev
freelog-cli draft push --env dev
# 到 Console 继续编辑发版草稿
freelog-cli draft pull --env dev
freelog-cli publish --yes --env dev
```

Console 草稿拉回 CLI：

```bash
freelog-cli status --env dev
freelog-cli draft pull --env dev
freelog-cli publish --yes --env dev
```

说明：

1. `draft push` 保存平台发版草稿，不创建正式版本。
2. `draft pull` 会更新 manifest.version，但保留本地 `filePath`。
3. 冲突时普通 push 会失败；确认覆盖远端时使用 `draft push --force --yes`。
4. 删除平台草稿使用 `draft discard --yes`。

## 12. 场景九：策略启停与上下架

应用策略：

```bash
freelog-cli policy apply --from-file ./policy.json --yes --env dev
freelog-cli policy list --env dev
```

启用/停用：

```bash
freelog-cli policy set <policyId> --status 1 --env dev
freelog-cli policy set <policyId> --status 0 --env dev
```

上下架：

```bash
freelog-cli online --yes --env dev
freelog-cli offline --yes --env dev
```

说明：

1. `online` 必须有正式版本和至少一条启用策略。
2. 已上架资源不允许停用最后一条启用策略。
3. `offline` 只把 status 改为 4，不删除版本、不删除策略。
4. 合集也使用同一个顶层 `online/offline`，CLI 会按 `manifest.subject` 分流。

## 13. 场景十：合集目录维护

```bash
freelog-cli pull --collection --env dev
freelog-cli collection item add <resourceId> --env dev
freelog-cli collection item update <itemId> --title "目录标题" --env dev
freelog-cli collection item reorder --order-file ./order.json --env dev
freelog-cli collection publish --yes --env dev
```

说明：

1. `collection item *` 操作的是目录草稿，不会立刻改变正式合集。
2. `collection item add <resourceId>` 可以引用他人已发布资源，因为这是把资源加入目录，不是修改对方资源。
3. `collection item add <path>` 会读取本地子项目 state，并校验本地资源 owner。
4. 目录草稿要通过 `collection publish` 才进入正式合集版本。

## 14. 常见排错

| 现象 | 原因 | 处理 |
|---|---|---|
| `online` 失败，提示 ONLINE_GATE_FAILED | 没有 latestVersion 或没有启用策略 | 先 `publish`，再 `policy apply --from-file` 或启用策略 |
| `publish` 提示版本已存在 | 当前 manifest.version 不大于平台 latestVersion 或重复 | `version set --version <更高版本>` |
| Console 改了标题，本地 manifest 没变 | `pull` 默认只刷新 state | 确认采用远端后执行 `pull --apply-listing`；冲突时加 `--force` |
| 草稿 push 冲突 | Console 或别人改过平台草稿 | 先 `draft pull` 合并，或确认后 `draft push --force --yes` |
| 非交互环境卡住或失败 | 缺必填参数或缺确认 | 补齐参数并加 `--yes` |
| 换账号后写命令失败 | 当前账号不是资源 owner | 切回资源 owner 账号或换目录 |

## 15. 最小验证清单

改造或发版前至少验证：

1. 主题/插件：`init . -> create -> publish` 能压缩目录并发布。
2. 图片/视频：单文件能原样上传并发布。
3. 文件夹单品：`resource import-dir` 每个文件一个资源。
4. 文件夹合集：`collection item import-dir --item-policy-file -> collection publish` 正常。
5. 策略门禁：无策略可 publish，但不能 online。
6. 上架后不能停用最后一条启用策略。
7. `status` 不写盘；`pull` 默认不改 manifest；`pull --apply-listing` 才改 manifest listing。
