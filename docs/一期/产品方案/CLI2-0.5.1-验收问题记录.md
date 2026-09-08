# @freelog-cli/cli2@0.5.1 验收问题记录

- 验收日期：2026-09-08
- 验收人：Claude（Cursor 代理，真网 dev 环境实测）
- 被测包：`@freelog-cli/cli2@0.5.1`（npm 全局安装，bin：`freelog-cli`）
- 参照系：本仓 `docs/一期/产品方案/业务梳理/字段级校验对照表.md`（含 2026-09-07 真网 25/25 + 45/45 + 28/28 记录）、`docs/一期/产品方案/脚手架设计/PHASE/单资源/` 全套
- 原始输出：系统临时目录 `freelog-runtime-cli-verification/` 下 `published-smoke.txt`、`published-deep.txt`、`published-final.txt`、`published-attrfix.txt`、`field-rules.txt`、`commands.txt`、`scenarios.txt`

状态图例：**[问题]** 需要修或裁定；**[口径]** 不是缺陷，但与本仓文档/测试前提不同，使用前要知道；**[观察]** 疑似问题但证据不足，待复测；**[通过]** 已验证符合准绳。

---

## 1. 问题清单

### 1.1 [问题] logout 只删工作区凭据，鉴权回落全局凭据文件

现象：在真实 `USERPROFILE` 下（`~/.freelog/auth-default.json` 已有 dev 凭据），工程内 `logout --yes` 只删除 `.freelog/auth`，随后 `online`、`version show` 仍然成功打到平台。

源码定位（发布包 `dist/bin/index.js`）：

```
loadAuth: findWorkspaceAuthPath(cwd) ?? globalAuthPath(homedir)
globalAuthPath: ~/.freelog/auth-default.json
```

即：工作区凭据缺失时**静默回落**全局凭据。深测脚本隔离 `USERPROFILE/HOME` 后复测，`logout` 后 `online`/`version show` 均正确报「请先 login」，行为本身闭环。

影响与风险：

1. 心智不符：「已退出登录」字面承诺未达成（当前机器上仍以同一身份持有凭据）。
2. 多工程切换 / 共用机器场景下，用户以为登出了，实际后续命令仍会用全局身份写平台。
3. `login --global` 写入、`logout` 不带 `--global` 不清除，两把钥匙一把锁。

建议（任选其一并写进使用文档）：

- `logout` 默认连全局一起清（或至少打印「全局凭据仍在」警告）；
- 或 `loadAuth` 回落全局时打一行「正在使用全局凭据 {env}/{loginName}」，让回落可见；
- 或文档明示 `logout --global` 的存在并在 `logout` 输出里提示。

### 1.2 [问题] `type search` 关键词查询恒返回空

现象（已登录、dev）：

- `type search 视频 --env dev` → exit 0，stdout 为空
- `type search RT006 --env dev` → exit 0，stdout 为空
- `type info RT006003 --env dev` → 正常返回 `RT006003 短视频`
- `type list` 正常

源码定位：`searchLeafTypes` 把关键词塞进 `nameChain` 参数调 `GET /v2/resources/types/listSimpleByParentCode`。

疑点：`nameChain` 在平台侧语义是「类型名称链（如 `视频>短视频`）」而不是模糊关键词。本仓真网验证时 `type search` 用的是同一接口但此前（对照表 §8 S41 轮）是可用的——不排除平台参数语义变化或 0.5.1 少传了参数（如 `name`/`parentCode` 组合）。

建议：抓一次平台原始响应确认 `nameChain=视频` 是否本就该空；若语义如此，应改传 `name` 参数或做树内过滤。修完补 `type search` 的 dev 真网用例。

### 1.3 [观察] 非交互 `init` 不接受「当前目录」省略写法

