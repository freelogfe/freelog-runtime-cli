# Console 与 CLI 对齐入口

> 文档角色：当前 Console 业务事实与 CLI 对照证据；产品范围由仓库根目录 [DESIGN.md](../../../DESIGN.md) 决定。

Console 对齐不是复制页面，而是核对页面背后的业务语义、字段限制、提示、状态门禁和平台写入结果。

| 问题 | 文档 |
|---|---|
| Console 完整流程、页面和 API 是什么？ | [Console完整业务梳理](./Console完整业务梳理.md) |
| 每个表单字段有什么必填、长度、格式、提示和禁用条件？ | [Console表单字段与交互规则](./Console表单字段与交互规则.md) |
| 每项 Console 能力在 CLI 中如何实现、是否有证据？ | [CLI数据操作与Console对照](./CLI数据操作与Console对照.md) |
| 页面 → Effect → API → CLI → 测试如何追踪？ | [CLI拓扑与Console对照](./CLI拓扑与Console对照.md) |
| **Console 源码路径（resource 域）** | [Console源码证据索引](./Console源码证据索引.md) |
| 双模式 CLI（会话 vs 工程 Store）？ | [CLI双模式设计](../开发/CLI双模式设计.md) · [实现设计 §24 代码对齐](../开发/CLI双模式实现设计.md#24-console-代码对齐状态编码真源) |
| 会话命令对应 Console 哪条路径？ | 索引 §10 · §13 结果页 · `verify:session-smoke` |
| Console 业务细节真源（持续更新）？ | 本文目录下四份对照文档；**发现 Console 新细节即补入** |

源码漂移检查：

```bash
pnpm --filter @freelog-cli/cli verify:console-forms
pnpm --filter @freelog-cli/cli verify:session-smoke   # 会话 MVP（§17 会话 Y 行）
```

运行结果写入日期化验证报告，不在本目录保存历史核对快照。
