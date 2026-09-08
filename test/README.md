# CLI 验证入口与固定素材

这里仅保留稳定、只读的测试素材。临时项目、平台绑定状态和报告不得写回 `test/`。

## 真网端到端（dev API，primary 账号）

在仓根执行：

```bash
node test/run-all-scenarios.mjs --env dev          # 先 pnpm build 再跑
node test/run-all-scenarios.mjs --env dev --skip-build   # 跳过 build
```

覆盖主链：prod 门禁 → login → init → create → `create-version --prepare` → `version show --local` → `create-version --yes`（POST 1.0.0，成功删稿）→ `version show`（线上）→ `policy apply/list` → `validate --for online` → `online` → `status` 终态 → `offline` 收尾。

- 环境只认 `--env dev` / `--env test`；**prod 硬禁用**，脚本直接退出 2。
- 报告写入系统临时目录 `freelog-runtime-cli-verification/latest.txt`，不落回 `test/`。
- 临时工程在系统临时目录创建并清理；**测试资源保留在 primary 账号**（下架态），供 Console 复查。

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
freelog-cli create --title smoke --type RT006003 --name smoke-<rand> --file sample-video.mp4 --yes --env dev
freelog-cli create-version --prepare --yes --env dev       # 上传+解析，不 POST
freelog-cli version show --local --env dev                 # 看工作稿
freelog-cli create-version --yes --env dev                 # POST 1.0.0，成功删稿
freelog-cli policy apply --from-file <test>/fixtures/policies/free.json --yes --env dev
freelog-cli validate --for online --yes --env dev
freelog-cli online --yes --env dev
freelog-cli offline --yes --env dev                        # 收尾下架
```

注意：

- `--file` 必须落在当前工程里（相对或绝对均可）。
- 发新号走 `version draft pull` → 改稿 → `update-version`，不要用 `create-version`。
- 一夹多条必须 `--file`；只有一条可省。

本目录不应出现 `.freelog/`、`.freelog-auth`、时间戳工程或运行日志。
