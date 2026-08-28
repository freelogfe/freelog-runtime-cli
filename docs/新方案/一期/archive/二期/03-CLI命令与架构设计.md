# CLI 命令与架构设计（完整）

> 文档角色：**完整** 命令面与实现约束（一期 + 二期规划）。原则 [01](./01-面向AI的CLI设计原则.md)；业务 [02](./02-平台业务分析.md)；能力 [04](./04-能力矩阵与验收.md)。

最后更新：2026-08-20

---

## 1. 设计目标

1. **资源发行闭环（一期 · 已实现）：** 本地 manifest → validate → publish → dep auth → policy → online。
2. **节点展品闭环（二期 · 规划）：** 在固定 `nodeId` 下 market 选品 → exhibit sign → online/offline。
3. **AI 可编排：** 全写命令支持 `--json` + 稳定 ID + preflight + handoff（code 0–5）。
4. **一套 services：** commands → services → FServiceAPI；禁止 `*ForAgent` 分叉。
5. **节点只读：** 不提供 `node create/update/delete`；节点壳 = Console。

---

## 2. 完整命令树

### 2.0 总览（一期 + 二期）

```text
# 环境与工程（一期）
login / logout / config / init / bind / status / validate / doctor / diff / pull

# 资源发行与维护（一期）
create / publish / update / online / offline / draft *
dep add|update|remove / dep auth
policy apply|set / version edit / release
type list|pick / resource import-dir

# 合集（一期）
collection create|publish|item *|display|properties *

# 会话（一期）
resource publish|update --session / dep * --session / ...

# 交互壳（一期 · TTY）
session / studio

# 市场（二期 · 规划）
market search / market show

# 节点与展品（二期 · 规划）
node list / node show
node exhibit sign|list|online|offline|version
node contract list|show   # 可选
```

### 2.1 二期增量命名空间

```text
freelog-cli market   …   # 资源市场（只读，选品）
freelog-cli node     …   # 节点只读 + 展品读写
freelog-cli …              # 资源本身仍用一期：create/publish/update/online/…
```

不与 `resource`、`collection` 混命名空间；**资源写** 继续用一期命令，避免 Agent 混淆「发资源」与「挂展品」。

### 2.2 `market` — 资源市场

| 命令 | 说明 | 写 | 主要 API |
|---|---|:-:|---|
| `market search` | 分页列表、筛选 | | `Resource.list` |
| `market show <resourceId>` | 详情 + 可签约 preflight | | `Resource.info`, `batchAuth` |

**共用 flag：**

```text
--category <operationCategoryCode>
--filter home|choice|latest    # 映射 operationTypes 4,5 / 5 / 3,4,5
--type <resourceTypeCode>
--keywords <text>
--skip --limit
--json
```

**`market show` JSON 扩展字段（规划）：**

```json
{
  "resourceId": "...",
  "status": 1,
  "canSignToNode": true,
  "policies": [{ "policyId", "policyName", "status" }],
  "signBlockers": []
}
```

`signBlockers`：`not_online` | `owner_frozen` | `auth_exception` | …

### 2.3 `node` — 节点（只读）

| 命令 | 说明 | 写 | 主要 API |
|---|---|:-:|---|
| `node list` | 当前用户的节点（供 Agent 选 `nodeId`） | | `Node.nodes` |
| `node show <nodeId\|name\|domain>` | 详情、冻结/owner 门禁 | | `Node.details` |

**刻意不提供（Console 专属）：** `node create` / `node update` / `node delete` — 涉及域名唯一性、可见性、Logo/封面、删除确认，属于 **重量级一次性配置**，不适合 Agent 自动化，误操作代价高。

Agent 约定：`nodeId` 来自环境变量、CI 配置或 `node list` 一次人工选定，后续 pipeline 只传 `--node <id>`。

### 2.4 `node exhibit` — 展品

| 命令 | 说明 | 写 | 主要 API |
|---|---|:-:|---|
| `exhibit list` | 节点下展品分页 | | `Exhibit.presentables` |
| `exhibit show <presentableId>` | 详情 | | `presentableDetails` 等 |
| `exhibit sign` | **签约创建展品** | ✓ | `batchCreatePresentable` |
| `exhibit online <presentableId>` | 上架 | ✓ | `presentablesOnlineStatus` |
| `exhibit offline <presentableId>` | 下架 | ✓ | 同上 |
| `exhibit version` | 切换版本 | ✓ | `presentablesVersion` |

