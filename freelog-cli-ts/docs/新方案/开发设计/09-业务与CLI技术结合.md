# 开发设计：业务 × CLI 技术结合

> 回答：「通用 CLI 约定够不够？」——不够。本文件把 **Freelog 业务场景** 钉到 **CLI 技术决策**。  
> 横切通则仍看 [08-CLI工程约定](./08-CLI工程约定.md)；命令步骤看 [02-命令规格](./02-命令规格.md)。

## 0. 结论（先读）

| 层面 | 已覆盖 | 本文件补齐 |
|------|--------|------------|
| 通用 CLI | TTY、exit、json、原子写、分层（08） | — |
| 业务×CLI | 分散在 Owner/草稿/字段 | **认证环境、配置加载、发版上传、三态边界、合集双草稿、错误码映射、Windows/CI** |

实现时：每个业务命令的 PR 须同时满足 08 + 本文件对应节。

---

## 1. 认证 / 环境 / 请求

| 业务事实 | CLI 技术定稿 |
|----------|--------------|
| 平台分生产 / 测试网 | `--test` 与 `FREELOG_ENV` 决定 `baseURL`；**token 与环境绑定**；status 必须显示当前环境 |
| 登录态 workspace > global | `getCurrentAuth` 已有优先级；写命令用「解析到的那份」；hint 写明 auth 文件路径（`--debug`） |
| token 加密存盘 | 保持加密；**禁止**写入 `freelog.*.config`；日志禁止打印 token |
| Cookie/Authorization 头 | 与 Console 一致字段；401/登录过期 → exit 2，hint `login`（清掉过期态可选） |
| 切换账号 | Owner 校验靠平台 info，不靠本地伪造；换号后未 pull 也不得写入他人资源 |

**易错点**：测网登录打生产 API、或反之 → 在 http 层断言「auth.environment === 当前 baseURL 环境」，不一致 exit 2/4。

---

## 2. 本地 config 加载（业务缓存）

| 业务事实 | CLI 技术定稿 |
|----------|--------------|
| config 是 JS/TS 模块 | `require`/动态 import 有执行风险：只加载约定文件名；路径须在 cwd 约定范围内；失败 → exit 4 |
| 一目录一资源 | 单品命令禁止「向上找到父目录 collection 就当单品」；合集命令才读 collection.config |
| create 后不可变 name/type | 本地改了也无效；publish/update 以平台为准，发现漂移 → warn 或 exit 4（定稿：**写命令前 ensureSynced 已拉平台则覆盖本地不可变字段**） |
| version 与 resource 成对 | 缺任一文件 → exit 4；userId 不一致 → 以 resource 为准写回 version |
| draftSync | 仅 CLI 维护；用户删了等于「从未 push」，走草稿冲突「无 sync」分支 |

**易错点**：`--cwd` 后相对 `--filePath`/`--cover`/`--from-file` 均相对 cwd，不是 process 启动目录。

---

## 3. 发版主路径（updateVersion / publish）

| 业务事实 | CLI 技术定稿 |
|----------|--------------|
| updateVersion 只写本地 | **零 HTTP**（除可选 ensureOwner/Synced 的 info）；不碰 drafts |
| publish = 上传 + createVersion | 与 draft push 严格分离；无 `--draft` |
| 主题/插件目录要 zip | `shouldCompress(resourceType)`；临时 zip `finally` 删除；磁盘满 → exit 1 |
| 文件 sha1 可能已存在 | 平台占用检测：TTY 可确认继续；**非 TTY / `--yes`：默认继续（与「文件可复用」一致）**，warn 打 stderr；若产品要拒绝对他人占用，用 `--strict-file`（可选，默认关） |
| 版本号 | 与 `FVersionInput` 一致：valid + gt(latest)；`--bump` 基于**平台** latest 不是本地脏 version |
| 首版 1.0.0 | create 后第一次 publish 若本地 version 空/非 1.0.0 → 校正或 exit 4 |
| 依赖授权 | createVersion 前算缺口；exit 5 + 缺口列表（resourceId/name）；不调微应用 |
| policyText | 提交前 **一次** `encodeURIComponent`；禁止双重 encode |
| 冻结 bitmask | `(status & 2) === 2`，不要只用 `status === 2` |
| 合集不能走单品 publish | subjectType===4 → exit 4 |

**易错点**：本地 version.config 仍是 1.0.0、线上已 1.2.0，未 sync 就 bump → 必须先 info/latest。

---

## 4. 三态与草稿（业务核心）

| 业务事实 | CLI 技术定稿 |
|----------|--------------|
| 本地意图 / 平台草稿 / 正式版 | 三套 API，禁止混用命令语义 |
| Console 防抖草稿 | CLI **禁止**自动 save；仅 `draft push` |
| draftData 形状 | 只经 adapter；commands 不手搓字段名 |
| 冲突 | 指纹 + draftSync + updateDate；exit 3；见 [04](./04-草稿转换层.md) |
| pull 保留 filePath | apply 时硬约束；单测必覆盖 |
| description 富文本 | CLI 存纯文本即可；push/pull 不跑 Braft |
| radio→select 有损 | warn 一次；不阻断 push |
| 无文件草稿 | selectedFileInfo=null 允许；publish 仍要求文件 |

