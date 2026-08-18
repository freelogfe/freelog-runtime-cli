# Console 源码证据索引（resource 域）

> 文档角色：**Console 侧源码路径真源**，供对齐讨论、双模式设计与 parity 核对使用；不定义 CLI 产品行为。页面→Effect→测试的拓扑展开见 [CLI拓扑与Console对照](./CLI拓扑与Console对照.md)；字段约束见 [Console表单字段与交互规则](./Console表单字段与交互规则.md)。

最后更新：2026-08-13

## 1. 工作区约定

| 项 | 路径 |
|---|---|
| **默认 Console 包** | `D:/appinside/freelogfe-web-repos/packages/console` |
| **默认 tools-lib** | `D:/appinside/freelogfe-web-repos/packages/@freelog/tools-lib` |
| **环境变量覆盖** | `FREELOG_CONSOLE_ROOT` → 指向 `packages/console` 目录 |
| **脚本参数** | `pnpm --filter @freelog-cli/cli2 verify:console-forms -- --console-root=<packages/console>` |
| **CLI 仓库内相对写法** | 下文「Console 相对路径」均相对于 `packages/console/src/` |

相邻仓库布局与 [verify-console-form-contract.mjs](../../../packages/cli/scripts/verify-console-form-contract.mjs) 一致。

---

## 2. 平台 API 契约（L5 真源）

| API | tools-lib 相对路径 | 说明 |
|---|---|---|
| `createVersion` | `@freelog/tools-lib/src/service-API/resources.ts` | 新发版/更新版本（含 dependencies、fileSha1、inputAttrs 等） |
| `updateResourceVersionInfo` | 同上，`UpdateResourceVersionInfoParamsType`（约 L455–478） | **已发版**维护：description、inputAttrs、customPropertyDescriptors、resolveResources；**无** dependencies |
| `saveVersionsDraft` / `lookDraft` | 同上 | 版本表单草稿 |
| `Resource.update` | 同上 | listing（title/intro/cover/tags） |
| `createBatch` | 同上 | 批量创建 |

CLI payload 构建真源：`packages/cli/src/services/resource/createVersionParams.ts` → 须与 Console `createVersion` 调用参数同构。

---

## 3. 独立资源：页面目录（L0）

Console 相对路径：`pages/resource/`

| 路由/场景 | 页面入口 | 主要 Model |
|---|---|---|
| 首发向导 Step1–4 | `creator/Step1` … `creator/Step4` | `models/resourceCreatorPage/`（`step1Effects.ts` … `step4Effects.ts`） |
| 首发 Step2 发行 | `creator/Step2/index.tsx` | `step2Effects.ts` → **`createVersion`**（约 L528+） |
| **新发版/改依赖列表** | `versionCreator/$id/index.tsx` | `models/resourceVersionCreatorPage.ts` → **`createVersion`**（约 L754+）；可选继承上一版文件 `selectedFileInfo.from === '上个版本'` |
| 维护侧栏-版本信息 | `sidebar/versionInfo/$id/index.tsx` | `models/resourceVersionEditorPage.ts` |
| 维护侧栏-资源信息 | `sidebar/info/$id/index.tsx` | `models/resourceInfoPage.ts`（listing） |
| 维护侧栏-依赖 | `sidebar/dependency/$id/index.tsx` | `models/resourceDependencyPage.ts` |
| 维护侧栏-策略 | `sidebar/policy/$id/index.tsx` | 策略相关 model |
| 批量创建 | `creatorBatch/Handle/index.tsx` | 批量 `createBatch` / 逐项 create |
| 资源详情（消费侧） | `details/$id/index.tsx` | 只读展示 |

---

## 4. 能力矩阵 → Console 证据（快速查表）

与 [CLI数据操作与Console对照](./CLI数据操作与Console对照.md) 能力 ID 对应。

