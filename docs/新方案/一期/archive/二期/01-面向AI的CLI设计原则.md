# 面向 AI 的 CLI 设计原则

> 文档角色：**完整** 产品 CLI 设计哲学（一期资源发行 + 二期节点/展品 + 后续扩展）。与 [DESIGN.md](../../../DESIGN.md)「机器输出协议」「写保护」「浏览器接力」一致；总览见 [00-产品设计总览](./00-产品设计总览.md)。

最后更新：2026-08-20

---

## 1. 定位

Freelog CLI 是 Freelog 平台的 **可脚本化操作面**，服务三类使用者：

| 使用者 | 典型入口 | 成功标准 |
|---|---|---|
| **人（TTY）** | 向导、confirm、`session`/`studio` | 约束可见、可取消、可理解 |
| **CI** | 全参数 + `--yes` + `--json` | 确定性、无交互、可门禁 |
| **AI Agent** | 同 CI + plan/preflight/act/verify 循环 | 输出可 parse、可重试、可 handoff |

**核心命题：** AI 时代许多平台提供 HTTP API，但 Freelog 的 CLI 额外承担 **本地文件 → 压缩/SHA1/上传 → 带门禁的平台写入 → 可恢复报告**；Agent 调子进程往往比直连数十个 REST 端点更稳——前提是 **CLI 本身是可依赖的公共接口**。

---

## 2. 原则（P1–P11）

### P1 · 一套业务语义，多种 Intent 来源

- 业务规则只在 **services + 平台 API** 实现一次。
- 工程 manifest、会话 flag、节点命令参数，最终汇入 **同一 service 函数**。
- **禁止** `*ForAgent.ts`、`*ForNode.ts` 复制 publish/sign 逻辑。

### P2 · 原子命令 + 稳定 ID，拒绝黑盒一键

每个写命令应回答一个问题，并在 JSON `data` 中返回下一步所需的 **稳定标识**：

```text
resourceId → presentableId → nodeId
version / versionId / policyId / contractId
```

Agent 编排 = 有序调用原子命令，而非 `freelog do-everything`。

### P3 · 先预检，后写入（Read → Validate → Write）

Agent 默认三步：

1. **L0 只读**：`status`、`market show`、`node show`
2. **L1 预检**：`validate`、`doctor`、`node exhibit sign --dry-run`（规划）
3. **L2/L3 写入**：带 `--yes` 的 mutating 命令

预检失败 **exit 4**；`error.hint` 含建议的下一条命令（可机器 parse）。

### P4 · 机器输出是公共 API

- `--json` envelope：`schemaVersion`、`ok`、`command`、`data`|`error`、`meta.env`
- JSON **key / event 名 / error.code** 英文稳定；人类文案可 i18n
- stdout **仅** 协议数据；日志、spinner、进度 → stderr
- 敏感字段（token、cookie、authorization、password）**脱敏**
- schema 随包发布；变更遵循 schemaVersion 升级规则（见 DESIGN）

### P5 · 写保护与环境显式

- 所有写 API 须 `--env <authorized-env>`（非 TTY 强制）
- 非交互写须 `--yes`（或 TTY confirm）
- owner / 节点归属 / 资源上架状态 在 **service 层** 校验，不只靠命令层

### P6 · 诚实 handoff，不伪造浏览器能力

以下能力 **OUT**，失败时须结构化 **接力**，而非假成功：

- 羽币支付、收银台、验证码
- 身份证 OCR、绑卡、提现、支付密码
- 可视化策略编辑器、封面裁剪、云存储 picker
- MicroApp 嵌入页（Console 内 qiankun 子应用）

handoff 响应应包含（形态与一期 `dep auth` 对齐）：

```text
error.code = 5
error.reason = payment_required | auth_incomplete | ...
error.contractsUrl / actionUrl
error.nextCommand = "freelog-cli ..."
```

Agent：**暂停 → 通知人 → 人完成 → 重跑 nextCommand**。

### P7 · 持久化语义可预测（Auth × Store）

| 编码 | Agent 默认 |
|:---:|---|
| 00 工程 | ✅ 长期资源 + 展品运营（凭据落盘 + manifest） |
| 01 命令会话 | ✅ 单次原子平台操作 |
| 10 studio | ⚠️ 仅多账号**发资源**；非节点管理 |
| 11 session 交互壳 | ❌ headless Agent **不得**依赖（要 TTY） |

节点/市场命令默认 **00**：使用工作区或全局 `.freelog-auth`；不引入新的「节点 manifest」真源（除非未来单独立项）。

**二期补充：** **节点壳**（域名、标题、可见性）不是 CLI/Agent 的修改对象；Agent 只持有 **只读 `nodeId`**，修改展品与资源。

### P8 · 幂等与恢复是一等公民

Agent 会重试。每条写命令须声明恢复模型（DESIGN 已定义）：

| 模型 | 含义 | Agent 行为 |
|---|---|---|
| 幂等读后再写 | 如 SHA1 已上传则 reuse | 安全重试 |
| `remote_succeeded_local_pending` | 平台已成功、本地未完成 | **续跑**，不 recreate |
| `remote_outcome_unknown` | 请求已发出、结果未知 | **停止**，对账后再动 |
| 冲突 code 3 | 本地/平台漂移 | `pull` / `diff` 后再写 |

Studio 报告、batch report 是 **状态机持久化**，不是人类日志。

### P9 · 非 TTY 行为完整

若某能力在 TTY 可用、在非 TTY 不可用，则该能力 **未完成**：

- 不得静默挂起等待输入
- 不得 fallback 到交互壳
- 应 **code 4** + hint「请补参数 `--xxx` 或使用 Console」

### P10 · Console 对齐 = API 语义对齐，不是 UI 对齐

