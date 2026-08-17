# CLI 交接文档

最后更新：2026-08-17

> 文档角色：当前会话交接与真实环境测试入口；不替代产品设计、字段账本或日期化验证报告。

本文是新会话接手 `freelog-runtime-cli` 的第一入口，记录容易因会话切换丢失、但继续开发和
真实环境测试必须知道的事实。产品设计仍以仓库根目录 [DESIGN.md](../../DESIGN.md) 为唯一
真源；字段、Console 对齐、使用和测试细节继续以各分册为准。

## 1. 一屏结论

1. 当前只开发 `D:\appinside\freelog-runtime-cli` 的新 CLI，不修改浏览器项目。
2. 核心目标：没有 Console UI，也能用 CLI 完成资源生命周期的全部平台操作。
3. CLI 对齐 Console 的业务语义、字段约束和最终接口结果，不机械复制页面交互步骤。
4. 新 CLI 没有旧代码兼容负担；旧脚手架只用于理解历史场景，不作为实现基础。
5. Console 资源业务证据位于 `D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource`。
6. CLI 使用仓库内 `tools-lib` 提供的 `@freelog/tools-lib2/node`；浏览器项目保持原依赖，不迁移。
7. Webpack 模板已删除，不再测试、恢复或作为支持面；当前只维护 Vite 与 package 模板。
8. `publish` 可以在未添加策略时完成；`online` 必须已有 latestVersion 和至少一条启用策略。
9. 主题、插件和前端库发布构建产物目录；CLI 负责确定性压缩、SHA1 和上传。
10. 图片/视频单文件是独立资源；图片/视频文件夹既可批量发行独立资源，也可组成合集。
11. 独立资源版本草稿、合集版本表单草稿、合集目录草稿是三种对象，命令和接口不能混用。
12. 修改代码前先同步设计文档；验证结果只写日期化报告，不能把动态测试数字写进产品设计。

## 2. 关键路径

| 用途 | 路径 |
|---|---|
| CLI 仓库 | `D:\appinside\freelog-runtime-cli` |
| CLI 包 | `D:\appinside\freelog-runtime-cli\packages\cli` |
| CLI 内 tools-lib2 | `D:\appinside\freelog-runtime-cli\tools-lib` |
| 当前产品设计 | `D:\appinside\freelog-runtime-cli\DESIGN.md` |
| 新方案文档 | `D:\appinside\freelog-runtime-cli\docs\新方案` |
| Console 资源页证据 | `D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource` |
| 浏览器仓 tools-lib 原位置 | `D:\appinside\freelogfe-web-repos\packages\@freelog\tools-lib` |
| 旧脚手架参考 | `D:\appinside\freelog-runtime-cli\backup\freelog-cli-ts-copy` |
| 测试资产与工程 | `D:\appinside\freelog-runtime-cli\test` |
| 主题发布测试工程 | `D:\appinside\freelog-runtime-cli\test\my-freelog-project` |
| dev 本地凭据 | `D:\appinside\freelog-runtime-cli\test\.freelog-test-credentials.local.json` |
| 最新综合报告 | `D:\appinside\freelog-runtime-cli\docs\新方案\验证\reports\2026-08-17-dev.md` |

## 3. 环境与测试账号

### 3.1 三个环境

| 环境 | CLI 值 | API | Console | 状态 |
|---|---|---|---|---|
| 生产 | `production` / `prod` | `https://api.freelog.cn` | `https://console.freelog.cn` | **当前 CLI 硬禁用** |
| 测试 | `test` | `https://api.testfreelog.com` | `https://console.testfreelog.com` | 获授权后可用 |
| 开发 | `dev` / `development` | `https://api.devfreelog.com` | `https://console.devfreelog.com` | 当前真实联调环境 |

当前真实联调统一使用 **dev**，所有写命令显式传入 `--env dev`。`production` / `prod` 在 CLI 中
会以 code 4 明确失败，不会请求 API、生成 Console 链接或写入平台；不得把 dev 通过结论冒充 prod
签字。production 重新开放前，不执行任何 prod smoke。

### 3.2 dev 两个联调账号

| 角色 | 登录名 | 密码 | 用途 |
|---|---|---|---|
| primary | `freelog-test11` | `freelog-test1111` | 常规创建、发行、维护、策略、上下架和合集主流程 |
| secondary | `snnaenu` | `snnaenu1` | Studio 多账号、跨 owner 拒绝和身份隔离 |

这两个密码是项目负责人明确要求保留的 **dev 专用测试凭据**。只允许集中记录在本节和已被
`.gitignore` 排除的 `test/.freelog-test-credentials.local.json`；不得复制到日期化报告、测试
输出、manifest、state、源码、token/cookie 文件或生产配置。prod 凭据不允许进入本文。

