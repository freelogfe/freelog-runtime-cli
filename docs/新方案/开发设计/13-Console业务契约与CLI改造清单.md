# 开发设计：Console 业务契约与 CLI 实现清单

> 本文是 Console 对齐清单。新 CLI 无旧代码负担，不做旧配置迁移。

## 1. 对齐目标

CLI 对齐 Console 的：

1. 平台请求字段语义。
2. 资源生命周期状态门禁。
3. 文件 SHA1 / 上传 / 发版顺序。
4. 策略、依赖授权、合集目录的业务结果。

CLI 不对齐 Console 的：

1. React 页面结构。
2. 四步向导节奏。
3. 弹窗与微应用。
4. 300ms 自动保存草稿。
5. 软上架入口。

## 2. 权威证据

| 优先级 | 来源 | 用途 |
|---|---|---|
| 1 | `packages/console/src/pages/resource` | 页面真实流程、门禁、调用顺序 |
| 2 | `packages/console/src/models/resource*` | effects、payload 组装 |
| 3 | `packages/@freelog/tools-lib/src/service-API/resources.ts` | FServiceAPI 请求契约 |
| 4 | CLI docs/API 对照表 | 归纳后的实现清单 |

当本文与源码冲突时，以源码为准，并修正文档。

## 3. 契约对照

| 业务 | Console 事实 | CLI 投影 |
|---|---|---|
| 创建资源 | `Resource.create` 提交短 name、title、typeCode | `create` / `collection create` 只接收短名 |
| 类型选择 | UI 类型树 | `type list/search/info` |
| 单品发版 | SHA1 -> Storage -> `createVersion` | `version set` -> `publish` |
| 合集发版 | `updateCollection` 合并目录草稿 | `collection publish` |
| listing | `Resource.update` | `update` / `collection update` |
| 策略 | `addPolicies` 新增；`updatePolicies(policyId,status)` 启停 | `policy apply/list/set` |
| 上架 | helper 检查 latestVersion + policy，再 update status | `online` 严格门禁 |
| 下架 | `Resource.update({ status: 4 })` | `offline` |
| 发版草稿 | versions/drafts | `draft push/pull/discard` |
| 合集目录草稿 | catalogues/drafts | `collection item *` |
| 依赖授权 | 微应用 + contract/authTree | P0 exit 5；P2 `dep auth` 只处理免费声明式策略 |

## 4. CLI 约定的差异

| 差异 | 约定 |
|---|---|
| 页面表单 vs 文件 | manifest 是用户意图，state 是平台事实 |
| 自动草稿 vs 显式草稿 | CLI 只显式 `draft push` |
| Builder vs 声明文件 | policy / auth-map 用 JSON/YAML schema |
| 交互 UI vs CI | flags + `--yes` 必须可跑，缺关键输入 exit 4 |
| 文件夹 | 单品导入与合集导入用不同命令 |
| 支付 | CLI 不做，回 Console |

## 5. 实现清单

### 5.1 平台层

- [ ] 安装 `@freelog/tools-lib2`。
- [ ] 只从 `@freelog/tools-lib2/node` 引入 `FServiceAPI/FUtil`。
- [ ] `configurePlatform` 注入 env、Bearer token、错误映射。
- [ ] 删除旧平行 API 封装。
- [ ] SHA1 路径算法与浏览器 `FUtil.Tool.getSHA1Hash(File)` 对齐。

### 5.2 本地文件层

- [ ] `freelog.manifest.json` schema。
- [ ] `.freelog/state.json` schema。
- [ ] `init` 只写 manifest/state/gitignore。
- [ ] `pull` 默认只刷新 state。
- [ ] `draftSync` 只写 state。
- [ ] 不执行用户 JS/TS 配置。

### 5.3 单品资源

- [ ] `type list/search/info`。
- [ ] `create` 短名查重与创建。
- [ ] `update` listing。
- [ ] `version set` 本地发版意图。
- [ ] `publish` typeInfo 校验、zip、SHA1、upload、createVersion。
- [ ] `version edit` 元数据。
- [ ] 依赖授权缺口 exit 5。

### 5.4 策略与上下架

- [ ] `policy apply --from-file` 单/多策略。
- [ ] `policy list`。
- [ ] `policy set --status`。
- [ ] `online` latestVersion + 启用策略门禁。
- [ ] `offline` status 4。
- [ ] 普通 `update` 禁止 status 上架。

### 5.5 草稿

- [ ] `draft push` manifest.version -> draftData。
- [ ] `draft pull` draftData -> manifest.version，保留 filePath。
- [ ] `draft discard`。
- [ ] 指纹 + updateDate 冲突算法。
- [ ] `status --json` 暴露远端草稿与 localDraftSync。

### 5.6 合集

- [ ] `collection create`。
- [ ] `collection item add/remove/update/reorder`。
- [ ] `collection item import-dir`。
- [ ] `collection update --display-*`。
- [ ] `collection publish` -> `updateCollection`。
- [ ] `collection collect-rules set`。
- [ ] `collection rss send-code/bind/sync`。

## 6. 端到端场景

| 场景 | 最短路径 |
|---|---|
| React 主题 | init runtime -> 用户 build -> create -> version set -> publish -> policy -> online |
| Vue 插件 | 同主题，换 resourceTypeCode |
| 单张图片 | init none -> create -> version set file -> publish |
| 单个视频 | 同图片 |
| 图片文件夹作为多个资源 | `resource import-dir` |
| 视频文件夹作为多个资源 | `resource import-dir` |
| 图片文件夹作为合集 | collection create -> `collection item import-dir` -> collection publish -> policy -> online |
| 视频文件夹作为合集 | 同图片合集 |
| Console 续编 CLI 草稿 | draft push -> Console 改 -> draft pull/publish |

## 7. 不做

- 不修改 Console 或浏览器 workspace 来迁就 CLI。
- 不复刻 React 页面、弹窗、微应用、防抖。
- 不自动构建用户项目。
- 不自动生成策略。
- 不自动完成付费授权。
- 不让单个文件夹既可能是 zip 资源又可能是合集；必须由命令区分。
