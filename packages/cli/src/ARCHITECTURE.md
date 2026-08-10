# CLI 源码架构

本文定义 `packages/cli/src` 的代码分类与依赖方向。产品行为以仓库根目录 `DESIGN.md` 为准；本文只约束实现结构。

## 分层

```text
bin
  ↓
commands
  ↓
services ──→ adapters
  ↓              ↓
platform       config
  ↑              ↑
  └──── core / i18n
```

| 目录 | 唯一职责 | 可以依赖 | 禁止承担 |
|---|---|---|---|
| `bin/` | 初始化平台适配器、注册顶层命令 | `commands`、`platform/bootstrap` | 业务流程 |
| `commands/` | 参数、TTY 交互、输出、调用一个或少量 service | `core`、`config`、`services`、`i18n` | 直接拼平台业务 payload；跨命令复用业务逻辑 |
| `services/` | 用例编排、业务门禁、同步、文件处理 | `core`、`config`、`platform`、`adapters`、`i18n` | CLI 参数解析与终端展示 |
| `adapters/` | manifest/state 与平台 DTO 的纯映射、指纹 | `config` | 网络请求、终端输出、持久化编排 |
| `config/` | manifest/state/config schema、读取与原子写入 | `core/env`、`i18n` | 平台请求、业务流程 |
| `platform/` | tools-lib 初始化、API envelope、底层平台访问 | `core`、`i18n` | 产品状态机和命令交互 |
| `core/` | 环境、认证、错误、TTY、公共命令基础设施 | `i18n` | 具体资源/合集业务 |
| `i18n/` | 稳定文案键与本地化 | `core/errors`；启动期可读取平台语言配置 | 业务流程 |

`login` 是唯一允许命令层直接使用平台 envelope 的例外：它负责建立平台认证上下文，发生在普通 service 调用之前。其余命令不得直接导入 `platform/`。

## services 分类

| 分类 | 位置 | 内容 |
|---|---|---|
| 资源发行 | `services/resource/` | 版本 payload、发布编排 |
| 合集 | `services/collection/` | 合集壳、目录草稿、属性、策略和发布 |
| 批量发行 | `services/batch/` | 扫描、配置、逐项结果、恢复 |
| 工程初始化 | `services/init/` | 模板选择、兼容矩阵、scaffold |
| 同步 | `services/sync/` | 资源 owner、pull、平台事实同步的公开入口 |
| 共享业务规则 | `services/shared/` | owner/listing/publish guards、平台读取适配 |
| 文件属性 | `services/fileProperty/` | 平台属性解析与轮询 |
| 跨域用例 | `services/*Service.ts` | release、status、diff、draft 等跨目录编排 |
| 独立管线能力 | `services/processFile.ts`、`storageUpload.ts`、`validation.ts`、`resourceType*.ts` | 尚未形成文件族的文件/类型/校验能力 |

新增代码优先进入已有领域目录。只有同时编排多个领域的用例，才以 `*Service.ts` 放在 `services/` 根目录；单文件独立能力可以留在根目录，一旦形成两个以上紧密协作模块就建立命名明确的子目录。

## 强制规则

1. 所有平台写入必须在 service 入口执行环境、owner、同步和业务门禁；命令层保护只能作为第一道防线。
2. `dry-run` 使用只读查询路径，不得调用会保存 state 的自动同步入口。
3. manifest 意图和 state 平台事实只通过 `config/project` 读写。
4. 平台 DTO 到本地 DTO 的转换集中在 adapter/shared mapping，不在命令中散落。
5. Console parity 验证工具仍遵守分层；`cover`、`meta` 命令通过 service 完成 SHA1、上传和对比。
6. 新增跨层依赖必须先更新本文，并修改架构边界测试。
