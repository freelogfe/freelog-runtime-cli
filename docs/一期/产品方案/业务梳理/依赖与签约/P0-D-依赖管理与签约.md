# P0-D: 依赖管理与签约（全量）

对照 Console 壳 + 微前端源码写的**业务事实**。CLI 规格见 [脚手架设计/版本表单/03-依赖.md](../../脚手架设计/PHASE/单资源/版本表单/03-依赖.md)、[管理/04](../../脚手架设计/PHASE/单资源/管理/04-依赖及其授权.md)。  
tools-lib **待加接口**（现在不写代码）见本文 §7。

证据：

- Console：`D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/`
- 声明器：`D:/appinside/freelog-sub-modules/【1】dependencies-declarator`
- 授权处理器：`D:/appinside/freelog-sub-modules/【2】authorization-processor`
- HTTP：`packages/tools-lib/src/service-API/`

本期 CLI **不嵌微前端、不支付、不合集/存储对象当依赖**。本文仍把 Console 全量写清，方便对照。

---

## 1. 三条业务，不是一页

```
发新版时改树（F0 Step2 / M0）
  Console：展开「更多设置」挂 FMicroAPP_Authorization
            mainAppType = resourceInVersionUpdate
            声明器（选资源 / 改范围 / 上抛）嵌授权处理器（签约 / 支付 / 排除）
  CLI：    create-version / update-version 菜单 5 / 6
            问完当场免费签，必须拿到授权

已发版补签（M4）
  Console：侧栏「依赖及其授权」
            mainAppType = resourceDepAuth
            不增删树，只补签 / 排除
  CLI：    dep list / dep init-auth-map / dep auth
            不增删树，只免费补签

本资源签出去的合约（M5）
  Console：侧栏「授权合约」只读列表（本资源当授权方）
  CLI：    不做
```

合集创建 / 合集侧栏 / 批量发卡 / 存储对象 / Markdown / 展品 / 节点：微前端也接，**不是**本期单资源 CLI 路径。

---

## 2. 概念（发版与补签共用）

| 词 | 含义 |
|----|------|
| 直接依赖 | 本版本 `dependencies[]`：`{ resourceId, versionRange }` |
| 基础上抛 | 本资源 `baseUpcastResources[]`：`{ resourceId }`。上抛后**本层可以不签**，使用本资源的人再解决 |
| 对方的基础上抛 | 对方 `info.baseUpcastResources`。本层若不上抛对方，就要替对方把这些也签掉（或再上抛） |
| 被授权方 | 正在发行 / 补签的**本资源**。合约 `licenseeId` = 本资源 id，`licenseeIdentityType=1` |
| 授权方 | 被依赖的对方。合约 `licensorId` = 对方 id |
| 合约挂在资源上 | 签一次覆盖本资源后续版本，**不是**每个新号重签。新号仍要带依赖树 |
| `authStatus` | `1` 正式授权；`2` 测试授权；`128` 未获得授权（通常要付钱或执行事件） |
| 排除项 | `authExcludedItems`：某条合约 / 策略不纳入本版授权。常用来绕过签不了的。Console 提交会带 |
| 循环 | `POST /v2/resources/{本资源id}/versions/cycleDependencyCheck`，体 `{ dependencies }` |

`status`：`0` 未发行；`1` 上架；`2` 冻结；`4` 下架。声明器抽屉里 `0/2/4` **点不了**（`resource-item.vue`）。

---

## 3. 发新版：加依赖（F0 Step2 / M0）

### 3.1 主流程 (ASCII)

