# P0-C0-Step3: 添加授权策略

与 [F0 Step3](../创建流程%20-%20发行单个资源/P0-F0-Step3-添加授权策略.md) **基本同构**：`fPolicyBuilder3` → `Resource.update addPolicies` → `info` 回拉。下一步不校验策略条数。

### 差异

| 项 | F0 | 合集 |
|----|----|------|
| model | `resourceCreatorPage` | `collectionCreatorPage` |
| 稍后 | `rqr_step3_btn_later` → 资源版本页 | `cqr_step3_btn_later` → 合集版本页 |
| 下一步 | `rqr_step3_btn_next` | `cqr_step3_btn_continue` |
| 区标题 | 都是 `authplanmgnt_title` | 同 |

### API

同 F0：`PUT /v2/resources/{id}`；`GET /v2/resources/{id}?isLoadPolicyInfo=1`。

### 源码

- `collectionCreator/Step3/index.tsx`
- `step3Effects.ts` L14–56

CLI：合集用 **`collection policy template apply`** / `collection policy apply`，不要用资源 `policy apply`。付费走 Console。

**源码对齐日期**: 2026-09-03
