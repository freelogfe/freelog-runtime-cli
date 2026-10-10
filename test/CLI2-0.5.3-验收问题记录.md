# @freelog-cli/cli2@0.5.3 验收问题记录

- 验收日期：2026-09-09
- 验收人：Claude（Cursor 代理，真网 dev 环境实测）
- 被测包：`@freelog-cli/cli2@0.5.3`（npm 全局安装，bin：`freelog-cli`；npm 上现有 0.5.0–0.5.3）
- 参照系：本仓 `docs/一期/产品方案/业务梳理/字段级校验对照表.md`（含 2026-09-07 真网 25/25 + 45/45 + 28/28 记录）、`docs/一期/产品方案/脚手架设计/PHASE/单资源/` 全套
- 验证脚本：`test/verify-published-053-full.mjs`（全量 90 项，80 过 10 败）、`test/verify-published-053-focus.mjs`（失败项定位补测 20 项，16 过 4 败）
- 原始输出：系统临时目录 `freelog-runtime-cli-verification/` 下 `published-053-full.txt`、`published-053-focus.txt`

> 版本说明：2026-09-08 曾对 0.5.1 做过一轮验收（结论当时记录在本文档，旧 0.5.1 结论已清理）。0.5.2/0.5.3 迭代后本记录以 **0.5.3** 为准重写；0.5.1 的历史结论不再单独维护。

状态图例：**[问题]** 需要修或裁定；**[口径]** 不是缺陷，但与本仓文档/测试前提不同，使用前要知道；**[观察]** 疑似问题但证据不足，待复测；**[通过]** 已验证符合准绳。

---

## 0.5.3 相对 0.5.1 的变化（本轮确认）

- 新增顶层 `resource` 命令组与全局 `--resource <selector>`（`id:` / `name:` / `title:` / `artifact:` / `file:N.json`），支持**一工程多资源**（`1.json` / `2.json` …）。
- 新增 `resource sync`（标题同步，支持批量与 `--resource` 定向）。
- 新增 `version draft description`（改更新稿描述）。
- `init` 支持 `init . --type <code> --artifact <path>`（0.5.1 的 §1.3「非交互 init 不接受省略 [dir]」在显式 `init .` 下可用；完全省略 dir 的写法仍未测）。
- 稿写入命令（`attr add/set` 等）**必须 `--yes` 确认预览**，非交互不带 `--yes` 时拒「请加 --yes 确认预览」——与本仓设计一致。
- 空目录无凭据 `status`：0.5.1 是 exit 0「线上：未查询」；0.5.3 改为 **exit 1** + 指引文案（「当前目录没有资源状态…create / bind」）。
- `policy template list` 支持 `--page` / `--page-size`。

---

## 1. 问题清单（0.5.3 仍然存在或新发现）

### 1.1 [问题] 多资源工程第二份 `create-version` 提交必失败：「不能创建重复的资源」

现象（`verify-published-053-full.mjs` §10 与 `verify-published-053-focus.mjs` §E 双重复现）：

1. 同一工程 `create` 第二份资源（RT005001，独立短标识 `focus2-*`，artifact `cover.png`）→ 成功，生成 `2.json`。
2. `create-version --prepare --resource id:<第二份>` → 成功，`2.version.json` 生成且 `draft.resourceId` 归属正确。
3. `create-version --resource id:<第二份> --yes` → **失败**：「提交失败：不能创建重复的资源」。
4. 追加 `--artifact cover.png` 重提 → 同样失败。

定位线索：prepare 阶段草稿归属正确（E4），失败发生在**提交**环节。「不能创建重复的资源」是平台对 `POST /v2/resources`（建壳）的报错而非发版接口的报错——怀疑 0.5.3 对 `draftKind: initial` 的第二份资源提交时仍走了建壳分支（或用了错误身份），而不是对已有 resourceId 发 1.0.0。

影响：**一工程多资源的「第二份起发行」链路完全不可用**，这是 0.5.3 新特性（多资源工程）的核心场景。

建议：优先修。复现脚本现成（`verify-published-053-focus.mjs` §E），修完先过这条再谈发版。

### 1.2 [问题] `status --json` 不输出 JSON

现象（已登录、单资源工程）：

```
freelog-cli status --json --env dev
→ stdout: 本地：1.json focus-* RT006003 video.mp4 | 工作稿：有 | 线上：resourceId=… latestVersion=
```

