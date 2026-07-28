# 开发设计：业务 × CLI 技术结合

> 通用横切 → [08-CLI工程约定](./08-CLI工程约定.md) · 命令步骤 → [02-命令规格](./02-命令规格.md)  
> 本文把 **Freelog 业务** 钉到 **唯一 CLI 技术默认**（无「可选/或」摇摆项）。

## 0. 结论

| 层面 | 文档 |
|------|------|
| 通用 CLI | [08](./08-CLI工程约定.md) |
| 业务 × CLI | **本文** |
| 每命令步骤 | [02](./02-命令规格.md) |

PR 须同时满足 08 + 本文对应节。

---

## 1. 认证 / 环境 / 请求

| 业务事实 | 定稿 |
|----------|------|
| 生产 / 测试网 | `--test` 与 `FREELOG_ENV` 定 `baseURL`；token 与环境绑定；`status` **必须**显示当前环境 |
| 登录优先级 | workspace auth > global；写命令用解析到的那份；`--debug` 打印 auth **路径**（不打印 token） |
| token | 加密存盘；**禁止**写入 `freelog.*.config`；日志禁止打印 token |
| 请求头 | 与 Console 一致（authorization / token 字段） |
| 401 / 过期 | exit 2；hint `login`；**清除本地过期 auth 文件**后再提示登录 |
| 环境不一致 | http 层：`auth.environment !== 当前 baseURL 环境` → exit 2，hint 用对应环境重新 login |
| 换号 | Owner 以平台 info 为准；不得写入他人资源 |

---

## 2. 本地 config

| 业务事实 | 定稿 |
|----------|------|
| JS/TS 模块 | 只加载约定文件名；路径限制在 cwd 树内；加载失败 → exit 4 |
| 一目录一资源 | 单品命令**不**向上误用父目录 collection.config；合集命令只读 collection.config |
| 不可变 name/type | ensureSynced / pull 后以平台覆盖本地；本地手改无效 |
| resource + version | 缺一 → exit 4；userId 不一致 → 以 resource 为准写回 version |
| draftSync | 仅 CLI 写；用户删除 = 从未 push（走「无 sync」冲突分支） |
| `--cwd` | 其后 `--filePath` / `--cover` / `--from-file` / 相对路径 **全部相对 cwd** |

---

## 3. 发版（updateVersion / publish）

| 业务事实 | 定稿 |
|----------|------|
| updateVersion | 只写本地；**除** ensureOwner/Synced 所需的 info/pull 外无其它 HTTP；不碰 drafts |
| publish | 仅 upload + `createVersion`；**无** `--draft` 入口 |
| 压缩上传 | 按类型 zip；临时文件 `finally` 删除；磁盘失败 → exit 1 |
| sha1 已占用 | **一律允许继续**（文件可复用）；stderr `⚠` 列出占用方（能查到时）；TTY **不再**弹确认（与 CI 行为一致） |
| 版本号 | semver.valid 且 `gt(平台 latest)`；`--bump` 基于**平台** latest |
| 首版 | 无正式版时 publish 强制 `1.0.0`（本地非 1.0.0 → 自动校正并 `ℹ` 提示） |
| 依赖授权 | 缺口 → exit 5 + 列表；不调微应用 |
| policyText | **恰好一次** `encodeURIComponent` |
| 冻结 | `(status & 2) === 2` → exit 4 |
| 合集 subject | subjectType===4 走单品 publish → exit 4 |

---

## 4. 三态与发版草稿

| 业务事实 | 定稿 |
|----------|------|
| 三态 | 本地意图 / 平台 versions/drafts / 正式 versions；API 与命令语义严禁混用 |
| 自动草稿 | **禁止**；仅 `draft push` |
| 形状 | 只经 `versionDraftAdapter` |
| 冲突 | 指纹 + draftSync + updateDate；算法见 [04](./04-草稿转换层.md)；exit 3 |
| filePath | `draft pull` **永不**清空或改写 |
| 描述 | 纯文本；不跑富文本引擎 |
| 属性有损 | radio/checkbox→select：warn 一次，不阻断 |
| 无文件草稿 | 允许 `selectedFileInfo=null`；publish 仍要文件 |

**文案**：`collection item *` = **目录草稿**；禁止称作「发版草稿」。

---

## 5. Listing / 策略 / 上下架

