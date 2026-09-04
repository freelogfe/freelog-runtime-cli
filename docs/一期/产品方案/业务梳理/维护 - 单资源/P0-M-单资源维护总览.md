# P0-M: 单资源维护

## 概述

已有普通资源的侧栏编辑。路由前缀 `/resource/sidebar/{page}/:id`。各页先 `resourceSider/onMount_Page`。

门禁（`resourceSider.ts` `fetchInfo`）：非本人 → 403；`status===2` → 冻结页；`subjectType===4` → 把 URL 换成 `/collectionSidebar/`。

### 主流程 (ASCII)

```
列表「编辑」/ 创建「稍后处理」
  → /resource/sidebar/.../:id
  → GET info（门禁）+ lookDraft
  → 左栏：上架开关 + 五个 Tab
  → 右栏对应页（M1–M5）
```

### 分册

| 编号 | Tab i18n | 文案 | 文档 |
|------|----------|------|------|
| M1 | `edit_resource_tab_versions` | 资源及其属性 | [P0-M1-版本信息.md](./P0-M1-版本信息.md) |
| M2 | `edit_resource_tab_articleinfo` | 资源信息 | [P0-M2-资源信息.md](./P0-M2-资源信息.md) |
| M3 | `edit_resource_tab_authplans` | 授权策略 | [P0-M3-授权策略.md](./P0-M3-授权策略.md) |
| M4 | `edit_resource_tab_relynauth` | 依赖及其授权 | [P0-M4-依赖及其授权.md](./P0-M4-依赖及其授权.md)；全量见 [P0-D](../依赖与签约/P0-D-依赖管理与签约.md) |
| M5 | `edit_resource_tab_licenceecontracts` | 授权合约 | [P0-M5-授权合约.md](./P0-M5-授权合约.md) |
| M6 | `switch_set_resource_avaliable` | 上架 | [P0-M6-上下架.md](./P0-M6-上下架.md) |

---

## Console 源码位置

- 壳：`pages/resource/sidebar/index.tsx`
- 左栏：`pages/resource/sidebar/Sider/index.tsx` L277–348 Tab
- 门禁：`models/resourceSider.ts` L150–243

**源码对齐日期**: 2026-09-03
