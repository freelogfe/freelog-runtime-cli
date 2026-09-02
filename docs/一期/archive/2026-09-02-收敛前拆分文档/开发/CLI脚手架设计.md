# CLI 脚手架命令与流程设计

> 文档角色：技术实现说明。本文只定义 CLI 脚手架入口、命令拓扑和流程编排；产品主线由 [产品方案](../产品方案/README.md) 定义，字段约束由 [CLI字段账本](./CLI字段账本.md) 与 [CLI交互与字段约束](./CLI交互与字段约束.md) 定义，Console 事实由 [对齐目录](../对齐/README.md) 记录。

最后更新：2026-09-01

## 0. 本文解决什么问题

“脚手架设计”不是通用技术架构，也不是命令清单。它回答四个问题：

1. 用户从哪个入口开始？
2. CLI 每一步问什么、校验什么、生成什么？
3. 不同资源类型如何分流：主题、插件、package、普通文件、普通目录、合集？
4. 生成本地工程后，如何自然接到 create、version、publish、policy template、online？

通用分层、Store、JSON、错误码见 [packages/cli/src/ARCHITECTURE.md](../../../../packages/cli/src/ARCHITECTURE.md)，本文不重复。

## 1. 命令拓扑

```text
freelog-cli start
  ├─ 空目录：发布新资源
  │   ├─ session 连续首发/发版
  │   └─ 显式本地工程命令
  ├─ 已有资源工程：进入本地工程维护壳
  ├─ 已有合集工程：进入合集维护壳
  ├─ 维护线上资源：进入 session
  ├─ 批量发布目录：进入批量向导
  └─ session / studio：进入临时或多账号工作区

freelog-cli type
  ├─ list/search/info：脚本和 AI 可用的类型发现
  └─ pick：TTY 一级级选择平台叶子类型，也支持搜索

freelog-cli template
  └─ list：列出本地支持的 runtime/package 工程模板

freelog-cli init
  ├─ theme <dir>：主题工程 preset
  ├─ widget <dir>：插件工程 preset
  ├─ package <dir>：前端库/软件库工程 preset
  └─ <dir> --scaffold none|collection：普通资源或合集工程
```

设计原则：

- `start` 是人的统一入口，负责把用户带进正确流程。
- `type` 和 `template` 是发现入口，不写本地工程。
- `init` 只创建本地工程和 manifest，不创建平台资源。
- `create`、`version`、`publish`、`policy template`、`online` 是脚手架后的发行链路，不塞进 `init`。

## 2. 总流程

```text
进入 CLI
  → 判断工作方式
  → 判断资源大类
  → 选择平台叶子资源类型
  → 选择本地工程模板或 artifact-mode
  → 填写资源标题 / 短授权标识 / namespace 等字段
  → 生成 freelog.manifest.json 与必要模板文件
  → 输出下一步命令
  → create 平台资源
  → version set 准备版本
  → publish 发行正式版本
  → policy template list/apply 添加策略
  → online 上架
```

脚手架只覆盖到“生成可维护的本地工程”。后续平台写入由对应 service 做 owner、env、同步、字段和 Console 业务门禁。

## 3. F0：`start` 主向导流程

`start` 先读取当前目录状态，再推荐入口。

```text
freelog-cli start
  → buildProjectStatus(cwd)
  → buildStartGuide(status)
  → 若 --json：输出推荐任务和命令，不进入 TTY
  → 若非 TTY：打印推荐任务和命令，不提问
  → 若 TTY：让用户选择任务并进入对应交互壳
```

| 当前目录状态 | 推荐任务 | 进入哪里 |
|---|---|---|
| 无 manifest/state | 发布一个新资源 | session 连续首发，或显示本地工程命令 |
| 有资源 manifest 或版本意图 | 更新当前本地工程 | `projectShell` |
| 有合集 manifest | 创建或维护合集 | `collectionShell` |
| 用户选择维护线上资源 | 维护一个已有线上资源 | `sessionShell` |
| 用户选择批量 | 批量发布本地文件夹 | `batchImportWizard` |
| 用户选择临时/多账号 | session / studio | `sessionShell` / `studioShell` |

`start` 不发明业务规则，只做入口分流。它输出的命令必须是真实公开命令，例如：

```bash
freelog-cli init theme <目录> --env <env>
freelog-cli init widget <目录> --env <env>
freelog-cli init package <目录> --env <env>
freelog-cli init <目录> --scaffold none --resource-type <leaf-code> --artifact-mode <file|directory-zip> --env <env>
freelog-cli init <目录> --scaffold collection --resource-type <collection-code> --env <env>
freelog-cli collection rss inspect <feed-url> --env <env>
```

## 4. F1：资源类型选择流程

Console 的资源类型是平台事实，CLI 不能写死环境相关 code。脚手架必须先把资源类型定稿到叶子类型。

```text
选择资源大类
  → 拉取平台资源类型树
  → 按大类过滤候选
  → TTY：一级级选择，也可搜索
  → 非 TTY：必须传 --resource-type
  → 校验 isTerminate / 叶子类型
  → 返回 typeCode、typeName、resourceType path
```

