# @freelog-cli/cli

Freelog 资源脚手架与发行 CLI。目标态只使用 `freelog.manifest.json` + `.freelog/state.json`，平台接口从 `@freelog/tools-lib2/node` 进入。

**身份凭据：** 自 `--cwd` 向上查找 `.freelog-auth`，未命中则回退 `~/.freelog-auth`；`login` 默认写工作区，`login -g` 写全局。**写入时加密 token/authorization/cookie，读取时解密**（AES-256-GCM；默认密钥 `~/.freelog-cli/auth.key`）。详见 [DESIGN.md](../../DESIGN.md)「本地加密」与 [全局参数与登录](../../docs/新方案/使用/全局参数与登录.md)。

联调 `devfreelog.com` 使用 `--env dev`。

完整使用说明见 [CLI 使用文档目录](../../docs/新方案/使用/README.md)（建议从 [快速上手](../../docs/新方案/使用/快速上手.md) 开始）。源码依赖方向见 [ARCHITECTURE.md](./src/ARCHITECTURE.md)。

## 命令面

| 类型 | 命令 |
|---|---|
| 全局 | `login` `logout` `status` `bind` `pull` |
| 类型 | `type list` `type search` `type info` |
| 初始化 | `init` |
| 独立资源 | `create` `update` `version set` `publish` `draft *` `dep *` `policy *` `online` `offline` `version edit` |
| 多资源 | `resource import-dir` |
| 合集 | `collection create` `collection item *` `collection version set` `collection publish` `collection collect-rules *` `collection rss *` |
| 交互壳 | `session`（11 · 全临时 TTY） `studio`（10 · 多账号工作区 TTY） |

四模式 10/11 说明见 [交互会话与多账号工作区](../../docs/新方案/使用/交互会话与多账号工作区.md)。

## 示例

已有主题 / 插件项目接入：

```bash
freelog-cli type search 主题
freelog-cli init . --scaffold none --resource-type <themeCode> --artifact-mode directory-zip --runtime 0.5 --yes
pnpm build
freelog-cli create
freelog-cli version set --version 1.0.0 --file dist --runtime 0.5
freelog-cli publish
```

通过模板新建主题 / 插件项目：

```bash
freelog-cli init theme my-theme --template vite-react-ts --runtime 0.5 --yes
cd my-theme
pnpm build
freelog-cli create
freelog-cli version set --version 1.0.0 --file dist --runtime 0.5
freelog-cli publish
freelog-cli policy apply --from-file ./policy.json --yes
freelog-cli online --yes
```

图片文件夹作为多个独立资源：

```bash
freelog-cli resource import-dir ./photos --resource-type <imageCode> --title-prefix "照片" --yes
```

图片文件夹作为合集：

```bash
freelog-cli init album --scaffold collection --resource-type <collectionCode> --yes
cd album
freelog-cli collection create
freelog-cli collection item import-dir ../photos --resource-type <imageCode> --yes
freelog-cli collection version set --version 1.0.0 --description "first album"
freelog-cli collection publish --yes
freelog-cli policy apply --from-file ./policy.json --yes
freelog-cli online --yes
```

## 本地文件

- `freelog.manifest.json`：用户意图，提交 git。
- `.freelog/state.json`：CLI 平台状态，不提交 git。

CLI 不读取旧配置文件，不执行用户 JS/TS 配置。
