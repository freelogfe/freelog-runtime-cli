---
title: 08 AI/CI 与预检
description: 给 AI、脚本和 CI 使用的无交互命令约定
sidebar:
  order: 9
document_role: 文档角色：面向最终用户的公开操作说明
---

# 08 · AI/CI 与预检

[返回目录](./README.md)

AI/CI 使用 CLI 时，目标不是模拟人点菜单，而是用显式参数表达同一套业务。

## 基本约定

| 约定 | 原因 |
|---|---|
| 写命令传 `--yes` | 避免卡在确认 prompt |
| 传 `--env <env>` | 禁止猜环境 |
| 用 `--json` 或 `--json-lines` | 机器读取结构化结果 |
| 先 `validate` / `diff` | 提前发现字段、文件和平台漂移 |
| 保存 reportFile | 中断后可恢复 |

## 预检

```bash
freelog-cli status --json --env <env>
freelog-cli validate --for publish --json --env <env>
freelog-cli diff --json --env <env>
```

## 单资源自动化

```bash
freelog-cli create --yes --json --env <env>
freelog-cli publish --yes --json --env <env>
freelog-cli policy template list --json --env <env>
freelog-cli policy template apply <templateId> --yes --json --env <env>
freelog-cli online --yes --json --env <env>
```

## 批量自动化

```bash
freelog-cli resource import-dir ./assets --resource-type <typeCode> --json-lines --yes --env <env>
```

失败后读取输出里的报告路径：

```bash
freelog-cli resource import-dir --resume <reportFile> --json-lines --yes --env <env>
```

## 错误处理

机器应读取：

- `ok`
- `code`
- `message`
- `hint`
- `details`

不要只匹配中文终端文案。文案可能为了人更好理解而调整，但 JSON 字段语义应保持稳定。
