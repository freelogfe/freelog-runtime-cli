# Freelog Runtime CLI

面向普通单文件、主题/插件和合集发行管理的 CLI。当前为开发阶段；不维护无意义的旧命令兼容层。批量发行、session、studio、支付与运行时 mock 不属于当前已交付能力。

## 从这里开始

- 用户：[随包交付的使用手册](docs/一期/产品方案/使用/README.md)
- 产品：[设计真源](DESIGN.md) / [正式脚手架设计](docs/一期/产品方案/脚手架设计/README.md)
- 研发：[设计—开发—测试—验证—发布质量契约](docs/研发交付规范/README.md)
- 接续：[交接文档](docs/一期/产品方案/交接文档.md)
- 测试：[测试入口与覆盖缺口](test/README.md)

## 安装与离线质量检查

Node.js 20+，pnpm 10.15.0，使用锁文件安装。普通本地验证不会登录、发行 dev 资源或发布 npm。

```powershell
pnpm install --frozen-lockfile
pnpm verify
```

`verify` 包含文档目标/明显秘密/脚本检查、质量工具负例自测、CLI 单元及架构测试、类型检查、构建和安装包验证。命令表面有批准快照；空测试与错误 filter 失败。当前没有独立 lint 或代码行覆盖率门禁，不能虚报已运行或把行覆盖率当功能覆盖率。

## 候选包与真实 dev 验收

发布包名固定为 `@freelog-cli/cli2`，registry 固定为 `https://registry.npmjs.org/`；不发布 tools-lib 或模板。

普通本地验证可直接准备 development 候选。未来用户明确要求发布指定版本时，按下节先固定最终源码提交和可信远端的精确 SHA 检查，再准备 release 候选。以下命令不自动升版本、不提交或推送：

```powershell
pnpm release:prepare
```

工具运行离线门禁，生成并隔离安装一个 tarball，打印 `.artifacts/release/<id>/candidate.json` 路径。新候选 schemaVersion 为 2，记录自动判定的 `purpose:development|release`、真实 `sourceRevision:{commit,tree,clean}`、源码内容指纹、版本、包 SHA-512 和实际安装 bin；它不表示验收或发布已获批准。

只有所有有效输入均对应固定 Git 提交的树与索引时，purpose 才是 release；Git status 干净本身不够。未提交、未跟踪、被 Git 忽略但参与源码指纹的输入，以及无 Git 提交的目录，只能生成 development 候选。树核对优先比较原始 Git blob；仅对有 text/eol/autocrlf 依据、无 NUL/异常控制字符且可确认 UTF-8 的文本允许标准 CRLF→LF，内容指纹仍绑定 checkout 的实际字节。外部 filter、ident、工作树编码或不确定转换保守地保留为 development，核验过程不执行 clean/smudge filter。既定生成/私有目录排除规则没有扩大，正式设计、测试、锁文件、交接与随包手册仍是输入。

POSIX 的有效输入执行位也计入指纹，并与 Git tree/index mode 核对；Windows 只核对 Git 自身的 tree/index mode，不伪造 POSIX 执行位证据。原生 Linux/macOS 行为须由对应平台实际验证。

