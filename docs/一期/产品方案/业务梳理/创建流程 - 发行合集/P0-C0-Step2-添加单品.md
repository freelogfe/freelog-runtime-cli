# P0-C0-Step2: 添加单品

## 概述

主路径是**从「我的资源」勾选已上架普通资源**写入目录草稿，不是在本页上传文件。类型也可只开 RSS。按钮：`cqr_itemmgmt_btn_submit` → 「下一步」。

### 主流程 (ASCII)

```
看 fileCommitMode
  → 仅 collectionLibrary：资源库
  → 仅 podcastRss：RSS
  → 两者都有：先选方式
资源库：搜自己的 subjectType=1 资源（须 online、未在草稿）
  → 每批最多 100 → 授权组件 → POST drafts/items (isPublish=0)
RSS：验证码 + bindFeed
提交：PUT catalogue（merge 草稿）→ step=3
  （RSS 进行中 skipDraft）
```

---

## 一、资源库添加

### 操作流程

1. `fSelectResourcesAsCollectionItems` / `SelectResourceDrawer`。
2. `Resource.list`：`isSelf=1`，`subjectType=1`。
3. `Resource.batchAuth`；`resourceIsExistInItems_Draft` 排除已在草稿的。
4. 可选「创建新资源」新开 F0 入口，回来刷新——**不在合集页上传**。
5. 须 `status==='online'`。
6. `FAddResourcesHandleAuth` `isPublish=false` → `addResourceItems_Draft`：`addCollectionItems[{resourceId,itemTitle,authExcludedItems?}]`，`isPublish:0`。
7. 每批 `length>=100` 禁选；组件 `slice(0,100)`。合集总件数创建页无硬上限，只展示 `totalCount`。

### API

| 操作 | FServiceAPI | HTTP |
|------|-------------|------|
| 搜自己的资源 | `Resource.list` | `GET /v2/resources` |
| 批量授权态 | `Resource.batchAuth` | `GET /v2/auths/resources/batchAuth/results` |
| 是否已在草稿 | `Resource.resourceIsExistInItems_Draft` | `GET /v2/resources/catalogues/drafts/{id}/items/checkExists` |
| 写入草稿单品 | `Resource.addResourceItems_Draft` | `POST /v2/resources/catalogues/drafts/{id}/items` |
| 拉草稿列表 | `Resource.getCollectionItems_Draft` | `GET /v2/resources/catalogues/drafts/{id}/items` |
| 版本草稿 | `Resource.saveVersionsDraft` | `POST /v2/resources/{id}/versions/drafts`（RSS 进行中跳过） |
| 提交进 Step3 | `Resource.updateCollection` | `PUT /v2/resources/catalogue/{id}` `isMergeCatalogueDraft` |

---

## 二、RSS

| 操作 | FServiceAPI | HTTP |
|------|-------------|------|
| 发验证码 | `Rss.sendVerificationCode` | `POST /v2/rss/bindings/sendVerificationCode` |
| 绑定 | `Resource.bindRssFeed` | `POST /v2/resources/rss/{resourceId}/bindFeed`（feedUrl、verificationCode、可选日期） |
| 进度（Step≥3 横幅） | `Rss.getSyncProgress` | `GET /v2/rss/bindings/{resourceId}/progress` 立即一次 + 60s |

验证码 UI：CLI 不实现（取舍 P3）。

---

## Console 源码位置

- 从库勾选：`Step2/index.tsx` L152–166；提交按钮 L1199 `cqr_itemmgmt_btn_submit`
- 提交 merge：`step2Effects.ts` L419–497（`updateCollection` + `isMergeCatalogueDraft`）
- 加草稿：`FAddResourcesHandleAuth` L229–248
- 100 上限：`SelectResourceDrawer` L532
- RSS 横幅：`collectionCreator/index.tsx` L51–81

## CLI

资源库：`collection item add` / `item import-dir`。RSS：`collection rss send-code` + `bind <feedUrl> --code`（码从邮箱抄，TTY 不渲染验证码图）。

**源码对齐日期**: 2026-09-03