```
展开「更多设置」
  → 声明器（已有 depList / upcastList 则加载并逐条 cycle）
  → 「添加依赖」抽屉
        资源市场 / 我的 / 收藏 / 合集 / 存储
        排除自己；status 0/2/4 不可点
  → 点一条 → 打开授权处理器（默认 versionRange = ^latest）
        拉对方 info + 对方上抛
        GET /v2/contracts/list（licenseeId=本资源, subjectIds=对方及上抛）
        GET /v2/auths/resources/batchAuth/results
        cycle（第一参源码写成了对方 id，声明器加载时用的是本资源 id）
        签策略 / 上抛 / 看对方基础上抛 / 排除 / 待执行则打开支付抽屉
  → 提交处理器后才写入声明器列表
  → 列表上可改 versionRange（semver.validRange 且 maxSatisfying 能命中对方某一已发号）
        改范围后声明器不再当场 cycle
  → updateData 回写 Console：
        directDependencies / baseUpcastResources / isAllAuthComplete / authExcludedItems
        resourceInVersionUpdate **不带** batchSignContracts
  → 人点「提交 / 发行」
        未完成授权 → 硬编码「依赖中存在未获取授权的资源」
        POST createVersion：dependencies + baseUpcastResources + authExcludedItems
        不带 batchSignContracts
```

F0 Step2 与 M0 **同一套微前端**。差异：

| | F0 Step2（首版） | M0（更新版本） |
|--|------------------|----------------|
| 起步 | 空表 | 无草稿时 inherit：依赖来自上一版 `resourceVersionInfo1.dependencies`；上抛来自壳 `info.baseUpcastResources`（**不是**上一版字段） |
| 版本号 | 写死 `1.0.0` | `versionInput`，须 `> latest` |
| 传给微前端 | 无 `licenseeVersion` | `licenseeVersion=versionInput`（给处理器展示 / 内部用，**不是** `batchSign` 的字段） |
| 草稿 | 300ms `saveVersionsDraft` | 有草稿则**跳过 inherit** |

### 3.2 「授权完成」在微前端怎么算

声明器 `store.updateData`（`resourceInVersionUpdate`）：

- 未上抛的直接依赖，以及未再上抛的「对方基础上抛」，都要有 `activeContracts.length > 0`
- `activeContracts` = `status===0` 的合约（**不看** `authStatus`）
- **已上抛的本层可以不签**（在上抛名单里就跳过）
- `128` 也算「有合约」，所以付完 / 没付只要合约还在，也能点提交
- 批量发卡（`resourceInBatchPublish`）才回写 `batchSignContracts`；发行 / 更新版本这条**不回写**

### 3.3 支付（授权处理器 `PayDrawer`）

PC（Console 桌面就是这条）：选微信 / 支付宝 → 出二维码 → 倒计时 5 分钟 → 约每秒轮询订单。

| 方式 | 怎么出码 |
|------|----------|
| 微信 | 拼带合约 / 订单信息的 URL，前端画码 |
| 支付宝 | `POST /v2/contracts/{id}/events/prePayment`，`tradeType=A_NATIVE`，用返回的 `qrCode` 画码 |
| 羽币 / FETH | 代码在，写死不展示 |

轮询：`GET /v3/transactions/payments/query`（`businessType=ContractRoutinePayment`，`outOrderId`）。`S` 成功 / `F` 失败。  
可用方式：`GET /v3/transactions/gateways/channelList`。  
旧接口 `POST /v2/contracts/{id}/events/payment` 处理器标了废弃。

手机端：微信内 H5、支付宝内跳 App；第三方浏览器才出码。不是发行页主路径。

### 3.4 提交体（Console）

`Resource.createVersion`（`POST /v2/resources/{id}/versions`）：

| 字段 | |
|------|--|
| `dependencies` | `{ resourceId, versionRange }` |
| `baseUpcastResources` | `{ resourceId }` |
| `authExcludedItems` | `{ resourceId, excludedType:'contractId', excludedValue }`（从微前端合约列表展平） |
| `batchSignContracts` | **不传**（签约已在处理器里做完） |
| `version` | 首版 `1.0.0`；M0 用输入框 |

### 3.5 API（发版加树）

