# verify:exhibit-smoke 设计（二期）

> 文档角色：`pnpm verify:exhibit-smoke` **设计规格**（脚本未实现）。人工报告 [10-L4验收模板](./10-L4验收模板.md)；能力链 [04 §9](./04-能力矩阵与验收.md)；harness 对标 [verify-session-smoke.mjs](../../packages/cli/scripts/verify-session-smoke.mjs)。

最后更新：2026-08-20

---

## 1. 目标

| 层 | 本脚本 | 说明 |
|:---:|---|---|
| **B** | ✅ 默认 | dev 环境 CLI 命令跑通 S1–S8 |
| **C** | 人工 + [10](./10-L4验收模板.md) | Console 并排不在脚本内自动断言 |

---

## 2. 环境与前置

| 变量 / 文件 | 必填 | 说明 |
|---|---|:---:|---|
| `--env dev`（或参数） | ✅ | 非 production |
| `FREELOG_NODE_ID` | ✅ | Console 预先创建的节点 |
| `FREELOG_TEST_RESOURCE_ID` | ✅ | 已上架、可签约的资源 |
| `.freelog-auth` 或 CI secret | ✅ | 主测账号（节点 owner） |
| `pnpm build` | ✅ | CLI 已构建 |

**Console commit 记录：** `d74121e647f0223203f1f0bb317354b4191266f1`（见 [05 B.8](./05-Console源码证据与调用链.md#b8-参考-commit)）

---

## 3. Harness 结构（规划）

```javascript
// packages/cli/scripts/verify-exhibit-smoke.mjs（规划）
import { createHarness } from './lib/verify-harness.mjs';

const h = createHarness(env);
const { pass, fail, runCli, runCliExpectFail, parseJson, expectEnvelope, expectFailCode, loginPrimary } = h;

// T-NM-S1 … T-NM-S8
// T-NM-N4 optional block
```

复用 `verify-harness.mjs`：`runCli`、`expectFailCode`、`expectEnvelope`（schemaVersion=1）。

---

## 4. 步骤映射

| 步骤 ID | 04 | 命令 | 断言 |
|---|---|---|---|
| T-NM-S1 | S1 | `market search --limit 5 --json` | `ok`; `data.items[].resourceId` |
| T-NM-S2 | S2 | `market show $RESOURCE_ID --json` | `status===1` |
| T-NM-S3 | S3 | `node show $NODE_ID --json` | `frozen===false`; owner |
| T-NM-S4 | S4 | `node exhibit sign --dry-run --node ... --resource ... --json` | checks pass 或 warn |
| T-NM-S5 | S5 | `node exhibit sign --yes ... --json` | `presentableId` 保存 → `PID` |
| T-NM-S6 | S6 | `node exhibit online $PID --yes --json` | `onlineStatus===1` |
| T-NM-S7 | S7 | `node exhibit list --node $NODE_ID --json` | 含 `PID` 且在线 |
| T-NM-S8 | S8 | `node exhibit offline $PID --yes --json` | `onlineStatus===0` |

**负向（首版建议）：**

| ID | 纳入 smoke | 说明 |
|---|---|---|
| T-NM-N4 | ✅ 建议 | 单独 sign 后不 online，对无 policy 的 presentable 跑 online → code 4 |
| T-NM-N1 | optional | 需第二账号 |
| T-NM-N2 | optional | 需冻结节点 fixture |
| T-NM-N3 | optional | 重复 sign S5 后再 sign |
| T-H5 | 人工 | 见 [10 Handoff](./10-L4验收模板.md#handoffcode-5--t-h5) |

---

## 5. 脚本骨架（伪代码）

```javascript
assertCliBuilt();
await loginPrimary();

let pid;
pass('EXH-00 login');

// S1–S3 只读
const search = parseJson(runCli('market search --limit 5 --json'));
if (!search.ok) fail('T-NM-S1', search);
else pass('T-NM-S1');

// … S2, S3 …

const dry = parseJson(runCli(`node exhibit sign --node ${NODE_ID} --resource ${RID} --dry-run --json`));
if (!dry.ok && dry.error?.code !== 0) fail('T-NM-S4', dry);
else pass('T-NM-S4');

const sign = parseJson(runCli(`node exhibit sign --node ${NODE_ID} --resource ${RID} --yes --json`));
pid = sign.data?.presentableId;
if (!pid) fail('T-NM-S5', sign);
else pass('T-NM-S5', pid);

// S6–S8 …

// N4: 若单独 fixture presentable 无 policy
// const bad = runCliExpectFail(`node exhibit online ${PID_NO_POLICY} --yes --json`);
// expectFailCode(bad, 4);

summarize();
```

---

## 6. Fixture 准备手册（附录）

### 6.1 基础 fixture（S1–S8）

1. Console 创建节点 → 写入 `FREELOG_NODE_ID`
2. 主测账号 publish + online 测试资源，或选市场第三方已上架资源 → `FREELOG_TEST_RESOURCE_ID`
3. sign 前确保资源 `status=1`（`market show`）

### 6.2 负向 fixture

| fixture | 准备 | 用途 |
|---|---|---|
| 账号 B | 第二 dev 账号 | T-NM-N1 |
| 冻结节点 | Console Setting 冻结 | T-NM-N2 |
| 无 policy presentable | sign 后 **不** online；presentable 上禁用全部 policy | T-NM-N4 |
| 付费 policy 资源 | 选含 TransactionEvent 的策略 | T-H5 人工 |

### 6.3 清理

- smoke 结束可 `exhibit offline` + 保留 presentable（重复 sign 测 N3 时需新 resourceId）
- 勿在 dev 删节点壳（Console 操作）

---

## 7. package.json（规划）

```json
"verify:exhibit-smoke": "node scripts/verify-exhibit-smoke.mjs --env dev"
```

**不**默认并入 `pnpm verify`（[04 §10](./04-能力矩阵与验收.md#10-验证脚本关系)）。

---

## 8. 相关文档

- [05 §C.1](./05-Console源码证据与调用链.md#c1-core-追溯矩阵) — Console 并排  
- [15 §7](./15-二期实现规格.md#7-实现里程碑--本文) — W5 交付  
- [06 §12](./06-JSON协议与Schema草案.md#12-errorreason-与-signblockers-索引) — reason 断言
