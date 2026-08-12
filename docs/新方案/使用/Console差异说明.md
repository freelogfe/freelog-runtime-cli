---
title: Console 差异说明
description: Freelog CLI 使用说明 — Console 差异说明
sidebar:
  order: 14
---

# Console 差异说明

> 文档角色：当前版本的派生使用说明；不定义产品范围、字段或完成状态。发生冲突时以仓库根目录 [DESIGN.md](../../../DESIGN.md) 和当前 `--help` 为准。

最后更新：2026-08-12

[← CLI 使用文档目录](./README.md)
## Console 对齐状态

**逐项契约见 [Console–CLI 业务能力契约](../对齐/CLI数据操作与Console对照.md)**。该矩阵使用稳定业务 ID，并将范围、对齐方式和证据分开记录。

**结论：** 本地文件发行主链已经具备字段级 Console 契约和 PropertyParser 属性解析；每项是否完成以能力矩阵中的 `SPEC / CODE / CONTRACT / ENV` 证据为准。CLI 原生的模板、压缩和批量恢复不计入 Console parity 分母，但必须满足相同的资源类型、owner、授权和平台状态门禁。

不在范围：云存储浏览器、付费收银台和消费侧 UI。RSS、collect-rules 已纳入 `ADVANCED + PARITY`，对齐标准与核心能力相同。
