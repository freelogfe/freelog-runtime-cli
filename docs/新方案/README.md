# Freelog Runtime CLI 新方案

最后更新：2026-08-10

本目录是 Freelog Runtime CLI 的**唯一设计入口**。文档已按角色分目录，避免 12 份平铺难以取舍。

## 1. 先读谁

| 你是… | 路径 |
|---|---|
| 第一次了解 | 本文 §2 → [普通用户简明手册](./使用/普通用户简明手册.md) |
| **产品经理** | **[产品经理简明手册](./使用/产品经理简明手册.md)** → [Console对齐核对报告](./对齐/Console对齐核对报告.md) |
| **测试 / QA** | **[测试人员简明手册](./使用/测试人员简明手册.md)** → [08 测试人员](./场景/08-测试人员手册.md) |
| **产品 / 测试 / 生产场景** | **[场景目录](./场景/README.md)** → [07 用户身份](./场景/07-用户身份测试手册.md) |
| 开发实现 | [开发设计](./开发/) → [Console 对齐](./对齐/) |
| 命令参数速查 | [CLI使用说明](./使用/CLI使用说明与Console差异.md) |
| 新会话接手 | [交接文档](./交接/CLI交接文档.md) |

## 2. 核心思想

脚手架以**本地目录和文件**为工作面：manifest 记录发版意图，`version set` / `publish` 读取本地路径上传，state 缓存平台事实。

**脚手架 = Console 本地文件发版的「无界面版」。** 操作级 parity 见 [CLI数据操作与Console对照 §0–§2](./对齐/CLI数据操作与Console对照.md)；架构原则见 [CLI脚手架设计 §1.8](./开发/CLI脚手架设计.md#18-console-两阶段创建creator与维护sidebar)。

**发行模式（方案 A）：**

```text
发行单个资源  →  freelog-cli init <dir>           （init 五选一 → create → …）
批量发行资源  →  freelog-cli resource import-dir
发行合集      →  init 选「合集」→ collection create → item * → …
```

基础层：`login -> status -> init/import-dir -> create/publish -> policy -> online -> pull`。

## 3. 文档结构

```text
新方案/
  README.md                 ← 你在这里
  场景/                     ★ 07 用户身份 + 08 测试人员 + 问题矩阵
  开发/                     架构 + 字段（2 份）
  对齐/                     Console parity（3 份 + 索引）
  使用/                     命令手册 + 三份分角色简明手册
  交接/                     环境、账号、验证记录
  archive/                  已完成台账
```

| 目录 | 文档 | 受众 |
|---|---|---|
| **场景** | [README](./场景/README.md) · [07 用户身份](./场景/07-用户身份测试手册.md) · [08 测试人员](./场景/08-测试人员手册.md) · [问题矩阵](./场景/04-问题矩阵.md) | **产品、作者、QA** |
| **开发** | [CLI脚手架设计](./开发/CLI脚手架设计.md) · [CLI产品边界与路线图](./开发/CLI产品边界与路线图.md) · [CLI字段账本](./开发/CLI字段账本.md) | 开发 |
| **对齐** | [索引](./对齐/README.md) · [Console对齐核对报告](./对齐/Console对齐核对报告.md) · Console梳理 · 数据对照 · 拓扑对照 | 产品、开发、QA |
| **使用** | [普通用户简明手册](./使用/普通用户简明手册.md) · [产品经理简明手册](./使用/产品经理简明手册.md) · [测试人员简明手册](./使用/测试人员简明手册.md) · [CLI使用说明](./使用/CLI使用说明与Console差异.md) | 用户、PM、QA |
| **交接** | [CLI交接文档](./交接/CLI交接文档.md) | 接手开发 |
| **archive** | 全量对齐任务/计划、产品与测试简明说明 | 溯源 |

**勿再新建** 场景散文档；新场景/踩坑写入 [场景/](./场景/) 对应文件（必更新 [04-问题矩阵](./场景/04-问题矩阵.md)）。

## 4. 设计硬约束

1. 不动浏览器项目；不恢复旧 CLI 配置和命令入口。
2. 平台事实只进 `.freelog/state.json`，不进 manifest。
3. 不把 token、cookie、password 写入项目目录。
4. 不绕过 `online` 门禁。
5. Console 已有稳定业务入口时，CLI 不能因无 UI 而放弃承接。
6. 草稿分三类，须显式 `draft push`；CLI 不自动防抖保存。
7. 改字段 → [CLI字段账本](./开发/CLI字段账本.md)；改架构/命令 → [CLI脚手架设计](./开发/CLI脚手架设计.md)；改 parity → [对齐/](./对齐/)；改使用流程 → [使用/](./使用/)；**改场景/问题/生产踩坑 → [场景/](./场景/)（必更新 [04-问题矩阵](./场景/04-问题矩阵.md)）**；改环境验证 → [交接/](./交接/CLI交接文档.md)。

## 5. 当前实现范围（摘要）

| 能力 | 状态 |
|---|---|
| 登录/环境/status/pull | ✅ |
| init 五选一 + template/theme/widget | ✅ |
| 单品 create/publish/policy/online/维护 | ✅ |
| 批量 import-dir、合集全链 | ✅ |
| draft 单品/合集、dep、维护期细测 S15 | ✅ |
| parity + scenarios 自动化 | ✅ dev **115/115** scenarios + parity 全 PASS（2026-08-10） |

详情与验证命令见 [交接文档 §9](./交接/CLI交接文档.md#9-验证记录)。

## 6. 权威源码路径

| 用途 | 路径 |
|---|---|
| CLI 仓库 | `D:\appinside\freelog-runtime-cli` |
| CLI 包 | `packages/cli` |
| Console 资源页 | `freelogfe-web-repos/packages/console/src/pages/resource` |
| 场景验证 | `packages/cli/scripts/verify-scenarios.mjs` |
| 全量测试 | `test/run-all-scenarios.mjs` |

## 7. 验证命令

```bash
pnpm build
node test/run-all-scenarios.mjs --env dev
```

或分项：`pnpm verify:scenarios` · `pnpm verify:parity` · `pnpm test`
