---
title: 09 排错与 Console 接力
description: 常见错误、处理顺序和必须跳转 Console 的场景
sidebar:
  order: 10
document_role: 文档角色：面向最终用户的公开操作说明
---

# 09 · 排错与 Console 接力

[返回目录](./README.md)

排错先看四件事：版本、环境、登录、当前工程状态。

```bash
freelog-cli --version
freelog-cli status --env <env>
freelog-cli diff --env <env>
freelog-cli validate --for publish --env <env>
```

## 常见错误

| 提示 | 常见原因 | 处理 |
|---|---|---|
| 未指定环境 | 写命令没有 `--env` | 补 `--env <env>` |
| 未登录或登录过期 | 当前目录和全局都没有可用凭据 | 重新 `login` |
| 资源类型无效 | 没选叶子类型，或目标环境不存在该类型 | `type pick` 或 `type info` |
| 非交互需要确认 | 脚本里缺 `--yes` | 确认参数后补 `--yes` |
| 本地和平台不一致 | Console 或其他终端改过同一资源 | 先 `pull` 或按 `diff` 提示处理 |
| 缺少授权 | 依赖资源未签约或未授权 | 去 Console 签约后重试 |
| RSS 验证码错误 | 验证码过期或输入错误 | 重新发送验证码 |
| RSS 正在同步 | 平台已有同步任务进行中 | 稍后再查 `collection rss status` |
| session / studio 中断 | 临时会话未导出，或多账号状态需要核对 | 重新进入交互模式；已成功项以报告和平台状态为准 |

## 必须 Console 接力

CLI 会尽量完成本地文件型发行和维护，但这些操作应去 Console：

| 场景 | 为什么 |
|---|---|
| 支付、签约、续约 | 涉及账户和合同确认 |
| 资源解冻 | 需要平台审核或管理员动作 |
| 网页可视化编辑器 | CLI 不提供富 UI 编辑 |
| 云存储选择器 | CLI 只处理本地文件路径或 URL |
| 复杂策略人工审阅 | Console 更适合逐项确认合同语义 |

## 不要做的事

- 不要手改 `.freelog/state.json` 来“修复”平台状态。
- 不要删除成功的批量子工程后整体重跑。
- 不要把 `.freelog-auth` 提交到版本库。
- 不要把 RSS 合集当普通合集手动改目录项。

## 需要给别人排查时

提供这些信息即可，不要提供密码、token、cookie 或 authorization：

```bash
freelog-cli --version
freelog-cli status --json --env <env>
freelog-cli diff --json --env <env>
```
