---
title: CLI 使用文档
description: Freelog CLI 用户文档目录，适合集成到开发者文档站点
sidebar:
  order: 0
---

# CLI 使用文档

> 文档角色：当前版本的派生使用说明；不定义产品范围、字段或完成状态。发生冲突时以仓库根目录 [DESIGN.md](../../../DESIGN.md) 和当前 `freelog-cli --help` 为准。

最后更新：2026-08-13

Freelog CLI 以本地工程为工作面，对齐 Console 业务语义，不复制网页向导。字段契约见 [CLI字段账本](../开发/CLI字段账本.md)；Console 证据见 [对齐目录](../对齐/README.md)。

## 推荐阅读顺序

| 顺序 | 文档 | 适合 |
|---|---|---|
| 1 | [快速上手](./快速上手.md) | 第一次用 CLI，15 分钟发一张图并上架（dev） |
| 2 | [选型指南](./普通用户简明手册.md) | 五选一：我该走哪条发行路径 |
| 3 | [全局参数与登录](./全局参数与登录.md) | `--env`、凭据、JSON、命令索引 |
| 4 | 按场景阅读下方「按任务查找」 | 日常操作与进阶 |

## 按任务查找（文档站点 sidebar 建议顺序）

| 文档 | 内容 |
|---|---|
| [快速上手](./快速上手.md) | 线性教程：login → type → init → publish → online |
| [选型指南](./普通用户简明手册.md) | 五选一 + Console 何时必须用网页 |
| [全局参数与登录](./全局参数与登录.md) | 环境、凭据、全局 flag、exit code、命令索引 |
| [准备与本地文件](./准备与本地文件.md) | type/template/pull、manifest/state、免费策略模板 |
| [发行单个资源](./发行单个资源.md) | 主题/插件、单图/单视频 |
| [批量发行](./批量发行.md) | `resource import-dir`、batch.json、resume/retry |
| [合集](./合集.md) | init-from-folder、目录项、RSS、collect-rules |
| [维护与草稿](./维护与草稿.md) | update、新版本、`--reuse-version`、draft、collection publish |
| [策略与上下架](./策略与上下架.md) | policy apply/set、online/offline |
| [依赖与授权](./依赖与授权.md) | dep、auth-map、batchSignContracts、Console 接力 |
| [工程化与预检](./工程化与预检.md) | config、release、validate、diff、init 预设 |
| [特殊流程](./特殊流程.md) | bind、换环境、半路接入、**会话模式 `--session`** |
| [排错与验收](./排错与验收.md) | 常见错误表、验收清单 |
| [Console 差异说明](./Console差异说明.md) | 对齐范围（非操作教程） |

## 方案 A — 发行模式

```text
发行单个资源  →  init <dir>（五选一）→ create → …
批量发行      →  resource import-dir
发行合集      →  init 选「合集」→ collection create → …
文件夹→合集   →  collection init-from-folder（不经过 init）
```

## 参数真源

- 用户可读：`freelog-cli --help`、各子命令 `--help`
- 代码：`packages/cli/src/core/cliArgs.ts`（见 [CLI脚手架设计 §4.1](../开发/CLI脚手架设计.md)）

## 兼容入口

历史单页手册：[CLI使用说明与Console差异](./CLI使用说明与Console差异.md)（已拆分为上表各页，保留链接兼容）。