| 操作 | 谁调 | HTTP | tools-lib 现在 |
|------|------|------|----------------|
| 查对方 / 自己 | 两边 | `GET /v2/resources/{idOrName}` | `Resource.info` 已有 |
| 批量资源 | 两边 | `GET /v2/resources/list` | `Resource.batchInfo` 已有 |
| 市场列表 | 声明器抽屉 | `GET /v2/resources` | `Resource.list` 已有 |
| 收藏列表 | 声明器抽屉 | `GET /v2/collections/resources` | `Collection.collectionResources` 已有 |
| 循环 | 两边 | `POST /v2/resources/{id}/versions/cycleDependencyCheck` | `Resource.cycleDependencyCheck` 已有 |
| 批量合约 | 处理器 | `GET /v2/contracts/list` | `Contract.batchContracts` 已有 |
| 批量授权结果 | 处理器 | `GET /v2/auths/resources/batchAuth/results` | `Resource.batchAuth` 已有 |
| 批量签约 | 处理器 | `POST /v2/contracts/batchSign` | `Contract.batchCreateContracts` 已有 |
| 用户批量 | 处理器展示 | `GET /v2/users/list` | `User.batchUserList` 已有 |
| 发行 | Console 壳 | `POST /v2/resources/{id}/versions` | `Resource.createVersion` 已有 |
| 上一版 | M0 inherit | `GET /v2/resources/{id}/versions/{ver}` | `Resource.resourceVersionInfo1` 已有 |
| 草稿 | Console 壳 | `GET/POST .../versions/drafts` | `lookDraft` / `saveVersionsDraft` 已有（CLI **不用**） |
| 按版本合约 | 处理器部分场景 | `GET /v2/resources/versions/{versionId}/authContract` | **待加** |
| 排除项 | 处理器 | `PUT /v2/resources/{id}/batchSetResourceAuthExcluded` | **待加** |
| 合约覆盖版本 | 处理器 | `GET /v2/resources/{id}/contracts/coverageVersions` | `Resource.batchGetCoverageVersions` 已有 |
| 有此依赖的版本 | 处理器 | `GET /v2/resources/{id}/resolveResources`（带 query） | **要补 query**，见 §7 |
| 流转记录批量 | 处理器展示 | `POST /v2/contracts/contractsTransitionRecord` | **待加** |
| 预支付 / 画码 | 支付抽屉 | `POST /v2/contracts/{id}/events/prePayment` | **待加**（本期 CLI 不调用） |
| 轮询订单 | 支付抽屉 | `GET /v3/transactions/payments/query` | **待加**（本期 CLI 不调用） |
| 可用支付方式 | 支付抽屉 | `GET /v3/transactions/gateways/channelList` | **待加**（本期 CLI 不调用） |

抽屉里的合集子作品、存储桶 / 对象、展品：本期 CLI 不加依赖，接口先不列入必加。

### 3.6 Console 源码位置

- F0 Step2 挂载：`creator/Step2/index.tsx` L905–919；提交拦授权：`step2Effects.ts` L510–543
- M0 挂载：`versionCreator/$id/index.tsx` L1110–1137；inherit：`resourceVersionCreatorPage.ts` L544–604；提交：L728–814
- 声明器回写：`dependencies-declarator/src/store/index.ts` L226–329
- 抽屉不可点：`resource-item.vue` L73–75（`status` 0/2/4）
- 处理器带合约拉取：`authorization-processor/.../resource-with-contracts.ts`
- 支付：`pay-drawer.vue` + `domain/payment/pay-drawer-plan.ts`

---

## 4. 已发版：补签（M4）

### 4.1 主流程 (ASCII)

```
侧栏 Tab「依赖及其授权」
  → GET info（baseUpcast + resourceVersions）
  → 版本筛：全部 / 某一版
  → GET versions 拼直接依赖（去重）
  → 微前端 resourceDepAuth（licenseeId=本资源）
        不增删树、不改 versionRange
        可补签 / 排除 / 支付
  → 签约成功后 sider 刷新黄标
```

本页**不**调 `PUT .../versions/batchSetContracts`（那是按版本挂策略，旧 effects 里有、当前页没用）。

