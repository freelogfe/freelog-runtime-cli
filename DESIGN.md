# Freelog Runtime CLI 产品设计

## Source of truth

- 状态：Active
- 最后更新：2026-08-28
- 权威性：本文是 Freelog Runtime CLI 的唯一产品设计契约。
- 主要产品表面：终端交互、声明式本地工程、CI/自动化、Freelog 平台 API。
- 已审阅证据：`docs/新方案/`、`packages/cli/src/`、Console 资源页、CLI 单元与场景验证脚本。

本文定义“产品应当是什么”。它不记录某次测试数字，也不以当前代码反向定义产品。

发生冲突时按以下顺序处理：

1. 本文决定产品目标、边界、领域概念和交互原则。
2. `docs/新方案/一期/01-产品与实现规格.md`定义一期资源发行域的能力、命令、门禁和实现摘要。
3. `docs/新方案/一期/02-CLI体验拓扑设计.md`定义一期用户体验总拓扑、流程拓扑和跨场景 UX 约束。
4. `docs/新方案/一期/场景/`定义 S01–S14 逐场景细节：主题、插件、package、普通文件、批量、合集、RSS、session/studio、策略模板等。
5. `docs/新方案/一期/03-多视角设计审查.md`定义重构前从 AI、产品、用户、QA、研发和安全视角回扫设计的门槛。
6. `docs/新方案/使用/` 决定用户可见命令、流程、参数与排错（[目录](docs/新方案/使用/README.md) 为操作说明入口；已拆分为多页便于文档站点集成）。
7. `docs/新方案/开发/CLI字段账本.md`决定 manifest/state/API 字段契约。
8. `docs/新方案/开发/CLI脚手架设计.md`解释技术实现（含 citty 参数真源 `packages/cli/src/core/cliArgs.ts`，§4.1）。
9. `docs/新方案/对齐/Console表单字段与交互规则.md`提供字段级有效约束；`docs/新方案/对齐/`其余文档提供流程、源码和平台行为证据。
10. `docs/新方案/验证/`只定义测试入口并记录某个版本、环境下的实现证据。

若 2–5 与本文冲突，先修正文档，不得用“代码已经如此”替代产品决策。

### 官方使用文档交付契约

`docs/新方案/使用/` 是可整体交付给 Freelog 官方文档站的最终用户文档集合，必须满足：

1. 目录内文档自洽；除本目录页面和公开 Freelog 网址外，不依赖仓库中的设计、开发、对齐、验证、源码或测试报告。
2. 当前发布线暂不开放 production：CLI 只能在获授权的 `dev` 或 `test` 环境运行，`production` / `prod` 必须在网络请求、平台写入和项目默认环境生效前明确失败。公开文档以 `<env>` 表示获授权环境，不公开内部域名、测试账号、密码或验证夹具；production 重新开放后，才可将文档改为正式环境教程。
3. 命令示例必须与当前发布包的 `--help` 一致，并明确本地写入、平台写入、不可回滚结果和 Console 接力点。
4. 文档只承诺已纳入当前发布验收范围的能力，不以“代码中存在”代替可交付。前端库 `package` 预设当前暂停验收，不进入公开教程和能力清单。
5. 安装、升级、登录、环境、首次发行、维护、批量、合集、自动化、排错和 Console 差异必须组成完整阅读路径；研发编号和一次性测试结论不得出现在公开正文。
6. 文档发布前必须自动检查内部相对链接、敏感信息、测试环境痕迹、暂停能力和过期命令。
7. 公开 `freelog-cli --help` 也是用户文档表面；研发验证命令必须由 `FREELOG_DEV=1` 等显式门控隐藏，不能只从 Markdown 中删除。
8. 当前 npm 包名固定为 `@freelog-cli/cli2`，用途是隔离测试发布，避免覆盖已有线上包 `@freelog-cli/cli`。`cli2` 是现阶段测试包名，不等于最终正式包名；正式发布前必须单独裁决包名、dist-tag、迁移和旧包处置，未经裁决不得覆盖旧线上版本。

## Brand

- 产品性格：明确、可靠、克制、可预判。
- 信任信号：执行前说明目标环境和副作用；失败说明原因、当前状态和下一步；机器输出稳定。
- 避免：隐藏写操作、模糊成功、静默降级、把 Console 页面结构机械复制成命令。

## Product goals

### 定位

Freelog Runtime CLI 是以本地工程为工作面的 Freelog 资源发行与生命周期工具：

> 本地文件和 manifest 表达发版意图，CLI 将 UI 中的隐性约束显式化，经校验、构建、压缩、上传和平台写入完成可重复发行。

它不是“没有界面的 Console”，也不是一组 API 的薄封装。

### 目标

1. 普通作者输入一次 TTY 入口命令后，就能被连续引导完成本地文件型资源的首次发行、更新或上下架，不需要背完整命令链。
2. 熟练用户、AI 和 CI 可以用显式命令、manifest、`--json`、NDJSON 和 exit code 复现同一业务流程。
3. Console 依靠 UI 保证的约束，在 CLI 中都有可发现、可验证、可自动化的表达。
4. 模板、构建产物、目录压缩和批量目录处理成为 CLI 的一等能力。
5. 本地意图与平台事实边界清楚，跨端协作发生冲突时不静默覆盖。
6. 同一套 Freelog 业务规则可在 **工程持久化 Store** 与 **会话 ephemeral Store** 下暴露；用户按场景选择，不得因模式不同而放宽门禁（详见 §工程模式与会话模式）。

### 非目标

- 不复制 Console 的列表运营、收藏、收入、节点管理和详情预览。
- 不实现必须依赖浏览器的支付、验证码、可视化编辑器和云存储选择器。
- 不承担视频转码、图片裁剪等内容生产能力。
- 不追求命令步骤与 Console 页面步骤一一对应。

### 成功信号

- 新用户能从一个 TTY 任务入口开始，按向导完成主题、插件、普通文件、批量或合集主路径，不需要理解平台内部字段或记住多条命令。
- 熟练用户可以只修改 manifest，并在非交互环境稳定复现相同结果。
- 所有写操作都有环境保护、预检、明确副作用和稳定错误语义。
- 同一业务规则在人类交互、声明式配置和 CI 模式下保持一致。

### 能力分类与证据维度

能力范围、交互方式和完成证据是三个独立维度，不得压缩成一个 `✅`：

| 维度 | 取值 | 含义 |
|---|---|---|
| 范围 | `CORE` / `ADVANCED` / `OUT` / `NATIVE` | 本地文件发行核心 / 高级平台维护 / 明确排除 / CLI 原生能力 |
| 对齐方式 | `PARITY` / `EQUIVALENT` / `CLI_ONLY` | 同业务语义与状态 / 同结果但交互不同 / Console 无对应物 |
| 证据 | `SPEC` / `CODE` / `ENV` / `CONTRACT` | 设计已定义 / 代码存在 / 目标环境可达 / Console 或 API 契约已核验 |

示例：显式 `draft push` 是 `CORE + EQUIVALENT`；模板是 `NATIVE + CLI_ONLY`；RSS 是 `ADVANCED + PARITY`；付费收银台是 `OUT`。

