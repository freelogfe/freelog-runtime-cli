---
title: 04 合集与 RSS
description: 创建合集、维护目录、绑定 RSS 和设置自动收录
sidebar:
  order: 5
document_role: 文档角色：面向最终用户的公开操作说明
---

# 04 · 合集与 RSS

[返回目录](./README.md)

合集不是“上传一个 zip”。合集是一个资源壳，里面有目录项；目录项通常指向已经发布的子资源。

## 从本地文件夹创建合集

```bash
freelog-cli collection init-from-folder --project-dir album --media-dir ./photos --yes --env <env>
```

这个流程会：

1. 创建合集工程。
2. 为媒体文件创建子资源。
3. 把子资源导入合集目录草稿。
4. 留下可恢复报告。

之后进入合集工程目录：

```bash
freelog-cli collection version set --description "首版合集" --env <env>
freelog-cli collection publish --yes --env <env>
freelog-cli collection policy template list --env <env>
freelog-cli collection policy template apply <templateId> --yes --env <env>
freelog-cli online --yes --env <env>
```

## 分步创建合集

```bash
freelog-cli type list --subject collection --env <env>
freelog-cli init ./my-collection --scaffold collection --resource-type <collectionTypeCode> --title "我的合集" --yes --env <env>
freelog-cli collection create --yes --env <env>
freelog-cli collection item add <resourceId> --env <env>
freelog-cli collection publish --yes --env <env>
```

## RSS 合集

RSS 合集内容由 feed 托管。CLI 对齐 Console 当前规则：

| 字段或操作 | CLI 行为 |
|---|---|
| 标题、封面、简介 | 由 feed 同步，禁止手动修改 |
| 标签 | 仍可手动维护 |
| 目录项增删改排 | 由 feed 管理，禁止手动修改 |
| RSS 换源 | 先预检、发验证码、compare，再绑定 |
| 同步 | 已有同步进行中时阻止重复触发 |

常用命令：

```bash
freelog-cli collection rss inspect <feedUrl> --env <env>
freelog-cli collection rss send-code <feedUrl> --yes --env <env>
freelog-cli collection rss bind <feedUrl> --code <code> --yes --env <env>
freelog-cli collection rss status --env <env>
freelog-cli collection rss sync --yes --env <env>
```

如果可收录单集超过 1000 条，绑定时需要传发布时间范围：

```bash
freelog-cli collection rss bind <feedUrl> --code <code> --pub-start 2026-01-01 --pub-end 2026-12-31 --yes --env <env>
```

CLI 会把日期转换成平台需要的整日起止时间。

## 自动收录规则

普通合集可以设置自动收录规则；RSS 合集不能设置，因为 RSS 自身就是内容来源。

```bash
freelog-cli collection collect-rules get --env <env>
freelog-cli collection collect-rules set --status 1 --serialize-status 0 --condition-type 1 --yes --env <env>
```

复杂条件请使用 `--from-file`。
