# Console–CLI 业务能力契约

> 文档角色：Console 业务事实到 CLI 产品契约的唯一能力矩阵。它不决定产品目标；范围和原则由仓库根目录 [DESIGN.md](../../../DESIGN.md) 决定。细粒度源码调用链见 [CLI拓扑与Console对照](./CLI拓扑与Console对照.md)。

字段级必填、长度、枚举、提示和禁用条件以 [Console表单字段与交互规则](./Console表单字段与交互规则.md) 的 `FORM-*` ID 为证据入口。

证据快照：2026-08-13（P0–P5 双模式落地后复核）。CLI commit 见当前仓库 HEAD，Console commit `9cdfac1cf7c56a7c061be8c3fd4bfd43d1ccefc1`；dev ENV [2026-08-12 验证报告](../验证/reports/2026-08-12-dev.md)；**会话 MVP** `pnpm verify:session-smoke`（13/13）；工程全链路 `verify-scenarios`；工作区 `D:/appinside/freelogfe-web-repos/packages/console` 与 `packages/@freelog/tools-lib`。

## 1. 判定方法

每项分别记录三个维度：

- 范围：`CORE` 本地文件发行核心；`ADVANCED` 高级平台维护；`OUT` 排除；`NATIVE` CLI 原生。
- 对齐：`PARITY` 同业务语义；`EQUIVALENT` 同平台结果但交互不同；`CLI_ONLY` Console 无对应能力。
- 证据：`SPEC` 产品已定义；`CODE` CLI 代码存在；`CONTRACT` Console/API 已核验；`ENV` 在目标环境完成真实验证。

本文不使用单个 `✅`，也不把历史测试数量当成长期结论。`CODE` 不代表完整环境验收。

## 2. 资源生命周期

| ID | Console 业务语义 | CLI 契约 | 范围 / 对齐 | 当前证据 | 必须一致的门禁 |
|---|---|---|---|---|---|
| R-01 | 创建资源身份 | `create` | CORE / PARITY | SPEC+CODE+CONTRACT | name/type 创建后不可改；owner/env 明确 |
| R-02 | 编辑标题、封面、简介、标签 | manifest → `update` | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | `FORM-RES-TITLE`、`FORM-LIST-*`；RSS 限制须专项 ENV |
| R-03 | 查询类型树并限制叶子类型 | `type list/pick`、init picker | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | 动态枚举；未知/非叶子失败 |
| R-04 | 绑定已有资源进入维护页 | `bind`；会话 **`--resource-id`** | CORE / CLI_ONLY | SPEC+CODE+ENV | owner 一致；默认只刷新平台事实 |
| R-05 | 平台与本地展示字段同步 | `pull` / `pull --apply-listing` | CORE / EQUIVALENT | SPEC+CODE | 默认不覆盖 manifest；双边变化冲突 |
| R-06 | 冻结资源禁止关键写入 | 所有 publish/update/online preflight | CORE / PARITY | SPEC+CODE+CONTRACT | `isFrozenStatus` 位掩码；frozenStatus + onlineService.test |

Console 证据入口：`console/src/pages/resource/creator`、`resourceSidebar/info`；平台契约：`@freelog/tools-lib/src/service-API/resources.ts`。

## 3. 版本与文件

| ID | Console 业务语义 | CLI 契约 | 范围 / 对齐 | 当前证据 | 必须一致的门禁 |
|---|---|---|---|---|---|
| V-01 | 创建正式版本 | manifest → `publish` | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | semver 递增、SHA1 未发布；`dependencies` + `baseUpcastResources` 授权完整 |
| V-02 | 选择/上传本地文件 | filePath → SHA1 → upload | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | 类型模式、格式、MIME、大小限制 |
| V-03 | 平台属性解析 | fileProperty service | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | 解析失败不得伪造属性继续发布 |
| V-04 | 保存/读取版本草稿 | `draft push/pull/discard` | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | local/remote fingerprint；both-dirty 冲突 |
| V-05 | 维护已发版描述和属性 | `version edit --sync-properties` | CORE / PARITY | SPEC+CODE+CONTRACT | 不更换 version/fileSha1/filename |
| V-06 | 新版继承上一版信息 | manifest 保留字段；会话 **`--reuse-version`**；工程 **`publish --reuse-version`** | CORE / EQUIVALENT | SPEC+CODE+CONTRACT+ENV | 同 fileSha1 升版本；默认继承平台 deps/attrs（insertMode/supportOptionalConfig 过滤）；`--no-inherit-deps` 清空 |
| V-07 | 新版视频封面表单在 Console 存草稿，但当前 `createVersion` 未提交该字段 | `version set --video-cover` → publish | NATIVE / CLI_ONLY | SPEC+CODE+CONTRACT | 本地封面上传后写 URL；不计入 Console parity |
| V-08 | Console 当前已发版维护页无 videoCover 入口 | `version edit --video-cover` | NATIVE / CLI_ONLY | SPEC+CODE | 平台契约与目标环境验证完成前不写 ENV；不计入 Console parity |

