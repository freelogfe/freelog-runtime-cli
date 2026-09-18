# @freelog-cli/cli2

Freelog 单资源 CLI：支持普通文件资源、主题与插件的初始化、创建、发版本和管理。

## 安装

需要 Node.js 20 或更高版本：

```powershell
npm install --global @freelog-cli/cli2
freelog-cli --cli-version
freelog-cli --help
```

若命令找不到，请重新打开终端，并确认 npm 的全局可执行目录已在 `PATH` 中。

## 从哪里开始

首次使用在交互终端运行 `freelog-cli login --env dev`，再按 [完整使用手册](./dist/docs/README.md) 的“快速开始”创建和发行第一个资源。`freelog-cli --help` 同时会打印安装后该手册的本机绝对路径。

正式环境目前由 CLI 拦截；联调时显式传 `--env dev` 或 `--env test`。