`--json` 被**忽略**，输出人类文本。0.5.1 时代 `--json` 在错误路径输出过 `{"code":"AUTH_REQUIRED",...}`，正常路径本轮未在 0.5.3 观察到 JSON。CI / 脚本化场景无法解析。

建议：`status --json` 正常路径输出 JSON（至少含 `identities[]`、`draft`、`latestVersion`、`auth` 布尔）。

### 1.3 [问题] `type search` 关键词查询恒返回空（0.5.1 遗留，未修）

现象（已登录、dev，0.5.3 复测）：

- `type search 视频` → exit 0，stdout 空
- `type search RT006` → exit 0，stdout 空（按 code 搜也不行）
- `type info RT006003` / `type list` 正常

源码定位：`searchLeafTypes` 把关键词塞 `nameChain` 调 `GET /v2/resources/types/listSimpleByParentCode`；`nameChain` 平台语义是名称链（`视频>短视频`）而非关键词。空结果时也没有「未找到匹配的资源类型」提示，静默空输出。

建议：改传 `name` 参数或树内过滤；空结果补提示文案；补 dev 真网用例。

### 1.4 [观察] `policy template list` 返回 0 条模板（0.5.1 遗留，未定性）

dev 下 `第 1/1 页，共 0 条`，exit 0。0.5.3 已支持 `--page/--page-size`，但仍是 0 条。本仓 2026-09-07 验证时同接口有数据。待与 dev 平台数据核对：是数据被清还是 CLI 参数差异（`resourceTypeCodes4Resource` 是否带上）。

### 1.5 [口径] `--version` 不存在，版本旗标是 `-V, --cli-version`（0.5.1 遗留）

`freelog-cli --version` → `unknown option '--version'`。对新手是第一个绊脚石，建议使用文档首屏写明，或补 `--version` 别名。

### 1.6 [口径] 根帮助里 `version` / `policy` 不带 `[command]` 提示

`init/template/type` 在根帮助标了 `[command]`，`version [options]`、`policy [options]` 没标（但 `version --help` 实际显示 `[command]` 且子命令齐全）。纯渲染不一致。0.5.3 顶层帮助新增了 `--resource` 说明，正常。

### 1.7 [口径] `type search` / `type info` / `type list` 需要登录态

未登录被 `请先 login` 拦截。PHASE 文档把 type 组定位为「供人先查」（`创建/01-Step1 §1.6`），未提登录前置。二选一：文档补前置，或实现放开（类型是公开数据）。

### 1.8 [观察] 多资源工程下未登录拦截次序：资源解析先于鉴权

全量测 §12：logout 后在**多资源工程**直接 `online` / `version show`（不带 `--resource`），先报「当前工程有多份资源状态；请使用 --resource 指定」而不是「请先 login」。用 `--resource` 定向后才正确报 `请先 login`（focus 测 §F 已验证拦截闭环）。不是安全问题（终归被拦），但报错次序让用户先去解决选择问题、登录问题被后置，建议鉴权前置。

---

## 2. 已验证符合准绳的部分（0.5.3 vs 字段级校验对照表）

