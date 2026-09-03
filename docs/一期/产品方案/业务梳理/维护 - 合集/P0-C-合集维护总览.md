# P0-C: 合集维护

## 概述

已有合集的侧栏。路由 `/resource/collectionSidebar/{page}/:id`。门禁与单资源对称：非本人 403；冻结；`subjectType===1` 把 URL 换成 `/sidebar/`。

壳上 60s 轮询 `Rss.getSyncProgress`（`GET /v2/rss/bindings/{id}/progress`），导入中/失败出横幅。

### 主流程 (ASCII)

```
列表「编辑」
  → collectionSidebar
  → GET info 门禁
  → 左栏：上架开关 + 五个 Tab（文案是合集 key）
  → C1 单品 / C2 listing+收录规则 / C3 同构 M3–M6
```

### 分册

| 编号 | Tab i18n | 文案 | 文档 |
|------|----------|------|------|
| C1 | `edit_collection_tab_itemmgnt` | 单品管理 | [P0-C1-单品管理.md](./P0-C1-单品管理.md) |
| C2 | `edit_collection_tab_info` | 合集信息 | [P0-C2-合集信息.md](./P0-C2-合集信息.md) |
| C3 | `edit_collection_tab_authplan` / `contracts` / `upstreamauthmgnt` + 开关 | 策略 / 合约 / 依赖 / 上下架 | [P0-C3-策略依赖签约上下架.md](./P0-C3-策略依赖签约上下架.md) |

---

## 与单资源侧栏

同构处交叉引用 [P0-M-单资源维护总览.md](../维护%20-%20单资源/P0-M-单资源维护总览.md)。合集**没有**「新建版本」入口（版本写死在合集生命周期里，维护页发的是目录 merge，不是 `createVersion`）。

### Console 源码位置

- 壳 + RSS 横幅：`collectionSidebar/index.tsx` L27–35、L66–125（`RSS_SYNC_POLL_MS = 60s`）
- 左栏 Tab：`collectionSidebar/Sider/index.tsx` L200–262
- 门禁：`collectionManager/siderEffects.ts` L74–175

**源码对齐日期**: 2026-09-03