现象：`freelog-cli init --type RT006003 --yes --env dev`（在临时工程根内、目标是当前目录）报「非交互 init 请显式提供 [dir]」。显式 `init .` 未测（首轮脚本用了无 dir 形式）。帮助文本是 `init [options] [command] [dir]`，`[dir]` 可省略，但非交互模式下省略被拒。

建议：确认这是有意设计还是参数解析丢省略位；若有意，报错文案应改为「非交互 init 请显式提供 [dir]，当前目录用 `init .`」。

### 1.4 [观察] 无凭据 `status` exit 0

现象：干净环境下 `status --env dev` 输出「本地：无 | 工作稿：无 | 线上：未查询」，exit 0。

争议点：`status` 定位是「只打印现状」，exit 0 说得通；但脚本化场景（CI 里判断登录态）拿不到非零信号，只能解析文本/`--json`。`status --json` 在未登录时输出 `{"code":"AUTH_REQUIRED","message":"请先 login"}` 且走 stdout、exit 1——同为 status，两种模式的 exit 语义不一致。

建议：裁定 `status` 未登录时 exit 0 还是 1，两种模式对齐。

### 1.5 [观察] `policy template list` 返回 0 条模板

现象：dev 下 `policy template list` 输出「第 1/1 页，共 0 条」，exit 0。本仓 2026-09-07 真网验证（对照表 §8，`test/verify-commands.mjs` 批次 A）时同接口有数据。可能是 dev 模板数据被清、也可能是 0.5.1 请求参数差异（如 `resourceTypeCodes4Resource` 没带）。待与 dev 平台数据核对后定性。

### 1.6 [口径] `--version` 不存在，版本旗标是 `-V, --cli-version`

`freelog-cli --version` 报 `unknown option '--version'`。常见 CLI 惯例是 `--version`，commander 的 `.version()` 默认就注册 `-V/--version`；0.5.1 显式改名 `--cli-version`。不是缺陷，但对新用户是第一个绊脚石，建议使用文档首屏写明（已写入打包 docs/README.md 的话维持现状即可，本条只提示）。

### 1.7 [口径] 根帮助里 `version` / `policy` 不带 `[command]` 提示

`init [options] [command] [dir]`、`template [options] [command]`、`type [options] [command]` 在根帮助里标了子命令形态，而 `version [options]`、`policy [options]` 没标——但两者实际都有子命令且正常工作。纯帮助渲染不一致，建议统一。

### 1.8 [口径] `type search` / `type info` 需要登录态

未登录时 `type search`/`type info`/`type list` 被 `请先 login` 拦截。本仓 PHASE 文档把 `type search`/`type info` 定位为「供人先查」的独立命令（`创建/01-Step1 §1.6`），未提登录前置。若保持登录前置，PHASE 文档应补一句；若希望免登录可查（类型是公开数据），实现侧放开即可。

---

## 2. 已验证符合准绳的部分（发布包 vs 字段级校验对照表）

