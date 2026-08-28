# JSON 协议与 Schema 草案（完整）

> 文档角色：CLI **机器输出** 设计级契约。§1–§2 为一期已有 envelope（与 DESIGN 一致）；§3 起为二期 NM 命令增补。**不在** `packages/cli/schemas/` 落代码。

最后更新：2026-08-20

---

## 1. 通用 Envelope（一期 · 已实现）

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "market search",
  "data": { },
  "meta": {
    "env": "dev",
    "durationMs": 120
  }
}
```

失败：

```json
{
  "schemaVersion": 1,
  "ok": false,
  "command": "node exhibit sign",
  "error": {
    "code": 4,
    "message": "Resource is not online",
    "hint": "freelog-cli online --yes --env dev",
    "reason": "resource_not_online"
  },
  "meta": { "env": "dev" }
}
```

### 1.1 退出码

| code | 含义 |
|:---:|---|
| 0 | 成功 |
| 1 | 平台/未知错误 |
| 2 | owner/权限/节点冻结 |
| 3 | 冲突（少用） |
| 4 | 参数/预检/未上架/无 policy / `--strict` warn 升级 |
| 5 | 需 Console 接力（付费签约等） |

### 1.2 schemaVersion 与兼容性

1. NM 命令首版 **`schemaVersion: 1`**，与一期 envelope 一致。
2. **新增** JSON key：minor 升级，旧 Agent 可忽略未知字段。
3. **删除/重命名** key 或改 reason 枚举：须升 major + 发布说明；Console commit 变更时复核 [05 B.8](./05-Console源码证据与调用链.md#b8-参考-commit)。

### 1.3 脱敏

token、cookie、authorization、password 不得出现在 stdout JSON（见 DESIGN）。

---

## 2. 一期写命令 JSON 要点（已实现）

| 命令族 | `data` 必含稳定 ID | 备注 |
|---|---|---|
| `create` | `resourceId` | |
| `publish` | `resourceId`, `version`, `versionId` | |
| `dep auth` | 签约结果；code 5 handoff | 二期 sign 同形态 |
| `online` / `offline` | `resourceId`, `status` | offline → status 4 |
| `collection publish` | `resourceId`, `version` | 合集 |

验证：`verify-json-envelope.mjs`（仓库内）。

---

## 3. `market search`（NM-01 · 规划）

**成功 `data`：**

```json
{
  "items": [
    {
      "resourceId": "abc123",
      "resourceTitle": "示例资源",
      "resourceName": "demo",
      "status": 1,
      "latestVersion": "1.0.0",
      "subjectType": 1,
      "operationType": 5,
      "resourceType": ["图片"]
    }
  ],
  "total": 42,
  "skip": 0,
  "limit": 20
}
```

---

## 4. `market show`（NM-02）

### 4.1 无 `--node`（选品 / 资源级）

**成功 `data`：**

```json
{
  "resourceId": "abc123",
  "status": 1,
  "subjectType": 1,
  "canSignToNode": true,
  "signBlockers": [],
  "policies": [
    { "policyId": "p1", "policyName": "永久免费", "status": 1 }
  ],
  "warnings": []
}
```

仅 **资源级** blockers：`not_published` | `not_online` | `frozen` | `owner_frozen`（后者为 warn，见 Q2）。

### 4.2 有 `--node <nodeId>`（含节点级 blockers）

```json
{
  "resourceId": "abc123",
  "status": 1,
  "subjectType": 1,
  "canSignToNode": true,
  "signBlockers": [],
  "policies": [{ "policyId": "p1", "policyName": "永久免费", "status": 1 }],
  "warnings": [],
  "nodeId": 1001,
  "alreadySigned": false
}
```

**节点级检查：** 调用 `presentableDetails({ resourceId, nodeId })`；与 Drawer L223–240 一致——`data` 为 truthy 时 `alreadySigned: true`，`signBlockers` 含 `already_signed`。

**合集（Q9）：** `subjectType=4` 时 `canSignToNode: false`，`signBlockers` 含 `collection_not_supported`（映射 reason `collection_exhibit_not_supported`）。

### 4.3 与 `sign --dry-run` 分工

| 命令 | 用途 | 节点 owner | 完整 checks |
|---|---|:---:|:---:|
| `market show` | L0 选品、资源+节点 blockers | 否 | 否 |
| `market show --node` | 是否已签约 | 否 | 部分 |
| `sign --dry-run` | L1 写前全量 preflight | **是** | **是** |

**Agent 不得** 仅用 `market show` 替代 `sign --dry-run`（见 [03 §6.2](./03-CLI命令与架构设计.md#62-节点主市场选品后挂展品j-06)）。

**`warnings`（不阻止默认 sign）：** `auth_exception` | `owner_frozen`

---

## 5. `node list`（NM-03）

```json
{
  "items": [
    {
      "nodeId": 1001,
      "nodeName": "myshop",
      "nodeTitle": "我的店铺",
      "nodeDomain": "myshop",
      "status": 1
    }
  ],
  "total": 3
}
```

Sign Drawer 等价：默认排除 `status === 4 || status === 5` 的节点（可选 `--include-suspended` 2.1）。

---

## 6. `node show`（NM-04）

```json
{
  "nodeId": 1001,
  "nodeName": "myshop",
  "nodeTitle": "我的店铺",
  "nodeDomain": "myshop",
  "ownerUserId": 42,
  "status": 1,
  "frozen": false,
  "deleted": false,
  "nodeThemeId": "theme-presentable-id-or-null",
  "visibility": "public"
}
```

**code 2：** 非 owner、冻结、已删除。

---

## 7. `node exhibit sign`（NM-08）

### 7.1 `--dry-run`

```json
{
  "dryRun": true,
  "nodeId": 1001,
  "resources": [
    { "resourceId": "abc123", "policyId": "p1" }
  ],
  "checks": {
    "nodeOwner": "pass",
    "resourceOnline": "pass",
    "notDuplicate": "pass",
    "authChain": "warn",
    "ownerFreeze": "pass",
    "paymentRequired": false
  },
  "warnings": ["auth_exception"]
}
```

`checks.*` 取值：`pass` | `warn` | `fail`。`--strict` 时 `warn` → 整体 code 4。

### 7.2 执行成功（单资源）

```json
{
  "nodeId": 1001,
  "resourceId": "abc123",
  "presentableId": "pres-xyz",
  "policyId": "p1",
  "resourceType": ["图片"]
}
```

**`presentableId` 来源：** [07-Q1](./07-开放问题与设计裁决.md) — `batchCreatePresentable` 成功后 **`presentableDetails({ resourceId, nodeId })` 反查**，不假设 batch 响应 `data` 字段语义。

### 7.3 批量 partial failure

```json
{
  "nodeId": 1001,
  "results": [
    {
      "resourceId": "r1",
      "status": "success",
      "presentableId": "p1"
    },
    {
      "resourceId": "r2",
      "status": "failed",
      "error": { "code": 4, "message": "Already signed", "reason": "duplicate" }
    }
  ]
}
```

整体 `ok`：全部成功为 true；部分失败为 false，code 4，但 `data.results` 仍返回明细。

### 7.4 Handoff（code 5）

```json
{
  "ok": false,
  "command": "node exhibit sign",
  "error": {
    "code": 5,
    "message": "Policy requires payment",
    "reason": "payment_required",
    "contractsUrl": "https://console.<env>/contracts/...",
    "nextCommand": "freelog-cli node exhibit sign --node 1001 --resource abc123 --policy p-paid --yes --env <env>"
  }
}
```

---

## 8. `node exhibit list`（NM-09）

```json
{
  "nodeId": 1001,
  "items": [
    {
      "presentableId": "pres-xyz",
      "resourceId": "abc123",
      "presentableTitle": "示例资源",
      "version": "1.0.0",
      "onlineStatus": 1,
      "isOnline": true,
      "hasPolicy": true,
      "subjectType": 1
    }
  ],
  "total": 15,
  "skip": 0,
  "limit": 100
}
```

---

## 9. `node exhibit online` / `offline`（NM-11 / NM-12）

**online 成功：**

```json
{
  "presentableId": "pres-xyz",
  "onlineStatus": 1
}
```

**online preflight 失败（无启用 policy）：**

```json
{
  "ok": false,
  "error": {
    "code": 4,
    "reason": "no_enabled_policy",
    "hint": "freelog-cli policy apply --session ... 或在 Console 启用策略后再执行 node exhibit online"
  }
}
```

**offline 成功：**

```json
{
  "presentableId": "pres-xyz",
  "onlineStatus": 0
}
```

---

## 12. error.reason 与 signBlockers 索引

> Agent / smoke 断言用。实现须与 [15 §3](./15-二期实现规格.md#3-preflight-检查表exhibit-sign) 一致。

### 12.1 `error.reason`（失败时）

| reason | 触发条件 | code | 典型 hint | 能力 | Console 等价 |
|---|---|:---:|---|---|---|
| `not_owner` | `Node.details.ownerUserId` ≠ 当前用户 | 2 | 换账号或 `node list` | NM-04 | pageEffects 403 |
| `node_frozen` | `status & 4` | 2 | Console 解冻节点 | NM-04 | nodeFreeze 页 |
| `node_deleted` | `status === -1` | 2 | 节点已删除 | NM-04 | nodeDeleted |
| `resource_not_online` | `batchInfo.status !== 1` | 4 | `online --yes` 或选市场资源 | NM-08 | badResources 未上架 |
| `resource_not_published` | status === 0 | 4 | 先 publish | NM-08 | 未发行 |
| `resource_frozen` | status === 2 | 4 | 资源已封禁 | NM-08 | 已封禁 |
| `duplicate` | presentable 已存在 | 4 | `exhibit list` | NM-08 | Drawer 重复 |
| `auth_exception` | `!batchAuth.isAuth` | 4（`--strict`）/ warn | 默认可继续 sign | NM-08 | 黄标 warning |
| `owner_frozen` | 作者 `batchUserList.status===1` | 4（strict）/ warn | 同上 | NM-08 | ownerFreeze 黄标 |
| `no_enabled_policy` | 展品无 status=1 policy | 4 | policy apply 或 Console | NM-11 | policy 弹窗 |
| `payment_required` | 付费 policy / 合约 | 5 | 打开 contractsUrl | NM-08 | 收银/合约 |
| `missing_yes` | 写命令无 `--yes` | 4 | 补 `--yes` | — | — |
| `missing_env` | 非 TTY 无 `--env` | 4 | 补 `--env` | — | — |
| `collection_exhibit_not_supported` | subjectType=4 sign | 4 | 3.0 / Console | NM-08 | Q9 OUT |

### 12.2 `signBlockers`（`market show`）

| blocker | 含义 | 对应 reason |
|---|---|---|
| `not_published` | status 0 | `resource_not_published` |
| `not_online` | status 4 | `resource_not_online` |
| `frozen` | status 2 | `resource_frozen` |
| `owner_frozen` | 作者冻结 | warn / strict |
| `already_signed` | 已有 presentable（需 `--node`） | `duplicate` |
| `collection_not_supported` | subjectType=4（Q9） | `collection_exhibit_not_supported` |

### 12.3 `checks.*`（`sign --dry-run`）

| 字段 | pass | warn | fail |
|---|---|---|---|
| `nodeOwner` | owner 匹配 | — | 非 owner / 冻结 |
| `resourceOnline` | status=1 | — | 其他 status |
| `notDuplicate` | 无 presentable | — | 已存在 |
| `authChain` | isAuth | !isAuth | strict 时 warn→fail |
| `ownerFreeze` | 作者未冻 | 作者冻结 | strict 时 warn→fail |
| `paymentRequired` | false | — | true → sign 时 code 5 |

---

## 13. Schema 文件清单

设计级路径：`docs/新方案/二期/schemas/`（实现 W5 复制至 `packages/cli/schemas/`）

| 文件 | 命令 / 场景 |
|---|---|
| `market-search-response.json` | `market search` |
| `market-show-response.json` | `market show`（含 node 字段） |
| `node-exhibit-sign-dry-run.json` | `sign --dry-run` |
| `node-exhibit-sign-response.json` | `sign` 成功 |
| `node-exhibit-online-response.json` | `online` 成功 |
| `node-exhibit-online-preflight-fail.json` | `online` code 4 |
| `handoff-code5.json` | code 5（sign / dep auth） |

---

## 14. 实现交付（规划）

| 产物 | 阶段 | 说明 |
|---|---|---|
| `schemas/`（设计级草案） | 设计 | 见 [§13](#13-schema-文件清单) |
| `packages/cli/schemas/market-*.json` | 实现 W5 | 随包发布 |
| `packages/cli/schemas/node-exhibit-*.json` | 实现 W5 | 随包发布 |
| `verify-json-envelope.mjs` 扩展 | 实现 W5 | NM 写命令 envelope |

---

## 15. 参考

- [03-CLI命令与架构设计](./03-CLI命令与架构设计.md) — 命令与 flag
- [07-开放问题与设计裁决](./07-开放问题与设计裁决.md) — presentableId、strict、handoff、Q7–Q10
- [13-术语与对象速查](./13-术语与对象速查.md) — signBlockers / 退出码
- [17-展品状态机与恢复模型](./17-展品状态机与恢复模型.md) — 重试与 reason 场景
- 一期 envelope：`packages/cli/scripts/verify-json-envelope.mjs`（形态参考）
