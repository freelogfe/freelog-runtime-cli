# 04 - bind

把已经在平台上的**单资源（普通文件、主题或插件）**，接到当前工作区的一份 `N.json`。只写不可变身份和本地文件对应关系。
不是 `pull`。看线上用 `status`。字段约定见 [02](./02-本地状态.md)。  
`subjectType===4`（合集）不能使用本页的单资源 `bind`；已有独立 `collection bind`，见 [合集 Step1](../PHASE/合集/创建/01-Step1-创建合集.md)。

```
freelog-cli bind <resourceId|username/name> [--resource <selector>] [--artifact <path>] [--force] [--yes]
```

必须先 `login`。GET 详情后，响应必须带非空 `resourceId`，且 owner 必须以 `userId`、`ownerId` 或 `creatorId` 中的一个安全整数明确等于当前登录账号；详情缺 ID / owner 或 owner 不匹配时失败，不能因为某一版接口没有返回 `userId` 而误拒绝自己的资源，也不能按本地缓存放行。只接受代表单资源的 `subjectType`：响应可为 `1`、`"1"`、`[1]` 或 `["1"]`，统一按“值中包含 1”判断；只包含其他主体类型时失败。仅含 `4` 的目标应提示改用 `collection bind`。

在解包详情前先核验业务信封：出现的 `ret`、`errCode`、`errcode` 必须严格为数值0。失败信封中的有效ID、owner等字段也不能作为绑定依据；不可解析响应或失败业务码固定报 `BIND_INFO_INVALID`，不回显平台正文，不写本地身份、不回退其它目标。

前置顺序遵守[08 §3](./08-多资源本地状态、选择与产物路径.md#3-命令路由与选择规则)：持有工程锁并恢复可验证事务→检查未决远端操作→全量校验所有身份/工作稿→解析显式`--resource`→读取平台详情→复验本地状态并按现有规则接续/新增。损坏身份、重复状态、孤儿或错配稿、错误选择器、占用锁、无法恢复的事务或现有未决操作，均在本次GET前失败；保留现场。认证与显式产物的既有校验也在GET前完成，不把这些失败转成一次无意义查询。

锁覆盖GET及本地提交整个异步窗口，避免两条CLI并发绑定复用编号或覆盖状态。CLI全局钩子的短锁不能替代这一领域层边界；直接调用同一领域函数也遵守它。GET结束后仍要复验本地，不能因增加前置校验就删除原有后置检查；工程锁不约束外部编辑器。平台失败/取消异常均释放本次锁，不重试GET、不新增身份或删除稿。不改变`bind`专属路由，也不将合集/创建入口套用普通资源选择菜单。

---

## 1. 什么时候用

| 场景 | 命令 | 不要 |
|------|------|------|
| 线上已有，本地有文件，以后要发新版 | `bind <id\|username/name> --artifact <path>` | 再 `create`；用 `pull` |
| 自己的壳、还没发行、本地没有这份 | 同上 `bind`，再 `create-version` | 再 `create`（换名也不行） |
| 主题/插件已 `init`，已有 `filePath` | `bind <id\|username/name>` | 再 `init` |
| 已有本地主题/插件工程，要接入线上资源并发新版 | `bind <id\|username/name> --artifact <文件\|dist\|build>` | 为了 bind 再 `init` |
| `create` 成功但 `N.json` 没写上 id | 同一条 `bind` | 再 `create` |
| 本地新发 | `create --artifact` | 先 bind 再 create |
| 合集 | 使用独立 `collection bind` | 不使用本页的单资源 `bind`；见[合集 Step1](../PHASE/合集/创建/01-Step1-创建合集.md) |

没有 `.freelog/` 时可以自己建，不必先 `init`。

---

## 2. 写入

只写：`schemaVersion=1`、`resourceId` / 完整不可变 `resourceName` / `name` / 可变展示 `title` / `typeCode` / `subject` / `filePath`；非 prod 才写 `env`。`resourceName`是完整`username/name`，短`name`不能代替它参与身份选择。所有写入遵守 [02 §2.1](./02-本地状态.md#21-一致性与恢复) 的锁和原子事务。
策略、版本 **不写**；标题作为选择元数据从平台详情写入。

`--artifact` 必须是工作区内的相对路径；CLI 会将 `./dist` 规范为 `dist`，并拒绝绝对路径、空路径与越过工作区的 `..` 路径。它指向普通文件 → 与 `create --artifact` 相同。指向目录 → 仅当类型是 `RT001`/`RT002`。其余类型给目录：失败「不支持文件夹」。

| 线上 | 工作区 | `--artifact` |
|------|--------|----------|
| 普通资源 | 还没有对应 `N.json` | **必须** |
| 普通资源 | 已有合格 `N.json` | 可省（复用其必填 `filePath`） |
| 主题 / 插件 | 已 `init` 且已有 `filePath` | 可省 |
| 主题 / 插件 | 没有本地身份或没有产物记录 | **必须**（传文件或构建目录） |

新增身份时，`--artifact` 指向的本地产物必须在平台 GET 前已存在；拿到类型详情后还要复验普通资源=文件、主题/插件=文件或目录，失败不写任何状态。`bind` 从平台详情写回 `RT001` / `RT002` 后，后续 `create-version` / `update-version` 仅在该路径是目录时临时压缩。对既有本地项目，`bind` 不下载、不复制模板，也不创建任何模板元数据；模板来源不是主题/插件发版的前提。

显式`--resource`已确定目标且没有替换`--artifact`时，复用锚点的存在/本地类型形态校验也在GET前完成；GET后仍按线上类型复验。未使用的其它旧产物后来缺失，不等于其身份元数据损坏，不为新增绑定检查全工程物理文件；使用有效新`--artifact`可替换本次目标的旧缺失锚点。

---

## 3. 对上哪一份

1. 显式 `--resource` 必须恰好匹配一份；空串不是“未传”，零匹配在GET前失败。线上ID已在另一份时拒绝，不能忽略显式目标。
2. 未传选择器且已有同一 `resourceId` → 幂等使用那份。
3. 尚无目标且传了 `--artifact` → 仅接续同路径未绑定身份；全新未占用路径则新增 `max+1`，即使还有多份其它未绑定身份也不拒绝。
4. 尚无目标且未传 `--artifact` → 仅一份未绑定身份可接续；多份则失败并要求显式 `--resource`；没有可复用身份则要求 `--artifact`。

不由TTY或编号顺序猜测目标；上述接续规则与[08 §3.1](./08-多资源本地状态、选择与产物路径.md#31-命令路由矩阵)一致。

同一工作区：一个 `resourceId` 一次；一个 `filePath` 一份。

同一 id 再 bind 幂等：仅当该份 `N.version.json` 的 `resourceId` / `resourceTypeCode` 与线上身份一致才保留；不一致以`DRAFT_IDENTITY_MISMATCH`失败，完整保留身份与稿。不能把同ID类型差异当成换绑、借`--force --yes`删除稿。换绑到另一ID要 `--force --yes`，并在同一事务中删除该份工作稿。这个 id 已在另一份、路径已被占用 → 失败。

本期没有 `unbind`。用户可以备份后删除同一编号的 `N.json` 与 `N.version.json` 这一完整状态单元，再重新 `bind`；单独删除身份会留下孤儿工作稿，CLI 必须停止并给出恢复提示。自动身份删除或重建仍只能通过本地状态事务同时处理 `N.json` 与 `N.version.json`。

成功后只提示 `status`。不 pull、不自动 `create-version`。