### 4.2 API

| 操作 | FServiceAPI / 微前端 | HTTP | tools-lib |
|------|----------------------|------|-----------|
| 壳 + 上抛 | `Resource.info` | `GET /v2/resources/{id}` | 已有 |
| 各版依赖 | `getVersionListByResourceID` | `GET /v2/resources/{id}/versions` | 已有 |
| 补签 | 处理器 `batchSign` | `POST /v2/contracts/batchSign` | 已有 |
| 树（CLI 看树用） | — | `GET /v2/resources/{id}/dependencyTree` | `Resource.dependencyTree` 已有 |

### 4.3 Console 源码位置

- 页面：`sidebar/dependency/$id/index.tsx` L33–52 挂载；L60–139 筛 + 微前端
- effects：`resourceDependencyPage.ts` L89–283

---

## 5. 授权合约列表（M5，只读）

本资源当**授权方**签出去的合约。`GET /v2/contracts`：`identityType=1`，`licensorId`=本资源。只读。CLI 不做。分册仍见 [P0-M5](../维护%20-%20单资源/P0-M5-授权合约.md)。

---

## 6. 和本期 CLI 的差异（设计时认这张表）

| | Console / 微前端 | 本期 CLI |
|--|------------------|----------|
| 选资源 | 抽屉五栏 | 问 id 或 `username/name` |
| 合集 / 存储对象当依赖 | 抽屉有 | **不加** |
| 循环体 | 常只传正在看的一条 | 工作稿全部 + 新的 |
| 循环第一参 | 声明器：本资源；处理器打开时源码写成了对方 id | **只用本资源 id** |
| 改范围后 cycle | 不再查 | **再查** |
| 授权完成 | 有 `status===0` 的合约即可（128 也算）；**上抛的本层可以不签** | **不看合约**。只认 `batchAuth` 的 `isAuth === true`。**不解决上抛** |
| 上抛 | 可勾上抛；要处理对方的基础上抛 | **不问、不写、不签上抛链**。对方有 `baseUpcastResources`：不加 / 提交失败。`createVersion.baseUpcastResources` 传 `[]` |
| 支付 | PC 扫码 | **不做**。128 / 只有付费策略：不加 |
| 排除项 | 可写，提交带上 | 菜单 5 **不写**；提交 `authExcludedItems: []` |
| 提交签约字段 | 不带 `batchSignContracts` | 同，签完再 POST |
| 草稿 | 300ms 平台草稿 | 只写 `N.version.json` |
| 已发版改树 | 必须再走 M0 | 必须再走 `update-version` |

合约挂在「本资源当被授权方」上，**不是**挂在某一个版本号上。更新版本回显上来的依赖，只要合约还是 `status===0` 且 `authStatus` 为 1 或 2，不必为新号重签。`licenseeVersion` 微前端会传，`batchSign` 的 tools-lib 体**没有**这个字段，不要造。

---

## 7. tools-lib：已有 / 要补 / 本期不要调

**现在不改 `packages/tools-lib`。** 开发依赖相关命令时再按表加。函数名跟旁边已有的风格走（小驼峰、与 HTTP 对应），不要另起一套。

### 7.1 本期 CLI 依赖路径：已经有，直接用

