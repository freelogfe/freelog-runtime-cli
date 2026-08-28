# CLI 验证入口与固定素材

这里仅保留稳定、只读的测试素材。临时项目、平台绑定状态和报告不得写回 `test/`。

## 全场景真实验证（dev API）

在仓根执行。凭据优先级：**环境变量** → **`test/.freelog-test-credentials.local.json`（gitignore，dev 联调用）** → 主账号回退本机 `~/.freelog-auth` session。

环境变量（CI / 临时覆盖）：

```text
FREELOG_TEST_LOGIN_NAME
FREELOG_TEST_PASSWORD
FREELOG_TEST_SECONDARY_LOGIN_NAME
FREELOG_TEST_SECONDARY_PASSWORD
```

本地文件（推荐 dev 联调）：复制 `test/.freelog-test-credentials.local.example.json` 为 `test/.freelog-test-credentials.local.json` 并填入 dev 主/辅账号。production 当前硬禁用，不配置 prod 凭据，也不执行 prod smoke。该文件已 gitignore，不会提交。

**凭据加密（核心）：** `login` 会将 `token` / `authorization` / `cookie` **加密后**写入 `.freelog-auth`；读取使用时解密。默认主密钥：`~/.freelog-cli/auth.key`（首次 login 自动创建）。可选 `FREELOG_CRYPTO_KEY`（CI）。契约见 [DESIGN.md](../DESIGN.md)「身份与凭据 · 本地加密」。

**P6-4 冻结 fixture（可选）：** 复制 `test/.freelog-test-fixtures.local.example.json` → `test/.freelog-test-fixtures.local.json`，在 Console **手动冻结**测试资源后填入 `frozenResourceId`（dev 账号不能 API 写 `status:2`）。或设置 `FREELOG_TEST_FROZEN_RESOURCE_ID`。验证：

```bash
pnpm --filter @freelog-cli/cli2 provision:frozen-fixture
pnpm --filter @freelog-cli/cli2 verify:p6-parity --env dev
```

Console 字段源码漂移检查另使用 `FREELOG_CONSOLE_ROOT`，值为 Console 仓库的 `packages/console` 目录；如果 Console 仓库与本仓库同级则无需设置。

然后运行：

```bash
node test/run-all-scenarios.mjs --env dev
pnpm --filter @freelog-cli/cli2 verify:session-smoke --env dev
pnpm --filter @freelog-cli/cli2 verify:p6-parity --env dev
```

- **`verify:session-smoke`**：01 命令会话（`--session` flag），非交互壳。
- **L3-H 交互壳**（10/11 TTY）：人工清单见 [探索测试 L3-H](../docs/新方案/一期/验证/探索测试清单.md#l3-h-交互壳session--studio)；CI 仅覆盖 `interactiveSession`/`interactiveStudio` 单测。

覆盖：`verify:scenarios` + L2 健壮性（NEG/BATCH/JSON/CHAOS）+ parity 子脚本；**不含** session-smoke / p6-parity（须单独跑，见上）。场景索引见 [`场景目录`](../docs/新方案/一期/验证/场景目录.md)。

手动测试统一入口：[`docs/新方案/一期/验证/手动测试.md`](../docs/新方案/一期/验证/手动测试.md)。

## 素材

- `fixtures/media/sample-image.png`：图片资源及封面素材。
- `fixtures/media/sample-cover.png`：800×800 封面素材。
- `fixtures/media/sample-video.mp4`：视频与视频合集素材。
- `fixtures/theme-artifact/`：无需安装依赖的最小主题构建产物。
- `fixtures/policies/`：策略输入样例。

## 推荐测试

单图片：

```bash
freelog-cli init image-smoke --scaffold none --resource-type <imageCode> --yes
cd image-smoke
freelog-cli create
freelog-cli version set --file ../test/fixtures/media/sample-image.png --version 1.0.0
freelog-cli publish
```

主题产物：

```bash
mkdir theme-smoke && cd theme-smoke
freelog-cli init theme . --runtime 0.5 --skip-install --yes
# 将 test/fixtures/theme-artifact 的内容复制到 ./dist
freelog-cli create
freelog-cli publish
```

本目录不应出现 `freelog.manifest.json`、`.freelog/`、`.freelog-auth`、时间戳工程或运行日志。全场景运行报告写入系统临时目录 `freelog-runtime-cli-verification/latest.txt`。
