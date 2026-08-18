# CLI 交接文档

最后更新：2026-08-18

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
6. CLI 使用仓库内 `packages/tools-lib` 提供的 `@freelog-cli/tools-lib2/node`；浏览器项目保持原依赖，不迁移。
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
| CLI 内 tools-lib2 | `D:\appinside\freelog-runtime-cli\packages\tools-lib` |
| 当前产品设计 | `D:\appinside\freelog-runtime-cli\DESIGN.md` |
| 新方案文档 | `D:\appinside\freelog-runtime-cli\docs\新方案` |
| Console 资源页证据 | `D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource` |
| 浏览器仓 tools-lib 原位置 | `D:\appinside\freelogfe-web-repos\packages\@freelog\tools-lib` |
| 旧脚手架参考 | `D:\appinside\freelog-runtime-cli\backup\freelog-cli-ts-copy` |
| 测试资产与工程 | `D:\appinside\freelog-runtime-cli\test` |
| 主题发布测试工程 | `D:\appinside\freelog-runtime-cli\test\my-freelog-project` |
| dev 本地凭据 | `D:\appinside\freelog-runtime-cli\test\.freelog-test-credentials.local.json` |
| 最新综合报告 | `D:\appinside\freelog-runtime-cli\docs\新方案\验证\reports\2026-08-17-dev.md` |

## 3. 环境与测试凭据

### 3.1 三个环境

| 环境 | CLI 值 | API | Console | 状态 |
|---|---|---|---|---|
| 生产 | `production` / `prod` | `https://api.freelog.cn` | `https://console.freelog.cn` | **当前 CLI 硬禁用** |
| 测试 | `test` | `https://api.testfreelog.com` | `https://console.testfreelog.com` | 获授权后可用 |
| 开发 | `dev` / `development` | `https://api.devfreelog.com` | `https://console.devfreelog.com` | 当前真实联调环境 |

当前真实联调统一使用 **dev**，所有写命令显式传入 `--env dev`。`production` / `prod` 在 CLI 中
会以 code 4 明确失败，不会请求 API、生成 Console 链接或写入平台；不得把 dev 通过结论冒充 prod
签字。production 重新开放前，不执行任何 prod smoke。

### 3.2 dev 联调凭据（仅本地）

仓库和文档不保存密码、token、cookie、authorization 或密钥。真实环境验证需要两组
由负责人另行安全分发的 dev 账号：primary 用于常规资源生命周期，secondary 用于 Studio
多账号、跨 owner 拒绝和身份隔离。接手者将其写入受保护环境变量，或从
`test/.freelog-test-credentials.local.example.json` 复制生成已被 `.gitignore` 排除的
`test/.freelog-test-credentials.local.json`；不得把真实值填回 example、本文、日期化报告、
测试输出、manifest、state、源码或生产配置。

历史版本曾把 dev 密码写入被 Git 跟踪的本文；从当前文件删除不会清除 Git 历史。因此两组 dev
密码在继续共享或长期联调前必须轮换。密码轮换属于外部账号操作，不通过改写仓库历史伪装完成；
轮换后只更新安全凭据系统和各自的本地 ignored JSON。

自动化测试优先读取：

```text
环境变量
  -> test/.freelog-test-credentials.local.json
  -> 仅主账号可回退本机 ~/.freelog-auth session
```

验证脚本登录时必须通过 `--password-stdin` 将密码写入子进程标准输入，不得把密码拼接到 shell
命令或 CLI argv。人工登录使用隐藏输入提示。

手工登录示例：