**`node exhibit sign`（核心）：**

```text
freelog-cli node exhibit sign \
  --node <nodeId> \
  --resource <resourceId> \
  [--policy <policyId>] \
  [--dry-run] \
  --yes --env <env> --json
```

| 阶段 | 行为 |
|---|---|
| `--dry-run` | 只跑 preflight，不调用 create（**CLI_ONLY**） |
| preflight | owner、resource status、batchAuth、User 冻结、重复签约；见 [07-Q2](./07-开放问题与设计裁决.md) |
| `--strict` | 将 authException/ownerFreeze 从 warn 升为 code 4 |
| 执行 | `batchCreatePresentable` |
| 成功 data | `presentableId`（**反查** `presentableDetails`）、`resourceId`, `nodeId`, `policyId`；见 [07-Q1](./07-开放问题与设计裁决.md) |
| 付费 policy | code 5 + `contractsUrl` + `nextCommand`；见 [07-Q4](./07-开放问题与设计裁决.md) |

支持 `--resource` 重复多次（NM-18 / 2.1）→ 一次 batch；部分失败返回 `results[]`。

**`exhibit list` 参数：**

```text
--node <nodeId>   # 必填
--status online|offline|all
--type <resourceTypeCode>
--keywords
--skip --limit
--json
```

默认 `omitResourceType: 主题` 与 Console 展品 Tab 一致；主题用 `node theme list`。

### 2.5 `node theme` — 主题（非 MVP，Console 优先）

主题激活影响整站 UI，且与「主题」类展品/policy 强绑定；**2.0 不纳入 Agent 主路径**，在 Console 完成首次配置即可。

| 命令 | 2.0 | 说明 |
|---|---|---|
| `theme list` | ⏭ 2.2 | 只读排查 |
| `theme activate` | ❌ OUT | Console 操作 |

若未来有「仅换主题、不改节点壳」的自动化需求，再单独立项。

### 2.6 `node contract` — 合约（只读）

| 命令 | 说明 |
|---|---|
| `contract list --node <nodeId> [--role authorize\|authorized]` | 分页列表 |
| `contract show <contractId>` | 详情 |

创建/终止/支付合约 → **OUT** + handoff。

---

## 3. 服务分层

```text
packages/cli/src/
  commands/
    market.ts          # market search/show
    node/
      index.ts         # node list/show（只读）
      exhibit.ts       # exhibit *
      contract.ts      # contract list/show（可选）
  services/
    market/
      searchMarket.ts
      describeMarketResource.ts
    node/
      nodeService.ts             # 只读 list/show + owner gate
      exhibitSignService.ts      # preflight + batchCreatePresentable + presentableId 反查
      exhibitLifecycleService.ts # online/offline（2.0 单条；bulk 2.1）
      contractListService.ts
    shared/
      nodeOwnerGate.ts           # node.details owner === auth
      resourceMarketGate.ts      # status===1, batchAuth
      signHandoff.ts             # 复用/扩展 dep auth handoff 形态
```

**边界规则：**

- `exhibitSignService` **唯一** 调用 `batchCreatePresentable` 的写路径
- 不引入 `NodeStore`；节点状态 **以平台为准**（无本地 manifest 真源）
- 可选：`.freelog/node.cache.json` 仅作 CI 缓存（`nodeId` 别名），**非**契约

---

## 4. Preflight 设计

### 4.1 `node exhibit sign --dry-run`

返回：

```json
{
  "ok": true,
  "command": "node exhibit sign",
  "data": {
    "dryRun": true,
    "nodeId": 123,
    "resourceId": "...",
    "policyId": "...",
    "checks": {
      "nodeOwner": "pass",
      "resourceOnline": "pass",
      "notDuplicate": "pass",
      "authChain": "warn",
      "paymentRequired": false
    }
  }
}
```

### 4.2 上架 preflight

`exhibit online` 前：

- 展品存在且属于当前用户可操作的 node
- 至少一条 **status=1** 的 policy（与 Console `onlineExhibit` 一致）
- 否则 code 4：`hint: freelog-cli node exhibit show ... 或先在资源侧启用策略`

### 4.3 门禁汇总（全产品）