| 函数 | HTTP | 用在 |
|------|------|------|
| `Resource.info` | `GET /v2/resources/{idOrName}` | 定位对方、策略、上抛、门禁 |
| `Resource.batchInfo` | `GET /v2/resources/list` | 批量补名字（可选） |
| `Resource.getVersionListByResourceID` | `GET /v2/resources/{id}/versions` | 选范围、回显源校验 |
| `Resource.cycleDependencyCheck` | `POST .../cycleDependencyCheck` | 加 / 改范围 |
| `Resource.createVersion` | `POST .../versions` | 提交发版 |
| `Resource.resourceVersionInfo1` | `GET .../versions/{ver}` | 更新版本回显依赖 |
| `Resource.dependencyTree` | `GET .../dependencyTree` | `dep list --tree` |
| `Resource.batchAuth` | `GET /v2/auths/resources/batchAuth/results` | **CLI 加依赖先查**：只看 `isAuth`。`resourceIds`=对方，`versionRanges`=范围。不看合约 |
| `Contract.contracts` | `GET /v2/contracts` | 微前端 / Console。**CLI 加依赖不用** |
| `Contract.batchContracts` | `GET /v2/contracts/list` | 微前端主用。**CLI 加依赖不用** |
| `Contract.batchCreateContracts` | `POST /v2/contracts/batchSign` | 免费签 |
| `Contract.contractDetails` | `GET /v2/contracts/{id}` | 核对一条（可选） |
| `Contract.transitionRecords` | `GET .../transitionRecords` | 展示用，本期可不调 |

### 7.2 开发时要补进 tools-lib（先记在这里）

跟**单资源依赖 / 签约**对得上、现在文件里没有或参数不完整的：

| 建议函数（未写） | HTTP | 微前端谁在用 | 本期 CLI |
|------------------|------|--------------|----------|
| `Resource.getVersionAuthContract` | `GET /v2/resources/versions/{versionId}/authContract` | 声明器 / 处理器 `getContractListByVersionId` | 已发版看某版挂了哪些合约时可能用；`dep list` 可先靠树 + `contracts` |
| `Resource.batchSetResourceAuthExcluded` | `PUT /v2/resources/{id}/batchSetResourceAuthExcluded` | 处理器改排除项 | **本期不调用**（不做排除）。以后做排除再接 |
| `Contract.contractsTransitionRecordBatch` | `POST /v2/contracts/contractsTransitionRecord` | 处理器给生效合约补最后一条流转 | 展示用，CLI 可不调 |
| `Resource.resolveResources` **补 query** | 现有函数只传 `resourceId`。处理器还传 `resolveResourceId`、`version`、`isExcludeUpcast` | `getVersionSetByDependency` | 已发版「哪些版本用了这个依赖」；补参数，不要新造第二个函数 |

`Resource.batchGetCoverageVersions`（`GET .../contracts/coverageVersions`）已经有，处理器 `coverageVersionList` 同条。

### 7.3 支付相关：也记上，本期 CLI 禁止调用

| 建议函数（未写） | HTTP | 说明 |
|------------------|------|------|
| `Contract.prePayment` | `POST /v2/contracts/{id}/events/prePayment` | 出支付宝码 |
| `Payment.queryContractPayment`（或放 `Transaction`） | `GET /v3/transactions/payments/query` | 轮询 `S`/`F` |
| `Payment.channelList` | `GET /v3/transactions/gateways/channelList` | 可用微信 / 支付宝 |

`Event.transaction`（`POST .../events/payment`）已有，处理器标了废弃，**不要**当新支付入口。  
`packages/tools-lib/src/service-API/payment.ts` 现在是金融账户 / 提现，不是合约扫码。

### 7.4 不要为抽屉五栏专新造

市场 / 收藏 / 存储列表：`Resource.list`、`Collection.collectionResources`、`Storage.bucketList` / `objectList` 已有。本期 CLI 不问这些。合集目录、展品、节点签约：不是本期依赖规格。

---

## 8. CLI 命令对照（不发明）

| Console | CLI | 决策 |
|---------|-----|------|
| 发版时改树 | `create-version` / `update-version` 菜单 5 / 6 | ✅ 问法见版本表单 |
| 已发版补签 | `dep auth` / `dep init-auth-map` | ⚠️ 仅免费 |
| 看树 | `dep list --tree` | ✅ |
| 支付 / 排除 / 合集当依赖 | — | ❌ |
| 授权合约列表 | — | ❌ |

```
freelog-cli create-version
freelog-cli update-version
freelog-cli dep list --tree
freelog-cli dep auth --policy-map ./auth-map.yaml --yes
```

**源码对齐日期**: 2026-09-04