| 能力 ID | Console 业务 | 页面（相对 `pages/resource/`） | Model / Effect | API |
|---|---|---|---|---|
| **R-01** | 创建资源身份 | `creator/Step1` | `resourceCreatorPage/step1Effects.ts` | `Resource.create` |
| **R-02** | 编辑 listing | `sidebar/info/$id` | `resourceInfoPage` | `Resource.update` |
| **V-01** | 创建正式版本 | `creator/Step2` 或 `versionCreator/$id` | `step2Effects.ts` / `resourceVersionCreatorPage.ts` | **`createVersion`** |
| **V-02** | 选文件/上传 | `creator/Step2`、`versionCreator/$id` | 同上 + `FLocalUpload` 等组件 | upload → fileSha1 |
| **V-04** | 版本草稿 | 维护页草稿 badge → 跳转 creator | `saveVersionsDraft` / `lookDraft` | 草稿 API |
| **V-05** | **已发版**改说明/属性 | `sidebar/versionInfo/$id` | `resourceVersionEditorPage.ts`：`updateDataSource`（L531+）、`syncAllProperties`（L549+） | **`updateResourceVersionInfo`** |
| **V-05 边界** | 已发版**依赖展示/签约** | `sidebar/versionInfo/$id` 内 `FMicroAPP_Authorization` | 非改依赖列表；签约微应用 | 合同/授权 API |
| **V-06** | 新版继承上一版 | `versionCreator/$id` | `resourceVersionCreatorPage` 加载上一版 fileSha1 | **`createVersion`**（新 version 号） |
| **D-*** | 依赖声明 | `versionCreator/$id`、`creator/Step2` | depList / upcastList 组件 | **`createVersion` 请求体** |
| **D-05** | 依赖签约 | `sidebar/versionInfo`、`sidebar/dependency` | `FMicroAPP_Authorization` | 合同 batch / `batchSetContracts` |
| **P-01** | 新增策略 | `creator/Step3`、`sidebar/policy/$id` | `step3Effects.ts` / `resourceAuthPage.ts` L619–648 | `Resource.update` addPolicies |
| **P-03** | sidebar 上架 | `sidebar/Sider/index.tsx` | `resourceOnline` L362–447 | `Resource.update` status:1 + 门禁 |
| **P-04** | sidebar 下架 | `sidebar/Sider/index.tsx` L101–123 | `operateResource` | `Resource.update` **status:4** |
| **N-06** | 会话式发行（CLI） | —（Console 无 manifest Store） | — | CLI `resource * --session`；证据见 §10 |

**V-05 关键结论（避免每轮会话重猜）：** 改**已发版**的 description/属性 → `updateResourceVersionInfo`；改**依赖列表** → 必须走 **versionCreator + createVersion**（可同文件 SHA1），**不能**用 `updateResourceVersionInfo`。

---

## 5. 维护页 versionInfo 细目（V-05 / 双模式对齐用）

| 行为 | 文件 | 符号/行号锚点 |
|---|---|---|
| 编辑已发版描述并保存 | `pages/resource/sidebar/versionInfo/$id/index.tsx` | `updateDataSource` dispatch，payload `{ description }`（约 L804–809） |
| 同步属性到平台 | `models/resourceVersionEditorPage.ts` | effect `syncAllProperties` → `updateResourceVersionInfo`（约 L549–596） |
| 单字段更新 | `models/resourceVersionEditorPage.ts` | effect `updateDataSource`（约 L531–547） |
| 打开「更新版本」（新发版） | `pages/resource/sidebar/versionInfo/$id/index.tsx` | `FUtil.LinkTo.resourceVersionCreator`（约 L310–314） |
| 已发版依赖只读+签约 UI | 同上 | `FMicroAPP_Authorization` + `directDependencies` / `baseUpcastResources`（约 L739–759） |

---

## 6. 新发版 versionCreator 细目（V-01 / 改依赖）

