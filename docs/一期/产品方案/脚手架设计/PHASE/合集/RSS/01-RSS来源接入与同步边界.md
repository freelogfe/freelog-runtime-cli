# 合集 RSS：来源接入与同步边界

状态：**暂时忽略，不属于当前 CLI 范围。** 不实现、不注册 RSS 命令，不写 RSS 自动化测试或 dev 资源；本文仅保留已核对的 Console 行为，供未来重新排期时参考。

当前 CLI 的唯一 RSS 要求是安全保护：普通目录、表单、依赖、规则、发布和 listing 写命令一旦识别出 RSS 目标即拒绝写入。CLI 不提供 `rss status`、绑定、换源、同步、失败项查询、轮询或浏览器自动跳转。

RSS 不应被设计成“另一种添加单品按钮”。普通合集目录由用户选择自己已上架的线上单资源，CLI 写入目录草稿并由用户发布；RSS 合集则由外部来源、邮箱验证和平台异步同步驱动，CLI 不能预测或本地构造单品。因此它是一个独立的**来源导入能力**，与手工目录和自动收录并列、互斥。

## 1. 未来重启时的用户模型与不可变边界

```text
普通手工目录 ──────── 用户选线上单资源 ──────── 服务端目录草稿 ──> publish
自动收录目录 ──────── 平台按规则收录 ────────── 服务端目录 ──────> 平台更新
RSS 来源目录 ── 邮箱验证 + 外部 feed ──> 平台异步导入/同步 ───────> 平台更新
```

三条路径不能混写。检测到 `feedUrl` 或等价 RSS 来源标记后：

1. `collection item add/remove/rename/move/sort`、`collect-rules`、`form`、`dep`、`publish` 均拒绝写入；它们不能修改外部来源生成的目录或版本信息。
2. `collection update --tag` 只有在真实 dev 证明仍被平台允许时才能保留；在该证据之前也拒绝写入，不能凭 Console UI 推测。
3. RSS 状态、日志、授权合约是只读观察能力，不因 RSS 而隐藏。
4. RSS 绑定、换源和同步必须是显式 `collection rss` 命令，绝不能被 `collection create`、`item add` 或 `publish` 隐式触发。

## 2. 未来重启时的候选分阶段交付

### R0：识别与状态（先交付）

```text
freelog-cli collection rss status [--resource <collection>]
```

只读一次合集详情和同步进度，输出 feed 地址（移除 URL 凭据、按隐私规则脱敏）、状态、最近同步时间、错误摘要和“哪些合集命令被来源锁定”。来源详情读取成功但进度暂不可用时，必须输出“来源已识别、进度未知”，不能把它误判为未绑定。默认绝不轮询；`--watch` 是以后可选能力，必须允许中断且有明确间隔。R0 的价值是让普通 CLI 用户看懂“为什么目录不能改”，不承担绑定或恢复。

### R1：绑定和换源（必须完成契约验证后）

```text
freelog-cli collection rss send-code --url <feed-url>
freelog-cli collection rss bind --url <feed-url> --code <verification-code>
  [--from <YYYY-MM-DD>] [--to <YYYY-MM-DD>] --yes
freelog-cli collection rss change-source --url <feed-url> --code <verification-code> --yes
  [--accept-guid-mismatch]
```

验证码仅由用户从邮箱输入；CLI 不获取邮箱内容、不保存验证码、不在日志回显。`bind`/`change-source` 发送前必须读回合集状态并检查平台确认的可绑定条件。特别是“已有手工目录、自动收录规则或未发布表单时是否允许换 RSS、平台是否清空它们”目前未知，未有 E5 证据时必须拒绝，而不能主动清理或猜测迁移结果。HTTP 成功只表示请求已受理，随后必须读回来源状态。

与 Console 当前可执行流程对齐，`bind`/`change-source` 的顺序是：先调用 `Rss.bindingsPreview`，确认 feed 可解析、有 owner email 且未被占用；再允许 `send-code`；用户输入验证码后才允许绑定。单集数超过平台阈值时必须让用户指定起止日期，并带日期重新 preview。`change-source` 还必须在**验证码输入后、bind 前**调用 `Rss.bindingsCompare({ resourceId, feedUrl, verificationCode })`：只有平台判定为大量 GUID 不匹配时，才显示“可能作为全新单集发布”的第二次确认；交互模式必须再次确认，非交互模式必须显式携带 `--accept-guid-mismatch`。预览/比较只是降低误操作，不能替代绑定后读回，也不能让 CLI 自行决定迁移或删除目录。

注意：当前 Node `Rss.bindingsCompare` 的 TypeScript 声明没有 `verificationCode`，但 Console 当前实际调用会传它。这是 B-06 的 DTO 缺口；CLI 实现前必须用 dev 请求确认字段并先修正 tools-lib 声明，不能以 `as any` 掩盖。

### R2：显式同步（最后交付）

```text
freelog-cli collection rss sync --yes
freelog-cli collection rss sync --yes --wait --timeout <duration>
```

`sync` 只触发一次平台同步，不默认等待。`--wait` 才读取进度，固定有界间隔、可 Ctrl+C 中断；超时必须输出“仍在同步”和最后已知进度，不能把超时写成失败或成功。同步期间普通合集写命令继续被来源门禁拒绝。

## 3. 未来真实测试前的硬条件

R1/R2 需要功能拓扑测试文档 B-06 解除。至少证明：

- `bindingsPreview`、`bindingsCompare`（含 `verificationCode`）、`sendVerificationCode`、`bindFeed`、`syncBinding`、`getSyncProgress` 的真实请求/响应和可恢复错误；
- RSS 识别字段、标签是否可写、以及所有受控字段的拒绝行为；
- 空合集绑定、已有手工目录绑定、换源、同步中再次同步、错误 feed、验证码错误、超时和中断；
- 每个写入后的目录、listing、表单与来源状态读回，不删除用户既有测试资源。

开发测试必须使用隔离的 dev RSS 来源和账号，不能使用用户生产 feed；所有 URL、验证码、邮箱及响应中的个人数据不得提交进仓库。

## 4. 证据

- 可信业务梳理：[P0-C0-Step2-添加单品](../../../../业务梳理/创建流程%20-%20发行合集/P0-C0-Step2-添加单品.md)、[P0-C1-单品管理](../../../../业务梳理/维护%20-%20合集/P0-C1-单品管理.md)、[P0-C2-合集信息](../../../../业务梳理/维护%20-%20合集/P0-C2-合集信息.md)。
- Node 包装：`packages/tools-lib/src/service-API/rss.ts` 的预览、比较、发码、绑定、同步与进度接口；不绕过 tools-lib 直接组装 HTTP 请求。
- 完整测试门禁：[合集功能拓扑与证据驱动测试门禁](../测试/00-功能拓扑与证据驱动测试门禁.md) 的 C-25、B-06、T-52～T-56。
