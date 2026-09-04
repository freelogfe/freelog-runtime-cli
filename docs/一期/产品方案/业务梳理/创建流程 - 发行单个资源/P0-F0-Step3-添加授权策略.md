# P0-F0-Step3: 添加授权策略

## 概述

单资源向导第 3 步：给已有资源壳加策略。本步**可跳过**，下一步按钮始终可点。策略通过 `Resource.update` 的 `addPolicies` 追加，再 `info` 回拉列表。

步骤标题：`rqr_step3` → 「添加授权策略」。侧栏：`rqr_authplan_info` → 「添加并启用授权策略之后，资源才能上架。授权策略也可以稍后在资源编辑模块添加。」

### 主流程 (ASCII)

```
进入 Step3
  → 空列表：说明 +「添加授权策略」 / 点模板
  → fPolicyBuilder3 编辑标题与策略文本
  → PUT update addPolicies（policyText 先 encodeURIComponent）
  → GET info(isLoadPolicyInfo=1, isTranslate=1) 刷新列表
  →「下一步」→ step=4，并预拉 coverImages[0] 给 Step4
  或「稍后处理」→ 版本信息页 version=1.0.0
```

---

## 一、列表与模板

### 操作流程

1. 标题 `authplanmgnt_title`。已有策略时右上角硬编码「添加策略」再开 builder。
2. 空列表：`versionreleased_desc`（JSX）+ `authplanmgnt_list_empty_btn`「添加授权策略」。
3. 有策略：`FPolicyList`，`activeBtnShow=false`（本步不在列表里开关上下线）。
4. 模板区：`PolicyTemplates` 按 `resourceTypeCode` 推荐；点模板把 `defaultValue` 带进 builder。

### API 调用

模板组件内部拉模板（不在 step3Effects）。本步写策略见下一节。

| 文案 | i18n key (zh_CN) |
|------|------------------|
| 区标题 | `authplanmgnt_title`: 「授权策略」 |
| 空按钮 | `authplanmgnt_list_empty_btn`: 「添加授权策略」 |
| 模板标题 | `authplanmgnt_title_templates`: 「授权策略模板」 |
| 模板帮助 | `authplanmgnt_title_templates_help`: 「点击下方推荐的策略模板，可以快速添加策略」 |

### Console 源码位置

- `creator/Step3/index.tsx` L45–171
- `creator/index.tsx` L124：侧栏 `rqr_authplan_info`

---

## 二、添加策略

### 操作流程

1. `fPolicyBuilder3`：已用 `policyText` / `policyName` 去重，可带模板 `defaultValue`，`resourceTypeCode` 数组。
2. 用户取消返回 null。
3. `Resource.update`：`addPolicies: [{ policyName: title, policyText: encodeURIComponent(text) }]`。
4. 失败 toast 平台 `msg`。
5. 成功 `Resource.info` 带 `isLoadPolicyInfo=1`、`isTranslate=1`；`policies` 反转后再把 `status===1` 排到前面。

### API 调用

| 操作 | FServiceAPI | HTTP |
|------|-------------|------|
| 追加策略 | `Resource.update` | `PUT /v2/resources/{resourceId}` |
| 回拉策略 | `Resource.info` | `GET /v2/resources/{resourceIdOrName}` |

### 字段约束

策略名 / 文本长度由 `fPolicyBuilder3` 内部约束（本 effects 不写 maxLength）。CLI 字段账本：策略名 2–20。以 builder / CLI 账本为准，本步不另猜。

### Console 源码位置

- `step3Effects.ts` L14–102

---

## 三、下一步 / 稍后

### 操作流程

1. 「下一步」从不禁用。只切 `step=4`，再 `info` 把 `coverImages[0]` 写入 `step4_resourceCover`。
2. 「稍后处理」去 `resourceVersionInfo({ resourceID, version: '1.0.0' })`。

| 按钮 | i18n key (zh_CN) |
|------|------------------|
| 稍后 | `rqr_step3_btn_later`: 「稍后处理」 |
| 下一步 | `rqr_step3_btn_next`: 「下一步」 |

### Console 源码位置

- `Step3/index.tsx` L175–203
- `step3Effects.ts` L103–149

---

## 四、CLI 对照

| Console | CLI | 决策 |
|---------|-----|------|
| 免费/商业/自定义模板 + builder | `policy template apply`；高级 `policy apply --from-file`；脚手架 `policy init` | ⚠️ 无付费、无执行预览 |
| 付费 / 支付 | Console | ❌ |
| 本步可跳过 | 不上架可不 apply | ✅ 与 `rqr_authplan_info` 一致 |

```text
freelog-cli policy template list --env <env>
freelog-cli policy template apply <templateId> --yes --env <env>
```

硬编码：「添加策略」（有列表时的入口）。

**源码对齐日期**: 2026-09-03