资源域 + 节点域完整门禁表见 [02 §7](./02-平台业务分析.md#7-门禁汇总cli-须一致实现)。实现时 **services 层** 统一抛出与 [06 §1.1](./06-JSON协议与Schema草案.md#11-退出码) 一致的 code。

---

## 5. JSON / 退出码 / Handoff

与一期一致：

| code | 含义 |
|:---:|---|
| 0 | 成功 |
| 1 | 平台/未知错误 |
| 2 | owner/权限/节点冻结 |
| 3 | 冲突（少用） |
| 4 | 参数/预检/未上架/无 policy |
| 5 | 需 Console 接力（付费签约等） |

**Handoff envelope 示例（code 5）：**

```json
{
  "ok": false,
  "command": "node exhibit sign",
  "error": {
    "code": 5,
    "message": "Policy requires payment",
    "reason": "payment_required",
    "contractsUrl": "https://console.<env>/...",
    "nextCommand": "freelog-cli node exhibit sign --node 123 --resource xxx --policy yyy --yes --env dev"
  }
}
```

---

## 6. Agent 编排示例

### 6.1 节点主日常：挂展品（nodeId 已配置）

```text
1. freelog-cli node show <nodeId> --json          # 确认未冻结、owner 正确
2. freelog-cli market show <resourceId> --json    # 或对自己资源：一期 status/online 已保证
3. freelog-cli node exhibit sign --node <id> --resource <rid> --dry-run --json
4. freelog-cli node exhibit sign ... --yes --json
5. freelog-cli node exhibit online <presentableId> --yes --json
```

### 6.2 节点主：市场选品后挂展品（J-06）

```text
1. freelog-cli market search --limit 20 --json
2. freelog-cli market show <resourceId> --node <nodeId> --json   # 选品 + already_signed
3. freelog-cli node show <nodeId> --json
4. freelog-cli node exhibit sign --node <id> --resource <rid> --dry-run --json   # 必填，不可跳过
5. freelog-cli node exhibit sign ... --yes --json
6. freelog-cli node exhibit online <presentableId> --yes --json
7. freelog-cli node exhibit list --node <nodeId> --json
```

**L0 分工：** `market show` = 选品与节点级 blockers；`sign --dry-run` = 写前全量 preflight（含 node owner、authChain、ownerFreeze）。**Agent 不得** 仅用 `market show`（即使带 `--node`）替代 `sign --dry-run` — 前者不校验 owner、不跑完整 checks（见 [06 §4.3](./06-JSON协议与Schema草案.md#43-与-sign-dry-run-分工)）。

场景详解：[11 J-06](./11-完整用户旅程.md#7-j-06--节点主运营他人资源)。

### 6.3 完整链路：从零到展品上线（同一账号）

```text
# 一期
login → init → create → publish --yes → dep auth? --yes
  → policy apply --yes → online --yes

# 二期（nodeId 已在 Console 配置）
node show $NODE_ID --json
node exhibit sign --node $NODE_ID --resource $RID --dry-run --json
node exhibit sign --node $NODE_ID --resource $RID --yes --json
node exhibit online $PRESENTABLE_ID --yes --json
```

场景详解：[11-完整用户旅程](./11-完整用户旅程.md) J-05。

### 6.4 Agent 速查卡（二期展品）

```text
node show → market show → sign --dry-run → sign --yes → online --yes → exhibit list
稳定 ID：nodeId · resourceId · presentableId
exit：2=owner/冻结 · 4=预检 · 5=handoff（读 nextCommand）
术语：[13](./13-术语与对象速查.md) · ADR：[07-Q1/Q2/Q4](./07-开放问题与设计裁决.md)
```

---

## 7. 与交互壳关系

| 入口 | 适用范围 |
|---|---|
| `freelog-cli` + `--json` + `--yes` | ✅ **Agent/CI 主路径**（一期资源 + 二期展品） |
| `session` / `studio` | 一期发资源 TTY 便利；**非** Agent 展品路径 |
| Console | 节点壳、主题、付费、可视化 policy |

可选 **2.2**：`session` 增加「签约至节点」菜单 — 仅 TTY 便利，**不是** Agent 路径。

---

## 8. 非目标（2.0）

- **节点写操作**（create/update/delete/setNodeInfo）— Console
- 测试节点 `InformalNode.*`
- 合集展品 create/catalogue/reorder
- 主题激活（整站级，Console 优先）
- 展品 viewport / rewrite properties 可视化编辑
- 节点收入、提现、交易
- MicroApp 签约路径对齐
- C 端购买 / 节点 runtime 部署

---

## 9. 实现顺序建议

> 实现细节见 **[15-二期实现规格](./15-二期实现规格.md)**（命令注册表、preflight 伪代码、handoff）。

```text
W1  services: nodeOwnerGate (read-only), resourceMarketGate, exhibitSignService
W2  commands: market search/show, node list/show, exhibit sign/list
W3  commands: exhibit online/offline
W4  contract list (read-only，可选)
W5  verify:exhibit-smoke.mjs + 能力矩阵 NM-xx + DESIGN 回写（见 08 草案）
```

---

## 10. 文档与 schema 交付物

| 交付 | 说明 |
|---|---|
| [06-JSON协议与Schema草案](./06-JSON协议与Schema草案.md) | 设计级 envelope（实现后落 `packages/cli/schemas/`） |
| [09-节点与资源市场（使用草案）](./09-节点与资源市场（使用草案）.md) | 公开用户文档草案 |
| [04-能力矩阵与验收](./04-能力矩阵与验收.md) | NM-01…NM-23（评审后合并至对齐 §9） |
| [15-二期实现规格](./15-二期实现规格.md) | 研发实现就绪规格 |
| `verify:exhibit-smoke` | dev 环境 E2E（规划，[16](./16-verify-exhibit-smoke设计.md)） |
| [08-DESIGN回写草案](./08-DESIGN回写草案.md) | 评审后合并 DESIGN |

---

## 12. Agent 标准配方

> 浓缩 [11 J-06/J-07](./11-完整用户旅程.md)；L0 分工见 [15 §2.1](./15-二期实现规格.md#21-l0-推荐工具链agent--j-06)、[06 §4.3](./06-JSON协议与Schema草案.md#43-与-sign-dry-run-分工)。

### 12.1 标准工具链（headless）

**J-06 · 节点主挂市场资源：**

```text
market search → market show <rid> --node <nodeId> --json
→ node show <nodeId> --json
→ node exhibit sign --dry-run … --json
→ node exhibit sign … --yes --json
→ node exhibit online <presentableId> --yes --json
→ node exhibit list --node <nodeId> --json
```

**J-07 · Agent 编排（含一期资源段）：** 同上，资源段先 `create → publish → policy apply → online`；遇 code 5 进入 handoff 循环（§12.3）。

**保存 ID：** `nodeId` · `resourceId` · `presentableId`（反查，[07-Q1](./07-开放问题与设计裁决.md#21-q1--sign-成功后如何得到-presentableid)）。

### 12.2 禁止清单

| 禁止 | 理由 |
|---|---|
| `studio` / `session` 作为展品唯一路径 | TTY；非 headless 契约 |
| `node create` / `update` / `delete` | P11 OUT |
| 跳过 `sign --dry-run` | `market show` 不含 owner / 完整 checks |
| 忽略 **code 5** 继续写 | 须 Console + `nextCommand` |
| 未对账连跑 sign | 易 duplicate；见 [17 R1/R6](./17-展品状态机与恢复模型.md#5-重试剧本) |
| 假设 batch `data` = presentableId | [07-Q1](./07-开放问题与设计裁决.md) |

### 12.3 handoff 循环（code 5）

```text
loop:
  result = cli(..., --json)
  if result.ok: break
  if result.error.code == 5:
    log(result.error.contractsUrl, result.error.nextCommand)
    wait_for_human_or_console()
    cli(parse(result.error.nextCommand))  # 含 --env
    continue
  if result.error.code in (2, 4):
    apply_hint(result.error); break or retry per 17
  raise
```

非 TTY / `--json`：**不**自动打开浏览器（与 DESIGN 一致）。

### 12.4 `warn` vs `--strict`

| 场景 | 默认 | CI / 保守 Agent |
|---|---|---|
| `auth_exception` / `ownerFreeze` | **warn**，允许 sign | `--strict` → code 4 |
| 资源未上架 / 重复 / 无 policy | fail 4 | fail 4 |
| 合集 sign（Q9） | fail 4 | fail 4 |

**默认策略：** 与 Console Drawer **PARITY**（[07-Q2](./07-开放问题与设计裁决.md#22-q2--authexception-与-ownerfreeze)）。**CI smoke / 严格编排** 建议全局 `--strict`。

---

## 11. 参考

- tools-lib：`@freelog/tools-lib/src/service-API/nodes.ts`, `presentables.ts`, `contracts.ts`
- Console 证据：[05-Console源码证据与调用链](./05-Console源码证据与调用链.md)
- Console Drawer 真源：`fSignResourceToNode/FSignResourceToNodeDrawer`
- 一期 handoff：`packages/cli/src/services/depAuthService.ts`（形态参考）