| 准绳条目 | 0.5.3 实测 | 结果 |
|----------|-----------|------|
| prod 默认拦截 | login 无 `--env` → 「prod 暂未开放」 | 通过 |
| 坏凭据拒绝 | 错误密码 → 「用户名或密码错误」 | 通过 |
| 一行式属性添加（须 `--yes` 确认预览） | `attr add … --yes` → 预览后写稿 | 通过 |
| 属性键唯一 / 名称唯一 | 「键 author 已存在」/ 同名被拒 | 通过 |
| 属性值 ≤140 | 141 字被拒 | 通过 |
| `attr set`（自定义键）/ `attr list` | 正常，`author=值 名称` | 通过 |
| `attr add/set` 缺 `--yes` | 「请加 --yes 确认预览」 | 通过 |
| 依赖 maxSatisfying 门禁 | `--range ^9.0.0` → 「这个范围对不上对方已发行的版本」 | 通过 |
| 依赖默认 `^latest`、`dep rm`、re-add | 正常 | 通过 |
| 类型不允许可选配置 | RT006003 `option add` → 「当前类型不支持可选配置」 | 通过 |
| 首版 1.0.0、`--prepare` 只备稿、提交后删稿 | 正常 | 通过 |
| 已有版本再 create-version 拒绝 | 「…请用 update-version」 | 通过 |
| 新号 > latest / `--version`+`--bump` 互斥 / 旧号拒绝 | 全部正确拦截 | 通过 |
| 本地文件不在不准续用 sha1 | `--artifact not-exist.bin` → 「本地文件不在…不准续用 sha1」 | 通过 |
| 回显源存在性（resourceVersionInfo1） | `draft pull --version 1.0.1` 正常覆盖；`9.9.9`（0.5.1 轮）拒 | 通过 |
| `draft description` / `draft pull` 覆盖预览 | 正常 | 通过 |
| 已发号只改描述 | `version description` 正常，读回生效 | 通过 |
| 策略 `--from-file` / `policy list` | 正常 | 通过 |
| `validate --for online` / `online`（幂等）/ `offline` | 全链通过 | 通过 |
| `version set --artifact` 只改路径 | 正常 | 通过 |
| `update --title/--intro/--tags`、`resource sync`（批量/定向） | 正常 | 通过 |
| 主题工程 `init theme --template` | 正常，`1.json` typeCode=RT001 filePath=dist，模板内容复制 | 通过 |
| 多资源：`--resource` 选择器（id:/name:/artifact:） | 正常；多资源不带 `--resource` 给出清晰选择列表 | 通过 |
| 干净环境 logout 后拦截 | `online --resource` / `version show --resource` → 「请先 login」 | 通过 |
| `init . --type --artifact` / 重复 init 拦截 / 缺类型拦截 | 正常 | 通过 |
| `--cli-version` 输出 0.5.3 | 正常 | 通过 |

命令面注册：`version {show,set,draft,description,attr,option,dep}`、`policy {list,template,apply,set}`、`resource {sync,…}` 全部注册，`--help` 正常。

---

## 3. 覆盖缺口（本轮没测到，验收不算数的地方）

1. **未授权依赖的 `--policy-id` 强制**：本轮 dep 对象（资源池）已有授权，`dep add` 未触发 0.5.3 的「非交互未授权依赖必须给 `--policy-id`」分支（交接文档声称的行为）——需要构造一个 primary 未授权的资源再测。
2. **`version option` 全链**：只在 RT006003（不支持）验证了拦截；RT001 主题类型上的 add/set/rm/下拉默认第一项/去重没跑。
3. **付费依赖签约** `authStatus 128` 待执行态分支、`cycleDependencyCheck` 真环拦截没测。
4. **多身份旧工程迁移**（旧 `1.json/2.json/index.json` 识别与拆分）没测——对应 `单工程单资源重构清单.md` 待办。
5. **`init widget`（插件）、zip 打包上传主题/插件产物**没测。
6. **`--cwd` 跨目录、`login --global` / `logout --global`** 未系统测。
7. **`--env test`** 未跑（只测 dev）。

---

## 4. 测试方法备注（复现用）

- 隔离鉴权：子进程设 `USERPROFILE`/`HOME` 指向临时空目录。否则全局凭据 `~/.freelog/auth-default.json` 会静默回落，logout 结论被污染（0.5.1 轮的教训，loadAuth 逻辑：`findWorkspaceAuthPath(cwd) ?? globalAuthPath(homedir)`）。
- 传参：spawn 必须无 shell + 精确 argv（或 `node dist/bin/index.js …`）；`shell:true` 会把一行式 `名称=作者 键=author 值=x` 拆成多参，误报「too many arguments」。
- **0.5.3 起稿写入必须 `--yes`**：非交互脚本忘带会得到「请加 --yes 确认预览」，注意区分真失败与断言口径。
- 报告：`%TEMP%/freelog-runtime-cli-verification/published-053-*.txt`。

## 5. 结论

0.5.3 的**单资源全链路（init → create → create-version → attr/dep → update-version → policy → online/offline → bind → description）在 dev 真网全部通过**，字段校验与对照表一致，0.5.1 的 logout 回落问题在隔离环境下行为闭环。**放行阻塞项两条**：§1.1 多资源第二份 `create-version` 必失败（新特性核心场景不可用）、§1.2 `status --json` 不输出 JSON；§1.3 `type search` 恒空为遗留未修。§1.4–1.6 建议裁定后记录；§3 覆盖缺口建议下轮补齐，优先未授权依赖的 `--policy-id` 分支与 `version option` 全链。