任何“已支持”声明必须同时说明范围、对齐方式和已有证据，不能用实现存在代替产品完成。

## Personas and jobs

### 主要用户

| 用户 | 主要任务 | 使用环境 |
|---|---|---|
| 内容作者 | 发布图片、音视频、小说等单资源或合集 | 本地终端，偏交互 |
| 前端开发者 | 从模板创建主题、插件、前端库并发布构建产物 | Git 工程，开发终端 |
| 批量运营者 | 将目录中的多个文件批量创建为资源或合集条目 | 本地目录，长任务 |
| CI/发布工程师 | 校验、构建、发版、上架，读取稳定结构化结果 | 非 TTY、自动化 |
| 测试与产品 | 对照 Console 的业务结果、复验门禁和失败路径 | dev/test 环境 |

### 用户任务

- 从模板开始一个可运行的 Freelog 工程。
- 将已有文件或已有工程接入 Freelog。
- 明确即将发布的版本、文件、属性、依赖和策略。
- 在写平台前发现输入、状态、权限和环境问题。
- 发布单资源、批量资源或合集，并能继续维护。
- 看懂本地与平台的差异，安全决定 pull、push 或保留本地意图。

## Information architecture

产品信息架构按用户任务组织，而不是按 Console 页面组织：

```text
环境与身份
  login / logout / config

工程立项
  init / template / bind / workspace

理解当前状态
  status / validate / doctor / diff / pull

准备发行意图
  version / draft / dep / policy / collection item

执行发行
  create / publish / release / resource import-dir / collection publish

维护平台对象
  update / policy / online / offline / collection maintenance

会话模式（S=1，无长期 manifest 工程）
  resource publish|update / dep * / version edit / policy * / online|offline
  （须 --session；详见 §工程模式与会话模式）

交互壳（TTY）
  freelog-cli session   → 11（A=1 S=1，全临时）
  freelog-cli studio    → 10（A=1 S=0，多账号工作区）
```

### 三种发行模式

| 模式 | 本地模型 | 平台结果 | 主入口 |
|---|---|---|---|
| 单资源 | 一个工程、一份 manifest/state、一个文件或构建目录 | 一个资源及其版本 | `init` → `create` → `publish` |
| 批量独立资源 | 一个输入目录，输出 N 个可独立维护的子工程 | N 个互不隶属的资源 | `resource import-dir` |
| 合集 | 一个合集工程，加 N 个条目引用或子资源 | 一个合集和有序条目 | `init collection` → `collection *` |

三种模式不得因命令相似而混淆。批量独立资源不是合集，合集条目也不是一个大压缩包中的普通文件。

### 工程模式与会话模式

同一套 Freelog 业务规则可通过两种 **本地 Store** 暴露（详见 [CLI双模式设计](docs/新方案/开发/CLI双模式设计.md)）：

| Store | 意图 | 平台事实 | 适用 |
|---|---|---|---|
| **工程模式** | `freelog.manifest.json` | `.freelog/state.json` | Git/CI、可复现、批量子工程 |
| **会话模式** | 当次 flag / 交互 | 内存（+ 可选系统临时目录） | Console 式选资源、选文件、提交 |

会话模式 **不** 降低 owner、授权、frozen、semver 等门禁；它消除的是 manifest/state 长期漂移、env 绑错 state、误提交缓存等 **持久化对齐** 问题。

会话模式产品约束：

1. **不调用** 远端发版表单 draft API（`saveVersionsDraft` / `lookDraft`）；单次命令内组装完整意图 → 直接 `createVersion` / `updateResourceVersionInfo`。需要 Console 式分步草稿时须使用工程模式 + `draft push/pull`。
2. 可选 **`--export-project`**：会话成功后导出 manifest/state 壳，便于转入 Git/CI 工程模式。
3. 命令面与工程模式 **同名**，由 `--session` + `--resource-id` 激活；细节见 [CLI双模式设计](docs/新方案/开发/CLI双模式设计.md)。
4. `xxx --session` 是一次进程内的原子操作，命令结束后内存 Store 即销毁；禁止设计“先执行一个命令修改内存，再由下一个命令消费”的流程。只修改下版意图的 `dep add/remove/update --session` 必须同时使用 `--export-project`，后续在导出的工程中发布；需要纯内存多步操作时使用单进程 `freelog-cli session`。

### 双维持久化（四模式）

除「工程 Store vs 会话 Store」外，**登录凭据（Auth）** 与 **资源状态（Store）** 是第二个正交维度。编码 **`AS`**：左 = Auth，右 = Store；`1` = 不落盘，`0` = 落盘。

| 编码 | 名称 | 入口 | 说明 |
|:---:|---|---|---|
| 00 | 工程模式 | `login` + 工程命令 | 默认路径 |
| 01 | 命令会话 | `xxx --session` | S=1；凭据仍可读 `.freelog-auth` |
| 10 | 多账号工作区 | `freelog-cli studio` | 同一人多账号；凭据仅进程内存；子工程落盘含 `state.owner.userId` |
| 11 | 交互会话 | `freelog-cli session` | A=1 且 S=1；菜单多步、单进程 |