**易错点**：`collection item *` 写的是 **目录草稿**（catalogues/drafts），不是 versions/drafts；命令提示文案禁止说成「发版草稿」。

---

## 5. Listing / 策略 / 上下架

| 业务事实 | CLI 技术定稿 |
|----------|--------------|
| update listing | 封面本地路径 → 先 upload 再传 URL；失败不写半截 tags |
| online = resourceOnline | 校验 latestVersion + 启用策略；不代建策略 |
| 最后一条启用策略 | 停用前读平台策略列表，不能只信本地 cache |
| offline / discard | 破坏性；`--yes` 或确认 |

---

## 6. 合集（双层草稿 + 他人资源）

| 业务事实 | CLI 技术定稿 |
|----------|--------------|
| 合集 owner ≠ 条目 owner | 写合集只 ensureOwner(合集)；`item add <id>` **跳过**条目 owner |
| `item add <路径>` | 解析子目录 resource；必须本账号；再取 resourceId 调 draft API |
| 目录草稿 vs 发版草稿 | item* → catalogues；合集表单草稿二期才 versions/drafts |
| publish 合集 | isMergeCatalogueDraft；长耗时 → spinner 仅 TTY；超时单独 hint |
| RSS | bind 无 code → exit 4；preview 业务码映射为人读 hint（invalid/noemail/alreadyexists_*） |
| display 枚举 | 非法 `--display-*` → exit 4（枚举表见页面覆盖文档） |

**易错点**：在章节目录误跑 `collection publish`（读错 config）→ 配置发现规则必须按命令类型选文件。

---

## 7. 多文件 `--from-dir`

| 业务事实 | CLI 技术定稿 |
|----------|--------------|
| 最多 20、同类型 | 超限 exit 4（整批不开始） |
| 内部 createBatch 或循环 | 对用户透明；日志可 `--debug` 打印策略 |
| 部分失败 | 默认继续；结束汇总；**任一项失败 exit 4**；成功项保留 config |
| 目录名 | 不安全文件名 → `.freelog/<safe>/`；映射表可写 stderr 一行 |

---

## 8. 平台错误 → CLI 退出码（映射表）

| 平台/业务现象 | exit | hint 方向 |
|---------------|------|-----------|
| 未登录 / 401 | 2 | login |
| 非所有者 / 403 owner | 2 | login 或换目录 |
| 版本号冲突 / 已存在 | 4 | pull 后改 version / bump |
| 冻结 | 4 | 联系运营（不解冻） |
| 字段校验失败 | 4 | 指出字段 |
| 依赖未授权 | 5 | Console 签约或 dep auth |
| 草稿冲突（CLI 判定） | 3 | draft pull 或 --force |
| 同步冲突（listing） | 3 | pull |
| RSS noemail / invalid | 4 | 按码说明 |
| 网络超时 / 5xx | 1 | 重试；--debug |

禁止把所有平台错误都映射成 exit 1。

---

## 9. 与 Console 交替（一致性）

| 场景 | CLI 技术定稿 |
|------|--------------|
| Console 先改 listing | 写命令 auto-pull 或 exit 3；status 必须能看出落后 |
| Console 先改发版草稿 | draft push 走指纹冲突，不能盲盖 |
| CLI publish 成功 | 写回 versionId/sha1；清空一次性 publish 字段（与现 publish 后清理一致） |
| 两边同时 publish 同版本 | 后到的 createVersion 失败 → exit 4，提示 pull |

---

## 10. 运行时（业务向）

| 项 | 定稿 |
|----|------|
| Node | ≥18（或与 package engines 对齐并写进开发维护） |
| OS | Windows 为一等公民：路径、杀毒占用 zip、中文路径用例必测 |
| 时钟 | draft `updateDate` 比较用平台字符串相等或解析为 UTC；禁止依赖本机时区格式化再比 |
| 指纹 | `stableStringify` + sha256；Node 版本升级不得改变 canonical 规则（单测锁死） |

---

## 11. 命令×技术检查（业务命令 PR）

在 08 的清单之外，再勾：

- [ ] 环境与 token 一致（测网/生产）  
- [ ] `--cwd` 下 filePath/from-file/cover 相对 cwd  
- [ ] 单品/合集 config 发现未串味  
- [ ] publish 未写 drafts；draft push 未 createVersion  
- [ ] 合集 item 文案未写成「发版草稿」  
- [ ] 平台错误映射到 2/3/4/5 而非一律 1  
- [ ] 冻结用 bitmask；online 校验策略  
- [ ] policyText 未双重 encode  
- [ ] `--from-dir` 部分失败汇总与 exit 4  

---

## 12. 与 08 的分工

| 文档 | 管什么 |
|------|--------|
| [08](./08-CLI工程约定.md) | 所有 CLI 通用：分层、TTY、json、原子写、CliError |
| **09（本文）** | Freelog 资源/合集/草稿/RSS/多文件 与上述机制如何咬合 |
| [02](./02-命令规格.md) | 每命令业务步骤 |
| [04](./04-草稿转换层.md) | 草稿算法细节 |
