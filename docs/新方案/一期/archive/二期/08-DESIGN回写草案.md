# DESIGN.md 完整回写草案

> 文档角色：评审通过后 **整体替换/合并** 仓库 [DESIGN.md](../../../DESIGN.md) 的草案。涵盖 **一期资源发行 + 二期节点/展品** 完整产品契约。**本阶段不直接修改 DESIGN.md。**

最后更新：2026-08-20

---

## 使用说明

1. 以 [00-产品设计总览](./00-产品设计总览.md) + [04-能力矩阵](./04-能力矩阵与验收.md) 为评审真源。  
2. 合并时 **保留** DESIGN 现有细节（凭据加密、字段账本引用、实现约束）中与本文不冲突的章节。  
3. 本文 **扩展** 产品目标至节点主 headless 运营；**不删除** 一期范围表述。

---

## 草案 §A · 产品目标（完整）

### 定位

Freelog Runtime CLI：以本地工程为工作面的 **资源发行 + 节点展品运营** 工具（见 [00](./00-产品设计总览.md)）。

### 目标

1. 作者不打开 Console，完成本地文件型资源主要生命周期（**一期**）。  
2. 节点主在固定 nodeId 下，headless 完成市场选品、展品签约与上下线（**二期**）。  
3. 同一工程可人手操作，也可进 Git/CI/Agent。  
4. Console UI 约束在 CLI 中可发现、可验证、可自动化。  
5. 模板、批量、JSON envelope 为一等能力。

---

## 草案 §B · 领域概念

| 概念 | 定义 |
|---|---|
| **Market listing** | `Resource.list` + `status=1`；非独立数据表 |
| **Presentable（展品）** | 某资源在某节点上的挂载实例；含 version、onlineStatus、policy |
| **节点壳** | nodeName、nodeDomain、可见性、Logo 等；Console 配置，CLI 只读 |
| **dep auth** | 发布者签依赖； licensee = 发布者 |
| **exhibit sign** | 节点主签市场资源； licensee = nodeId |

---

## 草案 §C · OUT 列表增补

在 DESIGN 现有 OUT（支付、云存储 picker 等）基础上，明确：

| 能力 | 分类 | CLI 行为 |
|---|---|---|
| 节点 create/update/delete | OUT | 不注册命令；文档指向 Console |
| 主题 activate（nodeThemeId） | OUT | 不注册命令 |
| 测试节点 InformalNode | OUT | 独立 API 面 |
| 节点收入、提现、交易 | OUT | Payment 域 |
| MicroApp 签约 | OUT | 不对齐 Drawer |
| 合集展品 CRUD | OUT | 3.0 再议 |
| C 端购买 / runtime 部署 | OUT | 浏览器域 |
| 可视化 policy builder（展品侧） | OUT | code 4 或 handoff；可复用一期 `policy apply` |

**IN（二期）：** `market search/show`；`node list/show`；`node exhibit sign/list/online/offline`；可选 `node contract list`（只读）。

---

## 草案 §D · Agent 主路径

- Headless Agent / CI：**不得**依赖 `session` / `studio` 做展品运营。
- 主路径：`--env` + `--yes` + `--json` + `node exhibit sign --dry-run` → sign → online。
- 遇 code **5**：输出 `contractsUrl` / `nextCommand`；人完成 Console 后重跑（与 dep auth handoff 同形态）。
- 节点 `nodeId`：环境变量 / CI 配置 / 一次 `node list`；**不** create node。

---

## 草案 §E · 能力矩阵引用

完整 NM-01 ~ NM-23 见 [04-能力矩阵与验收](./04-能力矩阵与验收.md)。评审后合并至 [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md)（**当前未修改**该文件）。

**NM** 与 CLI 原生 **N-01~N-06**（模板、批量、会话等）命名空间分离。

---

## 草案 §F · 机器 schema 清单增补

实现阶段随包发布（设计真源：[06-JSON协议与Schema草案.md](./06-JSON协议与Schema草案.md)）：

| schema（规划） | 命令 |
|---|---|
| `market-search.json` | `market search` |
| `market-show.json` | `market show` |
| `node-show.json` | `node show` |
| `node-exhibit-sign-dry-run.json` | `node exhibit sign --dry-run` |
| `node-exhibit-sign.json` | `node exhibit sign` |
| `node-exhibit-online.json` | `node exhibit online` |

`schemaVersion` 升级规则与一期 envelope 一致。

---

## 草案 §G · 验证

