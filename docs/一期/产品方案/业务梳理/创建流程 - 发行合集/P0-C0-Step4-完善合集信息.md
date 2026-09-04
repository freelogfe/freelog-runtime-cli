# P0-C0-Step4: 完善合集信息

## 概述

封面、简介、标签、更新/收录规则，然后两次 `update` 夹一次 `setCollectRules`，最后 `status:1`。RSS 合集封面/简介/规则只读。按钮：`cqr_step4_btn_release` → 「现在上架」。

### 主流程 (ASCII)

```
可选封面 / 简介≤200 / 标签
  → 更新完毕|持续更新 + 自动收录条件
  → 有策略则闪 500ms 进度
  → PUT update(tags, coverImages, intro)
  → POST collectRules
  → PUT update(status:1)
  → collectionCreateSuccess
```

---

## 字段

| 字段 | i18n | 约束 |
|------|------|------|
| 封面 | `cqr_listing_image`；帮助复用 `rqr_input_resouce_image_help` | 可选；RSS 禁用 |
| 简介 | `resource_short_description` | ≤200；超长禁提交；RSS 禁用 |
| 标签 | `cqr_listing_tags` | 可选 |
| 更新状态 | `UpdateStatesSettingBlock` | `isFinish`、`automatic`、`conditionType`、`conditions[]`；RSS 禁用 |

---

## API（三连）

| 序 | FServiceAPI | HTTP | 体 |
|----|-------------|------|-----|
| 1 | `Resource.update` | `PUT /v2/resources/{id}` | tags、coverImages、intro |
| 2 | `Resource.setCollectRules` | `POST /v2/resources/catalogue/{id}/items/collectRules` | serializeStatus 完结1/0；status 自动收录1/0；conditionType every=1 否则 2；filterConditions |
| 3 | `Resource.update` | `PUT /v2/resources/{id}` | **status:1** |

### 源码

- `Step4/index.tsx`；`step4Effects.ts` L84–189

## CLI

```text
freelog-cli collection update --cover <img> --intro "..." --tags a,b --env <env>
freelog-cli collection collect-rules set --env <env>
freelog-cli online --yes --env <env>
```

上架走 `online`，不要学 Step4 的 `status:1`。

**源码对齐日期**: 2026-09-03
