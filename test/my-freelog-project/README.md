# my-freelog-project

已有 React 主题项目，用于验证 CLI 接入已有项目、构建目录压缩和主题资源发布。

## Freelog metadata

当前项目已经通过新 CLI 初始化：

- manifest: `freelog.manifest.json`
- local state: `.freelog/state.json`
- resource type: `RT001`
- runtime version: `0.4`
- version file path: `dist`

`.freelog/state.json` 是本地平台状态，不提交；`freelog.manifest.json` 是用户意图，可以提交。

## Commands

```bash
pnpm build
freelog-cli create
freelog-cli version set --file ./dist --version 1.0.0 --runtime 0.4
freelog-cli publish
freelog-cli policy apply --from-file ./policy.json --yes
freelog-cli online --yes
```
