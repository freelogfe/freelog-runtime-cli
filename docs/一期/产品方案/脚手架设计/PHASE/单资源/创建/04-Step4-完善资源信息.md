# Step4 - 完善资源信息

对照业务：Console「完善资源详情」。封面 / 简介 / 标签**都可以空、都可以跳过**。  
平台那一步会 `update` 带 `status:1` 直接上架。CLI **拆开**：本文只写 listing；上架见 [管理/05](../管理/05-上下架.md)。禁止 `update --status`。

```
freelog-cli update
```

须已 `login`，已有 `resourceId`。本人、未冻结。标识只读，不在本命令改。  
跑完 `create-version` 也可以不跑本文，以后再 `update`。

| # | 功能 | 怎么进 | 写不写平台 |
|---|------|--------|------------|
| 1 | 打印当前 listing | 启动后先 `info` | 不写 |
| 2 | 改标题 | `--title` 或 TTY | 确认后 PUT |
| 3 | 改封面 | `--cover` 或 TTY | 先上传图，再 PUT |
| 4 | 改简介 | `--intro` 或 TTY | 确认后 PUT |
| 5 | 改标签 | `--tags` 或 TTY | 确认后 PUT |
| 6 | 写入 | 至少改了一项才 PUT | **不带 `status`** |

已传的 flag 不问。一个 flag 都没传且是 TTY：按 2–5 逐项问，每项都可以空着跳过。  
`--yes` 且什么 flag 都没有：失败，不要空 PUT。  
`--yes` 只改传入的字段。

---

## 0. 进入

`Resource.info`（`GET /v2/resources/{id}`）。非本人 / 冻结失败。

打印当前：标识（只读，`username/name`）、标题、是否已有封面、简介字数、标签列表。

帮助：

> 完善资源的相关信息，可以提升资源曝光度；您也可以稍后完善。

---

## 1. 标题

已传 `--title`：只校验，不问。未传且 TTY：问「标题」，默认值 = 线上当前标题。直接回车 = 不改。

| 输入 | 行为 |
|------|------|
| 回车且未传 --title | 本字段不进请求 |
| 空串且用户显式要清空 | 不让过：「请输入资源标题」（标题不能改成空） |
| 超过 100 | 「不超过100个字符」 |
| 1–100 | 请求带 `resourceTitle` |

帮助：标题直接影响搜索曝光，不超过 100 个字符。

本项无独立 API。

---

## 2. 封面

帮助：

> 封面  
> 图片是作品对外展示的窗口。只支持 JPG/PNG/GIF，GIF 不能动画，大小不超过 5M，建议宽高不小于 800px。

| 进入 | 行为 |
|------|------|
| `--cover <本地路径>` | 校验格式与大小后上传 |
| TTY 未传 | 问「封面图片路径（可空）」；空 = 不改线上封面 |
| 用户要去掉封面 | 本期不做「清空封面」（除非平台 `coverImages: []` 已证实可用；未证实就不要猜） |

本地文件：

| 检查 | 失败 |
|------|------|
| 不是 JPG/PNG/静态 GIF | 失败 |
| 动画 GIF | 失败 |
| > 5MB | 失败 |

通过后：`Storage.uploadImage`（`POST /v2/storages/files/uploadImage`）。用返回 URL。请求里 `coverImages: [url]`。空封面不传该字段。

---

## 3. 简介

问「简介」，可空。hint：最多 200 字。

| 输入 | 行为 |
|------|------|
| 回车 / 不传 --intro | 不改 |
| `--intro` 或问完有内容 | `trim` 后 ≤200 才带 `intro` |
| >200 | 「简介不超过 200 个字符」，TTY 重新问；`--yes` 失败 |

帮助：为作品添加明确实用的描述，方便其他用户找到。

本项无独立 API。

---

## 4. 标签

问「标签（逗号分隔，可空）」。

| 约束 | |
|------|--|
| 最多 20 个 | 超过失败 |
| 每个 ≤20 字 | 超过失败 |
| 单个空（`a,,b`） | 失败 |

TTY 未传 `--tags`：回车 = 不改。`--tags ""` 是否清空：只有用户显式传空列表时才 `tags: []`；回车不改。

可选：`Resource.availableTags`（`GET /v2/resources/tags/availableTags`，`resourceTypeCode`）打几条推荐，只作提示，不自动写入。失败则跳过推荐，不要挡主流程。

---

## 5. 确认并写入

TTY 摘要将要改的字段。什么都没改：打印「没有变更」退出，不 PUT。  
有变更：确认后 `Resource.update`（`PUT /v2/resources/{resourceId}`），**只带改了的字段**：`resourceTitle` / `intro` / `tags` / `coverImages`。

**不带 `status`。** 不要在这里上架。

失败：平台 `msg`。成功：再 `info` 打一行当前 listing。结束。提示上架用 `online`，且须已有版本和启用策略。

---

## tools-lib

| 何时 | 函数 | HTTP |
|------|------|------|
| 回拉 | `Resource.info` | `GET /v2/resources/{id}` |
| 封面 | `Storage.uploadImage` | `POST /v2/storages/files/uploadImage` |
| 写入 | `Resource.update` | `PUT /v2/resources/{resourceId}` |

---

## 禁止

`update --status`。把 Step2 属性塞进本请求。未改也空 PUT。封面传非图片。
