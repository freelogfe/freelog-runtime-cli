# S09 · RSS 合集维护

> **文档角色：** RSS / feed 与合集绑定、同步、锁定字段的体验设计。总规则见 [../02-CLI体验拓扑设计.md](../02-CLI体验拓扑设计.md)。

最后更新：2026-08-28

---

## 1. 用户目标

用户已有或准备创建一个合集，希望通过 RSS/feed 自动维护目录内容。CLI 要能发起 inspect、验证码、绑定、状态查询和同步，但不能伪造邮箱/验证码/第三方 feed 的外部动作。

---

## 2. 产品范围

RSS / collect-rules 不属于本地文件首发核心链路，但既然 CLI 支持，就必须对齐 Console sidebar 的业务约束。

| 能力 | CLI 处理 |
|---|---|
| RSS inspect | 只读检查 feed 信息、是否可绑定 |
| send-code | 触发验证码；用户去邮箱/Console 完成输入 |
| bind | 绑定 feed 到合集 |
| status | 查询同步状态、错误项、锁定原因 |
| sync | 触发或查询同步 |
| locked fields | 绑定后拒绝手改 Console 锁定字段 |
| collect-rules | 维护平台自动收录规则 |

---

## 3. Console 对齐点

| Console 行为 | CLI 必须对齐 |
|---|---|
| RSS 地址预检 | CLI inspect 失败时给具体原因 |
| 验证码 | CLI 不假装自动完成；只做触发和状态提示 |
| 已绑定 feed | 重复绑定要区分“本地滞后可恢复”和“真实重复占用” |
| 换源风险 | 需要 `--force --yes` 并展示 GUID/历史内容风险 |
| 字段锁定 | title/cover/intro/tags/display/items/status/version 草稿等锁定项必须拒绝 |
| collect-rules | STARTS_WITH 等规则按 Console 存取格式映射 |

---

## 4. TTY 连续向导

| checkpoint | 用户看到 | 输入 | 副作用 | 失败处理 |
|---|---|---|---|---|
| R1 选择 RSS | “维护 RSS 合集” | 已有合集或新建合集 | 无 | 无合集则跳 S08 |
| R2 inspect | feed URL、标题、条目数、风险 | URL | 只读平台/feed | feed 不可达给原因 |
| R3 验证码 | 需要邮箱/外部确认 | send-code/输入 code | 触发平台验证码 | code 5 或继续等待 |
| R4 bind | 将绑定 feed 到合集 | confirm | 写平台/state | 已绑定则区分恢复/冲突 |
| R5 status/sync | 同步状态、失败项、锁字段 | sync/退出 | 可能写平台 | 远端错误显示 item |
| R6 锁字段提示 | 哪些字段不能手改 | 查看 | 无 | 给允许动作 |

---

## 5. AI/CI 等价命令

```bash
freelog-cli collection rss inspect --url <feed-url> --env <env> --json
freelog-cli collection rss send-code --url <feed-url> --env <env>
freelog-cli collection rss bind --url <feed-url> --code <code> --yes --env <env>
freelog-cli collection rss status --env <env> --json
freelog-cli collection rss sync --yes --env <env> --json
freelog-cli collection collect-rules get --env <env> --json
freelog-cli collection collect-rules set --from-file ./rules.json --yes --env <env>
```

---

## 6. 常见情况处理

| 情况 | 处理 |
|---|---|
| 没有合集 | 引导创建合集，不把 RSS 做成普通资源 |
| feed 已被其它合集占用 | 停止并展示 owner/占用原因 |
| 本地 state 丢失但平台已绑定目标 feed | 修复本地 state |
| 用户想改 tags/display/items | code 4，说明 RSS 锁定并给 status/sync |
| 受控邮箱不可用 | 验证报告标 ENV 缺口，不降低设计要求 |

---

## 7. 回归到总设计

RSS 场景要求：

- RSS 必须在 collection 域；
- 锁定字段是硬门禁，不是 UI 提示；
- code 5 handoff 与 nextCommand 要稳定；
- ENV 证据缺口只能进验证报告。

