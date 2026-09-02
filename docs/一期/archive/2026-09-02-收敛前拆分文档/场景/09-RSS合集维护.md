---
title: 09 RSS 合集维护
description: 绑定、换源和同步 RSS 合集
document_role: 文档角色：场景校验卡，服务产品、开发、测试和 AI 执行
---

# 09 · RSS 合集维护

## 用户目标

RSS 维护者想让合集内容由 RSS feed 自动同步，并在需要时换源或手动触发同步。

## 前置条件

- 已有合集资源，或准备先创建合集壳。
- feed 可访问，并包含 owner email。
- 用户能取得邮箱验证码。

## 主流程

| 阶段 | TTY | AI/CI |
|---|---|---|
| 预检 feed | 展示标题、作者、邮箱掩码、单集数量 | rss inspect |
| 发送验证码 | 确认 owner email 后发送 | rss send-code |
| 绑定 | 输入验证码并确认范围 | rss bind |
| 同步 | 查看状态或触发同步 | rss status / sync |
| 维护标签 | 可手动更新 tags | collection update --tags |

## Console 对齐点

| 点 | 规则 |
|---|---|
| 单集数量 | `matchedItemCount > 1000` 时必须选择发布时间范围 |
| 时间范围 | 传给平台的是 `YYYY-MM-DD HH:mm:ss` |
| 换源 | 新地址不能等于原地址；compare 必须带验证码 |
| 验证码错误 | `VerificationCodeInvalid` / `wrong_verified_code` 视为验证码字段错误 |
| GUID 风险 | 大量不匹配时要求用户确认 |
| 字段锁定 | 标题、封面、简介、目录由 feed 管理；tags 仍可维护 |
| 同步 | pending / running 等状态防止重复同步 |

## 分支与异常

| 情况 | 处理 |
|---|---|
| feed 缺 owner email | 不能继续绑定 |
| feed 已被其他资源绑定 | 停止并显示冲突资源 |
| 验证码错误 | 重新输入或重新发送 |
| GUID 大量不匹配 | 明确风险后才允许继续 |
| 用户手改目录 | 拒绝，提示用 RSS sync |

## 验收点

- RSS 绑定、换源和同步流程与 Console 字段规则一致。
- 标签可以维护，但 feed 托管字段不能维护。
- 重复同步被拦截。
