# CLI 验证入口与固定素材

这里仅保留稳定、只读的测试素材。临时项目、平台绑定状态和报告不得写回 `test/`。

完整的执行门槛、覆盖矩阵与“大改动全量 / 单命令定向”的规则见 [DEV-全流程测试计划](./DEV-全流程测试计划.md)。以后要求“dev 全流程测试”时，直接按该计划第 3 节执行。

## 真网端到端（dev API，primary 账号）

在仓根执行：

```bash
node test/run-all-scenarios.mjs --env dev          # 先 pnpm build 再跑
node test/run-all-scenarios.mjs --env dev --skip-build   # 跳过 build
node test/verify-commands.mjs --env dev            # 管理面、工作稿、主题与 bind
node test/verify-scenarios.mjs --env dev           # S3/S11/S13/S16/S17/S19/S39/S41
node test/verify-field-rules.mjs --env dev         # 字段边界与 140 字平台回读
node test/discover-optional-config.mjs --env dev   # 只读列出实际支持可选配置的叶子类型
node test/verify-optional-config.mjs --env dev     # 可选配置 add/set/rm 的首版、更新版与线上读回
node test/verify-theme-image-full-lifecycle.mjs --env dev # 主题模板与照片各自完整首版/更新版链
node test/verify-multi-resource-tty.mjs --env dev  # 伪终端真实选择同工程第二份资源
node test/verify-draft-safety.mjs --env dev        # 未发布资源上的工作稿确认/重置安全性
node test/run-final-acceptance.mjs --env dev       # 只在全部真网能力完整时返回 PASS
```

## 场景证据矩阵

| 脚本 | 真网场景 / 重点 | 平台影响 |
|---|---|---|
| `run-all-scenarios` | 首版、更新、依赖、策略、上下架；主题目录压缩 | 创建并发行测试资源，脚本下架收尾 |
| `verify-commands` | 管理面、工作稿编辑、bind / 换绑、主题文本/下拉可选配置、登录失败 | 创建并发行测试资源，脚本下架收尾；事件策略 DSL 若仍被平台拒绝，单列 `BLOCKED` |
| `verify-scenarios` | S3、S11、S13、S16、S17、S19、S39、S41 与只读命令 | 创建并发行测试资源，脚本下架收尾 |
| `verify-field-rules` | 标题、属性、依赖、版本号；140 字属性真实提交与回读 | 创建并发行测试资源，脚本下架收尾；依赖统一使用本地资源池。它固定 RT006003 为“不支持”能力控制组；支持类型的完整提交与读回由 `verify-optional-config` 覆盖 |
| `discover-optional-config` | 只读扫描启用单资源叶子的详情能力，发现可选配置候选 | 只在系统临时目录登录后查询类型；不创建资源、不上传、不写回仓库。无候选为 `BLOCKED`，有候选为 `READY`，仍不替代完整验收 |
| `verify-optional-config` | 属性 add/set、依赖签约、文本/下拉可选配置 add/set/rm、首版/更新版读回 | 创建并发行测试资源，脚本下架收尾；先用 `type info <code>` 确认“可选配置：支持”，再为该类型提供适配文件或目录 fixture；任一项缺失以 `BLOCKED` 退出 |
| `verify-theme-image-full-lifecycle` | 主题从线上模板创建、目录 zip 首版/更新版；照片单文件首版/换图更新版；每条资源自身均含属性、文本/下拉可选配置、显式策略依赖和线上读回 | 创建并发行两份测试资源，成功后下架；主题使用模板创建后的用户构建 `dist` fixture，不渲染模板内项目名/版本占位符 |
| `verify-paid-dep` | 从资源池动态选择未授权的启用付费策略；未给策略 ID 必须停止，给精确策略后签约并写入工作稿 | 创建临时测试资源并建立一份付费签约；脚本下架资源。资源池全部已授权时明确 `BLOCKED`，不会拿已授权路径冒充签约覆盖；支付和“带未支付依赖发版”的平台结果只记录，不属于 CLI 成功条件 |
| `run-resource-pool-scenarios` | 从资源池选定一条带策略 ID 的依赖，验证显式策略选择与本地工作稿写入 | 创建未发布临时资源壳并在结束时下架；不 bind、修改或发行资源池中的既有资源 |
| `verify-multi-resource-tty` | S63 TTY 选择、S65 跨工作区标题同步、S66 多资源 create / bind | 只创建未发布资源壳，临时工程删除；所有平台统一使用根开发依赖 `node-pty`；驱动不可用时以 `BLOCKED` 退出 |
| `verify-draft-safety` | S67 非 TTY / TTY 确认、reset 预检和删除范围 | 只创建未发布资源壳，临时工程删除；所有平台统一使用根开发依赖 `node-pty`；驱动不可用时以 `BLOCKED` 退出 |