| 资源大类 | 类型来源 | 定稿规则 |
|---|---|---|
| 主题 | 平台类型树 + runtime 模板 | 只能选主题叶子类型 |
| 插件 | 平台类型树 + runtime 模板 | 只能选插件叶子类型 |
| package/前端库 | package 模板映射 + 平台类型树 | `package-js/react/vue` 解析到对应叶子类型；多候选拒绝猜测 |
| 图片/视频/普通文件 | 平台类型树 | 用户逐级选择或显式传 code |
| 普通目录 zip | 平台类型树 | 用户逐级选择或显式传 code，并选择 `directory-zip` |
| 合集 | 合集类型树 | 只能选合集叶子类型 |

交互体验要求：

- 默认是一级级选择，保留 Console 下拉选择的可探索性。
- 搜索只是辅助，不替代一级级选择。
- 显示项必须包含类型名称、code、是否还有子类型。
- 选到父节点时继续下钻；只有叶子节点能进入下一步。
- 找不到类型时停止，并提示 `type list/search/info/pick`。

## 5. F2：主题工程脚手架

```text
freelog-cli init theme <dir>
  → 选择/确认主题叶子类型
  → 选择 runtime：0.4 / 0.5
  → 选择 runtime 模板
  → 填写 title / resource-name
  → 复制模板
  → 写 freelog.manifest.json
  → 可选安装依赖
  → 输出 build/create/version/publish/policy/online 下一步
```

关键规则：

- `init` 不运行构建，也不创建平台资源。
- 模板必须来自 `template-compat.json` 支持矩阵。
- `--skip-install` 时只复制模板，不安装依赖。
- 版本文件后续通常指向构建目录，并使用 `artifact-mode directory-zip`。
- 需要 runtime version 的资源，发版前必须在 version 意图里有 runtime。

典型下一步：

```bash
cd <dir>
pnpm build
freelog-cli create --yes --env <env>
freelog-cli version set --version 1.0.0 --file dist --artifact-mode directory-zip --runtime 0.5 --env <env>
freelog-cli publish --yes --env <env>
freelog-cli policy template list --env <env>
freelog-cli policy template apply <templateId> --yes --env <env>
freelog-cli online --yes --env <env>
```

## 6. F3：插件工程脚手架

插件流程与主题相同，但资源大类、类型过滤和默认文案不同。

```text
freelog-cli init widget <dir>
  → 选择/确认插件叶子类型
  → 选择 runtime
  → 选择 runtime 模板
  → 填写 title / resource-name
  → 复制模板并写 manifest
  → 输出后续发行命令
```

区别：

- 插件仍走 runtime 模板。
- 构建产物通常也是目录 zip。
- 不能把插件项目误解析为 package/前端库类型。

## 7. F4：package/前端库脚手架

```text
freelog-cli init package <dir>
  → 选择 package 模板：package-js / package-react / package-vue
  → 根据模板解析平台叶子类型
  → 若多个候选或无候选：停止，要求用户显式 --resource-type
  → 填写 namespace / title / resource-name
  → 复制模板并写 manifest
  → 输出构建和发行命令
```

package 的特殊性：

- package 模板不是 runtime 模板。
- `namespace` 是 package 工程必填字段。
- `type pick --category package` 没有模板上下文，不能替用户猜测 JS 工具包还是组件库。
- 用户显式传 `--resource-type` 时仍要校验叶子类型。

## 8. F5：普通文件资源脚手架

```text
freelog-cli init <dir> --scaffold none --artifact-mode file
  → 选择/确认资源叶子类型
  → 填写 title / resource-name
  → 写 freelog.manifest.json
  → 输出 create/version/publish/policy/online 下一步
```

适用内容：

- 图片
- 视频
- 文档
- 已经准备好的 zip 或其他单文件

规则：

- CLI 上传原文件，不压缩、不转码。
- 文件格式、大小和类型能力在 `version set` / `publish` 前校验。
- 视频版本封面和 listing 封面是两个字段，不在脚手架阶段混在一起问。

## 9. F6：普通目录 zip 资源脚手架

```text
freelog-cli init <dir> --scaffold none --artifact-mode directory-zip
  → 选择/确认资源叶子类型
  → 填写 title / resource-name
  → 写 manifest
  → 后续 version set 指向目录
  → publish 时 deterministic zip
```

规则：

- `init` 不扫描目录、不生成 zip。
- `publish` 才根据 ignore 规则生成临时 zip。
- zip 必须确定性：排序、路径分隔符、时间戳、权限稳定。
- `.freelog/`、`.freelog-auth`、VCS、cache 等强制排除。

## 10. F7：合集脚手架

合集不是“上传一个文件夹”，而是“创建一个合集资源 + 多个目录项子资源”。

```text
freelog-cli init <dir> --scaffold collection
  → 选择/确认合集叶子类型
  → 填写合集 title / resource-name
  → 写合集 manifest
  → 输出 collection create / item import-dir / version set / publish / policy / online
```