- 对齐 Console **Drawer + API** 路径（如 `batchCreatePresentable`）
- **不对齐** MicroApp、无限滚动 UX、批量多选 UI
- 能力矩阵标注：`PARITY` / `EQUIVALENT` / `OUT` / `CLI_ONLY`（NM 系列见 [04](./04-能力矩阵与验收.md)）

### P11 · 节点壳不可变

- Agent **不得** `node create` / `node update` / `node delete`；节点域名、可见性、Logo 等在 **Console 一次性配置**。
- `nodeId` 来自环境变量、CI 配置或 `node list` 人工选定；后续 pipeline 只传 `--node <id>`。
- 展品与资源运营走 `node exhibit *` 与一期资源命令；**不得**用 `session` / `studio` 替代 headless 展品链路。

---

## 2.1 两条签约链（勿混淆）

| | 一期 `dep auth` | 二期 `node exhibit sign` |
|---|---|---|
| 主体 | 发布者签 **依赖** | 节点主签 **市场资源** |
| licensee | 发布者 userId | **nodeId** |
| 结果 | 版本可发行 | **presentable** |
| API | createVersion 内 batchSignContracts | batchCreatePresentable |

详见 [02 §9](./02-平台业务分析.md#9-两条签约链)。

---

## 3. Agent 集成分层

```text
L0  发现/只读     list, show, search, status
L1  预检          validate, doctor, diff, sign --dry-run
L2  本地意图      manifest / 参数组装（一期已有）
L3  平台写入      create, publish, exhibit sign, exhibit online
L4  恢复/对账      batch --resume, studio reconcile
L5  人类接力      handoff URL + nextCommand
```

编排器只在 L0→L3 自动推进；遇 L5 暂停。

Agent 标准配方（命令序、禁止项、handoff 循环）：[03 §12](./03-CLI命令与架构设计.md#12-agent-标准配方)。

---

## 4. 与 REST/OpenAPI 的关系

| 场景 | 推荐 |
|---|---|
| 纯 CRUD、无本地文件 | 平台 REST 或 tools-lib 均可 |
| 含文件上传、压缩、manifest | **CLI** |
| 需 preflight/门禁/恢复报告 | **CLI** |
| Agent 工具链（Cursor、LangGraph 等） | **CLI 子进程** + JSON envelope |

二期不强制另建「Agent SDK」；CLI + schema + 文档 即为 SDK。

---

## 5. 反模式（评审拒绝）

1. 为 Agent 新增与工程模式并行的业务实现  
2. 交互壳作为 CI/Agent 唯一路径  
3. JSON 输出不稳定、随版本改 key 无 schemaVersion  
4. 写命令无 `--yes` 却在非 TTY 猜默认值  
5. 支付/签约失败返回 `ok: true` 或静默 skip  
6. 复制 Console MicroApp 流程  
7. 节点收入/提现进 CLI「方便调试」  
8. 用 `session` / `studio` TTY 菜单做展品 sign/online 作为 Agent 唯一路径  
9. 假设 `batchCreatePresentable` 响应 `data` 恒为 presentableId（须反查，见 [07-Q1](./07-开放问题与设计裁决.md)）

---

## 7. 安全与权限边界

> 信任模型与 JSON 脱敏；实现须与 [06 §1.2–§1.3](./06-JSON协议与Schema草案.md#12-schemaversion-与兼容性) 一致。

### 7.1 Actor 与许可

| Actor | 典型命令 | 许可条件 |
|---|---|---|
| **资源作者** | `create`, `publish`, `dep auth`, `online`（资源） | 资源 owner；依赖已签 |
| **节点主** | `node exhibit sign/online/offline` | `Node.details.ownerUserId` = 当前用户；节点未删/未冻 |
| **市场浏览者** | `market search/show` | 已登录；**不**隐含 sign 权限 |

**`exhibit sign` 双门槛：** 节点主 **且** 目标资源 `status=1`（已上架）。非 owner 调用 → code **2**。

### 7.2 CI / 密钥与泄露面

| 项 | 约定 |
|---|---|
| 凭据 | `.freelog-auth`、环境变量中的 password/token **不得**进 Git |
| `FREELOG_NODE_ID` / smoke fixture | 仅 dev CI secret；文档示例用 `<env>` / `$NODE_ID` 占位 |
| `.gitignore` | 保持 `.freelog/`、auth 文件忽略（与一期一致） |
| stdout JSON | 不得含 token、cookie、`authorization`、password（[06 §1.3](./06-JSON协议与Schema草案.md#13-脱敏)） |

### 7.3 JSON 字段 allowlist（Agent 消费）

| 命令 | 稳定输出 | 默认不输出 / 脱敏 |
|---|---|---|
| `market search` | `resourceId`, `resourceTitle`, `status`, `subjectType` | 作者 `userId` / `username`（除非 `--verbose` 未来扩展） |
| `market show` | blockers、policies、`canSignToNode` | 内部调试字段 |
| `node exhibit sign` | `presentableId`, `nodeId`, `resourceId`, `checks` | batch 原始 `data` 字符串 |
| handoff | `contractsUrl`, `nextCommand`, `reason` | 会话 cookie |

新增字段须 **minor** schema 升级；删除/重命名须 major（[06 §1.2](./06-JSON协议与Schema草案.md#12-schemaversion-与兼容性)）。

---

## 6. 参考

- [DESIGN.md](../../../DESIGN.md) — 机器输出协议、写保护、handoff  
- [CLI双模式设计](../开发/CLI双模式设计.md) — 双模式分层  
- [CLI双维持久化设计](../开发/CLI双维持久化设计.md) — Auth × Store  
- 一期实践：`--json`、`--password-stdin`、`dep auth` handoff、`validate --for online`