源码稳定且候选生成后，AI 必须取得对应本次候选的独立代码与架构复核，并整理候选内 `delivery.json` 及两份原始审查记录。它们绑定源码、tarball、已登记设计/用例和时间；不是让用户手写 JSON，也不能从测试 fixture 生成通过结论。字段与归档规则见[质量契约](docs/研发交付规范/README.md#候选级设计追溯与独立审查证据)。如果审查要求修改任何源码/测试/文档，先修复并重新准备候选，再取得对应新候选的复核。

将输出的真实路径代入：

```powershell
pnpm test:dev --candidate <candidate.json的路径>
```

此命令会用本地授权 primary 账号创建隔离 dev 资源，执行固定安装包而非工作区 dist。需按[DEV 计划](test/DEV-全流程测试计划.md)准备本地凭据和素材。池内目标只读，不签约、不付款，不碰 prod。子命令串行；失败不重复未知写入。报告保存在候选目录 `acceptance.json`；development 候选可取证，但 `releaseEvidence:false`、`releaseApproved:false`，不能升级为发布候选。

```powershell
pnpm release:check --candidate <candidate.json的路径>
```

只读核验 release 候选的实际提交/树/有效输入、包/安装树、设计追溯、两lane原始复核记录、24 小时有效期、必需用例和报告绑定。development、旧 schema、伪造 purpose/sourceRevision、FAIL、BLOCKED、NOT_TESTED、缺失/重复/错误报告均拒绝。源码字节或提交/树变化均须重新准备和验收，即使新提交内容相同也不能复用旧候选。delivery 和原始审查使用 schemaVersion 2，同样绑定 purpose/sourceRevision；不能拿旧的 14/14 报告放行。

同一入口还实时只读核验GitHub `freelogfe/freelog-runtime-cli` 的dev精确SHA、官方Actions应用、固定workflow/run/attempt、六格及汇总strict success、当前保护和平台计算的PR审批；网络等待后重读本地绑定。现有 `GITHUB_TOKEN` / `GH_TOKEN` 可提供只读权限，不自动登录或修改设置。401、保护/审批不可核实、缺CI或CODEOWNERS均BLOCKED，不接收本地手写CI批准。核验范围是 `fixed-source-current-policy`，不冒称历史权限审计或同tarball跨平台通过；远端配置目前仍未满足，见当前交接。

当前专项和跨端覆盖仍有缺口，新门禁会如实阻止发布。这是待补的产品验收，不得写空脚本、删目录项或修改断言来变绿。具体缺口见[测试计划](test/DEV-全流程测试计划.md)。

## 由 AI 协助发布（用户只提供版本号）

用户明确要求发布某版本，才授权 npm 写入与已约定的 Git 收尾。本节不是对任意任务的发布授权。

1. 核对目标版本未发布，更新版本并完成已确认的源码/测试/设计/手册；排除凭据、候选、认证链接和无关变更，将最终源码提交经实际受保护分支/批准 PR 路径送到可信远端。合并/rebase 后以最终 SHA 为准。若该提交已在可信远端，直接读取核验；保护或权限不满足时停止，不能直接推送绕过。
2. 等待并核验该精确 SHA 的可信工作流和全部必需 CI 明确 success，再在同一提交上 `release:prepare`。取得同候选双路审查、delivery、固定 tarball 的 dev 与支持平台验收，并运行 `release:check`；来源、源码、提交、树、覆盖或时效变化均重验，旧 SHA 的 CI 不能替代。
3. AI 在真实交互终端执行下面的登录命令，主动打开终端本次给出的链接，让用户本人完成浏览器认证。保持原进程，不索取密码、OTP、token，不记录认证链接或 `.npmrc`。确认 npm 身份后重核候选及远端证据，再发布已经验过的同一 tarball。若 npm 再次给验证链接，主动打开当次链接，等待用户完成；不能复用旧链接或绕过 2FA。
4. 工具核对 registry 完整性和下载内容并隔离安装验证；发布结果未知时先查询事实，不盲目重发、不自动提高版本。发布中/未知/Git 未收尾的回执保留在 `.artifacts/release/` 与 `.artifacts/publications/`，绑定源码身份和包摘要；先读实际回执，不在发布中修改作为候选输入的交接。
5. registry 核验成功后，创建带说明的 `@freelog-cli/cli2@<版本>` tag，明确指向 candidate.sourceRevision.commit 并读回核对，再只推送该 tag。后续审计/交接记录另提交，不能移动已有 tag，不能把事后审计提交当发布源码。禁止强推、覆盖已有 tag 或顺带推其它分支；Git 失败只补 Git 收尾，不重复 npm 发布。

```powershell
npm login --auth-type=web --registry=https://registry.npmjs.org/ --browser=false
npm whoami --registry=https://registry.npmjs.org/
pnpm release --candidate <candidate.json的路径>
```

标准工具先验候选再发布固定 tarball，内部禁止 lifecycle 重建。直接从包目录 `npm publish` 会被 hook 拒绝；有发布权限者仍可能故意绕过本地 hook，本仓库不宣称能替代 npm 权限控制。

npm 身份验证由用户完成，机制见 [npm 2FA](https://docs.npmjs.com/accessing-npm-using-2fa/)；固定 tarball 发布见 [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)。

## 故障处理

| 现象 | 处理 |
|---|---|
| 缺 candidate、delivery 或验收报告 | 从对应阶段补实际证据；不能用旧日志、自动填通过或 fixture 替代。 |
| 源码/包/安装树变化、证据过期 | 重新准备候选及必要验收，不能手改 hash。 |
| development、提交/树变化或远端精确 SHA 未通过 | 固定最终源码并核验可信远端后重新 prepare；不能手改 purpose、复用旧 CI 或绕过门禁。 |
| 后端/平台样本阻塞 | 保留具体失败项和补测条件，不当 PASS；先解决或正式裁决范围。 |
| npm 版本已存在 | 查询已发布事实；不覆盖、不自动换版本。 |
| npm 权限或浏览器认证失败 | 保留原状态，重新进行官方认证；不绕过验证。 |
| npm 已成功但 Git 推送失败 | 核验 registry 后只补 Git，不重复 publish。 |
