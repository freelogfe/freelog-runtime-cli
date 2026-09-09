# CLI 验证入口与固定素材

这里仅保留稳定、只读的测试素材。临时项目、平台绑定状态和报告不得写回 `test/`。

## 真网端到端（dev API，primary 账号）

在仓根执行：

```bash
node test/run-all-scenarios.mjs --env dev          # 先 pnpm build 再跑
node test/run-all-scenarios.mjs --env dev --skip-build   # 跳过 build
node test/verify-commands.mjs --env dev            # 管理面、工作稿、主题与 bind
node test/verify-scenarios.mjs --env dev           # S3/S11/S13/S16/S17/S19/S39/S41
node test/verify-field-rules.mjs --env dev         # 字段边界与 140 字平台回读
node test/verify-multi-resource-tty.mjs --env dev  # 伪终端真实选择同工程第二份资源
node test/verify-draft-safety.mjs --env dev        # 未发布资源上的工作稿确认/重置安全性
```

## 场景证据矩阵

| 脚本 | 真网场景 / 重点 | 平台影响 |
|---|---|---|
| `run-all-scenarios` | 首版、更新、依赖、策略、上下架；主题目录压缩 | 创建并发行测试资源，脚本下架收尾 |
| `verify-commands` | 管理面、工作稿编辑、bind / 换绑、主题能力门禁、登录失败 | 创建并发行测试资源，脚本下架收尾 |
| `verify-scenarios` | S3、S11、S13、S16、S17、S19、S39、S41 与只读命令 | 创建并发行测试资源，脚本下架收尾 |
| `verify-field-rules` | 标题、属性、依赖、版本号；140 字属性真实提交与回读 | 创建并发行测试资源，脚本下架收尾；当前稳定真网批次只真测可选配置能力门禁，字段细则由单测覆盖 |
| `verify-multi-resource-tty` | S63 TTY 选择、S65 跨工作区标题同步、S66 多资源 create / bind | 只创建未发布资源壳，临时工程删除 |
| `verify-draft-safety` | S67 非 TTY / TTY 确认、reset 预检和删除范围 | 只创建未发布资源壳，临时工程删除 |

覆盖主链：prod 门禁 → login → init → create → `create-version --prepare` → `version show --local` → `create-version --yes`（POST 1.0.0，成功删稿）→ `version show`（线上）→ `policy apply/list` → `validate --for online` → `online` → `status` 终态 → `offline` 收尾。

`verify-multi-resource-tty.mjs` 创建三个未发布的 dev 资源壳，以 `expect` 提供伪终端，完整校验选择菜单内容；它会选择第二项执行 `status` 和 `update --title`，再从另一工作区修改该标题并验证精确/批量 `resource sync`，最后在另一工程连续 bind 三份资源，断言状态只按编号新增。临时工程会删除；线上资源壳保留为 dev 审计记录。

`verify-draft-safety.mjs` 同样只创建一个未发布资源壳，不发行版本；它验证非交互缺 `--yes`、TTY 默认取消和 `--reset` 的缺失产物预检均保留工作稿，再验证带 `--yes` 的重置和丢稿只作用于当前状态。

- 环境只认 `--env dev` / `--env test`；**prod 硬禁用**，脚本直接退出 2。
- 报告写入系统临时目录 `freelog-runtime-cli-verification/latest.txt`，不落回 `test/`。
- 临时工程在系统临时目录创建并清理；已发布的测试资源保留在 primary 账号的下架态，TTY 验证创建的资源保留为未发布壳，供 Console 复查。

### 凭据

只用 `test/.freelog-test-credentials.local.json`（gitignore，不会提交）：

- **账号权限（dev）：只有主账号 `primary` 可以发行和管理资源。** 辅账号 `secondary` 不具发行/管理权限，禁止用于任何写平台场景。
- production 不配置凭据，也不执行 prod smoke。

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
freelog-cli init . --type RT006003 --yes --env dev
# 把素材拷进本目录后：
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

- `--artifact` 必须落在当前工程里（相对或绝对均可）。
- 发新号走 `version draft pull` → 改稿 → `update-version`，不要用 `create-version`。
- 一夹多条必须用 `--resource` 指定或在 TTY 中选择；只有一条可省。`--artifact` 只表示要上传的文件或构建目录。

本目录不应出现 `.freelog/`、`.freelog-auth`、时间戳工程或运行日志。
