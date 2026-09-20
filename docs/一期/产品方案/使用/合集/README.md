# 合集使用教程（实验性）

合集是 `subjectType=4` 的独立线上主体。它收录的是**当前账号已经上架的线上单资源**，不是本地文件夹、主题工程或一组尚未发行的素材。

本教程与单资源手册分开维护：合集仍在完善中，已经可用的命令和仍受平台契约限制的能力会明确标注。不要把 Console 的服务端草稿、单资源版本工作稿或本地文件当作合集目录的来源。

## 从这里开始

| 你的目标 | 阅读 |
|---|---|
| 第一次创建合集、添加单品、编辑表单并发布 | [首次发行](./01-首次发行与发布.md) |
| 已发行合集的单品、信息、规则、表单、发布和观察 | [发行后管理](./02-发行后管理与边界.md) |
| 安装 CLI、登录、环境与单资源发行 | [返回主手册](../README.md) |

## 先理解三个独立事实

```text
线上合集身份 ── collection create / bind ──> .freelog/N.json（仅用于定位）
服务端目录草稿 ── collection item ... ──────> 待发布单品目录
本地表单操作稿 ── collection form / dep ───> 待发布属性、配置、描述、展示与依赖
                                         \
                                          collection publish
                                               │
                                  已发布合集快照 + 已发布目录
                                               │
                            collection online（另一步，且需要启用合集策略）
```

因此：

1. `collection create` 只创建线上合集壳；不会上传文件、添加单品、发布或上架。
2. `collection item add` 只改**服务端目录草稿**；单品只有经过 `collection publish` 才进入已发布目录。
3. `collection form`、`collection dep` 和 `collection display` 只改本地表单操作稿；只有 `collection publish` 才提交这些改动。
4. `collection publish` 不上架。上架是独立的 `collection online`，且当前必须已有一条启用的合集自身策略。

## 当前可用范围

| 能力 | 当前情况 |
|---|---|
| 创建、绑定、目录单品增删改排、listing、收录规则、表单、直接依赖、发布、下架、日志和授权合约只读查询 | 已实现；仍应按命令的实际读回结果判断成功。 |
| `collection online` | 已实现门禁和状态读回；需要已发布合集与启用的合集自身策略。 |
| 合集自身策略的创建、模板、编译、启停 | 暂未提供 CLI 命令，等待策略后端契约稳定。当前需要先在 Console 配置并启用策略，才可用 CLI 上架。 |
| 已有目录单品的授权重处理（`collection item auth resolve`） | 暂未实现；只提供 `auth status` 查询。 |
| RSS 合集、批量单资源发行、支付、从本地文件夹自动生成合集 | 当前不支持。 |

所有示例使用 dev 环境。生产环境当前被 CLI 拦截；请每次显式带 `--env dev` 或 `--env test`。

## 合集如何选择

合集命令的 `--resource` 只选择目标合集，不接受 `artifact:`：

```powershell
--resource id:<合集ID>                 # 最稳定，推荐
--resource name:<username/name>         # 完整授权标识
--resource file:N.json                  # 当前工程本地合集身份
```

标题可变且可以重复，不能作为选择器。工程内恰有一份合集身份时可省略 `--resource`；零份或多份时必须明确指定。`--cwd <工程目录>` 决定从哪里读取登录选择器和 `.freelog/`，不会改变线上主体。

## 使用时的底线

- 合集单品只能是本人、当前环境、已上架且已有最新版本的线上单资源；本地是否有该资源的文件或 `N.json` 不影响资格。
- 单品上游授权、合集直接依赖、合集自身策略是三件不同的事。不要把合同 ID、策略 ID 或依赖信息手工写进 JSON。
- `collection form pull` 会以**已发布合集快照**刷新本地表单操作稿；它不会读取、覆盖或删除 Console 的服务端草稿。
- 网络请求结果不明确时，用 `collection publish resume`、`collection item list`、`collection form show` 或 `status` 读回事实；不要反复盲目重发。

发布包会递归携带本目录。安装后运行 `freelog-cli --help`，根据输出的本机手册路径打开 `合集/README.md` 即可。