从本地文件夹快速创建合集时：

```text
collection init-from-folder
  → 扫描媒体目录
  → 确认子资源类型
  → 为每个文件创建子资源工程
  → 创建合集工程
  → 加入目录草稿
  → 用户发布合集版本
```

合集脚手架要求：

- 子资源和合集是两类平台对象，不混成一个 manifest。
- 目录项顺序属于合集目录草稿，不属于普通 listing。
- RSS 和自动收录是合集高级能力，不在普通合集首发流程里强制询问。

## 11. F8：已有线上资源接入

如果资源已在 Console 创建，脚手架流程不是 create，而是 init + bind。

```text
初始化本地 manifest
  → bind <resourceId | username/shortname>
  → 校验 owner、typeCode、resourceName/title 意图
  → 写 state
  → 后续维护 listing、version、policy、online
```

规则：

- 已绑定 resourceId 的目录不能再次 create。
- 类型不一致、owner 不一致、授权标识冲突都必须停止。
- `--apply-listing` 才允许用平台 listing 覆盖本地 manifest。

## 12. 交互字段顺序

脚手架 TTY 的字段顺序必须符合用户思考顺序：

```text
先问我要做什么
  → 再问资源大类
  → 再问具体平台类型
  → 再问模板/发行物模式
  → 再问标题和授权标识
  → 最后确认将生成的文件
```

不应一开始要求用户输入 code、resourceName、artifactMode 这类内部字段。可以展示字段名，但要先用业务语言解释。

| 字段 | 询问时机 | 提示重点 |
|---|---|---|
| resource type | 资源大类之后 | 必须选叶子类型；可一级级选，也可搜索 |
| template | 主题/插件/package 类型确定后 | 模板版本和 runtime/package 兼容 |
| artifact-mode | 普通资源没有模板时 | 单文件上传或目录 zip |
| title | 类型和模板确定后 | 展示给用户看的标题 |
| resource-name | title 之后 | 授权标识，默认由 title 规范化，可修改 |
| namespace | package 模板之后 | package 必填，不从 title 猜测 |

## 13. 生成物

| 流程 | 生成物 | 不生成什么 |
|---|---|---|
| theme/widget/package init | 模板文件、`freelog.manifest.json` | 不创建平台资源、不发行版本 |
| none init | `freelog.manifest.json` | 不复制模板、不上传文件 |
| collection init | 合集 manifest | 不创建子资源、不发布合集版本 |
| collection init-from-folder | 合集工程、子资源工程、报告 | 不自动绕过失败项、不隐藏部分成功 |
| start | 根据用户选择进入向导或打印命令 | 不在非 TTY 下提问 |

## 14. 代码映射

| 设计点 | 代码位置 |
|---|---|
| `start` 入口和任务分流 | `commands/start.ts`、`services/startGuide.ts` |
| session/project/studio/collection 连续壳 | `services/interactive/*Shell.ts` |
| init 命令手动路由 | `commands/init.ts` |
| 工程大类、模板和脚手架元数据 | `services/init/catalog.ts` |
| 类型树选择、逐级下钻、搜索 | `services/init/picker.ts` |
| init TTY 字段 | `services/init/wizard.ts`、`services/init/prompts.ts` |
| 模板复制和 manifest 写入 | `services/init/scaffold.ts` |
| 模板兼容矩阵 | `compat/template-compat.json`、`services/compat.ts` |
| 目录 zip / 单文件发行物管线 | `services/artifactPipeline.ts`、`services/processFile.ts` |
| 策略模板主路径 | `services/policyTemplate/*` |
| 本地 Store | `config/project/*`、`services/store/*` |

## 15. 验收标准

脚手架命令设计通过以下标准才算完成：

1. 空目录运行 `freelog-cli start` 能明确推荐新资源路径。
2. 已有资源工程运行 `start` 进入本地工程维护壳。
3. 已有合集工程运行 `start` 进入合集维护壳。
4. `type pick` 支持一级级选择，也支持搜索；不能选父类型。
5. theme/widget/package/none/collection 五类 init 都能输出正确下一步。
6. package 类型不能猜 code，必须由模板映射、显式 code 或 TTY 选择定稿。
7. `init` 不创建平台资源；平台写入必须从 create/publish/collection create 等命令开始。
8. 策略新增主路径是 `policy template list/apply`，不是手写策略文件。
9. 非 TTY 下缺少关键字段必须失败或打印命令，不进入交互。
10. 文档示例命令必须是公开命令，不能出现 dev-only 命令或不存在的子命令。

对应验证：

```bash
pnpm --filter @freelog-cli/cli2 test -- tests/startGuide.test.ts tests/initFiveChoice.test.ts tests/resourceTypeTree.test.ts tests/publicDocumentationCommands.test.ts
pnpm --filter @freelog-cli/cli2 typecheck
```

真实环境验收还需要在授权 dev/test 账号下跑 `start`、`init theme/widget/package`、普通文件、合集和策略模板场景；日期化结果只写入验证报告，不写回本文。