自动化测试优先读取：

```text
环境变量
  -> test/.freelog-test-credentials.local.json
  -> 仅主账号可回退本机 ~/.freelog-auth session
```

手工登录示例：

```powershell
cd D:\appinside\freelog-runtime-cli\packages\cli
node dist/bin/index.js login --env dev --login-name freelog-test11
```

## 4. 当前模板与包关系

当前兼容矩阵共 7 套模板：

| 类型 | 模板 |
|---|---|
| runtime | `vite-react`、`vite-react-ts`、`vite-vue`、`vite-vue-ts` |
| package | `package-js`、`package-react`、`package-vue` |

package 模板不能使用「前端库」父节点：`package-js` 从平台类型树解析「JS工具包」叶子，
`package-react` / `package-vue` 解析「组件库」叶子；不得写死环境相关 `RT*` code。

Webpack 四套模板已由仓库维护者删除。兼容矩阵、CLI 可选列表、workspace lock 和验证门禁均已
退出 Webpack，不再投入时间修复历史依赖。

**2026-08-17 测试范围裁决：package 暂停测试。** 当前真实环境签字只覆盖四套 Vite runtime
模板；三套 package 模板不再继续跑矩阵，也不计入本轮正式验收。恢复 package 验证须由项目
负责人明确重新开启。暂停决定下达前已发现并修复「前端库父节点不可 create」问题，相关
package 运行结果仅作为探索证据保留，不能改写为当前签字范围。

仓库通过 workspace/link 使用本地 tools-lib2：

```yaml
packages:
  - tools-lib
  - packages/*
  - packages/templates/*

overrides:
  '@freelog/tools-lib2': link:./tools-lib
```

发布顺序：tools-lib2 有改动时先发布 `@freelog/tools-lib2`，再发布 CLI；npm 中的 CLI 不能依赖
开发机绝对路径。

## 5. 业务流程边界

### 5.1 独立资源

```text
login -> init/create 或 bind -> update 基础信息
  -> version set/edit/draft -> publish
  -> policy apply/set -> online/offline -> pull/status
```

- 新建资源与更新基础信息是资源壳操作。
- `publish` 创建或发行版本，不要求已经配置策略。
- `online` 是严格门禁：必须存在 latestVersion 和启用策略。
- 已发版说明/属性维护与“发一个新版本”是两条不同路径。
- 视频上传原文件，不做转码；预览只提供资源详情链接。
- CLI 必须支持封面上传，不能因没有 UI 而删减 Console 可完成的数据操作。

### 5.2 合集

```text
collection create/update
  -> item add/import-dir/remove/reorder
  -> collection version set/draft
  -> collection publish
  -> collection policy -> online/offline
```

- 图片/视频文件夹可先批量创建子资源，再形成合集目录。
- 合集目录是有序单品列表；大目录按 API 限制分块并支持恢复。
- 合集发版表单草稿和目录草稿分开维护，不能用一个 discard 同时清除两者。

### 5.3 Auth × Store

| 模式 | Auth 落盘 | Store 落盘 | 入口 |
|---|---:|---:|---|
| 00 | 是 | 是 | 普通工程命令 |
| 01 | 是 | 否 | `--session` |
| 10 | 否 | 是 | `freelog-cli studio` |
| 11 | 否 | 否 | `freelog-cli session` |

所有写操作必须校验当前登录账号与资源 owner；不得因凭据损坏或 owner 不匹配而静默切换到
其他账号。

## 6. 当前验证基线

截至 2026-08-17 的有效证据见 [dev 综合报告](./验证/reports/2026-08-17-dev.md)：

- 最新离线回归：78 个测试文件、447 项测试通过；typecheck、build、公开文档命令契约和
  npm pack dry-run 通过。package 业务流程仍按 §4 暂停，不因共享单元测试而改为通过。
- dev 主场景：133/133 通过。
- negative gates：9 通过，1 项因 frozen fixture 跳过。
- batch / JSON / chaos：4/4、12/12、4/4 通过。
- Console parity：10 个子脚本通过。
- session smoke：13/13 通过。
- P6：6 项通过，1 项因 frozen fixture 跳过。
- L3-H：4/4 通过，覆盖双账号 Studio 和非 owner 门禁。
- 四套 Vite runtime 模板均完成真实 init、install、build、create、release、policy、online；
  React TS 与 Vue TS 另完成 1.0.1 更新版本。package 按 §4 的 2026-08-17 裁决暂停测试。

