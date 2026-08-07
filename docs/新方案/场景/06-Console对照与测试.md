# 06 · Console 对照与测试

最后更新：2026-08-07

关联：[对齐目录](../对齐/README.md) · [04-问题矩阵](./04-问题矩阵.md) · [交接文档 §9](../交接/CLI交接文档.md#9-验证记录)

---

## 1. Console 数据 parity（创建 + 维护）

溯源详表：[CLI脚手架设计 §1.10](../开发/CLI脚手架设计.md#110-console-页面--api--cli-溯源维护期必读)

### 阶段 A — 创建/首版

| Console | 数据操作 | CLI | 须一致 |
|---|---|---|---|
| creator Step1 | 创建壳 + typeCode | `init` → `create` / `bind` | resourceId、typeCode |
| creator Step2 | 首版本 + 说明 | `version set` + `publish` | latestVersion、fileSha1 |
| creator Step2 | 发版表单草稿 | `draft push/pull/discard` | 远端草稿对象 |
| creator Step3–4 | 策略 + listing + 上架 | `policy apply` + `update` + `online` | policies、status |
| creatorBatch | 批量 create | `resource import-dir` | N 个 resourceId |
| collectionCreator | 合集 + 目录 | P4 命令链 | 合集 + 单品 |

### 阶段 B — sidebar 维护

| Console Tab | 数据操作 | CLI | 须一致 |
|---|---|---|---|
| **info** | 标题/简介/封面/标签 | `update`；`pull --apply-listing` | listing |
| **versionInfo** | 下一版文件 | `version set --file` | 版本意图 |
| **versionInfo** | 发版草稿 | `draft *` | saveVersionsDraft |
| **versionInfo** | 发布新版本 | `publish` / `--bump` | latestVersion |
| **versionInfo** | 改已发版说明 | `version edit` | description |
| **versionInfo** | 属性同步 | `version edit --sync-properties` | inputAttrs |
| **policy** | 策略启停/追加 | `policy apply/list/set` | policies |
| **dependency** | 依赖 | `dep *` + `dep auth` | dependencies |
| **Sider** | 上下架 | `online` / `offline` | status |
| collectionSidebar | 目录单品 | `collection item *` | catalogueDraft |
| collectionSidebar | 合集发版草稿 | `draft * --collection` | 合集版本草稿 |
| collectionSidebar | 发布合集版 | `collection publish` | 合集 latestVersion |

**流程可不同、结果须相同：** Console 防抖草稿 → CLI 显式 `draft push`；Console 表单 → CLI manifest + 本地路径。

---

## 2. 测试覆盖拓扑

**维度 × 必测节点**（与 [04-问题矩阵](./04-问题矩阵.md) 对齐）：

| 维度 | 必测路径/节点 |
|---|---|
| D1 环境 | dev 登录→test 写；state.env 不匹配 |
| 凭据 | login/logout；auth.env 不一致 |
| owner | 非 owner：update/publish/policy/online/bind |
| 同步 | status/pull/apply-listing/冲突/force |
| 文件 | 不存在/目录文件不匹配/格式/大小 |
| P1 | runtime+none+package；zip 发布 |
| P2 | 单文件+videoCover |
| P3 | 部分失败/retry/子目录 state |
| P4 | 子资源门禁/publish 合并/三类草稿/offline |
| P5 | bind/create 冲突/apply-listing |
| P6 | listing/cover/tags；policy 门禁；bump/edit；dep；draft 冲突 |
| 策略 | 第二条语法；policy set --status；无策略上架 |
| 输出 | human/json/debug 脱敏/exit code |

### 2.1 verify:scenarios 映射

| 场景块 | 路径 | 文档 |
|---|---|---|
| S1–S5 | init/命令面/维护入口 | [02](./02-主路径.md) · [03 L0–L2](./03-命令节点.md) |
| S6–S7 | P2/P1 首发+维护 | [05](./05-场景实例.md) · [07 图片/主题](./07-用户身份测试手册.md) |
| S8–S10 | P1 插件/P2 视频 | [07 §2/§5](./07-用户身份测试手册.md) |
| S11–S12 | P4 合集 | [07 §3.3/§5.2](./07-用户身份测试手册.md) |
| S13 | P3 批量 | [07 §3.2](./07-用户身份测试手册.md) |
| **S15** | **P6 维护细测** | [04 §4.5–4.8](./04-问题矩阵.md) · [08 §6.5](./08-测试人员手册.md) |
| **手工** | **小说 P2/P3/P4** | [07 §4](./07-用户身份测试手册.md) · [08 NOV-*](./08-测试人员手册.md#63-小说p2p3p4--多手工) |

### 2.2 手工记录模板

| 字段 | 内容 |
|---|---|
| 路径 | P1–P6 子场景 |
| 命令 | 完整 bash + `--json` 输出 |
| 环境 | dev/test + 账号 |
| resourceId | 平台 id |
| Console 并排 | listing/version/policies/status |
| 预期 | [04](./04-问题矩阵.md) 对应行 |
| 结果 | PASS/FAIL + code |

---

## 3. 新场景接入规则

遇到文档未覆盖场景：

1. 映射到 [02-主路径](./02-主路径.md) 之一，或新增路径并说明收敛点；
2. 在 [03-命令节点](./03-命令节点.md) 补节点行；
3. 在 [04-问题矩阵](./04-问题矩阵.md) **必须**补问题行（含 code、处理）；
4. 在 [05-场景实例](./05-场景实例.md) 补可执行命令链；
5. 能自动化则加 `verify-scenarios.mjs` 场景块；
6. 同步 [CLI字段账本](../开发/CLI字段账本.md) / [CLI脚手架设计](../开发/CLI脚手架设计.md)。

**禁止：**

- 无拓扑定位的散文场景；
- 声称 init 含批量/文件夹合集（方案 A 已禁止）；
- 忽略 sidebar **info/versionInfo** 维护阶段；
- 只写 happy path 不写 [04-问题矩阵](./04-问题矩阵.md) 负向行。

---

## 4. 验收通过标准（生产）

1. `node test/run-all-scenarios.mjs --env dev` 全绿（83/83 + parity）。
2. [04 §4.11](./04-问题矩阵.md#411-生产检查清单发版前) 发版前检查项可执行。
3. 四类主路径 + P6 维护各至少 1 条手工并排 Console 通过。
4. [07 §6 身份矩阵](./07-用户身份测试手册.md#6-身份--形态-必测矩阵用户自检) 五种用户身份已勾选。
5. [08 §9 发版签字](./08-测试人员手册.md#9-发版签字标准测试人员) 测试人员签字项完成。