**session 一词仅指 S=1**（不写 manifest/state），不表示凭据是否落盘。完整流程、userId 规则与 studio 场景见 [CLI双维持久化设计](docs/新方案/开发/CLI双维持久化设计.md)。交互壳实现与测试分层见 [CLI双模式实现设计 §25](docs/新方案/开发/CLI双模式实现设计.md#25-交互壳sessionstudio)；TTY 验收见 [L3-H](docs/新方案/验证/探索测试清单.md#l3-h-交互壳session--studio)。

## Domain model

### 本地对象

| 对象 | 作用 | 是否可提交 Git |
|---|---|---|
| `freelog.manifest.json` | 用户长期意图：发什么、使用什么类型、版本及本地路径 | 是 |
| `.freelog/state.json` | 平台事实缓存：ID、owner、状态、已发布版本、同步指纹 | 否 |
| `.freelog/config.json` | 项目级 CLI 偏好，例如默认环境 | 可选 |
| `.freelogignore` | 扫描、模板和压缩时忽略的本地内容 | 是 |
| `.freelog-auth`（工作区） | 目录树中的身份凭据；自命令 `cwd` 向上解析，供 monorepo 多账号隔离 | 否，必须 gitignore |
| `.freelog-auth`（全局） | 用户主目录下的默认身份凭据 | 否（位于用户目录） |
| `~/.freelog-cli/auth.key` | AES-256-GCM 本地加密主密钥（32 字节，base64 落盘） | 否（用户目录，mode 0600） |
| 临时产物 | 压缩包、上传缓存、过程文件 | 否，完成或失败后可清理 |

### 不变量

1. manifest 只保存用户意图，平台 ID、owner、SHA1、远端状态和凭据不得进入 manifest。
2. state 只缓存平台事实，不成为用户长期配置入口。
3. `pull` 默认只刷新 state；只有显式操作才能将平台 listing 应用到 manifest。
4. manifest 与平台发生冲突时默认停止，由用户显式选择 pull、push 或 force。
5. 同一个 state 只能属于一个平台环境。
6. 身份凭据不得写入 manifest 或 state；不得提交 Git；工作区凭据与全局凭据的解析规则见下文「身份与凭据」。

### 身份与凭据

CLI 支持 **工作区凭据** 与 **全局凭据** 两层身份，用于 monorepo、多作者同机协作和 CI 默认账号并存。

#### 两层存储

| 层级 | 文件位置 | 典型用途 |
|---|---|---|
| 工作区 | 目录树中某层的 `.freelog-auth` | monorepo 根、业务线根目录绑定团队账号；子目录可覆盖为个人账号 |
| 全局 | 用户主目录 `~/.freelog-auth`（Windows：`%USERPROFILE%\.freelog-auth`） | 机器默认账号；无工作区凭据时的回退 |

凭据内容：`token`、`authorization`、`cookie`（dev 等环境）、`userId`、`username`、`environment`；**不保存密码**。`userId` / `username` / `environment` 以明文写入 JSON；**`token` / `authorization` / `cookie` 必须在落盘前加密，读取使用时必须解密**（见下节）。

#### 本地加密（写入加密 / 读取解密，核心）

`login` 成功后的 **写入路径** 与所有 **读取路径**（`resolveCurrentAuth` / `requireAuth`）必须遵守同一契约：

| 阶段 | 行为 |
|---|---|
| **写入（`saveAuth`）** | 对 `token` 必填加密；若存在则对 `authorization`、`cookie` 加密；写入 `.freelog-auth` 时设 `encrypted: true` |
| **读取（`readAuthFile`）** | 只接受 `encrypted: true`、合法 scope/environment/字段类型的凭据；对三个敏感字段 **解密后再** 交给 API 客户端；格式非法或解密失败必须明确报错，不得等同于“未登录”或回退其他账号 |
| **明文禁止** | 磁盘上的 `.freelog-auth` **不得**出现可读的 `token` / `authorization` / `cookie` 明文 |

**算法：** AES-256-GCM。每条密文为 base64(12-byte IV ∥ 16-byte auth tag ∥ ciphertext)。

**密钥来源（优先级高 → 低）：**

1. 环境变量 `FREELOG_CRYPTO_KEY`（任意长度字符串）→ SHA-256 派生 32 字节密钥；适用于 CI 或高级用户统一密钥。
2. 默认：用户主目录 **`~/.freelog-cli/auth.key`**（Windows：`%USERPROFILE%\.freelog-cli\auth.key`）中保存 base64 编码的 32 字节随机密钥；**首次 `login` 时自动创建**（文件 mode `0600`，并发创建用独占写入避免竞态）。
3. 测试/自动化可通过 `FREELOG_CRYPTO_KEY_PATH` 覆盖 `auth.key` 路径（不对终端用户工作流暴露）。

**无明文兼容：** 本项目没有旧凭据迁移负担。缺少严格布尔值 `encrypted: true`、scope/environment
或字段类型非法的文件一律视为损坏凭据并明确失败；用户可执行 `logout` 删除命中的文件，再重新
`login` 生成合法加密凭据。

**安全边界：**

- `.freelog-auth` 与 `auth.key` **均不得**进入 Git、manifest、state 或仓库文档。
- `auth.key` 丢失且未配置 `FREELOG_CRYPTO_KEY` 时，已有 `.freelog-auth` **无法解密** → 用户须重新 `login`（不静默降级、不伪造登录态）。
- 默认密钥与密文都位于同一 OS 用户可访问的文件系统中：该加密用于防止凭据因误提交、误复制或
  单个文件泄露而直接暴露，**不抵御已经获得同一 OS 用户文件读取权限的攻击者**。需要更强隔离时，
  应由运行环境通过 `FREELOG_CRYPTO_KEY` 和受控的秘密管理机制提供密钥。
- `--debug` / JSON 输出须对 token、authorization、cookie 脱敏（见 Implementation constraints）。

#### 解析顺序（读）

普通工程命令以 **命令有效工作目录** 为起点（`--cwd`，否则 `process.cwd()`）：

1. **`freelog-cli studio` / `freelog-cli session`**：启动时强制执行 no-save 登录，只使用本进程内 scope=`ephemeral` 的凭据；不得读取或复用工作区/全局凭据。
2. 其他命令从有效工作目录开始，**逐级向父目录**查找 `.freelog-auth`，直至文件系统 root；用户主目录的全局文件不算工作区命中。
3. **命中第一份文件** → scope = `workspace`，并记录来源路径；该文件损坏、缺字段或无法解密时必须显式失败，不得跳过后回退其他账号。
4. 整条路径均未命中 → 读取全局 `~/.freelog-auth`（scope = `global`）。
5. 仍无有效凭据 → 视为未登录。

规则：

- **就近优先**：子目录的工作区凭据覆盖祖先目录的工作区凭据；不会被「更深层 manifest 所在目录」自动绑定，只认 `.freelog-auth` 文件本身。
- **与项目边界解耦**：是否存在 `freelog.manifest.json` 不影响凭据解析；未 init 的目录也可先 `login` 再 `init`。
- **环境绑定**：凭据内 `environment` 必须与当前 `--env` 一致，否则写操作失败（code 2）。
- **自动化测试** 可通过 `FREELOG_AUTH_PATH_GLOBAL` / `FREELOG_AUTH_PATH_WORKSPACE` 覆盖路径；该机制不对终端用户暴露，不写入使用说明的正文流程。

#### 写入与清除

| 命令 | 行为 |
|---|---|
| `login`（默认） | 先保证当前目录 `.gitignore` 最终规则忽略 `/.freelog-auth`，再原子写入工作区凭据 |
| `login --global` / `-g` | 写入用户主目录 `.freelog-auth`（全局凭据） |
| `logout`（默认） | 删除 **当前上下文解析命中的** 那一份凭据（工作区或全局） |
| `logout --global` / `-g` | 仅删除全局凭据；目录树中的工作区凭据保留 |

自动化登录使用 `--password-stdin` 从非 TTY 标准输入读取一行密码；该参数与 `--password` 互斥，
密码不得进入 CLI 进程 argv、日志或 JSON envelope。交互终端省略两者，使用隐藏输入提示。

`logout` 不删除 manifest、state 或 `.freelog/config.json`。

#### 多用户与 owner

- 平台资源 **owner** 缓存于 `.freelog/state.json`；**当前登录** 来自凭据解析。
- 写操作前必须验证 owner：登录 `userId` 与平台 owner 不一致时失败，并同时给出 owner 与 current。
- 交互式 **写命令** 在执行前一行展示：`当前登录: <username>（<env>，工作区凭据|全局凭据|临时会话·不落盘）`。
- `status` 只读展示：已登录账号、凭据 scope、资源所属 owner、以及二者是否一致（✅/❌）。

#### 安全与 Git

1. `.freelog-auth` **不得**进入 manifest/state。
2. `login`、`init` 与模板生成必须保证 `.gitignore` 的最终相关规则忽略 `.freelog-auth`；已有反选规则时由 CLI 追加覆盖。
3. 压缩、扫描、批量导入的 ignore 规则 **强制排除** `.freelog-auth`（不可被用户规则反选）。
4. 工作区凭据可以位于资源工程目录的祖先路径；CLI 在写入凭据前主动建立 gitignore 安全不变量。
5. 用户主目录 **`~/.freelog-cli/auth.key`** 为本地加密主密钥；不得提交 Git；丢失后须重新 `login`（见「本地加密」）。

#### 示例（monorepo）

```text
~/work/monorepo/.freelog-auth          ← 团队账号 A
~/work/monorepo/packages/theme-x/      ← 在此 cwd 操作 → 使用 A
~/work/monorepo/packages/theme-y/.freelog-auth  ← 个人账号 B
~/work/monorepo/packages/theme-y/      ← 在此 cwd 操作 → 使用 B（就近覆盖 A）
~/elsewhere/                           ← 无祖先凭据 → 回退全局 ~/.freelog-auth
```

### 字段所有权与可变性

| 对象 | 字段 | 创建后/发布后规则 | 本地归属 |
|---|---|---|---|
| 资源身份 | `name`、`resourceTypeCode`、`resourceTypeName` | 平台资源创建后不可修改；修改需新建资源 | manifest 意图，state 保存平台确认值 |

`resourceTypeName` 必须保留来源语义：标准 `RT*` 类型在 manifest 中保存的平台展示名不是
Console `customInput`，`Resource.create` 时必须省略；只有显式 `--type-name` 或真正的自定义
类型意图才可作为自定义类型名提交。不得把 manifest 展示事实提升为创建参数。
| 资源展示 | `resourceTitle`、`coverImages`、`intro`、`tags` | 创建后可维护 | manifest 意图；pull 默认不覆盖 |
| 资源状态 | `resourceId`、owner、`status`、`latestVersion` | 平台事实；只能通过专用业务动作变化 | state |
| 版本身份与文件 | `version`、`fileSha1`、`filename` | 版本发布后不可变；变更必须发布新版本 | 发布前为 manifest 意图，发布后事实进入 state |
| 版本可维护信息 | `description`、`inputAttrs`、`customPropertyDescriptors` | 发布后可通过版本维护 API 更新 | manifest 保存期望值，state 保存最近平台事实/同步基线 |
| 版本依赖图 | `dependencies`、`baseUpcastResources`、`authExcludedItems` | 随版本发布固化；修改需要新版本，除非平台契约明确开放维护 API | manifest |
| 视频封面 | `videoCover` | 新版本发布时可声明；Console 已发布版本维护页没有该入口，因此 `version edit` 不允许修改 | manifest |
| 策略定义 | `policyName`、`policyText`、期望启停状态 | 可新增和启停；已存在正文不原地修改 | manifest 保存意图，policyId 与实际状态进 state |
| 合集展示 | manifest `collection.display` ↔ API `catalogueProperty` | 合集发布时写入，可在新一次合集发布中修改 | manifest / 映射层 |
| 合集目录 | 条目、标题、顺序 | 先写目录草稿，合集发布时按 merge 规则合入 | state 保存远端目录草稿和同步指纹 |

字段账本必须按本矩阵展开到具体 schema；不得再用“版本不可变”概括全部版本字段。

state 不是无条件可丢弃的普通缓存：`resourceId` 和 owner 等平台绑定事实只在 state 中。state 丢失后，CLI 不会根据本地名称猜测远端身份；用户必须已知 `resourceId`/授权名并显式执行 `bind`，再从平台恢复其他事实。

### 三类草稿

| 草稿 | 内容 | CLI 动作 | 冲突与发布语义 |
|---|---|---|---|
| 资源版本表单草稿 | 版本号、文件、描述、属性、依赖、继承资源、排除项 | `draft push/pull/discard` | 本地与远端都变化时失败；发布版本后不自动代表远端草稿已删除，按 API 结果处理 |
| 合集版本表单草稿 | 描述、展示设置、属性、依赖、排除项 | `draft push/pull/discard --collection` | 使用独立 fingerprint；不能和资源版本草稿共用同步元数据 |
| 合集目录草稿 | 条目增删、标题、排序 | `collection item add/update/reorder/remove/import-dir` | 每次动作写目录草稿；`collection publish` 仅在目录变化时设置 merge=1 |

`draft push` 只处理“发版表单草稿”，不处理合集目录草稿。`discard` 必须明确目标草稿，不能一次模糊删除多个远端对象。

### 依赖与授权

| 类型 | 数据 | 规则 |
|---|---|---|
| 直接依赖 | `resourceId + versionRange` | versionRange 必须可解析；发布前验证目标存在和授权状态。**声明时默认：** 用户未指定 range 时，CLI 解析依赖资源 `latestVersion` 并写入 `^<latestVersion>`；无 latest 或查询失败时回退 `*`。显式 `--version-range` / `--version` 优先（对齐 Console 云存储导入 metadata 的 `^latestVersion` 语义；手动 add 等价）。 |
| 基础上抛资源 | `resourceId` | 与直接依赖分开建模，不伪造 versionRange |
| 授权排除项 | `resourceId + excludedType + excludedValue` | 只描述合同/策略排除，不代表已经获得授权 |
| 授权完成状态 | 运行时查询结果 | 是发布硬门禁；不完整时失败并列出未解决依赖，不允许静默继续 |

付费收银台本身属于 `OUT`；CLI 可以使用已存在合同或处理平台允许的免费签约，但不能代替收银台。需要支付、策略不可验证或授权仍未完成时，CLI 必须形成浏览器接力：按当前环境返回资源或合集的 Console 依赖页 `actionUrl`、合约页 `contractsUrl`、稳定 `reason` 和完成网页操作后应重跑的 `nextCommand`。TTY 可展示可点击链接；非 TTY/JSON 模式不得自动打开浏览器。授权完成度必须按 manifest 声明的每个直接依赖逐项核对 Console 授权树；同一依赖存在历史合同时以“至少一份有效合同”为满足条件，缺节点、无合同或只有失效合同都不得视为已授权。

### 版本准备默认值

- 首次发布默认版本为 `1.0.0`。
- 维护期未显式指定版本时，建议值为平台 latestVersion 的 patch + 1；非交互写操作仍需在 manifest 或参数中确认该值，不能静默 bump。
- **同文件升版（Console「上个版本」）：** 发布新 semver 但 **复用已发版的 fileSha1/filename**，仅变更 deps、说明或属性意图；工程模式用 `publish --reuse-version`，会话模式用 `resource publish --session --reuse-version`；与 `--file` 互斥。
- 没有本地显式值和远端草稿时，新版本可以继承 latestVersion 的文件、描述、属性、直接依赖、基础上抛资源和授权排除项；继承 attrs 须按平台 descriptor 过滤（`insertMode` / `supportOptionalConfig`，见 [CLI数据操作与Console对照](docs/新方案/对齐/CLI数据操作与Console对照.md) V-06）；继承结果必须写入本地意图或在执行计划中完整展示。
- 本地显式值优先于继承值；远端草稿与本地均变化时进入冲突流程，不能自动合并复杂数组；工程模式 **draft pull 优先于** reuse/manifest 意图（对齐 Console versionCreator）。

### 策略模型

- 普通 TTY 新增策略必须先呈现 Console 同源策略模板：按资源/合集类型拉模板，选择后填写参数和策略名，再预览译文与 policyText 摘要，确认后写 `Resource.update.addPolicies`。
- `policyText` 文件入口只服务 advanced/AI/CI/迁移场景；它不能成为普通用户主体验，也不能替代模板列表、参数编译和预览确认。
- manifest 保存 `policyName`、未编码的 `policyText` 和期望启停状态；`policyId` 与平台实际状态只进入 state。
- URL 编码属于 API 适配层，不能要求用户在 manifest 手工编码。
- 新增策略前检查名称和正文重复；已有策略正文不原地修改，使用新增策略后启停切换。
- 已 online 的资源不得把全部策略停用；CLI 在写平台前执行至少一条启用策略门禁。

### 合集领域模型

1. 合集壳是 subjectType=4 的平台资源；合集本身不等于一个待压缩文件夹。
2. 合集条目可以来自：
   - 本地文件：CLI 先创建并发布子资源，再把它加入目录草稿；
   - 已有平台资源：只要目标资源 online、未被当前合集重复使用且当前用户具备加入所需的授权条件。
3. 单次选择/导入最多 100 个条目；更大输入由 CLI 分批，但最终仍需满足平台合集容量限制。
4. 条目至少包含 `itemId`、`itemTitle`、`sortId`、编号和挂载资源信息；本地 manifest 不复制平台完整条目对象。
5. `collection.display` 定义展示模式、排序方向、标题来源以及是否显示编号、图片和描述；映射到平台 `catalogueProperty`。
6. 目录内容变化通过稳定 fingerprint 判断；未变化发布 merge=0，变化发布 merge=1。

### 高级平台维护

RSS 和 collect-rules 定义为 `ADVANCED + PARITY`。`ADVANCED` 只表示它们不属于“本地文件发行核心链路”的导航分组，不降低对齐标准，也不允许从完整产品验收中豁免。完整产品签字时，两项都必须有独立的 mandatory 场景和目标环境证据。

- RSS 必须覆盖地址预检、重复占用、owner email、15 条单集阈值与日期范围、验证码、换源 GUID 风险确认、绑定、同步进度和失败项；不能把远端导入伪装成本地文件发行。
- RSS 合集的内容由 feed 管理：标题、封面、简介、标签、更新状态、目录条目、展示设置、发版表单草稿和版本发布均不得人工写入；CLI 必须在写入前拒绝。RSS 绑定、同步和读取仍走专用命令，不得将远端导入伪装成本地文件发行。
- collect-rules 必须完整表达 `serializeStatus`、启停状态、`conditionType` 和 `filterConditions`；key/operator 组合、必填值、100/60 字长度和 `authIdentity STARTS_WITH` 的 username 前缀都必须与 Console 一致。
- RSS 与 collect-rules 的 Console 源码契约必须进入漂移检查；真实 dev 验收必须分别验证 get/set round-trip，以及 inspect/send-code/bind/status/sync 状态链。验证码只能来自受控测试 RSS 邮箱，不得在仓库保存。

### 生命周期

```text
未初始化
  → 已初始化（只有本地工程）
  → 已创建/已绑定（已有平台资源）
  → 已准备（版本文件、属性、依赖满足要求）
  → 已发布（存在正式版本；文件身份固化，描述和属性仍可维护）
  → 可上架（至少一条启用策略且通过门禁）
  → 已上架
  → 维护（新版本、基础信息、草稿、策略、上下架）
```

**冻结门禁：** 资源 `status` 含冻结位时，`publish`、`collection publish`、`online` 等关键写入必须拒绝（与 Console versionCreator 位掩码语义一致）；须 Console 解冻后再操作。

命令必须验证当前状态是否允许目标转换，不能依赖用户记住正确顺序。

## Design principles

### 1. 业务语义对齐，交互不复制

Console 是平台业务语义和约束的重要证据，但不是 CLI 信息架构模板。

- 对齐：平台对象、字段含义、状态转换、权限和业务门禁。
- 不对齐：页面步骤、弹窗、拖拽、防抖、按钮布局和微应用形态。
- CLI 增强：模板、构建、压缩、Git、批量目录、dry-run、结构化输出。

当 Console 内部存在冲突路径时，CLI 选择更稳定、更安全的业务语义并明确记录：首次创建向导 Step4 可直接写 `status:1`，但侧栏上架要求正式版本和至少一条启用策略。CLI 统一采用侧栏严格门禁，创建向导的宽松路径不作为 CLI 契约。

以下差异不能伪装成逐步相同，必须作为正式产品边界记录：

| 差异 | 分类 | CLI 契约 |
|---|---|---|
| 付费支付、复杂人工签约 | `OUT` + 浏览器接力 | 输出环境感知的 Console 依赖页/合约页和可重试命令；完成后重新验证授权，不自动打开或伪造支付结果 |
| 云存储选择、可视化编辑器、封面裁剪 | `OUT` | 接受本地文件、平台资源 ID 或已裁剪结果；不实现功能不完整的终端替代品 |
| Console 自动草稿 | `EQUIVALENT` | 工程模式显式 push/pull/discard；会话模式单次提交，不跨进程保存隐式草稿 |
| Console SSE 文件属性进度 | `EQUIVALENT` | CLI 使用 REST 轮询，保持相同最终属性、超时和失败语义；传输协议不同不算业务缺口 |
| 拖拽、即时保存和确认弹窗 | `EQUIVALENT` | 稳定顺序命令、显式 update、TTY confirm 或 `--yes`；验收最终平台状态而非点击步骤 |
| RSS 验证码、资源解冻 | `PARITY` + 外部前置 | CLI 实现 RSS 状态链，但验证码必须由受控邮箱提供；冻结只能检测并拒绝，解冻仍在 Console 完成 |
| 新版本 videoCover | `CLI_ONLY` | 作为明确增强，不计入 Console parity；不开放 Console 当前不存在的已发布版本封面编辑 |

该表与 [公开差异说明](docs/新方案/使用/Console差异说明.md)、[能力矩阵](docs/新方案/对齐/CLI数据操作与Console对照.md) 和验证场景必须同步。`CONTRACT` 只表示业务事实已核验，`ENV` 未完成时不得写“完整对齐”。

### 2. 把 UI 隐性约束变成显式契约

| Console 的约束方式 | CLI 的等价设计 |
|---|---|
| 下拉框限制可选值 | 动态查询类型/枚举并校验；不接受未知值 |
| 必填、长度、格式控件 | 参数解析与 schema 校验，写操作前一次性报告 |
| 分步向导 | 状态机与前置条件，不允许跳过必要业务阶段 |
| 禁用按钮 | 明确失败，给出缺失条件和下一条安全命令 |
| 确认弹窗 | TTY 确认；非交互必须 `--yes` |
| 页面当前账号和环境 | 写操作前展示当前登录与环境；验证 owner；`status` 对照 owner | 
| 300ms 防抖保存 | 显式 `draft push`，绝不静默远端写入 |
| 页面内存中的表单 | manifest 持久化，可审阅、可提交 Git |
| 进度条和逐项结果 | 终端进度；CI 使用 NDJSON 事件流和最终汇总 |
| 支付、验证码、微应用 | 明确说明边界并失败；支付/签约返回环境感知的 Console 接力链接，不伪造成功 |

### 3. 一套业务规则，三种交互模式

| 模式 | 适用情况 | 输入 | 输出 |
|---|---|---|---|
| 交互模式 | 初次使用、缺少参数 | 引导式选择和确认 | 人类可读进度与下一步 |
| 声明式模式 | 长期维护工程 | manifest、JSON/YAML | 差异和执行结果 |
| 自动化模式 | CI、批量任务 | 完整参数、文件、环境变量 | 稳定 JSON/NDJSON 和退出码 |

三种模式只能改变输入输出方式，不能改变门禁、安全要求和最终平台语义。

### 4. 默认安全，显式覆盖

- 读操作可以自动执行；写操作必须可识别。
- 环境解析顺序固定为：命令行 `--env` → `FREELOG_ENV` → 项目 `.freelog/config.json.defaultEnv` → production fallback。production fallback 仅用于得出可行动的“环境未开放”错误，绝不用于请求平台。
- 当前环境白名单是 `dev`、`test`。任何 `production` / `prod` 值（包括 flag、环境变量、项目配置和默认回退）都必须在 API/Console URL 解析和平台写操作前以 code 4 失败；不得静默降级到 dev/test。
- 非交互写操作只有在 flag、环境变量或项目配置至少一个明确提供环境时才允许执行；production fallback 不算显式环境。
- 普通 TTY 主路径是连续任务向导：CLI 可以在进入具体写入 checkpoint 前主动引导用户选择任务、资源类型和必填字段；每一步写入前仍必须展示 preflight 和确认。
- 显式 checkpoint 命令（例如 `create`）的字段解析顺序固定为 **命令行覆盖值 > manifest**。`init` 或入口向导已写入完整
  `resource.title/typeCode/name` 时，`create --yes` 必须直接使用 manifest，不得再次强制传
  `--title/--type/--name`；若命令行覆盖值与 manifest 合并后仍缺字段，TTY 才进入该 checkpoint 的补全向导，非交互才按缺失字段
  以 code 4 失败。
- production 重新开放前，不存在交互式 production 写操作；重新开放时必须恢复显著环境提示和二次确认，并补齐独立上线验收。
- 覆盖远端或本地冲突需要 `--force --yes`，并输出被覆盖对象。
- `dry-run` 必须零持久副作用：不改 manifest/state、不构建、不生成压缩包、不上传、不写平台。
- dry-run 可以读取本地文件、计算单文件 SHA1，并进行只读平台查询；不得通过“自动 pull”回写 state。
- 对依赖构建或压缩后文件才能确定的字段，输出 `unresolved` 及其产生阶段，不伪造最终 SHA1/payload。
- dry-run 输出执行计划、已解析 payload、未决字段、只读查询和正常执行时的预期副作用。

### 5. 失败必须可行动

错误至少包含：稳定 code、发生了什么、为什么、当前关键状态、建议的下一步。不得吞掉平台异常后继续执行，也不得用模糊的“操作失败”代替业务原因。

## CLI-native capabilities

模板和压缩是产品核心能力，不是 Console parity 的附属实现。

### 模板

模板解决“从空目录到可构建工程”的问题：

- 主题和插件：生成 runtime 工程、manifest、运行时版本配置和构建入口。
- 前端库/软件库：生成 package 工程、manifest、namespace/包配置和构建入口。
- 其余资源：只建立 manifest，不强加前端工程。
- 合集：建立合集 manifest，不生成无意义的前端模板。

模板行为约束：

1. `init` 只创建本地工程，不创建平台资源。
2. 模板来源和版本必须可追溯，升级不得静默覆盖用户代码。仓库开发与 link 运行优先使用 `packages/templates`；发布安装包在不存在本地模板时解析 npm `latest` dist-tag，并把它解析成具体 SemVer 后下载、校验和按具体版本缓存。
3. 模板必须生成可直接执行的最小工程和明确下一步。
4. 已有工程可选择 `scaffold none`，不能被迫套模板；非交互初始化必须同时显式给出 `--artifact-mode file|directory-zip`，不能根据类型展示名猜测。
5. 每次 `init` 必须输出实际使用的模板 ID、npm 包名和具体版本。`latest` 只负责选择初始化时的版本，进入下载、缓存和结果记录后必须转换为具体 SemVer；CLI 不提供原地升级用户代码。模板新版本只影响之后新建的工程，安全修复通过显式迁移说明处理。
6. 模板包缺少自身 manifest 时视为无效，不允许静默合成兼容信息后继续。
7. 生成工程的依赖必须最小且按运行边界分类：浏览器运行时库放 `dependencies`；类型包、
   构建器及其插件放 `devDependencies`。模板不得携带未被源码或构建配置使用的
   包，更不得把服务端框架依赖带入主题/插件工程。
8. 当前受支持模板以 `template-compat.json` 为唯一清单；仓库中已移除的模板必须同时退出
   兼容矩阵、CLI 可选列表和兼容检查，不得保留一个必然无法初始化的入口。当前运行时工程
   只支持 Vite React/Vue（JavaScript/TypeScript），包工程支持 JavaScript/React/Vue。
9. package preset 必须创建平台叶子类型，不能把「前端库」父节点直接写入 manifest。
   `package-js` 对应「JS工具包」，`package-react` / `package-vue` 对应「组件库」；CLI 按
   展示名从当前环境类型树解析实际 code，避免跨环境写死 `RT*`。显式 `--resource-type`
   始终优先，且仍须通过叶子类型校验。该规则与 Console 类型输入只提交
   `isTerminate=true` 候选一致。
10. 通用 `type pick --category package` 在非交互模式没有模板上下文，面对多个 package 叶子时必须以
    code 4 拒绝，不能任选一个 code。`init package --template package-*` 或显式 `--resource-type`
    才是可以定稿类型的入口；TTY 下由逐级选择完成同样的明确选择。
11. 当前 latest 策略只用于主题/插件的四个 runtime 模板。已有 npm latest `3.0.0` 缺少当前 CLI 必需的 `template.manifest.json`，因此发布顺序固定为：先将当前四个 runtime 模板发布为新的 `4.x` latest，并验证 tarball 契约；再发布 `@freelog-cli/cli2`。不得先发布依赖 latest 的 CLI。暂停验收的 package 模板继续使用原有精确版本，不进入本次改造。

### 构建与压缩

发行物分为两类：

| 发行物 | 输入 | 发布前处理 |
|---|---|---|
| 单文件资源 | 本地文件 | 校验类型、大小、存在性和 SHA1，原文件上传 |
| 工程型资源 | 构建产物目录 | 校验目录后生成临时 zip，再计算 SHA1 和上传 |

产品规则：

1. 是否压缩由资源类型能力决定，不能只靠展示名或散落的硬编码。
2. `publish` 消费已准备好的文件或构建目录；`release` 可以编排 validate → build → package → publish → online。
3. 内部统一能力字段为 `artifactMode: file | directory-zip`。平台适配层只读取显式能力字段 `artifactMode/compress/needCompress/isCompress/packageMode/filePackageMode` 并规范化为该字段；随后与 init 写入的模板能力核对。两者均缺失、任一值非法或两者冲突时校验失败，不按中文/英文展示名或类型 code 猜测。
4. 压缩必须遵守 ignore 规则，排除 state、凭据、缓存、源码垃圾和临时文件。
5. ignore v1 采用项目根相对的 POSIX 路径；支持空行、`#` 注释、`*`、`?`、`**` 和目录后缀 `/`；暂不支持 `!` 反选，出现时明确报错。`.freelog/`、auth、VCS 和系统临时文件是不可反选的强制排除项。
6. 相同输入、配置和 CLI 版本必须产生字节级相同的 zip：条目排序、时间戳、权限和路径分隔符均规范化。
7. 压缩包是临时上传产物，不回写为用户长期意图，成功或失败后均可清理。
8. 构建、压缩、上传和平台写入必须分别报告状态，不能合并成一个不可诊断的“发布失败”。

### Build contract

- `init` 可以安装依赖，但不自动构建。
- `publish` 只消费 manifest 指定的既有文件或构建目录，不执行任意构建命令。
- `release --build-cmd` 是显式编排能力：在项目 cwd 中执行用户提供的命令、继承当前环境、流式输出，非零退出立即停止；CLI 不猜测 package manager 或默认脚本。
- 提供 `--build-cmd` 时，build 前校验 manifest、owner、类型和版本等非产物契约，不要求尚未生成的产物；build 后必须再执行完整 publish 产物校验。
- dry-run 不执行 build，只显示命令、cwd、预期产物路径和未决字段。
- `release --bump` 必须先在内存形成计划版本，并用计划版本完成 build 前后校验；校验通过前不得把 bump 写入 manifest。build 完成后必须重新 validate 产物路径，再进入 package/upload 阶段；`release --online` 先按 publish 校验和发布，随后由 online service 执行动态上架门禁。

### 批量目录

- 扫描前展示将处理、忽略和拒绝的文件统计。
- 每个输入项拥有稳定结果：成功、失败、跳过及原因。
- 中断后可依据持久化报告重试失败项，不能只依赖终端滚屏。
- 平台批次限制由 CLI 自动分批，但最终仍按单资源提供结果和后续维护入口。
- `createBatch` 只有在调用前即可证明能力不存在（资源类型 capability 不支持或 SDK 方法不存在）时，才允许改走逐项创建；一旦调用已经发起，任何异常都保留 `remote_outcome_unknown`，不得按 URL、404/405 文案或网络错误猜测未执行。
- 合集目录导入的 `100` 是 Console 单次选择/单次提交上限，不是已证实的合集总容量。CLI 必须在创建子资源前完成本地扫描和静态门禁，再按最多 100 项分批写目录草稿；不得先创建、上架全部子资源后才做数量检查。

正式批量报告保存在 `.freelog/reports/<runId>.json`，并包含：schemaVersion、runId、命令、环境、输入目录 fingerprint、配置 fingerprint、开始/结束时间、每项幂等键、阶段、结果、resourceId/versionId、错误和清理状态。`.freelog/reports/latest.json` 只保存最近报告路径。

Studio 单文件首发复用同一报告状态机，最近报告指针单独保存在
`.freelog/reports/studio-latest.json`，不得覆盖 `import-dir` 的 `latest.json`。Studio
必须先上传文件再创建版本，并在远端写入前校验当前登录具有数字 `userId`；报告同时
记录 actor，恢复时必须与当前账号一致。同一工作区从恢复检查到远端写入和本地落盘
必须持有跨进程异步排他锁；同进程并发也不得重入。`remote_outcome_unknown` 只能通过
显式对账动作转为“确认未创建、可重试”或“确认已创建、补 resourceId 后恢复”，并校验
环境、actor 与当前文件 SHA1。确认已创建时还必须从平台读取 resourceId，校验 owner、
授权名、资源类型以及目标版本 fileSha1；不接受未经远端验证的手填 ID，禁止要求用户手工修改报告。

- 每项幂等键由规范化相对路径、内容 SHA1、资源类型和目标授权名共同确定。
- `--resume <report>` 从最后一个可安全恢复阶段继续；`--retry <report>` 只重新执行失败项。
- 平台成功但本地回写失败必须记录为 `remote_succeeded_local_pending`，重试时先查询并修复本地状态，不能重复创建平台资源。
- 远端写请求已经发出但客户端未能确认响应时记录为 `remote_outcome_unknown`；自动 `resume/retry` 必须停止并要求按授权名、版本和 owner 对账，不能猜测失败后重复创建。
- skip、failed、waived、passed 分开统计；skip 不得计入 passed。

## Interaction architecture

### 业务动作优先于命令名称

产品先定义以下动作，再映射为命令：

- 建立本地工程
- 创建或绑定平台对象
- 编辑长期意图
- 校验当前工程
- 比较本地与平台
- 保存或拉取草稿
- 构建和准备发行物
- 发布版本（版本号和文件身份不可变；描述和属性可维护）
- 管理策略与依赖
- 上下架
- 批量处理与失败重试

命令可以演进，但业务动作、前置条件和副作用必须稳定。

### 副作用等级

| 等级 | 行为 | 示例要求 |
|---|---|---|
| R0 | 纯读取 | 不登录也能完成的本地检查尽量离线运行 |
| L1 | 修改本地意图 | 显示修改文件；可通过 Git 审阅 |
| T2 | 生成临时产物/上传存储 | 显示路径、大小、SHA1；失败可清理 |
| P3 | 修改平台对象 | 环境、owner、目标 ID、动作必须明确 |
| D4 | 覆盖、删除或不可逆动作 | 必须显式确认，非交互要求 `--yes`，冲突时要求 `--force` |

复合命令必须按阶段报告副作用，失败时指出已完成到哪一步以及如何恢复。

### 机器输出协议

`--json` 使用单结果 envelope：

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "publish",
  "data": {},
  "warnings": [],
  "meta": { "env": "dev" }
}
```

失败时使用同一 envelope，将 `data` 替换为 `error: { code, message, hint, details }`。debug 信息只在显式 debug 时出现并完成敏感字段脱敏。

`--json-lines` 的每一行包含 `schemaVersion`、`command`、单调递增 `seq`、`event` 和 `data`；批量任务事件为 `start`、`ok`、`fail`、`skip`、`done`，其中逐项结果分别由 `ok` / `fail` / `skip` 表达。stdout 只输出协议数据，日志和诊断进入 stderr。新增可选字段保持向后兼容，删除/改义必须提升 schemaVersion。

### 同步与冲突

- 平台事实变化：`pull` 更新 state。
- 用户希望采用平台 listing：显式 `pull --apply-listing`。
- 用户希望把本地表单保存为平台草稿：显式 `draft push`。
- 本地和远端都变化：默认冲突，不按时间戳猜测赢家。
- 强制覆盖前输出差异摘要和覆盖方向。
- Store 只能提交调用方相对读取基线真正改变的字段；完整旧 DTO 不得覆盖并发产生的无关本地意图。同一字段双方都变化时以 code 3 停止。
- 远端写与本地回写不是同一事务。每个写用例必须属于且明确实现以下一种恢复模型：远端请求天然幂等并在重试前 GET 对账；通过 `remoteWriteConfirmed` 只合并平台事实；或先持久化正式 report，再用 `remote_succeeded_local_pending` / `remote_outcome_unknown` 恢复。普通异常不得让用户误以为平台一定未写入。
- 非幂等创建在重试时必须按稳定身份（resourceId、授权名、版本、SHA1、owner）查询平台结果；版本发行还必须核对 filename、说明、封面、依赖、授权排除、批量签约和属性等完整不可变发布意图。只有所有字段一致时才补本地状态，发现冲突则停止人工核对，不得再次创建或把新的本地意图标记为已发布。

## Interaction states

- **Prompting（TTY）：** 每个交互输入步骤须在用户键入 **之前** 展示该字段的 HARD 约束摘要；键入时使用与写平台前相同的校验器即时反馈。规格见 [CLI交互与字段约束](docs/新方案/开发/CLI交互与字段约束.md)；Console 字段事实见 [Console表单字段与交互规则](docs/新方案/对齐/Console表单字段与交互规则.md)。
- Loading：长任务显示阶段、当前项和总量；JSON 模式发出结构化事件。
- Empty：说明缺少的是本地工程、平台对象、版本、策略还是合集条目。
- Error：稳定错误结构，包含恢复建议；部分成功必须明确列出成功项。
- Success：只在平台响应和必要本地回写完成后报告成功。
- Disabled：CLI 中表现为预检失败，不静默跳过。
- Offline/slow network：区分本地校验失败、网络失败和平台业务拒绝；可安全重试的步骤必须标识。

## Content voice

- 语气：直接、具体、不过度技术化。
- 术语：资源、版本、合集、条目、草稿、策略、依赖、上架；同一概念不得出现多个字段名。
- 提示顺序：结果 → 原因 → 当前状态 → 下一步命令。
- 禁止：乱码或 `????`、模糊的“参数错误”、把内部 API 名直接暴露给普通用户。
- 人类输出可以本地化；JSON key、error code 和事件名必须稳定且使用英文标识。

## Visual language

CLI 不定义网页视觉系统，但终端呈现必须一致：

- 颜色只作增强，关闭颜色后仍能理解。
- 成功、警告、失败不能只靠颜色区分，必须带文本或符号。
- 表格用于小规模摘要；长列表使用逐行输出或 NDJSON。
- 进度输出不得破坏 `--json` / `--json-lines` 的可解析性。

## Components

CLI 的“组件”是可复用交互与契约：

- 环境选择与写保护
- TTY 确认和 `--yes`
- cwd/项目发现
- manifest/state 读取、校验和原子写入
- owner、同步和冲突门禁
- 人类输出、JSON 结果、NDJSON 进度、统一错误
- 文件扫描、ignore、压缩、SHA1 和上传阶段

这些能力必须集中实现，不能由各命令自行拼装不同语义。

## Accessibility

- 键盘/焦点：所有交互完全可用键盘完成，支持取消并保持状态可解释。
- 可读性：不依赖颜色；重要 ID、路径和命令可复制。
- 屏幕阅读器：交互提示顺序稳定，避免持续重绘整屏。
- 感知差异：支持 `NO_COLOR`、非 Unicode 回退和关闭动画/进度 spinner。

## Responsive behavior

CLI 的响应式目标是不同终端宽度和执行环境：

- 窄终端使用逐项布局，不截断关键 ID、路径和错误原因。
- 非 TTY 不显示 spinner、ANSI 控制序列或交互提问。
- Windows、macOS、Linux 的路径、shell 引号和换行行为必须有明确兼容策略。

## Implementation constraints

- Node.js 版本和支持平台由包元数据统一声明。
- manifest/state 必须有正数 `schemaVersion`；当前仅接受 v1，缺失/非法版本和未知未来版本必须明确拒绝。每次升版都必须通过独立、可测试的 N → N+1 迁移入口，不得在 normalize 时静默改写版本。
- 工程模式的所有本地读-改-写必须持有跨进程项目写锁；读取结果携带不落盘的 revision，写入时若发现已被其他进程更新则以 code 3 冲突失败，不得 last-writer-wins。Store 在锁内合并 patch 时必须保留刚读取快照的 revision，不能让调用方旧 revision 覆盖它。manifest/state 成对更新必须先落可恢复事务日志，读取前自动完成中断的提交；原子替换须先 fsync 临时文件，POSIX 上 rename 后再 fsync 父目录。
- 平台类型、字段和能力优先运行时查询；无法查询时明确失败，不静默使用过期常量。
- 所有写服务入口都必须执行环境、owner、同步和业务门禁，不能只依赖命令层。
- JSON/NDJSON 是公共接口，需要版本化和回归测试。
- 凭据不得进入仓库、manifest/state、测试脚本或文档；工作区凭据仅可存于已 gitignore 的 `.freelog-auth`，也可使用环境变量或安全凭据存储。
- 单元、契约、真实环境场景和人工验收必须分层记录，不能用一个动态数字代表全部质量。
- manifest、batch config、batch report 和 JSON/NDJSON envelope 都必须有随包发布的机器可验证 schema；技术文档只引用 schema，不复制另一份字段定义。

## Verification contract

产品验收分四层，互不替代：

| 层 | 证明什么 | 不证明什么 |
|---|---|---|
| 单元/静态检查 | 纯逻辑、类型、门禁和回归 | 真实平台可达性 |
| 契约测试 | CLI payload 符合已确认的平台/Console 契约 | Console UI 当前完整行为 |
| dev/test 场景 | 指定版本、账号、环境下的真实业务链路 | production、所有类型和长期稳定性 |
| 人工跨端验收 | Console 与 CLI 的业务结果及体验差异 | 自动持续回归 |

运行结果必须记录：commit、CLI 版本、环境、账号角色、场景 ID、通过/失败/跳过、产物和时间。跳过不得计为通过。动态测试数字不得写进产品设计正文。

## Open questions

- [x] `artifactMode` 适配契约已收口：只接受平台显式 capability 或 manifest/template 明示值；展示名 fallback 已删除。平台后续若统一为单一字段，仅缩减 adapter，不改变产品契约。
- [x] 已发布版本 `videoCover`：当前 Console 维护页无入口，CLI 不开放 `version edit --video-cover`；将来只有 Console/API 契约同时确认后再作为新能力评审。
- [x] 合集 `100`：按 Console 源码裁决为单次选择/提交上限；CLI 按 100 分批。平台若另有总容量限制，以真实 API 错误停止并记录已完成批次，不预设未知总上限。
- [ ] `release --build-cmd` 长期是否改为 argv/脚本名协议以避免 shell 差异？负责人：CLI；影响：跨平台和安全。
- [ ] production 上线前需要哪些账号、资源类型和人工验收矩阵？负责人：QA/产品；影响：发布门禁。