跳过不能算通过。当前仍缺两个仓库外条件：

1. **frozen fixture**：dev 普通账号不能通过 API 设置冻结状态，需要在 Console 预置一个由
   primary 拥有且已冻结的资源，并将 ID 写入 `test/.freelog-test-fixtures.local.json`。
2. **RSS fixture**：需要受控 feed、feed owner 邮箱和一次性验证码；两个 dev 账号密码不足以
   单独完成该链路。

## 7. 下一轮执行顺序

1. 先读本文、根 `DESIGN.md`、[文档入口](./README.md)和最新日期化报告。
2. `git status --short`，确认并保护用户已有改动。
3. 运行 `pnpm --filter @freelog-cli/cli2 verify`。
4. 使用本地凭据运行 dev 全场景与 session/Studio 回归。
5. 验证 Vite React/Vue 模板创建、安装、构建、create、发版和更新版本；不处理 Webpack，
   package 按 2026-08-17 范围裁决暂停测试。
6. 只有拿到 frozen/RSS fixture 后才执行对应签字，不得伪造、降级或用 skip 冒充 pass。
7. 发现差异时先更新设计/字段/对齐文档，再修改代码和测试，最后更新日期化报告。

## 8. 必读文档

| 目的 | 文档 |
|---|---|
| 产品范围与不变量 | [DESIGN.md](../../DESIGN.md) |
| 文档总入口 | [新方案 README](./README.md) |
| 字段、DTO 与命令写入 | [CLI字段账本](./开发/CLI字段账本.md) |
| CLI 架构与模板 | [CLI脚手架设计](./开发/CLI脚手架设计.md) |
| Console 业务证据 | [Console 对齐入口](./对齐/README.md) |
| 使用说明 | [使用文档目录](./使用/README.md) |
| 手工与探索测试 | [手动测试](./验证/手动测试.md)、[探索测试清单](./验证/探索测试清单.md) |
| 当前 dev 结果 | [2026-08-17 dev 报告](./验证/reports/2026-08-17-dev.md) |

## 9. 禁止重新引入的偏差

- 不改浏览器项目来迁就 CLI。
- 不根据资源中文展示名猜 `artifactMode`、类型或 API 字段。
- 不把 Console 页面步骤直接翻译成命令树。
- 不把“接口支持某字段”当作“Console 当前业务需要该字段”；必须先查 Console 源码证据。
- 不把视频转码、内嵌预览或其他 Console 不具备的能力擅自加入发行主流程。
- 不恢复 Webpack 模板或旧脚手架配置。
- 不把测试 skip、dry-run 或 mock 结果写成真实 dev 通过。
- 不在多个文档复制账号密码；凭据变化时只更新本文 §3.2 和本地 ignored JSON。

## 10. 官方使用文档交付状态

`docs/新方案/使用/` 已按官方用户文档重写，设计目标是整目录复制到文档站后仍可独立阅读：

- production 当前硬禁用；公开示例以 `<env>` 表示获授权的 dev/test 环境，不暴露内部域名、测试账号或密码。
- 目录内不链接仓库的开发、对齐、验证、源码和报告文档。
- 已补齐安装升级、快速上手、选型、完整生命周期、自动化、排错和 Console 差异。
- `package` 预设仍按 2026-08-17 裁决暂停验收，公开使用文档不承诺该路径。
- `documentationGovernance.test.ts` 会阻止内部路径、验证编号、测试环境示例、敏感账号、
  `init package`、内部 `cover` 命令和跨目录相对链接重新进入公开文档。
- 公开命令表面已同步收口：`cover` 与 `meta` 只在 `FREELOG_DEV=1` 下挂载；
  `dep add/remove/update/list` 已恢复 `--session` / `--resource-id` / `--export-project` 参数，
  且不再显示无关的 reuse 参数。

**发布阻断：** production 暂未开放，`使用/` 只能作为获授权环境的文档源，暂不能按“正式环境发行教程”
上线。解除禁用后，还必须确认 npm 包名与发布配置一致。仓库当前包名是 `@freelog-cli/cli2`、版本
`0.5.0`；此前 `@freelog-cli/cli2` 的 `latest=0.0.13` 记录不能作为新包的发布依据。届时确认目标包
的 `latest` 指向 `0.5.0`，再用全新目录执行：

```text
npm install --global @freelog-cli/cli2@latest
freelog-cli --version
freelog-cli --help
```

只有安装结果为 `0.5.x` 且安装包 smoke 通过，才能把 `使用/` 标记为已正式发布。文档内容可交付，
但在 npm dist-tag 修正前不得提前上线，避免用户按新文档操作旧 CLI。
