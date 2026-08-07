# @freelog-cli/cli

Freelog 资源脚手架与发行 CLI。目标态只使用 `freelog.manifest.json` + `.freelog/state.json`，平台接口从 `@freelog/tools-lib2/node` 进入。
登录凭据默认保存到用户级 `.freelog-auth`，不会写入项目目录；联调 `devfreelog.com` 使用 `--env dev`。

完整使用说明、Console 流程差异和多场景命令链见 [CLI使用说明与Console差异](../../docs/新方案/使用/CLI使用说明与Console差异.md)。

## 命令面

| 类型 | 命令 |
|---|---|
| 全局 | `login` `logout` `status` `bind` `pull` |
| 类型 | `type list` `type search` `type info` |
| 初始化 | `init` |
| 单品 | `create` `update` `version set` `publish` `draft *` `dep *` `policy *` `online` `offline` `version edit` |
| 多资源 | `resource import-dir` |
| 合集 | `collection create` `collection item *` `collection version set` `collection publish` `collection collect-rules *` `collection rss *` |

## 示例

已有主题 / 插件项目接入：

```bash
freelog-cli type search 主题
freelog-cli init . --scaffold none --resource-type <themeCode> --runtime 0.5 --yes
pnpm build
freelog-cli create
freelog-cli version set --version 1.0.0 --file dist --runtime 0.5
freelog-cli publish
```

通过模板新建主题 / 插件项目：

```bash
freelog-cli type search 主题
freelog-cli init my-theme --scaffold runtime --template vite-react-ts --resource-type <themeCode> --runtime 0.5 --yes
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
