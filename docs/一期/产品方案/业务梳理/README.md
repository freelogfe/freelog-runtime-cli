# Console 资源发行业务梳理

面向 CLI 的 Console 资源发行梳理。只写能在 Console 源码 + `FServiceAPI` + `i18n.json` 对上的事实。

**全量范围与批次顺序**见 [00-资源发行全量梳理计划.md](./00-资源发行全量梳理计划.md)。

本轮覆盖：创建（F0/F1/C0）+ 新版本 M0 + 侧栏维护 + 我的资源/合集列表与详情。不含收藏、收入、交易。

## 范围（创建入口）

入口：`packages/console/src/pages/resource/creatorEntry/index.tsx` 三张卡片，加上已有资源的新版本页。

| 编号 | Console 入口 | 步骤（i18n） |
|------|--------------|--------------|
| F0 | `creator/` | 创建授权条目 → 提交资源文件 → 添加授权策略 → 完善资源详情 |
| F1 | `creatorBatch/` | 选类型 → 上传填卡 → 完成页 |
| C0 | `collectionCreator/` | 创建合集 → 添加单品 → 添加授权策略 → 完善合集信息 |
| M0 | `versionCreator/$id/` | 已有 `resourceId` 建新版本（单页，接近 F0 Step2） |

## 文档约定

每份 Step / 页文档必须有：

1. ASCII 流程图
2. 操作流程
3. API 表：`FServiceAPI.*` + HTTP + i18n（`zh_CN` 只从本目录 `i18n.json` 抄）
4. 字段约束表
5. Console 源码位置：**页面 + effects**，带行号
6. CLI Flag 对照已有命令，不发明第二套
7. 禁止真实 TS/JS 代码块；禁止无行号猜测

证据层：

- UI：`D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/...`
- 业务：`.../packages/console/src/models/...`
- 文案：`docs/一期/产品方案/业务梳理/i18n.json`
- HTTP：`packages/tools-lib/src/service-API/`

**Console 与 CLI 差异总表**见 [CLI 功能取舍决策规范.md](./CLI%20功能取舍决策规范.md)。  
**脚手架设计先读** [01-脚手架设计前置对照.md](./01-脚手架设计前置对照.md)，规格见 [脚手架设计/README.md](../脚手架设计/README.md)。`init` 五选一 ≠ Console 三张入口卡。

业务分册记 Console 全量；CLI 只对照已有命令。最容易写错：上架只用 `online`；合集策略用 `collection policy`；批量 `--resource-type`；inherit 用 `publish --reuse-version`。

## 进度

| 文档 | 状态 |
|------|------|
| [创建流程 - 发行单个资源/](./创建流程%20-%20发行单个资源/P0-F0-单资源发布流程.md) | 已对齐 |
| [创建流程 - 批量发行资源/](./创建流程%20-%20批量发行资源/P0-F1-批量发布流程.md) | 已对齐 |
| [创建流程 - 发行合集/](./创建流程%20-%20发行合集/P0-C0-合集创建流程.md) | 已对齐 |
| [创建流程 - 发行新版本/P0-M0-发行新版本.md](./创建流程%20-%20发行新版本/P0-M0-发行新版本.md) | 已对齐 |
| [维护 - 单资源/](./维护%20-%20单资源/P0-M-单资源维护总览.md) | 已对齐 |
| [依赖与签约/P0-D-依赖管理与签约.md](./依赖与签约/P0-D-依赖管理与签约.md) | 已对齐（含 tools-lib 待加，不改代码） |
| [维护 - 合集/](./维护%20-%20合集/P0-C-合集维护总览.md) | 已对齐 |
| [列表与详情/P0-L1-我的资源与合集列表.md](./列表与详情/P0-L1-我的资源与合集列表.md) | 已对齐 |
| [列表与详情/P0-L2-资源与合集详情.md](./列表与详情/P0-L2-资源与合集详情.md) | 已对齐 |

## 源码索引

```
packages/console/src/pages/resource/
├── creatorEntry/                 # 三选一入口
├── creator/Step1..Step4          # F0
├── creatorBatch/                 # F1
├── collectionCreator/Step1..Step4
├── versionCreator/$id/           # M0
├── sidebar/                      # 单资源维护
├── collectionSidebar/            # 合集维护
├── list/Resources | Collections
├── details/$id/
└── collectionDetails/$id/

packages/console/src/models/
├── resourceCreatorPage/stepNEffects.ts
├── resourceCreatorBatchPage
├── collectionCreatorPage/stepNEffects.ts
├── resourceVersionCreatorPage.ts
├── resourceSider.ts / resourceVersionEditorPage.ts
├── resourceInfoPage.ts / resourceAuthPage.ts / resourceDependencyPage.ts
├── collectionManager/{sider,info,version}Effects.ts
├── resourceListPage.ts / collectionListPage.ts
├── resourceDetailPage.ts / collectionDetailPage.ts
```