| 行为 | 文件 | 符号/行号锚点 |
|---|---|---|
| 提交新版本 | `models/resourceVersionCreatorPage.ts` | `createVersion` 调用（约 L754–816） |
| 依赖/上抛编辑 UI | `pages/resource/versionCreator/$id/index.tsx` | `FMicroAPP_Authorization` depList/upcastList（约 L1114+） |
| 继承上一版文件 | `models/resourceVersionCreatorPage.ts` | `selectedFileInfo`、`from === '上个版本'`（约 L580、L877+） |
| 平台草稿优先 | 同上 | `lookDraft` 有值 → `_FetchDraft`，跳过 latest inherit（L531–687） |
| inherit 范围 | 同上 | `insertMode===2` 附加属性；`supportOptionalConfig===2` 才带 optional configs（L617–655） |
| 云存储 deps 自动填 | 同上 | `onSucceed_ImportObject` L1033–1120（`^latestVersion`）；本地上传不自动 |
| 冻结 gate | 同上 | `(status & 2) === 2`（L441–447，位掩码） |

---

## 7. CLI 侧对应（读 Console 后去哪改）

| Console 证据 | CLI 实现 |
|---|---|
| `createVersion` params | `services/resource/createVersionParams.ts`、`publishVersion.ts` |
| `updateResourceVersionInfo` | `services/versionEditService.ts`（`version edit`） |
| listing update | `services/resourceService.ts`（`updateListing`） |
| 依赖签约 | `services/depAuthService.ts`、`authorizationTree.ts` |
| 双模式 Store | [CLI双模式设计](../开发/CLI双模式设计.md)（业务仍走上述 service） |

---

## 8. 合集（collection）入口（简表）

| 场景 | 页面（相对 `pages/resource/`） | Model |
|---|---|---|
| 合集创建 | `collectionCreator/Step1`–`Step4` | `collectionCreatorPage` 等 |
| 合集维护版本 | `collectionSidebar/versionInfo/$id` | `collectionVersionEditorPage` 等 |
| 合集 listing | `collectionSidebar/info/$id` | — |

细拓扑见 [CLI拓扑与Console对照](./CLI拓扑与Console对照.md) 合集章节。

---

## 10. 会话模式（N-06）与 Console 等价路径

> 产品规格：[CLI双模式实现设计](../开发/CLI双模式实现设计.md) §17–§22。CLI 验收：`pnpm verify:session-smoke`。

Console **无**本地 EphemeralStore；下列 Console 页面动作与会话 CLI **业务等价**（API 相同，交互拆步）：

| 能力 ID | Console 页面 / 动作 | 会话 CLI | 数据源（会话） |
|---|---|---|---|
| R-01 | creator Step1 | `resource publish --session`（首发，无 `--resource-id`） | argv + create 后 fetch |
| V-01–V-03 | Step2 / versionCreator 发行 | `resource publish --session --file …` | `publishVersion` + fileProperty |
| V-06 | versionCreator「上个版本」 | `--reuse-version`（⊥ `--file`） | `fetchReleasedVersionSnapshot` |
| R-02 | sidebar info / Step4 listing | `resource update --session` | `fetchResourceInfo` + memory |
| D-* | versionCreator depList | `dep add/remove/update --session --export-project` 或交互会话 | `01` 不跨命令保留 Store；`11` 同进程 publish |
| D-05 | 维护页 dep 签约 | `dep auth --session --policy-map` | **platform** `resourceVersionInfo1`（§22，非 store edits） |
| P-01–P-02 | Step3 / sidebar policy | `policy apply/set --session` | `fetchResourceInfo.policies` |
| P-03 | sidebar Sider 上架 | `online --session` | `evaluateOnlineGates` → status:1 |
| P-04 | sidebar Sider 下架 | `offline --session` | status:**4** |
| V-05 | sidebar versionInfo 维护 | `version edit --session` | merge 底=平台 snapshot |
| R-04 | 绑定已有资源 | `--resource-id`（无 bind 子命令） | lazy fetch |
| — | — | `--export-project` | **CLI 独有**落盘 |

**Console 有、会话 CLI 明确不做：** V-04 draft、`draft push --session`（code 4）、合集 C-*、batch N-04。

**Console sidebar 有、CLI 拆步（↷）：** 零策略时 atomic `status:1+addPolicies`（Sider L373–409）；策略页「立即上架」提示（`resourceAuthPage` L712–737）→ CLI 用户单独 `online`；`batchAuth` 依赖 Tab 告警（`resourceSider` L196–203）→ CLI 仅 publish D-04 硬拦。

