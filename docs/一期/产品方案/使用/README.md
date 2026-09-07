# 使用文档（freelog-cli）

面向使用者。这里只写**怎么敲、出了什么提示怎么办**；产品为什么这么定的真源在 [脚手架设计](../脚手架设计/README.md)，不在本文重复。

| 分册 | 答什么 |
|------|--------|
| [01-快速上手](./01-快速上手.md) | 装好、登录、把一个视频发成 1.0.0 的最小完整链 |
| [02-日常路径](./02-日常路径.md) | 创建 / 发新号 / 接入已有资源三条主路径的全部命令 |
| [03-主题与插件](./03-主题与插件.md) | 模板立项、构建 dist、CLI 打 zip 发版 |
| [04-版本工作稿](./04-版本工作稿.md) | 多次改缓存、拉底、盖稿、丢稿 |
| [05-资源管理](./05-资源管理.md) | 描述、listing、策略、上下架 |
| [06-常见情况与报错](./06-常见情况与报错.md) | 每条失败提示：为什么、怎么办 |
| [07-环境与凭据](./07-环境与凭据.md) | `--env` 三套环境、`.freelog/auth` 放哪 |
| [08-本地文件参考](./08-本地文件参考.md) | `.freelog/` 里每个文件长什么样、能不能提交 |

---

## 一分钟速查

```text
login → init? → create → create-version → policy? → update? → online     # 创建
version draft pull? → 改缓存 → update-version                            # 发新号
bind <id|username/name> [--file]                                         # 接入已有资源
```

四层，不要搅：

| 层 | 命令 | POST 版本？ |
|----|------|-------------|
| 看 | `version show` / `version show --local` | 否 |
| 管缓存 | `version draft pull` / `version draft discard` | 否 |
| 改稿 | `version attr` / `option` / `dep` / `draft description` | 否 |
| 提交 | `create-version` / `update-version` | **是** |

所有写命令共用：`--env <prod|test|dev>`（省略 = prod，**当前发布前 prod 被硬拦**）、`--yes`、`--cwd <dir>`、`--json`、`--file <path>`（一夹多条必须指定）。
