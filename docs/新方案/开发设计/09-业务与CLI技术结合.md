# 开发设计：业务 × CLI 技术结合

> 本文把 Freelog 业务事实钉到 CLI 技术默认。通用工程约定见 [08](./08-CLI工程约定.md)。

## 1. 认证 / 环境 / 请求

| 业务事实 | CLI 定稿 |
|---|---|
| Console 用浏览器 cookie | CLI 默认用登录会话 Cookie，经 tools-lib2 Node adapter 注入；Bearer/PAT 以后可扩展 |
| 生产 / 测试网 | `--env` / `FREELOG_ENV` 决定 baseURL；token 绑定环境 |
| 登录凭据 | 默认用户级 `.freelog-auth`，保存脱敏外的加密 Cookie/token；测试隔离才用 `FREELOG_AUTH_PATH_WORKSPACE` |
| 401 / 过期 | 清过期 auth，exit 2，hint login |
| 换号 | 写命令按平台 owner 拒绝，不能靠本地 state 放行 |

## 2. manifest / state

| 业务事实 | CLI 定稿 |
|---|---|
| 资源意图需要可审阅 | manifest 可提交、可手改、schema 校验 |
| 平台状态会变化 | state 不提交，可由 pull/status 重建 |
| listing 与发版意图不同 | `update` 改 listing；`version set` 改下一版 |
| 草稿与正式版不同 | `draft *` 管平台草稿；`publish` 管正式版 |
| 合集目录与单品版本不同 | `collection item *` 管目录草稿；`publish` 不碰目录 |

## 3. 发版

| 业务事实 | CLI 定稿 |
|---|---|
| 用户已经 build 主题/插件 | CLI 不隐式执行 build |
| 运行时类发布的是构建产物 | `publish` 压缩 `version.filePath` 指向的构建目录 |
| 图片/视频发布的是文件 | `publish` 上传单个文件 |
| 资源类型决定文件能力 | 每次 publish 前读取 typeInfo 校验格式、大小、可选配置 |
| SHA1 是平台去重关键 | 路径 SHA1 必须与浏览器 File SHA1 结果一致 |
| 首版 | 平台无 latest 时版本为 `1.0.0` |
| 续版 | semver 大于平台 latest |
| 依赖授权 | 缺口 exit 5；不先调用 createVersion |
| 本资源策略 | publish 不要求；online 才要求 |

上传链：

```text
resolve filePath -> maybe zip -> SHA1 -> Storage.fileIsExist
  -> getResourceBySha1 warn -> upload if needed -> Resource.createVersion
```

SHA1 占用不是失败：文件可复用，只 warn 可见占用方；不弹确认。

## 4. 草稿

| 业务事实 | CLI 定稿 |
|---|---|
| Console 发版页自动保存 | CLI 只在 `draft push` 显式保存 |
| Console 可以继续编辑 CLI 草稿 | `draft pull` 可取回 |
| 双端可能同时修改 | 指纹 + updateDate 冲突算法，exit 3 |
| 本地 filePath 是机器路径 | `draft pull` 永不覆盖 filePath |

## 5. Listing / 策略 / 上下架

| 业务事实 | CLI 定稿 |
|---|---|
| listing 是资源基础信息 | `update` 处理 title/intro/tags/cover |
| 策略正文复杂 | 文件输入，CLI 不做 Builder |
| policyText API 要编码 | 提交前恰好一次编码 |
| 上架需要版本和策略 | `online` 检查 latestVersion + 启用策略 |
| 下架只是状态更新 | `offline` -> status 4 |
| 冻结是平台状态 | 所有写命令 exit 4，不解冻 |

## 6. 合集

| 业务事实 | CLI 定稿 |
|---|---|
| 合集本身也是资源壳 | `collection create` 创建 subjectType=4 |
| 合集目录是 catalogue draft | `collection item *` 写目录草稿 |
| 文件夹合集由多个资源组成 | `collection item import-dir` 每个文件先发布为资源 |
| 合集发版 | `Resource.updateCollection`，合并目录草稿 |
| 条目可来自他人 | `item add <resourceId>` 允许他人资源 |
| 本地路径条目 | 必须是当前账号资源 |
| 合集上架 | 同单品严格门禁 |

集合可以先 publish，再添加合集自己的策略，最后 online。缺策略不阻塞 publish。

## 7. 多资源导入

| 命令 | 语义 |
|---|---|
| `resource import-dir <dir>` | 目录下每个文件 -> 独立资源 |
| `collection item import-dir <dir>` | 每个文件 -> 独立资源 -> 加入当前合集目录 |

约束：

1. P0 只递归或不递归二选一，默认不递归；若需要递归必须显式 `--recursive`。
2. 批量上限默认 20，超过 exit 4。
3. 部分失败继续汇总，进程 exit 4。
4. 成功项不回滚。

## 8. 依赖授权

| 场景 | CLI |
|---|---|
| 无依赖 | publish 继续 |
| 依赖均已授权 | publish 继续 |
| 未授权免费策略 | P0 exit 5；P2 可 `dep auth --policy-map` |
| 付费策略 | exit 5，回 Console |
| 需要额外交互 | exit 5，回 Console |

`dep auth` 只允许当前 manifest 已声明的直接依赖；签后必须用 authTree 验证。

## 9. 平台错误映射

| 现象 | exit | hint |
|---|---:|---|
| 未登录 / 401 / 环境不匹配 | 2 | login |
| 非所有者 / 403 | 2 | 换账号或换目录 |
| 同步冲突 | 3 | pull / force |
| 草稿冲突 | 3 | draft pull / draft push --force |
| 字段非法 / 缺参 / 冻结 | 4 | 指出字段或状态 |
| 版本已存在 | 4 | bump 或 pull |
| online 门禁失败 | 4 | publish / policy apply |
| 依赖授权缺口 | 5 | Console 或 dep auth |
| 网络 / 5xx / 超时 | 1 | 重试；debug |

## 10. 与 Console 交替

| 场景 | CLI 行为 |
|---|---|
| Console 改 listing | `status` 可见；写命令默认 auto-pull state，冲突 exit 3 |
| Console 改发版草稿 | `draft push` 无 force 阻断 |
| CLI publish 成功 | 写 state latestVersion；manifest 下一版意图按命令策略处理 |
| Console 软上架了缺策略资源 | CLI `online` 仍拒绝 |
| 用户删除 state | 可 `pull` 重建平台事实；manifest 不受影响 |

## 11. PR 检查

- [ ] publish 与 draft 语义未混用
- [ ] collection item 未称为发版草稿
- [ ] resource import-dir 未创建合集
- [ ] collection item import-dir 每个文件都有独立资源
- [ ] 运行时类强制 runtimeVersion
- [ ] 非运行时类不传 runtimeVersion
- [ ] typeInfo 校验先于上传
- [ ] publish 不要求本资源策略
- [ ] online 要求 latestVersion + 启用策略
- [ ] 付费/交互授权回 Console
