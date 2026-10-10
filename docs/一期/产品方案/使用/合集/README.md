# 合集使用教程

合集用来组织**你自己已经上架的线上单资源**。它适合把一组视频、图片、文章等资源整理成一个独立展示和授权的整体。它不是本地文件夹上传器，也不会替你把一批素材自动发行成单资源。

使用合集前，确认当前工程已登录正确 dev 账号；未登录时再执行，已有可用登录则跳过：

```powershell
freelog-cli login --cwd . --env dev
```

## 你要做什么

| 目标 | 阅读 |
|---|---|
| 第一次从 0 创建、添加单品、发布并上架 | [01-首次发行与发布](./01-首次发行与发布.md) |
| 已有合集继续改目录、资料、表单、规则或上下架 | [02-发行后管理与边界](./02-发行后管理与边界.md) |
| 给合集自身添加、查看、启停授权策略 | [03-合集授权策略](./03-合集授权策略.md) |
| 先发行本地文件、主题或图片为单资源 | [返回主手册](../README.md) |

最小前置只有两条：

1. 当前工程已经登录正确账号和环境。
2. 准备加入合集的内容已经作为本人单资源发布并上架。

如果你手里还是本地文件或本地目录，请先按单资源教程完成创建版本、添加单资源自身策略和上架，再回来执行 `collection item add`。

## 三类改动别混在一起

合集命令会修改三类不同事实：

| 事实 | 相关命令 | 什么时候线上可见 |
|---|---|---|
| 服务端目录草稿 | `collection item add/rename/move/sort/remove` | 运行 `collection publish` 合并目录后 |
| 本地表单操作稿 | `collection form/display/dep` | 运行 `collection publish` 提交表单后 |
| 线上即时信息 | `collection update`、`collect-rules`、`policy`、`online/offline` | 命令成功并读回后立即生效 |

Console 的表单草稿和 CLI 的本地表单操作稿不是同一个东西。CLI 不读取、不合并、不覆盖 Console 表单草稿；`collection form show` 只显示本地待发布表单，不是线上状态查询。

## 怎么选择合集

合集命令里的 `--resource` 只选择目标合集：

```text
--resource id:<合集ID>
--resource name:<username/name>
--resource file:N.json
```

推荐脚本和文档都使用 `id:<合集ID>`。标题会变、可重复，不能作为选择器。合集选择器不接受 `artifact:`；那是单资源产物路径相关用法。

## 当前边界

- 已支持创建/绑定合集、目录草稿、资料、收录规则、本地表单、直接依赖、合集策略、发布、上下架、日志和授权方合约查询。
- 已有目录单品的授权修复命令 `collection item auth resolve` 还没有实现；当前只能用 `collection item auth status` 查看。
- RSS、批量单资源发行、CLI 支付、从本地文件夹自动生成合集都不在当前范围。
- `collection publish resume` 只读诊断未知发布 intent，不自动重发、不自动清理，也不是其它写命令的通用恢复入口。
- 不要把 `--json` 当成所有命令的稳定成功协议。策略模板 `list/info --json`、日志和合约等明确支持 JSON 的命令可以给脚本读取；普通写命令主要面向人工确认和读回。

本目录会随 CLI 包发布。安装后运行 `freelog-cli --help`，按帮助里显示的本机手册路径打开 `合集/README.md` 即可。
