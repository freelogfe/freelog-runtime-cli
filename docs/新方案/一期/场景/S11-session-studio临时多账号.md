# S11 · session / studio 临时与多账号

> **文档角色：** `--session`、`freelog-cli session` 和 `freelog-cli studio` 的临时/多账号体验设计。总规则见 [../02-CLI体验拓扑设计.md](../02-CLI体验拓扑设计.md)。

最后更新：2026-08-28

---

## 1. 用户目标

用户可能只是临时维护一个线上资源，或在一台电脑上用多个账号处理多份文件。CLI 要提供不污染长期工程、不串账号、不误写凭据的模式。

---

## 2. 三种入口

| 入口 | 适合 | 本地状态 |
|---|---|---|
| `xxx --session` | 单条命令临时维护已有资源 | 内存 Store，命令结束销毁 |
| `freelog-cli session` | TTY 多步临时壳 | 内存 Store，退出销毁 |
| `freelog-cli studio` | 多账号文件工作区 | 子工程落盘，auth 不落盘 |

---

## 3. Console 对齐点

四模式不能改变 Console 业务门禁：

- owner 必须匹配；
- env 必须明确；
- semver、依赖授权、frozen、策略、online 不放宽；
- 支付/验证码仍 handoff。

差异只在“manifest/state/auth 如何保存”。

---

## 4. `--session` 单命令拓扑

| checkpoint | 用户看到 | 输入 | 副作用 | 禁止误导 |
|---|---|---|---|---|
| S1 目标资源 | resourceId、owner、type、latest | `--resource-id` | 只读平台 | 不扫描当前目录猜资源 |
| S2 一次性意图 | flags 拼出的 update/publish/policy | flags | 无本地写 | 不说已保存工程 |
| S3 写平台 | preflight + confirm | `--yes` 或 TTY confirm | 写平台 | 不跨命令保留内存 |
| S4 导出 | 是否 export-project | path | 可写工程 | 只有显式导出才落盘 |

---

## 5. `freelog-cli session` TTY 壳

```text
临时登录
  → 搜索/选择资源
  → 选择动作
  → preflight
  → 写平台
  → 是否导出工程
  → 退出销毁
```

退出前如果存在未导出意图，必须明确提示“退出后丢失”；但不能替用户自动写当前目录。

一次 session 可以连续完成完整事项，但前提是都发生在同一个进程内：

```text
新建/选择资源
  → publish
  → dep auth / Console handoff 后重试当前 checkpoint
  → 策略模板 Builder
  → online
  → status summary
  → 退出或 export-project
```

如果用户中途关闭终端，内存 Store 丢失；只有显式 `export-project` 才能把当前上下文转成工程模式继续维护。

---

## 6. `freelog-cli studio` 多账号工作区

| 问题 | 设计 |
|---|---|
| 登录 | 进程内临时凭据；不读/不写磁盘 auth |
| 文件扫描 | 复用 `.freelogignore`，强制排除 `.freelog-auth`、`.freelog/`、VCS |
| 多账号 | 每次写前展示账号；子工程记录 owner |
| 并发 | 同 workspace/file 首发持锁 |
| 恢复 | studio report 独立于 import-dir report |
| 后续维护 | 子工程可退出 studio 后用普通工程命令维护 |

---

## 7. AI/CI 等价与限制

| 场景 | 机器路径 |
|---|---|
| 单命令临时维护 | 可用 `xxx --session --resource-id <id> --json --yes --env <env>` |
| 多步临时会话 | 不适合 CI；应导出工程或改用显式命令链 |
| studio 多账号 | 主要是 TTY 运营工作台；自动化批量应优先用 S07 import-dir |

---

## 8. 常见情况处理

| 情况 | 处理 |
|---|---|
| 用户以为 `--session` 会保存下一条命令可用的状态 | 明确提示单命令结束即销毁 |
| 用户退出 session 前有未导出意图 | 提示会丢失，可选择 export-project |
| studio 切换账号后继续写同一资源 | owner 检查，不一致拒绝 |
| studio 扫描到敏感文件 | 不展示为候选，必要时说明被强制排除 |
| 远端结果未知 | report 标 unknown，不自动重试 |

---

## 9. 回归到总设计

session/studio 场景要求：

- root/start 能解释三种临时入口差别；
- public help 不暴露 `00/01/10/11` 给普通用户；
- “不落盘凭据”和“子工程落盘”要同时讲清，不能混。
