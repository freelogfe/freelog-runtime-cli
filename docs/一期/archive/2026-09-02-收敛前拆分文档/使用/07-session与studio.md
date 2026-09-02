---
title: 07 session 与 studio
description: 使用临时会话和多账号工作区完成非工程化操作
sidebar:
  order: 8
document_role: 文档角色：面向最终用户的公开操作说明
---

# 07 · session 与 studio

[返回目录](./README.md)

`session` 和 `studio` 都是交互型入口，解决“不想或不能长期写本地工程”的问题。

## 什么时候用

| 模式 | 适合 | 退出后 |
|---|---|---|
| `start` | 当前目录已有工程，或第一次不知道怎么走 | 保留工程文件 |
| `session` | 临时维护一个线上资源 | 默认不落盘，可导出工程 |
| `studio` | 一个文件夹里多个账号分别处理资源 | 每个成功资源生成子工程和报告 |
| 普通工程命令 | 长期维护、团队协作、CI | 保留 manifest 和 state |

## session

```bash
freelog-cli session --env <env>
```

session 适合连续完成：

1. 临时登录。
2. 搜索或输入资源 ID。
3. 更新 listing。
4. 发布新版本。
5. 配策略、上下架。
6. 选择是否导出成本地工程。

也可以用单命令会话模式：

```bash
freelog-cli resource update --session --resource-id <resourceId> --tags "标签一,标签二" --yes --env <env>
freelog-cli resource publish --session --resource-id <resourceId> --file ./dist --version 1.0.1 --artifact-mode directory-zip --yes --env <env>
```

## studio

```bash
freelog-cli studio --env <env>
```

studio 适合人工运营工作台：同一个本地目录，不同账号分别登录、预检、发行、导出报告。

如果只有一个账号批量发行一个目录，应优先使用 [05 批量发行](./05-批量发行.md)。

## 安全边界

- session / studio 凭据只保存在当前进程。
- 需要长期维护时，应导出工程。
- 自动化脚本优先用显式命令，不要依赖交互选择。