| 业务事实 | 定稿 |
|----------|------|
| 封面本地路径 | 先 upload 成功再 update；失败则整命令失败，不写半截 listing |
| online | resourceOnline：latestVersion + ≥1 启用策略；不代建策略 |
| 停用策略 | 以**平台**策略列表判断「最后一条启用」 |
| offline / draft discard | 须 `--yes` 或 TTY 确认 |

---

## 6. 合集

| 业务事实 | 定稿 |
|----------|------|
| Owner | 只校验合集 owner；`item add <resourceId>` 不校验条目 owner |
| `item add <路径>` | 子目录须本账号 resource；再调 catalogues draft API |
| 双草稿 | item* → `catalogues/drafts`；合集发版表单草稿 = 二期（versions/drafts） |
| collection publish | `isMergeCatalogueDraft`；超时 exit 1 + hint 重试 `collection publish` |
| RSS | 无 `--code` → exit 4；preview 码 → 人读 hint |
| display | 非法枚举 → exit 4 |

配置发现：合集命令在 cwd 找不到 collection.config → exit 4（**不**回退读单品 config）。

---

## 7. `--from-dir`

| 业务事实 | 定稿 |
|----------|------|
| 上限 | >20 或类型不一致 → exit 4，**整批不开始** |
| 实现 | createBatch 或循环，对用户透明；`--debug` 打印选用策略 |
| 部分失败 | **继续跑完** → stderr 汇总表 → **任一项失败则进程 exit 4**；成功项保留 config |
| 不安全文件名 | 落盘 `.freelog/<safeName>/`；stderr 打印源文件→目录映射 |

不提供 `--fail-fast` 开关（行为唯一）。

---

## 8. 平台错误 → exit

| 现象 | exit | hint |
|------|------|------|
| 未登录 / 401 / 过期 | 2 | login（已清过期态） |
| 非所有者 / 403 | 2 | login 或换目录 |
| 环境与 token 不一致 | 2 | 对应环境重新 login |
| 版本冲突 / 已存在 | 4 | pull 后改 version / bump |
| 冻结 | 4 | 联系运营（CLI 不解冻） |
| 字段 / 缺参 / 枚举非法 | 4 | 指出字段 |
| 依赖未授权 | 5 | Console 或后续 dep auth |
| 草稿冲突 | 3 | draft pull 或 `--force` |
| listing 同步冲突 | 3 | pull |
| RSS 业务错 | 4 | 按码说明 |
| 超时 / 5xx | 1 | 重试；`--debug` |

禁止一律 exit 1。

---

## 9. 与 Console 交替

| 场景 | 定稿 |
|------|------|
| Console 改 listing | 写命令：落后 auto-pull；真冲突 exit 3；status 可见 |
| Console 改发版草稿 | draft push 走指纹冲突，禁止盲盖 |
| CLI publish 成功 | 写回 versionId/sha1；清空一次性 publish 字段 |
| 并发同版本 publish | 后到失败 → exit 4，hint pull |

---

## 10. 运行时

| 项 | 定稿 |
|----|------|
| Node | 与 `package.json` `engines` 一致（目标 ≥18）；不符 → 启动 warn |
| OS | Windows 一等：`--cwd`、中文路径、zip 占用必测 |
| updateDate | 与平台字符串全等比较，或二者均解析为 UTC ms；禁止本地 format 后再比 |
| 指纹 | stableStringify + sha256；规则变更须升 draftSync 版本字段并写迁移（当前无迁移则锁死单测） |

---

## 11. PR 检查（业务命令）

在 08 清单外再勾：

- [ ] 环境与 token 一致；401 清过期 auth  
- [ ] `--cwd` 下相对路径均相对 cwd  
- [ ] 单品/合集 config 发现未串味  
- [ ] publish ↔ draft 语义未混用  
- [ ] 合集 item 未写成「发版草稿」  
- [ ] 错误映射 2/3/4/5  
- [ ] 冻结 bitmask；online 查平台策略  
- [ ] policyText 单次 encode  
- [ ] sha1 占用无交互确认、仅 warn  
- [ ] `--from-dir` 跑完汇总且失败 exit 4  

---

## 12. 分工

| 文档 | 内容 |
|------|------|
| [08](./08-CLI工程约定.md) | TTY、json、原子写、CliError、分层 |
| **09** | 认证环境、发版、三态、合集、RSS、错误映射 |
| [02](./02-命令规格.md) | 每命令步骤 |
| [04](./04-草稿转换层.md) | 草稿算法 |