覆盖主链：prod 门禁 → login → init → create → `create-version --prepare` → `version show --local` → `create-version --yes`（POST 1.0.0，成功删稿）→ `version show`（线上）→ `policy apply/list` → `validate --for online` → `online` → `status` 终态 → `offline` 收尾。

## 最终真网验收标准

“功能覆盖”指每项当前受支持功能都要有真实平台全链路证据，而不只是一条主链成功；属性、可选配置、依赖、策略模板与开关、listing、版本工作稿、首版/更新版、上架/下架都在范围内。即使某项在产品上是非必填字段或可跳过步骤，也不能只靠单测或能力门禁拒绝就标为已验收。

若 dev 缺少支持某项功能的资源类型、样例产物或后端契约，该项必须记录为**阻塞**，不能跳过或降级为通过；待能力可用后补跑真实创建、提交、读回和相邻生命周期操作。支付仍不属于本期 CLI：依赖已有授权或签约成功即可写入工作稿；付费由用户在浏览器端完成，不阻塞依赖声明或版本提交。

最终结论当前运行 `node test/run-final-acceptance.mjs --env dev`。它先要求 primary 凭据、依赖资源池、可选配置类型与产物的私有 fixture，以及根开发依赖 `node-pty` 的可用伪终端驱动。少任一项就输出 `BLOCKED` 并以非零退出。它再顺序运行所有已接入真网脚本：任何 CLI 回归为 `FAIL`；已知的后端事件模板编译不兼容、资源池无法提供 primary 未授权的付费策略，或其它平台能力不足为 `BLOCKED`；**只有每项都真实通过时才输出 `PASS`**。但版本更新、资源管理和全命令参数组合仍有专项缺口。在 `verify-version-update.mjs`、`verify-resource-management.mjs`、`verify-command-contracts.mjs` 接入前，`PASS` 只能表述为“已接入脚本通过”，不能表述为完整 dev 全流程验收。`--json` 目前只对 `CliError` 输出稳定 `{ code, message }`；成功分支仍输出文本。成功 JSON 契约的设计、实现和验证完成前，所有命令/参数全覆盖不成立。详见 [DEV-全流程测试计划 §4.1](./DEV-全流程测试计划.md#41-版本更新专项矩阵必须逐项验收)、[§4.2](./DEV-全流程测试计划.md#42-资源管理专项矩阵必须逐项验收) 与 [§5](./DEV-全流程测试计划.md#5-全命令与参数组合验收契约)。

`verify-multi-resource-tty.mjs` 创建三个未发布的 dev 资源壳。所有平台经同一个 `node-pty` 适配器以真正的伪终端完整校验选择菜单内容：选择第二项执行 `status` 和 `update --title`；随后从另一工作区修改该标题并验证精确/批量 `resource sync`，最后在另一工程连续 bind 三份资源，断言状态只按编号新增。没有可用驱动时脚本以 `BLOCKED` 退出，不会继续把 TTY 结论记为通过。临时工程会删除；线上资源壳保留为 dev 审计记录。

`verify-draft-safety.mjs` 同样只创建一个未发布资源壳，不发行版本；它验证非交互缺 `--yes`、真正 TTY 中的默认取消和 `--reset` 的缺失产物预检均保留工作稿，再验证带 `--yes` 的重置和丢稿只作用于当前状态。没有可用伪终端时以 `BLOCKED` 退出。

### TTY 驱动

根目录精确锁定的 `node-pty@1.1.0` 是唯一 TTY 测试驱动。pnpm 只批准它运行原生构建脚本；其它依赖仍保持禁止。它在 Windows 使用 ConPTY、在 macOS/Linux 使用系统 PTY，但测试代码只经 `test/tty-driver.mjs` 的统一 `spawn/onData/write` 接口运行。每次真网脚本开始前，驱动会先检查 Node 的 `stdin` / `stdout` 均为 TTY，再用 CLI 实际依赖的 Inquirer `select` 执行“下移并选择第二项”；失败时不创建测试资源，直接 `BLOCKED`。短生命周期测试入口在结果写出后显式退出，避免原生 PTY 句柄让 Node 保活。若目标机器缺少该原生模块的预构建产物，按 node-pty 上游要求安装本机 C++ 构建工具后重新执行 `pnpm install`。它是开发测试依赖，不会进入 `@freelog-cli/cli2` 的发布包，也不改 CLI 的交互判断。

- 环境只认 `--env dev` / `--env test`；**prod 硬禁用**，脚本直接退出 2。
- 报告写入系统临时目录 `freelog-runtime-cli-verification/latest.txt`，不落回 `test/`。
- 临时工程在系统临时目录创建并清理；已发布的测试资源保留在 primary 账号的下架态，TTY 验证创建的资源保留为未发布壳，供 Console 复查。

### 凭据

只用 `test/.freelog-test-credentials.local.json`（gitignore，不会提交）：

- **账号权限（dev）：只有主账号 `primary` 可以发行和管理资源。** 辅账号 `secondary` 不具发行/管理权限，禁止用于任何写平台场景。
- production 不配置凭据，也不执行 prod smoke。

可选配置最终验收还需要 `test/.freelog-test-optional-config.local.json`（同样 gitignore）。先通过 `freelog-cli type info <typeCode> --env dev` 确认输出为“可选配置：支持”，再填写：

```json
{
  "typeCode": "dev 中启用且支持可选配置的最终叶子类型",
  "artifact": "fixtures/与该类型匹配的真实文件或目录"
}
```

不要填写资源 ID、账号信息或策略 ID。该脚本创建自己的临时资源，实际验证文本和下拉配置的 add / set / rm、首版和更新版提交及线上读回。

没有可填的 `typeCode` 时先运行 `node test/discover-optional-config.mjs --env dev`。它只在系统临时目录登录并查询类型详情，不创建资源、不上传、也不写回仓库：没有候选会以 `BLOCKED` 列出平台事实；有候选则列出 code/name，仍需要人工为该类型配对仓内真实产物。它刻意不尝试用视频、图片或主题目录“碰运气”建壳。

### 凭据加密

`login` 将 token / cookie（AES-256-GCM，iv/tag）加密写入 `.freelog/auth`（工作区）或 `~/.freelog-auth`（`--global`）。dev 环境登录态在 `Set-Cookie`（`authInfo` + `uid`），`login` 已一并捕获。

## 素材

- `fixtures/media/sample-image.png`：图片资源及封面素材。
- `fixtures/media/sample-cover.png`：800×800 封面素材。
- `fixtures/media/sample-video.mp4`：视频素材（端到端主链用）。
- `fixtures/theme-artifact/`：无需安装依赖的最小主题构建产物。
- `fixtures/policies/free.json`：免费策略样例（`FOR PUBLIC` / `terminate`，`status: 1`）。

## 手工最小链（新 CLI 命令）

```bash
cd <某临时目录>
freelog-cli login --login-name <primary> --password-stdin --yes --env dev   # 密码走 stdin
# 先把素材拷进本目录，再用它建立本地身份：
freelog-cli init . --type RT006003 --artifact sample-video.mp4 --yes --env dev
freelog-cli create --title smoke --type RT006003 --name smoke-<rand> --artifact sample-video.mp4 --yes --env dev
freelog-cli create-version --prepare --yes --env dev       # 上传+解析，不 POST
freelog-cli version show --local --env dev                 # 看工作稿
freelog-cli create-version --yes --env dev                 # POST 1.0.0，成功删稿
freelog-cli policy apply --from-file <test>/fixtures/policies/free.json --yes --env dev
freelog-cli validate --for online --yes --env dev
freelog-cli online --yes --env dev
freelog-cli offline --yes --env dev                        # 收尾下架
```

注意：

- `--artifact` 必须是当前工程内的相对路径；绝对路径和 `..` 越界路径都会被拒绝。
- 发新号走 `version draft pull` → 改稿 → `update-version`，不要用 `create-version`。
- 一夹多条必须用 `--resource` 指定或在 TTY 中选择；只有一条可省。`--artifact` 只表示要上传的文件或构建目录。

本目录不应出现 `.freelog/`、`.freelog-auth`、时间戳工程或运行日志。