- 二期 E2E：`verify:exhibit-smoke`（规划）；**不**默认并入 `pnpm verify` 直至 smoke 稳定。
- 场景索引：L4 展品链见 [04 §9](./04-能力矩阵与验收.md) 与 [10-L4验收模板](./10-L4验收模板.md)（评审后合并 [场景目录](../验证/场景目录.md)）。
- 完成声明须绑定日期化 dev ENV 报告，与一期规则相同。

---

## 草案 §H · 与 Console 关系（一句话）

对齐 Console **Drawer + 展品 Tab API** 语义，不对齐 MicroApp、批量上架 policy 缺口、节点 Setting 表单。

---

## 合并检查清单

- [ ] DESIGN 产品目标含「节点主 headless 展品运营」
- [ ] OUT 表含节点写、主题、InformalNode、MicroApp
- [ ] dep auth vs exhibit sign 区分（链 [13 §3](./13-术语与对象速查.md#3-易混动词)）
- [ ] 对齐文档 §9 NM 系列已合并
- [ ] 使用文档 [09](./09-节点与资源市场（使用草案）.md) 复制到 `使用/` 后与 DESIGN 边界一致
- [ ] 测试并排引用 [05 §C](./05-Console源码证据与调用链.md#c-测试人员-console-对照nm-core) 或合并至验证目录
- [ ] 多视角与术语：[12](./12-多视角设计说明.md)、[13](./13-术语与对象速查.md) 要点已纳入 DESIGN 读者导读（可选附录）

完整评审门禁见 [14-文档修订与评审清单](./14-文档修订与评审清单.md)。

---

## 冲突处理

| 阶段 | 真源 | 规则 |
|---|---|---|
| **评审期（当前）** | `docs/新方案/二期/` | 讨论、ADR、能力矩阵以本目录为准；**不**直接改 `DESIGN.md`、`对齐/`、`使用/` |
| **合并 DESIGN 前** | 本目录 vs 仓库 [DESIGN.md](../../../DESIGN.md) | 逐节 diff；无冲突则按 [08](./08-DESIGN回写草案.md) 合并 |
| **发现冲突** | — | 1）优先查 [07 ADR](./07-开放问题与设计裁决.md) 是否已裁决；2）未裁决则新增 Q* 并标注日期；3）同步 03/04/06/15/17 |
| **代码 vs 设计** | 实现以 **已合并 DESIGN + 07** 为准 | 评审期代码仍跟一期 DESIGN；二期实现启动前须 §6 评审通过（[14](./14-文档修订与评审清单.md#6-实现启动评审研发)） |

**禁止：** 静默「以 Console 为准」改 CLI 文档而不升 ADR；禁止在 `对齐/` 手改 NM 表（用 [附录 A](#附录-a--对齐文档-nm-修订草案合并用)）。

---

## 附录 A · 对齐文档 NM 修订草案（合并用）

> **不修改** [CLI数据操作与Console对照](../对齐/CLI数据操作与Console对照.md) 直至评审批准。合并时：新增 **§9 节点·市场·展品**；修订 **§7 OUT** 一行。

### A.1 修订 §7 OUT 行

**原（对齐 §7）：** `节点展品、收入、收藏、运营消费侧 | OUT`

**改为：**

| 能力 | 分类 | CLI 行为 |
|---|---|---|
| 节点展品 sign/list/online/offline | **IN（二期）** | `node exhibit *`；见 NM-08~12 |
| 节点 create/update/delete、主题 activate | OUT | Console |
| 节点收入、收藏、C 端购买 | OUT | 不注册命令 |

### A.2 新增 §9 格式草案（CORE 摘录）

| ID | Console 业务语义 | CLI 契约 | 范围 / 对齐 | 当前证据 | 必须一致的门禁 |
|---|---|---|---|---|---|
| NM-08 | Sign Drawer 签约 | `node exhibit sign` | CORE / PARITY | SPEC+CONTRACT（[05](./05-Console源码证据与调用链.md)） | batchInfo/Auth/User；反查 presentableId |
| NM-11 | 展品上架 onlineExhibit | `node exhibit online` | CORE / EQUIVALENT | SPEC+CONTRACT | 至少一条启用 policy |
| NM-12 | 展品下架 | `node exhibit offline` | CORE / PARITY | SPEC+CONTRACT | presentable 存在 |

完整 NM-01~23 见 [04 §7](./04-能力矩阵与验收.md)；合并时补全证据列 SPEC/CODE/CONTRACT/ENV。

### A.3 同步文档

- [DESIGN.md](../../../DESIGN.md) ← 本文 §A–§H  
- `对齐/CLI数据操作与Console对照.md` ← 附录 A  
- `使用/` ← [09](./09-节点与资源市场（使用草案）.md)  
- `验证/` ← [10](./10-L4验收模板.md)、[16](./16-verify-exhibit-smoke设计.md)
