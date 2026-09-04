# P0-F0-Step4: 完善资源详情

## 概述

单资源向导第 4 步：封面、简介、标签，然后 `Resource.update` 带 `status: 1`（上架）并跳创建成功页。封面/标签/简介均可空；简介超过 200 字禁用上架按钮。

步骤标题：`rqr_step4` → 「完善资源详情」。侧栏：`rqr_listing_info` → 「完善资源的相关信息，可以提升资源曝光度；您也可以稍后在资源编辑模块完善它们。」

进入本步时 Step3 已用 `coverImages[0]` 预填封面（若有）。

### 主流程 (ASCII)

```
进入 Step4
  → 可选上传/替换封面
  → 可选简介（≤200）
  → 可选标签（抽屉编辑）
  →「现在上架」：若已有策略先闪 500ms 进度框
  → PUT update(tags, coverImages?, status=1, intro)
  → 成功页 resourceCreateSuccess
  或「稍后处理」→ 版本信息 1.0.0
  或「上一步」→ step=3
```

---

## 一、封面

### 操作流程

1. `FUploadCover`。空态：云图标 + `upload_image`「上传图片」。已有：200px 预览，悬停 `btn_edit_cover`「编辑封面」。
2. 成功 → `onChange_step4_resourceCover`（+dirty）。失败 toast 组件 `err`。
3. 帮助文案给出格式与大小（JPG/PNG/GIF，GIF 不能动画，≤5M，建议 ≥800px）。

### 字段约束

| 字段 | 必填 | 约束来源 |
|------|------|----------|
| `step4_resourceCover` | 否 | 默认 `''`；提交时空则不传 `coverImages` |
| 格式 / 大小 | — | `rqr_input_resouce_image_help` + `FUploadCover` |

| 文案 | i18n key (zh_CN) |
|------|------------------|
| 标签 | `rqr_input_resouce_image`: 「封面」 |
| 帮助 | `rqr_input_resouce_image_help`: 「图片是作品对外展示的窗口…只支持JPG/PNG/GIF，GIF文件不能动画化，大小不超过5M，建议宽高不小于800px。」 |
| 空按钮 | `upload_image`: 「上传图片」 |
| 已有 | `btn_edit_cover`: 「编辑封面」 |

### Console 源码位置

- `Step4/index.tsx` L38–84
- `step4Effects.ts` L15–31

---

## 二、简介

### 操作流程

`FInput.FMultiLine`，`lengthLimit=200`。直接 `change` 写 `step4_resourceIntroduction`（**不**增加 dirty count）。

| 字段 | maxLength | 必填 | i18n |
|------|-----------|------|------|
| `step4_resourceIntroduction` | 200 | 否 | `resource_short_description`: 「简介」 |

按钮禁用条件：`introduction.length > 200`。

### Console 源码位置

- `Step4/index.tsx` L88–107、L248–249

---

## 三、标签

### 操作流程

1. 空：说明 +「添加标签」打开 `fEditLabelsDrawer`（可带 `resourceTypeCode` 推推荐标签）。
2. 已有：`ResourceLabelsCard` 再开同一抽屉。
3. 取消返回 null。确认 → `onChange_step4_resourceLabels`（+dirty）。
4. 页内旧版 `FResourceLabelEditor` 已注释，不生效。

| 文案 | i18n key (zh_CN) |
|------|------------------|
| 标签 | `rqr_input_resouce_tag`: 「资源标签」 |
| 空说明 | `rqr_input_resouce_tag_empty_msg` |
| 空按钮 | `rqr_input_resouce_tag_empty_btn` |

条数上限以标签抽屉 / CLI `tagsMaxCount=20`、`tagMaxLength=20` 为准（本 effects 不写死）。

### Console 源码位置

- `Step4/index.tsx` L112–203
- `step4Effects.ts` L33–48

---

## 四、上架提交

### 操作流程

1. 「现在上架」：若 `step3_policies.length > 0`，先开 `FInProcessModal` 睡 500ms，再 dispatch 提交。
2. `Resource.update`：`tags`，`intro`，`status: 1`，封面非空才传 `coverImages: [url]`。
3. 失败 toast `msg`。成功清 Step4 dirty，100ms 后跳 `resourceCreateSuccess({ resourceID })`。
4. 「稍后处理」仍去版本信息 `1.0.0`（按钮复用 `rqr_step3_btn_later`）。
5. 「上一步」只 `step=3`。

注意：Console 用 `status: 1` 当上架。CLI 规范禁止用 update 的 status 当上架，应走独立 `online`。

### API

| 操作 | FServiceAPI | HTTP |
|------|-------------|------|
| 写 listing + 上架 | `Resource.update` | `PUT /v2/resources/{resourceId}` |

| 按钮 | i18n key (zh_CN) |
|------|------------------|
| 稍后 | `rqr_step3_btn_later`: 「稍后处理」 |
| 上一步 | `rqr_step4_btn_back`: 「上一步」 |
| 上架 | `rqr_step4_btn_release`: 「现在上架」 |
| 热点 | `hotpots_rqr_info_done`: 「完善资源详情后，点击将资源上架至资源市场」 |

### Console 源码位置

- `Step4/index.tsx` L207–264
- `step4Effects.ts` L50–105
- `creator/index.tsx` L153：侧栏 `rqr_listing_info`

---

## 五、CLI 对照

| Console | CLI | 决策 |
|---------|-----|------|
| 封面 | `update --cover` | ✅ 本地 JPG/PNG/静态 GIF ≤5MB |
| 简介 | `update --intro` | ✅ ≤200 |
| 标签 | `update --tags` | ✅ ≤20 个、单标签 ≤20 |
| `update status:1` 上架 | `online` | ✅ CLI 不走 status=1 |
| 无策略仍点上架 | Console 会发 `status:1` | CLI `online` 预检：须 latestVersion + 启用策略 |

```text
freelog-cli update --cover <img> --intro "..." --tags "a,b" --yes --env <env>
freelog-cli validate --for online --env <env>
freelog-cli online --yes --env <env>
```

**源码对齐日期**: 2026-09-03