Console 证据入口：见 **[Console源码证据索引](./Console源码证据索引.md)** §4–§6（维护页 `sidebar/versionInfo`、新发版 `versionCreator`、`updateResourceVersionInfo` vs `createVersion` 边界）。字段级：`resource/creator`、`resourceSidebar/versionInfo`、PropertyParser。API：`@freelog/tools-lib/.../service-API/resources.ts` 中 `createVersion`、`updateResourceVersionInfo`、`saveVersionsDraft`、`lookDraft`。

## 4. 依赖、授权与策略

| ID | Console 业务语义 | CLI 契约 | 范围 / 对齐 | 当前证据 | 必须一致的门禁 |
|---|---|---|---|---|---|
| D-01 | 直接依赖和版本范围 | `dep add/update/remove`；会话 **`dep * --session`** | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | versionRange 合法；Console **云存储导入**自动 `^latestVersion`（OUT）；CLI 手动 `dep add` 默认 `^latest`（`batchInfo`，无 latest 回退 `*`，见 `FORM-DEP-RANGE`） |
| D-02 | 基础上抛资源 | 独立 manifest 字段 | CORE / PARITY | SPEC+CODE+CONTRACT | 不伪装为直接依赖 |
| D-03 | 授权排除项 | 独立 manifest 字段 | CORE / PARITY | SPEC+CODE+CONTRACT | excludedType/value 完整 |
| D-04 | 发布前授权检查 | `publish` / `collection publish` preflight | CORE / PARITY | SPEC+CODE+CONTRACT | `dependencies` + `baseUpcastResources`；authTree + contracts 回退；未解决项全部列出；exit code=5。**Console Sidebar** 另用 `batchAuth` 仅 UI 告警（`FORM-SIDER-AUTH-WARN`），不阻止操作 |
| D-05 | 依赖签约（免费策略直签；付费 Console 接力） | `dep auth --policy-map`；会话读 **platform** deps | CORE / EQUIVALENT | SPEC+CODE+CONTRACT+ENV | 工程读 manifest；**会话读 `resourceVersionInfo1`**（§22）；收银台/验证码仍为 OUT |
| P-01 | 新增策略 | `policy apply/set`；会话 **`policy apply --session`** | CORE / PARITY | SPEC+CODE+CONTRACT+ENV | 正文 URI 编码；重复检测；**追加**策略时 CLI 额外校验 `FOR PUBLIC`+`Initial:`（`FORM-POL-APPEND`） |
| P-02 | 启停策略 | `policy set`；会话 **`policy set --session`** | CORE / PARITY | SPEC+CODE+CONTRACT+ENV | online 时至少保留一条启用策略（`assertPolicyStatusChangeAllowed` ↔ Console `atLeastOneUsing`） |
| P-03 | 上架 | `online`；会话 **`online --session`** | CORE / PARITY | SPEC+CODE+CONTRACT+ENV | latestVersion + enabled policy；sidebar 严格门禁（**不**复制 creator Step4 / 策略页 `online_afterSuccessCreatePolicy` 软上架） |
| P-04 | 下架 | `offline`；会话 **`offline --session`** | CORE / PARITY | SPEC+CODE+CONTRACT+ENV | API 写 **status:4**（非 0）；owner/env/sync 一致 |

Console 创建向导 Step4 可能直接写 `status=1`（无 latestVersion/策略检查）；sidebar `resourceOnline` 与 CLI `online` 采用相同严格门禁。sidebar 在**零策略**时可一次请求写 `status:1+addPolicies` — CLI **拆步**为先 `policy apply` 再 `online`（↷，见 [Console源码证据索引](./Console源码证据索引.md) §11）。

## 4.1 会话模式（N-06）能力映射

会话 CLI 与 Console 页面/API **等价**关系见 [Console源码证据索引](./Console源码证据索引.md) §10 与 [CLI双模式实现设计](../开发/CLI双模式实现设计.md) §17。

| 会话 CLI | 等价 Console 路径 | 不做 |
|---|---|---|
| `resource publish --session` | Step1+2 或 versionCreator | draft、云存储 |
| `resource update --session` | sidebar info / Step4 listing | — |
| `version edit --session` | sidebar versionInfo（V-05） | 改 deps |
| `dep auth --session` | sidebar dep 签约（D-05） | 读 manifest |
| `dep * --session` | versionCreator depList | version edit 改 deps |
| `policy/online/offline --session` | Step3 + sidebar Sider | inline Builder 上架 |
| `--export-project` | — | **CLI 独有** |

验收：`pnpm verify:session-smoke`（离线门禁 + vitest 子集 + dev API §17 Y 行）。

## 5. 合集

