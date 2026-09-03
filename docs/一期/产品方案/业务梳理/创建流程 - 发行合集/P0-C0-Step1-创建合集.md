# P0-C0-Step1: 创建合集

## 概述

与 [F0 Step1](../创建流程%20-%20发行单个资源/P0-F0-Step1-创建授权条目.md) 同构：类型、标题、授权标识、查重、创建壳。差异见下。

步骤：`cqr_step1` → 「创建合集」。按钮：`cqr_step1_btn_createnow` → 「立即创建」。

### 主流程 (ASCII)

```
选合集类型（subjectType=collection，禁止添加新类型）
  → 标题≤100；未分叉时前 60 字同步标识
  → 标识≤60，规范化，300ms Resource.info 查重
  → POST create(subjectType=4)
  → getResourceTypeInfoByCode（含 collectionLibrary / podcastRss）
  → 空 sha1 拉属性模板 → step=2
```

---

## 与 F0 Step1 的差异

| 项 | F0 | 合集 |
|----|----|------|
| create `subjectType` | 不传（默认 1） | **4** |
| 类型选择器 | `subjectType=resource`，`showAddNewType=true` | `collection`，**false** |
| 拉树 / 最近建议 | subjectType=1 | **4** |
| 文案 | `rqr_*` | `cqr_input_type` / `cqr_input_title` / `cqr_input_authid` |
| 类型配置额外位 | 上传/存储/MD/漫画 | 另有 `2^4=collectionLibrary`、`2^5=podcastRss` |
| 创建后 | 只进 Step2 | 再用空 sha1 初始化属性 |

标题空错误在合集页面为硬编码「请输入标题」（F0 用 i18n）。查重、规范化、`POST /v2/resources` 字段 `name/resourceTitle/resourceTypeCode` 同 F0。

| 文案 | i18n key (zh_CN) |
|------|------------------|
| 步骤 | `cqr_step1`: 「创建合集」 |
| 类型 | `cqr_input_type`: 「合集类型」 |
| 标题 | `cqr_input_title`: 「合集标题」 |
| 标识 | `cqr_input_authid`: 「合集授权标识」 |
| 按钮 | `cqr_step1_btn_createnow`: 「立即创建」 |

---

## API

| 操作 | FServiceAPI | HTTP |
|------|-------------|------|
| 查重 | `Resource.info` | `GET /v2/resources/{userName/optimized}` |
| 创建 | `Resource.create` | `POST /v2/resources` 带 `subjectType: 4` |
| 类型配置 | `Resource.getResourceTypeInfoByCode` | `GET /v2/resources/types/getInfoByCode` |

---

## Console 源码位置

- `collectionCreator/Step1/index.tsx`：类型 L84–96；标题 L123–156；标识 L194–207；按钮 L284–301
- `collectionCreatorPage/step1Effects.ts` L82–114 查重；L116–149 创建（`subjectType: 4`）

## CLI

`collection create --type --title --name [--type-name]`。合集一般不传自定义类型名（Console 禁新建）。

**源码对齐日期**: 2026-09-03
