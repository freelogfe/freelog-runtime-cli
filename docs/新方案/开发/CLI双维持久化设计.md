---
title: CLI 双维持久化设计
description: Auth 与 Store 两个独立维度 · 四模式（00/01/10/11）
---

# CLI 双维持久化设计

> 文档角色：产品与技术设计（Auth × Store 四模式）。业务门禁仍以 [DESIGN.md](../../../DESIGN.md) 为准；会话 Store 细节见 [CLI双模式设计](./CLI双模式设计.md)。

最后更新：2026-08-14

[← 开发文档索引](../README.md)

## 1. 结论（先看）

CLI 有两个**正交**的本地持久化维度，用 **`AS`** 编码（左 = Auth，右 = Store；`1` = 不落盘，`0` = 落盘）：

| 编码 | 名称 | A 凭据 | S 资源状态 | 入口 |
|:---:|---|:-:|:-:|---|
| **00** | 工程模式 | 落盘 | 落盘 | `login` + 工程目录命令 |
| **01** | 命令会话 | 落盘 | 不落盘 | `xxx --session` |
| **10** | 多账号工作区 | 不落盘 | 落盘 | `freelog-cli studio` |
| **11** | 交互会话 | 不落盘 | 不落盘 | `freelog-cli session` |

**session 的固定含义：** 仅 **S=1**（不写 `freelog.manifest.json` / `.freelog/state.json`）。  
**不是**「什么都不落盘」；A 与 S 独立组合。

```text
                    S=0 落盘                     S=1 不落盘（session Store）
                 ┌─────────────────────┬──────────────────────────┐
A=0 凭据落盘     │ 00 工程模式          │ 01 命令 --session         │
                 ├─────────────────────┼──────────────────────────┤
A=1 凭据不落盘   │ 10 studio           │ 11 session 交互控制台     │
                 └─────────────────────┴──────────────────────────┘
```

## 2. 本地 state 里的 userId

发行成功后 **owner 写入 `.freelog/state.json`**，与凭据文件分离：

```text
.freelog/state.json
  resource.owner.userId      ← 发行时登录账号
  resource.owner.username
  resource.resourceId
  version.lastPublishedVersion
```

**规则（四模式共用）：**

1. create / 首发 publish 时，用**当时** `auth.userId` 写入 state。  
2. 写操作前：`当前 auth.userId === state.owner.userId`，否则 code 2。  
3. manifest 存用户意图；**owner 以 state 为准**。  
4. 同一人有账号 A、B：A 发的子工程只有 login A 能写；login B 会被 owner 门禁拒绝（预期行为）。

## 3. 凭据解析

```text
resolveAuth() 优先级：
  1. 进程内存（studio / session 内 no-save 登录）
  2. 工作区 .freelog-auth（自 --cwd 向上）
  3. 全局 ~/.freelog-auth
  4. 未登录
```

**A=1 约束：** 仅 **studio / session 单进程** 内有效；进程结束凭据清空。不使用环境变量注入。

`status` / 写命令提示 scope：

- `工作区凭据` / `全局凭据`（A=0）  
- `临时会话·不落盘`（A=1）

## 4. 四模式流程

### 4.1 `00` 工程模式

**场景：** 长期维护一个资源；Git/CI；同账号批量 `import-dir`。

```text
login → init/create → 读写 manifest/state → publish / draft / pull
```

### 4.2 `01` 命令会话

**场景：** 本机已 login，对已有 resourceId 做一次性平台操作，不写本地 state。

```bash
freelog-cli login --env dev
freelog-cli resource publish --session --resource-id xxx --file ./v2.zip --version 2.0.0 --yes --env dev
```

- S=1，A=0；每条命令新进程；owner 从平台 API 校验。

### 4.3 `10` 多账号工作区（`studio`）

**场景：** **同一人**注册多个 Freelog 账号（如个人号 + 品牌号）。同一文件夹多个视频，不同账号各发一条；机器上**不留** `.freelog-auth`，但每个视频要有独立子工程（含正确 userId）。

```bash
freelog-cli studio --env dev
```

**流程：**

```text
[1] no-save 登录（内存）
[2] 选工作文件夹（批量工作区根，可无 manifest）
[3] 菜单循环：
      · 从文件夹选文件发行 → 新建子目录 + manifest/state（owner = 当前账号）
      · 进入已有子目录维护（owner 门禁）
      · 切换账号（重新登录，覆盖内存 auth）
      · 文件夹概况
      · 退出
[4] 退出 → 无 .freelog-auth；子目录保留
```

**工作区根菜单：**

| # | 菜单 | 行为 |
|:---:|---|---|
| 1 | 从文件夹选文件发行 | 新建子工程 + manifest/state（owner = 当前账号） |
| 2 | 进入子工程维护 | 见下表；须 owner 匹配 |
| 3 | 切换账号 | 重新 no-save 登录 |
| 4 | 文件夹概况 | 根目录文件与子工程统计 |
| 0 | 退出 | 清内存凭据；子目录保留 |

**子工程维护子菜单（S=0 + ephemeral auth）：**

| # | 菜单 | 对应 service |
|:---:|---|---|
| 1 | 发新版 | `publishVersion`（confirm 前 publish preflight） |
| 2 | 改 listing | `updateListing` |
| 3 | 改版本说明 | `editReleasedVersion` |
| 4 | 上架 / 下架 | `onlineResource` / `offlineResource` |
| 0 | 返回工作区根 | — |