```powershell
cd D:\appinside\freelog-runtime-cli\packages\cli
node dist/bin/index.js login --env dev
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

仓库通过 workspace 使用本地 tools-lib2：

```yaml
packages:
  - packages/*
  - packages/templates/*
```

`packages/tools-lib` 是私有 workspace，CLI 构建时内联其 Node 实现；不会发布 tools-lib，也不会让
最终安装的 CLI 依赖开发机路径或额外的 npm 包。

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
- dev 主场景：132 通过，1 项按范围裁决跳过（`S8b init package`）。
- negative gates：9 通过，1 项因 frozen fixture 跳过。
- batch / JSON / chaos：4/4、12/12、4/4 通过。
- Console parity：10 个子脚本通过，含 `cover` 同步/SSE 一致性。
- session smoke：13/13 通过。
- P6：6 项通过，1 项因 frozen fixture 跳过。
- L3-H：4/4 通过，覆盖双账号 Studio 和非 owner 门禁。
- 四套 Vite runtime 模板均完成真实 init、install、build、create、release、policy、online；
  React TS 与 Vue TS 另完成 1.0.1 更新版本。已发布 npm `@freelog-cli/cli2@0.5.0` 也完成
  隔离全局安装及 primary 的主题首发、上架、listing 更新和 `1.0.1` 发版。package 按 §4 的
  2026-08-17 裁决暂停测试。

跳过不能算通过。当前仍缺两个仓库外条件：

1. **frozen fixture**：dev 普通账号不能通过 API 设置冻结状态，需要在 Console 预置一个由
   primary 拥有且已冻结的资源，并将 ID 写入 `test/.freelog-test-fixtures.local.json`。
2. **RSS fixture**：需要受控 feed、feed owner 邮箱和一次性验证码；已有 dev 账号不足以
   单独完成该链路。

## 7. 下一轮执行顺序

1. 先读本文、根 `DESIGN.md`、[文档入口](./README.md)和最新日期化报告。
2. `git status --short`，确认并保护用户已有改动。
3. 运行 `pnpm --filter @freelog-cli/cli2 verify`；准备发布时再运行
   `pnpm --filter @freelog-cli/cli2 verify:template-registry`，后者在四套 runtime 模板尚未发布为
   npm `latest` 时必须失败。
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
- 不在仓库或文档记录账号密码；凭据变化时只更新安全凭据系统或本地 ignored JSON。

## 10. 官方使用文档交付状态

### 10.1 npm 包名隔离决策

- 已有线上包：`@freelog-cli/cli`，本阶段不得覆盖。
- 当前公司小范围试用包：`@freelog-cli/cli2`，用于独立发布和安装验证，避免影响线上用户。
- `cli2` 是当前试用发布通道，不代表最终正式包名已经定稿。
- 正式发布前必须由负责人明确最终包名、dist-tag、旧包迁移/弃用策略和文档安装命令；在此之前，公司试用、仓库脚本、测试记录和测试安装统一使用 `@freelog-cli/cli2`。

### 10.2 主题/插件模板发布顺序

- 仓库开发和 link 测试优先读取 `packages/templates`，用于验证当前源码。
- 发布安装的 CLI 在本地模板不存在时解析四个 runtime 模板的 npm `latest`，随后按解析出的具体版本缓存和校验。
- 四套 runtime 模板已发布为 `4.0.0`，npm `latest` 均已指向包含 `template.manifest.json` 与 `template/` 的有效 tarball；`verify:template-registry` 已通过。
- 发布 `@freelog-cli/cli2` 前必须保持这四个 latest 有效；反向顺序会导致安装版 `init theme/widget` 失败。
- package 模板仍处于暂停验收状态，本次不切换 latest、不发布、不测试其线上链路。

`packages/tools-lib` 是标记为 `private: true` 的 CLI workspace Node adapter，不发布到 npm。CLI 构建时将其内联进
发行包；用户安装 `@freelog-cli/cli2` 时不需要额外安装 tools-lib。`cli2` 的 `prepublishOnly` 会先构建
该 workspace，再构建 CLI，并在 postbuild 阶段拒绝任何残留的私有包 import 或公开声明引用。

最新真实 dev 回归中，`type pick --category package --json` 在未提供模板上下文时以 code 4 拒绝多个
叶子候选，这是设计正确行为，不能改回任意选取。`verify-scenarios` 将该保护记为 PASS，并将暂停验收的
`init package` 记为显式 SKIP。`verify-cover-parity` 为自身启动的子 CLI 显式传入 `FREELOG_DEV=1`；公开
安装版默认 help 仍不展示 `cover` / `meta`。

runtime 模板和 CLI 的发布命令使用显式的 `release` / `pub` 脚本：

```powershell
pnpm --dir packages/templates/vite-react-ts run pub
pnpm --dir packages/templates/vite-react run pub
pnpm --dir packages/templates/vite-vue-ts run pub
pnpm --dir packages/templates/vite-vue run pub
pnpm --filter @freelog-cli/cli2 verify:template-registry
pnpm --filter @freelog-cli/cli2 run release
```

`cli2` 在 `publishConfig` 固定 `access=public` 与 npm registry；发布顺序是四套 runtime 模板、
模板注册表门禁、CLI；
模板 latest 门禁通过后才允许执行最后一条。

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

**当前发布状态：** `@freelog-cli/cli2@0.5.0` 已发布到 npm 公共 registry，`latest` 已指向 `0.5.0`。
隔离全局安装与 `init theme --template vite-vue-ts` 已成功验证，并解析线上
`@freelog-cli/template-vite-vue-ts@4.0.0`。公司小范围试用人员现在可以按 `使用/` 的安装页操作。

production 仍未开放，`使用/` 只能作为获授权环境的文档源，不能作为正式环境发行教程。此前旧线上包
`@freelog-cli/cli` 的 `latest=0.0.13` 不能替代当前试用包。

确认目标包的 `latest` 指向 `0.5.0` 后，用全新目录执行：

```text
npm install --global @freelog-cli/cli2@latest
freelog-cli --version
freelog-cli --help
```

安装结果为 `0.5.x` 且安装包 smoke 已通过，`使用/` 可以交付给公司小范围试用人员。正式环境开放前，
仍不得将其标记为 production 发行教程。
