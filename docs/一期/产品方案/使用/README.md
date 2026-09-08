# Freelog CLI 使用手册

这套命令只处理**单资源**：普通文件资源、主题和插件。每份资源有独立的本地身份和版本工作稿；合集、批量发行、前端库模板、支付、session 与 studio 多账号不在本期范围。

## 先安装 CLI

CLI 要求 Node.js 20 或更高版本。确认版本后，用 npm 全局安装：

```powershell
node --version
npm install --global @freelog-cli/cli2
freelog-cli --cli-version
```

若最后一条提示找不到 `freelog-cli`，先重新打开终端；仍无效时，检查 npm 的全局可执行目录是否已经加入 `PATH`。不要以仓库内的 `node packages/...` 命令替代正常使用方式，那只用于本项目开发。

安装完成后运行：

```powershell
freelog-cli --help
```

顶层帮助会打印这份本机手册的绝对路径。CLI 不会联网下载文档；发布包内自带完整手册。

## 使用前先知道

开始操作前请先明确两件事：

1. 当前联调使用 `--env dev` 或 `--env test`；省略环境会按 `prod` 处理，而 prod 目前被 CLI 拦截。
2. 所有命令都以 `--cwd <工程目录>`（或当前目录）定位工程和账号选择器；一个工程有多份资源身份时，必须再给 `--file <已记录路径>` 选中目标资源。

文档仅供阅读，不会在执行命令时修改工程状态。

## 从哪一篇开始

| 你的目标 | 阅读 |
|---|---|
| 第一次登录并发行一个普通文件 | [快速开始](./01-快速上手.md) |
| 先按自己所处的情形找到完整操作路径 | [按场景操作](./09-按场景操作.md) |
| 创建、发新版本、接入已有资源 | [日常操作](./02-日常路径.md) |
| 创建主题或插件并发布构建产物 | [主题与插件](./03-主题与插件.md) |
| 继续、覆盖或丢弃未提交的版本内容 | [版本工作稿](./04-版本工作稿.md) |
| 修改展示信息、策略和上下架 | [资源管理](./05-资源管理.md) |
| 命令失败后的处理方式 | [常见问题](./06-常见情况与报错.md) |
| 环境、登录和本地文件 | [环境与账号](./07-环境与凭据.md) · [本地文件](./08-本地文件参考.md) |

## 三条常用路径

```text
普通文件：login → init . → create → create-version --prepare → create-version --yes
主题/插件：login → init theme|widget . --template <id> → create → 构建产物 → create-version --yes
已有资源：login → bind →（无线上版本则 create-version；有线上版本则 draft pull → update-version）
```

`create` 只创建线上资源壳，`create-version` 才提交首个 `1.0.0`，`update-version` 才提交后续版本。`version show --local` 看的是未提交工作稿；不带 `--local` 的 `version show` 看的是线上已发版本。

## 通用参数

| 参数 | 含义 |
|---|---|
| `--env dev|test` | 选择联调环境。推荐每次显式传入。 |
| `--cwd <dir>` | 工程目录；决定 `.freelog/` 与工作区账号选择器的位置。 |
| `--file <path>` | 在多资源工程选择已记录身份；在 `create` / `bind` 时记录本地路径。发版时它不是上传路径。 |
| `--artifact <path>` | `create-version` / `update-version` 的本次上传路径，及 `version set` 要记录的新路径。多资源时与 `--file` 一起使用。 |
| `--yes` | 不进行交互确认；不会放宽校验，也不会覆盖已有文件。 |
| `--json` | 将 CLI 错误输出为 `{ "code", "message" }`。 |

新脚本只使用 `--type`，不要使用 `--resource-type`；后者仅为迁移期兼容别名，CLI 会给出弃用警告。`--scaffold`、`artifactMode`、`publish` 和 `release` 不存在于当前命令面。

## 先记住四条规则

1. `init` 只创建本地身份，`create` 只创建线上资源壳，`bind` 只接入已有线上资源；三者都不会上传或发布版本。
2. 无线上版本时只能用 `create-version` 发布固定的 `1.0.0`；已有线上版本时只能用 `update-version --version ...` 或 `--bump ...`。
3. 每次真实发版都会从当前文件或构建目录重新上传、分析；工作稿里的旧 SHA1 不能替代已丢失的产物。
4. 主题/插件传构建目录，CLI 临时压缩目录内容；普通资源传单个文件。两类资源都不需要、也不能由用户先手工打 zip。
