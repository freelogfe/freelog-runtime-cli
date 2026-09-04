# 脚手架设计 · 合集备份（本期不实现）

> 从 `产品方案/脚手架设计/PHASE` 挪出。只作追溯，**不是**本期真源。

**本期不实现合集。** 先把单资源创建和管理做完。

下面这些先不要做、不要在单资源文档里展开：

- `collection create` / `init --scaffold collection`
- `collection item *`、`collection publish`、`collection properties sync`
- `collection update` / `collection policy *` / `collect-rules`
- 合集工作稿、合集会话、目录草稿

| 旧稿 | |
|------|--|
| [03-C0 合集创建](./03-C0-合集创建.md) | 建壳、`item add`、`collection publish` |
| [05 合集维护](./05-合集维护.md) | 改目录、合集属性/依赖、收录规则 |

单资源上架仍用顶层 `online`，不要为此去写 `collection policy`。  
恢复合集时另开讨论，再对单资源已定的 `N.version.json` 是否复用。

现行入口：[产品方案/脚手架设计](../../产品方案/脚手架设计/README.md) · [单资源](../../产品方案/脚手架设计/PHASE/单资源/README.md)