| ID | Console 业务语义 | CLI 契约 | 范围 / 对齐 | 当前证据 | 必须一致的门禁 |
|---|---|---|---|---|---|
| C-01 | 创建合集壳 | `collection create` | CORE / PARITY | SPEC+CODE+CONTRACT | subjectType=4、owner/env |
| C-02 | 合集展示属性 | `collection.display` → `catalogueProperty` | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | 字段枚举与 Console 一致 |
| C-03 | 加入已有平台资源 | `collection item add <resourceId>` | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | online、未重复；子资源 `baseUpcastResources` 须在合集 licensee 下已有生效合同（≅ FAddResourcesHandleAuth） |
| C-04 | 从本地目录创建子资源 | `collection init-from-folder/import-dir` | CORE / CLI_ONLY | SPEC+CODE | 子资源走完整 create/publish/policy/online 门禁 |
| C-05 | 条目标题、删除、排序 | `collection item update/remove/reorder` | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | **即时**写目录 draft API；与 `collection publish` 分离（§8.5.1） |
| C-06 | 合集表单草稿 | `draft * --collection` | CORE / EQUIVALENT | SPEC+CODE+CONTRACT | 与资源草稿使用独立 fingerprint |
| C-07 | 合集发布 | `collection publish` | CORE / PARITY | SPEC+CODE+CONTRACT | 合集 `dependencies` + `baseUpcastResources` + 目录项 auth；目录变化决定 merge=0/1 |
| C-08 | 合集属性维护 | `collection properties sync` | CORE / PARITY | SPEC+CODE+CONTRACT | 只改允许维护的属性 |
| C-09 | collect-rules | 专用 collection 命令 | ADVANCED / PARITY | SPEC+CODE+CONTRACT+ENV | 完整 serialize/condition/filter、operator 与长度语义；dev get/set round-trip 已进入 collection parity |
| C-10 | RSS 绑定与同步 | `inspect/send-code/bind/status/sync` | ADVANCED / PARITY | SPEC+CODE+CONTRACT；ENV mandatory | 预检、15 条阈值、换源 GUID、同步状态与 RSS 编辑限制一致；`verify:rss` 受控邮箱状态链方可签字 |

合集 API 证据：`@freelog/tools-lib/src/service-API/resources.ts` 中 catalogue draft、reorder、batchAuth、collectRules；Console 路由见 `console/config/routes.ts`。

## 6. CLI 原生能力

| ID | 能力 | 产品契约 | 范围 / 对齐 | 当前证据 | 未完成项 |
|---|---|---|---|---|---|
| N-01 | 工程模板 | theme/widget/package/other/collection scaffold | NATIVE / CLI_ONLY | SPEC+CODE | 模板升级策略按 DESIGN v1 不原地升级 |
| N-02 | 类型驱动压缩 | `artifactMode=file|directory-zip` | NATIVE / CLI_ONLY | SPEC+CODE | 仅显式 capability/manifest；冲突或缺失失败；统一 ignore、符号链接保护和字节确定性 zip |
| N-03 | 零副作用预览 | publish/collection/release dry-run | NATIVE / CLI_ONLY | SPEC+CODE | 继续扩充命令级回归测试 |
| N-04 | 批量独立资源 | `resource import-dir` | NATIVE / CLI_ONLY | SPEC+CODE+ENV | 持久化 report；`resume/retry`；环境/配置/输入漂移保护；远端成功本地待回写恢复（`verify-scenarios` S14/S14b）；远端结果未知时停止并要求对账 |
| N-05 | Git/CI 编排 | validate/diff/release/JSON/NDJSON | NATIVE / CLI_ONLY | SPEC+CODE+ENV | `--json` 成功/失败统一 schemaVersion=1 envelope（2026-08-12）；`unwrapCliJson` 兼容脚本；子命令级 `command` 字段（如 `dep list`、`offline`）；人类可读 `--tree` 仍直出格式化 JSON |
| N-06 | 会话式发行（无本地 manifest） | `resource publish/update` + `--session` + `--export-project`；维护：`policy/online/offline/dep/version edit --session` | NATIVE / EQUIVALENT | SPEC+CODE+CONTRACT+ENV | EphemeralStore；Console 临时操作 API 等价；`--export-project` CLI 独有；`verify:session-smoke` 13/13 |

CLI 原生能力不进入 Console parity 分母，但必须满足同一套类型、owner、授权、策略和平台状态门禁。

## 7. 明确排除

| 能力 | 分类 | CLI 行为 |
|---|---|---|
| 支付收银台、验证码 | OUT | 明确失败；支付/签约给出当前环境的 Console 依赖页、合约页和下一条重试命令 |
| Console 云存储浏览器 | OUT | CLI 只接受本地文件或已有平台引用 |
| 可视化属性编辑器、拖拽 UI | OUT | 使用 manifest、参数和 reorder 命令表达 |
| 列表 batchUpdate / 多选批量维护 | OUT | CLI 逐资源 `online`/`offline`/`policy apply` |
| 节点展品、收入、收藏、运营消费侧 | OUT | 不注册伪等价命令 |

## 8. 验收规则

一项能力可以称为“Console 对齐完成”，必须同时具备：

1. 本表存在稳定 ID、范围和对齐方式；
2. Console/API 事实有源码定位或契约快照；
3. CLI payload、状态变化和负向门禁有自动化证据；
4. 目标环境 mandatory 场景执行，failed=0、未批准 skipped=0；
5. UI 特有约束已转换为 CLI 显式行为；
6. CLI 原生阶段的副作用和恢复方式已说明。

完成声明必须绑定当前源码、契约检查和日期化环境证据；运行数字只进入验证报告。
