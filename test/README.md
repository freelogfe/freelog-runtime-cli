# CLI manual test fixtures

这里保留真实手动测试素材，不放旧 CLI 配置。

## 素材

- `abcdef.png`: 单图片资源测试素材。
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
