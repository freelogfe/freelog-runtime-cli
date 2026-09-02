# S10 · AI / CI 代用户执行

> **文档角色：** AI Agent、脚本和 CI 环境执行 CLI 的历史场景材料。当前主线方案见 [../产品方案/README.md](../产品方案/README.md)；交互拓扑补充见 [../02-CLI体验拓扑设计.md](../02-CLI体验拓扑设计.md)。

最后更新：2026-08-28

---

## 1. 用户目标

用户希望把本地资源管理交给 AI 或 CI：自动 validate、dry-run、publish、online，并能根据结构化输出判断下一步。

---

## 2. 产品原则

AI/CI 不是 TTY 向导的降级版，而是同一业务规则的机器表面：

| 原则 | 设计 |
|---|---|
| 不交互 | 非 TTY 不 prompt、不等待输入 |
| 显式环境 | 写操作必须显式 `--env` 或项目配置 |
| 显式确认 | 写操作必须 `--yes` |
| 稳定输出 | `--json` stdout 只有 envelope；长任务用 NDJSON |
| 可恢复 | 重复执行要么幂等恢复，要么明确冲突 |
| 可接力 | code 5 输出 URL 与 nextCommand |

AI/CI 默认不使用 `freelog-cli session` / `studio` 这种人类交互壳；它要靠工程模式、显式参数、JSON、NDJSON 和 report 串联上下文。需要临时操作已有资源时，可以使用单命令 `--session`，但不能设计成“上一条 `--session` 命令改了内存，下一条继续用”。

---

## 3. Console 对齐点

Console 的按钮禁用、弹窗确认和页面上下文，在 AI/CI 中变成：

- 参数必填；
- schema 校验；
- preflight/dry-run；
- exit code；
- JSON details；
- report/retry/resume。

不能靠中文文案让机器猜，也不能让机器卡在 prompt。

---

## 4. 标准流水线

```text
login --password-stdin
  → validate --json
  → diff --json
  → publish --dry-run --json
  → publish/release --yes --json
  → policy template/apply --yes --json
  → online --yes --json
```

长任务：

```text
resource import-dir --json-lines
  → start
  → ok/fail/skip
  → done
  → report path
```

---

## 5. 错误处理协议

| code | AI/CI 应如何处理 |
|---|---|
| 0 | 成功，读取 data |
| 2 | 登录/owner 权限问题，停止 |
| 3 | 本地/远端冲突，需要人工或显式 force |
| 4 | 输入/状态不满足，按 hint 修参数 |
| 5 | 浏览器 handoff，交给用户去 Console |

所有错误 details 不得泄露 token、password、cookie、authorization。

---

## 6. 常见情况处理

| 情况 | 处理 |
|---|---|
| 命令缺 `--env` | code 4；hint 说明如何显式环境 |
| 命令缺 `--yes` | code 4；不进入 prompt |
| 输出混入日志 | 视为协议错误；日志必须去 stderr |
| 长任务中断 | 依 report 进入 retry/resume/unknown |
| 付费/验证码 | code 5；交给人类完成 Console 动作 |
| 策略新增 | 先 `policy template list/render --json` 固定模板和参数；`--from-file` 只用于 advanced fallback |
| 需要多步上下文 | 优先落工程 manifest/state 或使用 report；不要让 AI 依赖 TTY 菜单状态 |
| 同一命令重复执行 | 幂等恢复或 code 3 冲突，不重复创建 |

---

## 7. 回归到总设计

AI/CI 场景要求：

- 所有命令的 `--help` 要暴露机器可用参数；
- JSON schema 是公共协议；
- TTY 文案再友好，也不能污染 JSON stdout；
- 向导新增功能时必须同步等价命令。