| 准绳条目 | 0.5.1 实测 | 结果 |
|----------|-----------|------|
| prod 默认拦截（「prod 暂未开放」） | login 无 `--env` | 通过 |
| 坏凭据拒绝 | login 错误密码 → 「用户名或密码错误」 | 通过 |
| 自定义属性：一行式添加（预览后写稿） | `version attr add "名称=… 键=author 值=…"` | 通过 |
| 属性键唯一 | 重复键 → 「键 author 已存在」 | 通过 |
| 属性名称唯一 | 同名第二条被拒 | 通过 |
| 属性值 ≤140 | 141 字 → 「自定义属性值最长 140」 | 通过 |
| `attr set` 改值 / `attr list` | 正常，list 输出 `author=值 名称` | 通过 |
| 依赖范围 maxSatisfying 门禁 | `--range ^9.0.0` → 「这个范围对不上对方已发行的版本」 | 通过 |
| 依赖默认 `^latest`、去重、`dep rm` | 正常 | 通过 |
| 不能依赖自己 | → 「不能依赖自己」 | 通过 |
| 类型不允许可选配置时拦截 | RT006003 `option add`（未走到业务校验前被 argv 拦，option 门禁未真网复验，见 §3 待办） | 部分 |
| 首版写死 1.0.0、`--prepare` 只备稿 | 正常 | 通过 |
| 已有版本再 create-version 拒绝 | → 「线上 latest 是 1.0.0，请用 update-version」 | 通过 |
| 新号必须 > latest | `--version 1.0.0`（latest 1.1.1）→ 拒 | 通过 |
| `--version` 与 `--bump` 互斥 | → 「不能一起用」 | 通过 |
| 本地文件不在不准续用 sha1 | `--artifact not-exist.bin` → 「本地文件不在…不准续用 sha1」 | 通过 |
| 回显源存在性用 resourceVersionInfo1 | `draft pull --version 9.9.9` → 「没有这个版本」 | 通过 |
| `draft discard` / `show --local` | 正常；提交后无稿报「没有本地版本工作稿」 | 通过 |
| 已发号只改描述（PUT 只带 description） | `version description` 正常，读回生效 | 通过 |
| 策略 `--from-file`（status:1 追加） | 正常，「已添加并启用授权策略」 | 通过 |
| `validate --for online` / `online` / `offline` | 全链通过；online 幂等；未启用策略时拦「上架须至少一条启用策略」 | 通过 |
| `version set --artifact` 只改记录路径 | 正常，`status` 回显路径 | 通过 |
| 干净环境下未登录拦截 | `online`/`version show` → 「请先 login」 | 通过 |
| 错误 `--json` 输出 | `{"code":"AUTH_REQUIRED",...}` 可解析 | 通过 |

命令面注册：`version {show,set,draft,description,attr,option,dep}`、`policy {list,template,apply,set}` 全部注册且 `--help` 正常（首轮根帮助不显示 `[command]` 的疑虑已用直接调用排除，见 §1.7 仅剩显示问题）。

---

## 3. 覆盖缺口（本轮没测到，验收不算数的地方）

1. **`version option` 真网全链**：本次只在 RT006003（类型不支持）上验证了拦截路径，`supportOptionalConfig===2` 类型（RT001 主题）上的 option add/set/rm/下拉默认第一项/选项去重没跑。
2. **`version dep` 的签约链**：`dep add` 走到了 batchAuth/签约（依赖池资源带免费策略），但没有验证付费策略落 `authStatus 128` 待执行态的分支，也没有验证 `cycleDependencyCheck` 真环拦截。
3. **多身份迁移**：仓库文档已列（`单工程单资源重构清单.md`），本轮未构造旧 `1.json/2.json/index.json` 工程做迁移实测。
4. **主题/插件工程**（`init theme/widget`、zip 打包上传）未测。
5. **`--cwd` 跨目录、`--global` 登录/登出**未系统测。
6. **test 环境**：只测了 dev；`--env test` 未跑。

---

## 4. 测试方法备注（复现用）

- 隔离鉴权：子进程设 `USERPROFILE`/`HOME` 指向临时空目录，避免全局凭据回落污染结论（§1.1 的教训）。
- 一行式传参：spawn 必须用**无 shell + 精确 argv**（或 `node dist/bin/index.js …`），`shell:true` 会把 `名称=作者 键=author 值=x` 拆成多个参数，误报「too many arguments」——首轮两个 FAIL 假阳性即由此来。
- 报告：`%TEMP%/freelog-runtime-cli-verification/published-*.txt`。

## 5. 结论

0.5.1 的**核心发行链路（create → create-version → policy → online/offline → draft pull → update-version → description）在 dev 真网全部通过**，字段校验与对照表一致。放行前需要处理的是 §1.1（logout/全局回落的心智与安全问题，最低成本先补提示文案）和 §1.2（type search 恒空，功能性回归）；§1.3–1.5 建议裁定后记录；§3 的覆盖缺口建议在下一轮验收补齐，特别是 `version option` 全链与付费签约分支。
