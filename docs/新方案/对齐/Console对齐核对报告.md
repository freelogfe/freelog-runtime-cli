# Console 与 CLI 对齐核对报告

最后更新：2026-08-10

**读者：** 产品、测试、开发  
**真源：** [CLI数据操作与Console对照 §2](./CLI数据操作与Console对照.md#2-业务操作-parity-总表)（81 项）· [Console完整业务梳理](./Console完整业务梳理.md)

---

## 1. 核对结论（一屏）

| 维度 | 结论 |
|---|---|
| **L1 业务/API** | ✅ 81 项 §2 **无 ❌**；范围内写入 API 均有 CLI 等价路径 |
| **L2 校验/门禁** | ✅ 查重、semver、SHA1、批量 20、合集 ≤100、策略重复、owner、offline 确认等已对齐 |
| **L3 文案/i18n** | ✅ OSS 同源 key；`pnpm i18n:audit` 0 命中 |
| **↷ 交互等价** | 8 项：裁剪 UI、Builder、自动草稿、软上架、策略后上架等（功能等价，步骤不同） |
| **— 边界** | 5 项：云存储 #12、Markdown/Cartoon #19、付费 #68、策略正文 #64、Console 源码 |
| **⚠ Console 落后** | 1 项：创建/发新版 **未传 videoCover**（CLI 已支持 `--video-cover`） |

**能否验收「脚手架已对齐 Console」？→ 可以。** 边界（—）与交互差异（↷）除外，L1+L2+L3 全量对齐；Console 侧已知 TODO 不影响 CLI 能力，但影响跨端体验一致度。

**验证命令（2026-08-10 实测）：**

```bash
cd packages/cli
pnpm test                          # 188/188
pnpm verify:parity                 # 10 个子脚本全 PASS
pnpm verify:scenarios --env dev      # 115/115
node ../../test/run-all-scenarios.mjs --env dev
```

---

## 2. 已一致项（摘要）

### 2.1 81 项 parity 分布

| 状态 | 数量 | 含义 |
|---:|---:|---|
| ✅ | **68** | API/字段/门禁与 Console 对齐，dev 自动化或契约脚本可证 |
| ↷ | **8** | 功能等价，填写方式或步骤不同（见 §3.1） |
| — | **5** | 形态/平台限制，CLI 与 Console 同限或 CLI 做不到（见 §3.2） |

> 注：#60（已发版 videoCover）CLI 已实现 `version edit --video-cover`，parity 表已更正为 ✅。

### 2.2 主链路（与 Console 一致）

```text
login → init/import-dir → create → version set → publish
     → policy apply → online → pull/status
维护：update / version edit / draft / collection item* / collection publish / offline
```

### 2.3 自动化覆盖映射

| 域 | verify 脚本 / 场景 | 覆盖 parity # |
|---|---|---|
| 单品发版 + 属性 | `verify:console`、`verify:payload`、S6/S6d/S6e | 1–7, 13–18, 53–59 |
| 批量 | `verify:create-batch`、S13/S13b、VID-03 | 24–30 |
| 合集 | `verify:collection`、`verify:collection-attrs`、S11/S12/S16b–d | 31–46, 72–77 |
| 策略/上下架 | S15、policy 单测 | 20–23, 61–63, 70–71 |
| 依赖/签约 | `verify:auth-fallback`、S15 dep | 65–67, 69 |
| 半路接入 | COM-06/07、S78 bind | 78 |
| 跨账号 | E3（辅账号 snnaenu） | owner 门禁 |
| 负向/形态 | IMG-06–08、F2、VID-04 | 类型/dep 校验 |

**RSS / collect-rules（#45–46）：** CLI 命令已实现（`collection rss *`、`collect-rules set`），属 **sidebar 维护分支**，不在「本地文件发版」主链路 E2E 内；需手工或专项验证（见 §3.3）。

---

## 3. 不一致项与影响

### 3.1 ↷ 交互等价（功能一致，操作不同）

| # | Console | CLI | 对用户的影响 |
|---:|---|---|---|
| 22 | Step4 **软上架**（无完整门禁） | 必须 `online`（完整门禁） | CLI 更安全：未满足策略/封面等条件无法上架；Console 可能先 status=1 再补 |
| 63 | 新增策略后 **自动上架** | 须再执行 `online` | CLI 多一步；避免无意公开 |
| 81 | Step2 **300ms 自动存草稿** | 显式 `draft push` | CLI 不会静默写远端草稿；忘 push 则平台无草稿 |
| — | 策略 **Builder UI** | `policy apply --from-file` | 须手写/复制 policyText；语法错误在 CLI 预检 |
| — | 封面 **裁剪弹窗** | 本地裁好再 `--cover` | 无交互裁剪；须外部工具预处理 |
| 29 | batchSign **微应用 UI** | manifest / `freelog.batch.json` + `dep auth` | 批量付费签约须手填 YAML/JSON |
| — | 富文本 i18n → React | CLI `t()` 纯文本 | 错误提示无链接/样式，文字内容同源 |
| — | 表单防抖、拖拽排序 | 命令 + manifest | 合集排序用 `collection item reorder`，无拖拽 |

**产品影响：** 不算功能缺失；需在用户文档中说明「CLI 更严格、更手动」，避免 Console 用户误以为行为完全一致。

### 3.2 — 边界（做不到或双方同限）

| # | 项 | 说明 | 影响 |
|---:|---|---|---|
| 12 | **云存储选文件** | 脚手架只认本地 `filePath` | 已从 Storage 选文件的资源，须 Console 或先下载到本地 |
| 19 | **Markdown/Cartoon 微应用** | 浏览器内嵌编辑器 + 专用 draft | 小说/富文本若走微应用路径，**必须 Console**；CLI 走 `.txt`/本地文件类型 |
| 68 | **付费策略签约** | 须收银台 | CLI 可声明 dep、免费 `batchSetContracts`；**付费须 Console 或已签约资源** |
| 64 | **改已有策略正文** | 平台惯例 | 只能 **新增策略 + 启停**；旧策略内容不可改（Console/CLI 同限） |
| — | 列表/收藏/收入/节点 | 运营消费侧 | CLI 不做；与发版无关 |

### 3.3 ⚠ 文档/范围表述曾冲突（已统一）

| 议题 | 旧表述冲突 | **统一口径** |
|---|---|---|
| RSS / collect-rules | 有的说「不在脚手架」、对照表标 ✅ | **Parity：** #45–46 ✅，命令可用 · **验收：** 非本地发版主链路，E2E 不强制，手工验 |
| 场景 pass 计数 | 59 / 83 / 100+ 混用 | **以 `verify-scenarios` 脚本末尾 `汇总: X/X 通过` 为准**（含条件 skip 的 pass 行） |
| 单元测试数 | 147 / 186 / 188 | **当前 188**（`pnpm test`） |

### 3.4 ⚠ Console 源码落后（CLI 已领先）

| 位置 | Console | CLI | 影响 |
|---|---|---|---|
| step2 / versionCreator **createVersion** | **TODO：未传 videoCover** | ✅ `version set --video-cover` → `publish` | Console 发短视频首版可能**无版本封面**；CLI 正常。跨端验收时勿只查 Console |
| creatorBatch 封面生成 | 注释掉 generateCoverImage | ✅ `cover generate` | Console 批量可能缺自动封面 |
| 已发版 videoCover 维护 | versionEditor 有 | ✅ `version edit --video-cover` | 维护期两端均可；创建期见上行 |

---

## 4. 分角色入口

| 角色 | 文档 |
|---|---|
| 产品经理 | [产品经理简明手册](../使用/产品经理简明手册.md) |
| 测试人员 | [测试人员简明手册](../使用/测试人员简明手册.md) · 详版 [08-测试人员手册](../场景/08-测试人员手册.md) |
| 普通用户 / 作者 | [普通用户简明手册](../使用/普通用户简明手册.md) · 详版 [CLI使用说明](../使用/CLI使用说明与Console差异.md) |
| 开发 / parity 查表 | [CLI数据操作与Console对照](./CLI数据操作与Console对照.md) |

---

## 5. 维护约定

1. Console 新增写入 Effect → 先更新 [Console完整业务梳理](./Console完整业务梳理.md) → [拓扑 TOP-*](./CLI拓扑与Console对照.md) → 对照 §2 一行。
2. 改 CLI 校验/门禁 → 同步 i18n bundled + `i18n:audit`。
3. 新增 E2E 场景 → `verify-scenarios.mjs` + [08-测试人员手册](../场景/08-测试人员手册.md) 场景表。
4. 本报告与 §0.1 一屏结论同步更新；**不以固定「59 项」等历史数字为准**。

---

## 6. 证据索引

| 类型 | 路径 |
|---|---|
| Parity 扁平表 | `docs/新方案/对齐/CLI数据操作与Console对照.md` §2 |
| Console 契约 | `packages/cli/scripts/lib/console-source-contract.mjs` |
| E2E 场景 | `packages/cli/scripts/verify-scenarios.mjs` |
| 一键验收 | `test/run-all-scenarios.mjs` |
| 联调账号 | 主 `freelog-test11`；辅 `snnaenu`（仅 E3 owner 负向，**不可 policy/online 主链路**） |
