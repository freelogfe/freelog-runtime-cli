# PHASE

| | 文档 | 主路径 |
|--|------|--------|
| 01 | [F0 单资源发行](./01-F0-单资源发行.md) | `create` → `publish` |
| 02 | [M0 发行新版本](./02-M0-发行新版本.md) | `publish --version` / `--reuse-version` |
| 03 | [C0 合集创建](./03-C0-合集创建.md) | `collection create` → `item add <id\|标识>` → `collection publish` |
| 04 | [单资源维护](./04-单资源维护.md) | 共用管理 + `version edit` / `dep` |
| 05 | [合集维护](./05-合集维护.md) | 共用管理 + `item *` + 属性/依赖 |
| 06 | [属性配置与依赖](./06-属性配置与依赖.md) | `publish` 上传后保持会话，提交才发行 |

listing / 策略 / 上下架：[ARCHITECTURE/05-共用管理](../ARCHITECTURE/05-共用管理.md)。  
属性 / 可选配置 / 依赖：本文 06（不要写进 listing）。  
接续：[ARCHITECTURE/02-本地状态](../ARCHITECTURE/02-本地状态.md)。
