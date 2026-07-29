# 开发设计：Console 页面覆盖矩阵

> 服从 [产品原则](../产品设计/01-结论与原则.md) · 不为每 Tab 堆命令 · P0 必须 / P1 应对齐 / P2 后期 / 非目标不做

## 1. 操作速查

| Console | CLI |
|---------|-----|
| 登录 / 我的资源 | `login`（workspace > global） |
| 打开编辑页 | `cd` + `status` / `pull`；先确认 Owner |
| 创建向导 | `create` / `create --from-dir` |
| 上传并创建版本 | `updateVersion` → `publish` |
| 发版页暂存 / 续编 | `draft push` / `draft pull` |
| 丢弃发版草稿 | `draft discard` |
| 改正式版说明 | `version edit` |
| 策略 / listing / 上下架 | `policy` / `update` / `online`/`offline` |
| 合集加本地章节 | `collection item add ./path` |
| 合集加他人资源 | `collection item add <resourceId>`（允许） |
| 目录展示 | `collection update --display-*` |
| 依赖未授权 | publish exit 5；后期 `dep auth --policy-map` |
| 授权方合约列表 | P2 `contract list` |
| 冻结 | 写命令拒绝；不解冻 |
| 列表财务 / details Save / 解冻 | **非目标** |

## 2. 定稿原则

| 原则 | 说明 |
|------|------|
| 打开页 ≈ pull | listing/正式版用 pull；WIP 用 draft push/pull |
| 写门禁 | Owner → 冻结 → ensureSynced → 字段/授权 → API |
| 微应用不对齐 | 文件驱动或引导 Console |
| 草稿非防抖 | 禁止自动 saveVersionsDraft；允许显式 draft push |
| 上架严格 | CLI `online` = resourceOnline；**不**跟 Step4 软 `status:1` |

产品对照表 → [05-Console与CLI对照](../产品设计/05-Console与CLI对照.md)。

---

## 2.1 软上架 vs resourceOnline（口径钉死）

| 路径 | Console | CLI |
|------|---------|-----|
| Step4 / 合集 Step4 | `update(…, status:1)` **软上架**（策略门禁弱） | **禁止**模仿；listing 用 `update`，上架只用 `online` |
| 侧栏上下架开关 | 常走 **resourceOnline** 级联（须版本+启用策略）→ 再改 status | `online` / `offline` **始终**对齐此硬路径 |
| 缺策略仍「上架」 | 软路径可能出现 | CLI `online` → **exit 4**（`ONLINE_GATE_FAILED`） |

交叉引用：[命令规格 online](./02-命令规格.md) · [API 对照 Step4](./API/Console资源页API对照表.md)。

### 防抖草稿与 CLI 共存

- Console：编辑中 300ms → `saveVersionsDraft`。  
- CLI：仅 `draft push/pull/discard`；`status` 暴露「远端有、本地无 draftSync」。  
- 细节矩阵 → [04 §9.1](./04-草稿转换层.md)。

### 微应用 → 文件 / hint

| Console 微应用 | CLI |
|----------------|-----|
| 依赖签约 | Phase1：publish exit 5 + `consoleHint`；Phase5：`dep auth --policy-map` |
| fPolicyBuilder3 | Console 导出 → `policy add --from-file`（§6 schema） |
| 合集选资源 UI | `item add <resourceId\|path>` / order-file |

### RSS 验证码 / 轮询 / 换绑

见 §5；人机混合：码来自邮箱；CI 人工 `--code`。

## 3. 单品侧栏

| Tab | API | CLI | 优先级 |
|-----|-----|-----|--------|
| 框架 | info；冻结；subjectType；batchAuth 提示 | status/pull；写前同检 | P0 |
| info | update listing | update | P0 |
| policy | add/updatePolicies；batchSetContracts | policy *；合约 → dep auth(P2) 或 Console | P0/P2 |
| versionInfo | lookDraft；deleteDraft；updateResourceVersionInfo | draft *；version edit；publish | P0/P1 |
| dependency | 依赖树 + 微应用签约 | dep list；dep auth(P2) 或 Console | P1/P2 |
| contract | 授权方合约只读 | contract list | P2 |
| 上下架 | **resourceOnline** 级联 / status4（侧栏硬路径） | `online`/`offline`（严格；非 Step4 软） | P0 |

### 发版准入（versionCreator）

```text
info → owner → 冻结拒绝 → 非合集 → typeInfo → lookDraft → … → createVersion
```

授权：`isCompleteAuthorization===false` → 禁止提交；CLI publish → exit 5。  
草稿：见 [04-草稿转换层](./04-草稿转换层.md)。

## 4. 合集侧栏

| 区域 | API | CLI | 优先级 |
|------|-----|-----|--------|
| info | update；setCollectRules；RSS 换绑 | collection update；collect-rules；rss | P0 |
| versionInfo | catalogue drafts；isMergeCatalogueDraft；catalogueProperty；Rss.sync | item *；display；publish；rss sync | P0 |
| ChangeLog | getCollectionUpdateLogs | collection logs | P2 |
| policy/dependency/contract | 同单品（合集 subject） | 同单品命令 | P0/P2 |
| 上下架 | 同 **resourceOnline**（硬） | online/offline 严格；合集 Step4 软 status:1 **不跟** | P0 |

### catalogueProperty（`--display-*`）

| 字段 | 取值 |
|------|------|
| collection_sort_list | ascending / descending |
| collection_item_title | rtitle / sn / empty / custom |
| collection_item_no_display | show / hide |
| collection_item_image_display | show / hide |
| collection_item_descr_display | show / hide |
| collection_view | list / card |

### 空合集 rssSource

| 状态 | CLI |
|------|-----|
| unknown | 须 item add 或 rss bind |
| no | 正常 item/display/publish |
| yes | 目录锁定；以 rss sync 为主 |

## 5. RSS 流程（人机混合）

```text
bindingsPreview → sendVerificationCode（邮箱）→ 用户取码
  → bindRssFeed(--code) → syncBinding → 轮询 progress
换绑：preview + compare → 发码 → bind
```

| 项 | 定稿 |
|----|------|
| CLI | `rss send-code` → 提示查邮箱 → `rss bind --code` → `rss sync` |
| 无 code | 拒绝 bind，exit 4 |
| 错误 | error_invalid / noemail / alreadyexists_* → exit 4 + hint |
| 轮询 | progress；超时见命令规格（300s） |
| CI | 不能纯自动；人工注入 code |

## 6. 优先级总表

| 优先级 | 能力 |
|--------|------|
| P0 | 主路径 flags+`--yes`；Owner；字段约束；冻结；授权 exit 5；online 严格；auto-pull；退出码；合集 item/publish/rules；RSS bind/sync |
| P1 | status --json（含草稿）；draft * + adapter；version edit；display-*；dep list |
| P2 | dep auth --policy-map；contract list；collection logs；RSS failed-items；合集发版草稿 adapter |
| 非目标 | 自动防抖 saveDraft；列表财务；details Save；解冻；交互微应用；默认 wizard；batch/syncr/syncv |
