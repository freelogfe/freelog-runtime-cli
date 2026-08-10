# CLI manual test fixtures

这里保留真实手动测试素材，不放旧 CLI 配置。

## 全场景真实验证（dev API）

在仓根执行。先通过环境变量提供主、辅验证账号，凭据不得写入仓库：

```text
FREELOG_TEST_LOGIN_NAME
FREELOG_TEST_PASSWORD
FREELOG_TEST_SECONDARY_LOGIN_NAME
FREELOG_TEST_SECONDARY_PASSWORD
```

然后运行：

```bash
node test/run-all-scenarios.mjs --env dev
```

覆盖：`verify:scenarios`（S1–S15）+ `verify:parity`。

**双身份手工测试：**

- 各类用户（主题/插件/图片/小说/短视频）：[`docs/新方案/场景/07-用户身份测试手册.md`](../docs/新方案/场景/07-用户身份测试手册.md)
- 测试人员（负向/漏洞/发版签字）：[`docs/新方案/场景/08-测试人员手册.md`](../docs/新方案/场景/08-测试人员手册.md)

参考录屏：`屏幕录制 2026-08-07 101434.mp4`

## 素材

- `abcdef.png`: 单图片资源测试素材（也可用于 `--cover` / `--video-cover`）。
- `cover-800.png`: 800×800 封面示例（可选）。
- `my-freelog-project/`: 已有 React 主题项目测试素材。

## 推荐测试

单图片：

```bash
freelog-cli init image-smoke --scaffold none --resource-type <imageCode> --yes
cd image-smoke
freelog-cli create
freelog-cli version set --file ../abcdef.png --version 1.0.0
freelog-cli publish
```

已有主题项目：

```bash
cd my-freelog-project
freelog-cli init . --scaffold none --resource-type <themeCode> --runtime 0.4 --yes
pnpm build
freelog-cli create
freelog-cli version set --file ./dist --version 1.0.0 --runtime 0.4
freelog-cli publish
```

本目录不应再出现 `freelog.resource.config.*`、`freelog.version.config.*` 或 `.freelog-auth`。