**不含：** dep、policy、draft。

**与 `import-dir`（00）区别：**

| | import-dir | studio |
|---|---|---|
| 账号 | 整批同一 login | 同一人可中途换账号 |
| 凭据 | 落盘 | 不落盘 |
| 适用 | 同账号批量 ≤20 | 同文件夹、多账号逐条发 |

### 4.4 `11` 交互会话（`session`）

**场景：** 临时维护已有资源；不留凭据、不留 manifest。

```bash
freelog-cli session --env dev
```

**流程：**

```text
[1] no-save 登录
[2] 选 resourceId / 搜索 / 新建首发 / 稍后
[3] 菜单：publish / update / version edit / dep / policy / online / offline / 切换资源
[4] 退出 → auth + EphemeralStore 全清
[5] 可选「导出工程」→ 指定目录写入 manifest/state（转入 00）
```

**主菜单（与代码 1:1）：**

| # | 菜单 | 对应 service / 行为 |
|:---:|---|---|
| 1 | 发新版 | `runSessionPublishWizard` → `createThenPublish` / `publishVersion` |
| 2 | 改 listing | `runUpdateListingWizard` → `updateListing` |
| 3 | 改版本说明 | `editReleasedVersion`（description） |
| 4 | 依赖 / 签约 | 子菜单 → `depService` / `depAuthService` |
| 5 | 策略 | 子菜单 → `policyService` |
| 6 | 上架 / 下架 | 子菜单 → `onlineService`（online 含 preflight） |
| 7 | 查看当前资源 | `fetchResourceInfo` |
| 8 | 导出工程 | `exportSessionProject`（须已有 resource 身份） |
| 9 | 切换 / 选择资源 | id / 搜索 / 新建首发 / 稍后 |
| 10 | 切换账号 | `promptSwitchEphemeralAccount`；切换后建议菜单 9 重选 |
| 0 | 退出 | 清 ephemeral auth + EphemeralStore |

**不含：** `draft push/pull`（须工程目录或导出后操作）。

## 5. 未登录行为

| 场景 | 行为 |
|---|---|
| 00 / 01 写命令 | code 2 → `freelog-cli login` |
| `studio` / `session` 启动 | 第一步强制 no-save 登录（同进程） |
| 非 TTY | `studio` / `session` 拒绝启动（code 4） |

不在 00/01 自动弹登录向导（避免脚本卡住）。

## 6. 与 `--session` flag 的关系

| | `--session` flag | `freelog-cli session` 子命令 |
|---|---|---|
| 控制 | 仅 S=1 | A=1 + S=1（11） |
| 形态 | 单条命令 | 交互菜单、单进程 |
| 凭据 | 通常 A=0（已有 login） | A=1 |

**禁止：** 用 `--persist-store` 之类 flag 让 `--session` 写 state——一旦 S=0 就不是 session。

## 7. 实现映射

| 编码 | 模块 | 路径 | 状态 |
|:---:|---|---|:---:|
| A | ephemeral auth | `packages/cli/src/core/auth.ts` | ✅ |
| A | 共用 login API | `packages/cli/src/services/auth/loginFlow.ts` | ✅ |
| 01 | `--session` Store | `packages/cli/src/services/store/ephemeralStore.ts` + 命令族 | ✅ |
| 10 | studio 命令 | `packages/cli/src/commands/studio.ts` | ✅ |
| 10 | studio 壳 | `packages/cli/src/services/interactive/studioShell.ts` | ✅ |
| 10 | 单文件首发 | `packages/cli/src/services/interactive/studioPublish.ts` | ✅ |
| 10 | 子工程维护 | `packages/cli/src/services/interactive/studioActions.ts` | ✅ |
| 10 | owner 门禁 | `packages/cli/src/services/interactive/context.ts` → `assertStudioOwner` | ✅ |
| 11 | session 命令 | `packages/cli/src/commands/sessionInteractive.ts` | ✅ |
| 11 | session 壳 | `packages/cli/src/services/interactive/sessionShell.ts` | ✅ |
| 11 | session 动作 | `packages/cli/src/services/interactive/sessionActions.ts` | ✅ |
| 11 | 发版向导 | `packages/cli/src/services/interactive/runSessionPublishWizard.ts` | ✅ |
| 11 | 导出工程 | `packages/cli/src/services/store/exportSessionProject.ts` | ✅ |
| 共享 | 交互上下文 | `packages/cli/src/services/interactive/context.ts` | ✅ |
| 共享 | 写确认 | `packages/cli/src/services/interactive/interactiveWrite.ts` | ✅ |
| 共享 | ephemeral 登录 | `packages/cli/src/services/interactive/ephemeralLogin.ts` | ✅ |

测试分层与 UX 细节见 [CLI双模式实现设计 §25.5–25.6](./CLI双模式实现设计.md#255-测试分层)。

## 8. 非目标

- 环境变量注入 token  
- 把 `--session` 扩展为「凭据也不落盘」  
- 跨进程共享 A=1 凭据  
- studio 替代同账号整批 `import-dir`

---

**原则：** 与 Console 对齐的业务只实现一次（services）；四模式差异仅在 **Auth 来源** 与 **ProjectStore 实现**（ManifestStateStore vs EphemeralStore）。
