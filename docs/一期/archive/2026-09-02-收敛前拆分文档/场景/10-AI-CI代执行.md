---
title: 10 AI/CI 代执行
description: 无交互环境中安全执行 CLI
document_role: 文档角色：场景校验卡，服务产品、开发、测试和 AI 执行
---

# 10 · AI / CI 代执行

## 用户目标

用户希望 AI 或 CI 能代表自己完成发行、维护和恢复，同时输出可审计结果。

## 前置条件

- 环境和凭据已由用户授权配置。
- 命令参数完整。
- 写操作必须显式确认。

## 主流程

| 阶段 | 要求 |
|---|---|
| 预检 | status / validate / diff 使用 JSON 输出 |
| 写入 | 所有写命令传 `--yes` 和 `--env` |
| 进度 | 长任务使用 JSON 或 NDJSON |
| 恢复 | 保存 reportFile、resourceId、version、fileSha1 |
| 交接 | 只交接脱敏信息，不交接密码或 token |

## 分支与异常

| 情况 | 处理 |
|---|---|
| 参数缺失 | 停止并提示缺失字段，不进入 prompt |
| 需要支付或签约 | 停止并提示 Console 接力 |
| 平台写入结果未知 | 进入对账，不盲目重试 |
| 本地状态冲突 | 保留现场并要求 pull/diff |

## 验收点

- 无交互环境不会卡住。
- JSON 中有稳定的 ok、code、message、hint、details。
- 中断后能继续或明确人工对账点。
