# 脚手架设计

本期 `freelog-cli` 产品规格。目录连续编号，只链本夹现行文件。

```
login
  单资源   init? → create [--file] → publish →（管理：policy / update / online）     01-F0
  再发一版 publish --version | --reuse-version                                      02-M0
  合集     collection create → item add <resourceId|username/name> → publish        03-C0
  接入     bind <id|username/name> [--file]                                         04-bind
```

listing / 策略 / 上下架：[ARCHITECTURE/05](./ARCHITECTURE/05-共用管理.md)。  
属性 / 可选配置 / 依赖 / 描述：[PHASE/06](./PHASE/06-属性配置与依赖.md)，`publish` 上传后**保持会话**，提交才发行。  
接续只在「有壳、无版本」。合集没有 M0。`item add` 不认本地路径。

| | 文档 |
|--|------|
| 架构 | [01 账号](./ARCHITECTURE/01-账号.md) · [02 本地状态](./ARCHITECTURE/02-本地状态.md) · [03 init](./ARCHITECTURE/03-init.md) · [04 bind](./ARCHITECTURE/04-bind.md) · [05 共用管理](./ARCHITECTURE/05-共用管理.md) |
| 编排 | [01 F0](./PHASE/01-F0-单资源发行.md) · [02 M0](./PHASE/02-M0-发行新版本.md) · [03 C0](./PHASE/03-C0-合集创建.md) · [04 单资源维护](./PHASE/04-单资源维护.md) · [05 合集维护](./PHASE/05-合集维护.md) · [06 属性配置与依赖](./PHASE/06-属性配置与依赖.md) |
| 速查 | [COMMANDS](./COMMANDS.md) |

硬红线：上架只用 `online`；合集策略用 `collection policy`；inherit 用 `publish --reuse-version`；`bind` 不是 `pull`。

本夹现行只有上表 12 份 + 两个子目录 README。改任何一份之前先对下面这张表；只改对应文档，禁止重写整夹、禁止把已划掉的写回来。

## 已敲定

| 条 | 在哪 |
|----|------|
| 账号只有 `login` / `logout`；工作区 `.freelog/auth` 往上找，没有才全局；坏文件不准回退；省略 `--env` = prod | [01-账号](./ARCHITECTURE/01-账号.md) |
| `session` / `studio` / `--session` 不是账号；PHASE 主路径不写 | 同上 §4 |
| `init` 不登录、不打平台；没登录还能改代码 / 构建 / `version set` | 01、[03-init](./ARCHITECTURE/03-init.md) |
| 本地只记不可变身份 + 对应文件；没有本地草稿、没有 `state.json`、根上不放 `freelog.manifest.json` | [02-本地状态](./ARCHITECTURE/02-本地状态.md) |
| 一夹一个 `.freelog/`：`N.json` 编号 + `index.json`；编号不是排序；合集 index 用 `.`，一夹一份 | 02 |
| `status` 只打印；接续只有「有壳、无版本」；策略 / listing / 上架不接续 | 02 |
| 同名已存在必须改 `name`；自己的壳禁止再 `create` | 02、[F0](./PHASE/01-F0-单资源发行.md) |
| 一夹多视频 = 多条 F0，用 `--file`；不是 F1 | 02、F0 |
| **不做** F1 / `import-dir` / 扫盘合集 | 本夹无对应文档 |
| **不做** RSS（一行设计都不留） | — |
| `item add` 只认 `resourceId` 或 `username/name`；先 F0 上架再加；主路径不签约 | [C0](./PHASE/03-C0-合集创建.md) |
| 合集没有 M0；改目录用 `collection publish` | C0、[M0](./PHASE/02-M0-发行新版本.md)、[合集维护](./PHASE/05-合集维护.md) |
| `bind` 只写身份和 `filePath`；不是 `pull`；合集禁止 `--file` | [04-bind](./ARCHITECTURE/04-bind.md) |
| listing / 策略 / 上下架共用；合集策略用 `collection policy`；禁止 `update --status` | [05-共用管理](./ARCHITECTURE/05-共用管理.md) |
| inherit 用 `publish --reuse-version`，与 `--file` 互斥；不要写在 `version set` | M0 |
| `publish` 上传后保持会话，反复改属性/配置/依赖/描述，提交才 `createVersion`；不写 `N.json` | [06](./PHASE/06-属性配置与依赖.md) |
| 系统 `raw` 只读；`additional` 只改 value；自定义 / 可选配置可增删改 | 06 |
| 没有 `dep add`；添加依赖只在 `publish` 菜单 5（输入 id 或标识 → 查询 → 签约） | 06 |
| 自己的资源当依赖也要签；合集加自己的单品不签 | 06、C0 |
| `dep auth` 只免费；付费 / 微前端失败并提示 Console；授权合约列表不做 | 06、[单资源维护](./PHASE/04-单资源维护.md) |
| 上传中断整文件再传；不设计断点续传 | 02 §4 |