---

## 11. Sidebar 上架/下架源码锚点（P-03 / P-04）

| 行为 | 文件 | 锚点 |
|---|---|---|
| 下架写 status:4 | `pages/resource/sidebar/Sider/index.tsx` | L101–123 |
| resourceOnline 门禁 | 同上 | L362–447（无 latestVersion / 无启用策略 / 全禁用策略三分支） |
| 零策略 inline 上架 | 同上 | L373–409（`status:1` + `addPolicies` 同请求） |
| 状态展示映射 | `models/resourceSider.ts` | L227–232（0=unreleased，4=offline，其余=online） |
| creator Step4 软上架 | `models/resourceCreatorPage/step4Effects.ts` | L68–77（仅 `status:1`，无门禁 — CLI **不复制**） |
| 策略页无门禁上架 | `models/resourceAuthPage.ts` | `online_afterSuccessCreatePolicy` L712–737（直接 `status:1`） |
| 发版成功页上架按钮 | `pages/result/resource/version/create/success/$id/$version/index.tsx` | L84 调 **sidebar 同款** `resourceOnline` |

---

## 12. resourceSider 全局加载（维护页）

| 行为 | 文件 | 锚点 |
|---|---|---|
| 冻结跳转 | `models/resourceSider.ts` | L186–188（`status === 2`） |
| 合集重定向 | 同上 | L191–193（`subjectType === 4`） |
| 依赖授权告警 | 同上 | L196–203（`batchAuth` → `hasAuthProblem`） |
| 封面解析中 | 同上 | L205–218 + Sider UI L184–247 |
| 编辑精选角标 | 同上 | L241（`operationType === 5`） |
| 状态三元映射 | 同上 | L227–232（0/4/其他） |

**CLI 对照：** R-06 冻结 preflight；D-04 publish 硬拦（无 batchAuth 软告警）；`operationType` 运营字段 OUT。

---

## 13. 发行结果页（UI 引导 · OUT）

| 场景 | 文件 | 锚点 |
|---|---|---|
| 单品创建成功 | `pages/result/resource/create/success/$id/index.tsx` | owner 403；节点/合集后置 OUT |
| 版本 release 假进度 | `pages/result/resource/version/create/release/$id/$version/index.tsx` | 2s 无 API |
| 版本 success 分支 | `pages/result/resource/version/create/success/$id/$version/index.tsx` | status 1→倒计时；4→resourceOnline CTA |
| 批量 Finish 后置 | `pages/resource/creatorBatch/Finish/index.tsx` | L95–138 节点须 online |

---

## 15. 合集 Sidebar（collectionSidebar）

| 行为 | 文件 | 锚点 |
|---|---|---|
| Sider mount 粘滞 | `models/collectionManager/siderEffects.ts` | L26–30 |
| 目录即时 CRUD | `pages/resource/collectionSidebar/versionInfo/$id/index.tsx` | L718–822 |
| dual dirty / merge | `models/collectionManager/versionEffects.ts` | L466–469, L952 |
| properties sync vs publish | 同上 | L728–780 vs L888–953 |
| collect-rules info 维护 | `pages/.../collectionSidebar/info/$id/index.tsx` | L701–715, L824–849 |
| RSS 禁 draft | `versionEffects.ts` | L134–153 |
| RSS sync 轮询 | `pages/resource/collectionSidebar/index.tsx` | L95–137 |

---

## 16. 维护规则

1. **新增 parity 讨论时**：先在本表或 [CLI拓扑与Console对照](./CLI拓扑与Console对照.md) 增加「页面 + Model + API」一行，再改 CLI。
2. **行号**会漂移：以 **文件名 + effect/函数名** 为主键；行号为 2026-08-13 核对时的近似锚点。
3. Console commit 记录在 [CLI数据操作与Console对照](./CLI数据操作与Console对照.md) 证据快照，不在本文重复日期化结论。
