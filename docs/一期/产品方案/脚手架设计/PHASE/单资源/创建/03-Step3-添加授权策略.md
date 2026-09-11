# Step3 - 添加授权策略

对照业务：第一次加授权策略。**可跳过**，不接续。没有策略也能结束；没有启用策略则以后 `online` 会失败。  
创建之后随时还能再加，命令与 [管理/03](../管理/03-授权策略.md) 相同。本文只写刚建完壳、第一次加怎么问。

```
freelog-cli policy template list
freelog-cli policy template apply [templateId]
```

须已 `login`，`N.json` 已有 `resourceId`。本人、未冻结。当前后端按类型筛选模板存在故障，CLI 暂时展示平台完整返回的模板（包括带 `TransactionEvent` 的模板）；不在客户端按类型、免费/付费或事件猜测过滤，待后端修复后恢复按类型请求。CLI 不提供策略编辑器、支付或执行预览。加完**不**自动 `online`。
不跑本命令 = 不上策略。不要为此再问一次。

| # | 功能 | 命令 | 写不写平台 |
|---|------|------|------------|
| 1 | 列平台完整返回模板 | `policy template list` | 不写 |
| 2 | 选一条模板，或走文件 | `policy template apply <id>` / `policy apply --from-file` | 不写 |
| 3 | 策略名（可改） | TTY / `--name` | 不写 |
| 4 | 追加一条并启用 | 确认后 PUT `addPolicies` | **写** |
| 5 | 回拉列表 | 成功后再 `info` | 不写 |

TTY 跑 `policy template apply` 且未给 id：从 §1 的列表里选。  
`--yes` 或非交互模式必须带 `<templateId>`（或 `--from-file`），缺了失败。

---

## 0. 进入

`Resource.info`（`GET /v2/resources/{id}`，`isLoadPolicyInfo=1`）：非本人 / 冻结失败。打印当前已有策略名和启用状态。没有策略就打一行：

> 添加并启用授权策略之后，资源才能上架。授权策略也可以稍后添加。

本步不要求已有 `latestVersion`（刚 create 完、还没 create-version 时也能加）。上架门禁在 [上下架](../管理/05-上下架.md)。

---

## 1. 列出模板

```
freelog-cli policy template list
```

`Policy.policyTemplates`（`POST /v2/translate/translate-config/list4Client`）当前用空请求体 `{}`；当前 dev 接口带 `resourceTypeCodes4Resource: [当前 typeCode]` 会错误过滤模板。等待后端修复筛选契约后再恢复该参数。

完整展示平台返回的模板，包含带 `TransactionEvent` / 付费条件的模板；固定每页 20 条，TTY 用“上一页 / 下一页”翻页，非 TTY 输出首页和继续提示；不提供分页参数。模板应用只创建授权规则，不触发支付；最终适用性由平台重新编译与资源写入接口决定。

空列表：提示高级路径 `policy apply --from-file`，或去 Console 写策略。不要伪造模板。

帮助：选中推荐模板可以快速添加策略。

---

## 2. 选定模板或文件

| 进入 | 行为 |
|------|------|
| `policy template apply [templateId]` | 用这条。id 必须在本次完整返回的模板列表中 |
| TTY 未给 id | 分页选择模板；取消则回 Step3 |
| `policy apply --from-file <path>` | 读本地策略文本或 JSON，不走模板 id。可含交易事件，平台负责语义校验 |

不要在终端里预览或编辑策略文本。要改文本用 `--from-file`。

---

## 3. 策略名

问：「策略名称」。hint：1–30 个字符。

| 输入 | 行为 |
|------|------|
| 空 | 用模板自带名称；也没有则失败 |
| 空白或 >30 | 「策略名须为 1–30 个字符」，重新问 |
| 与已有策略名或策略文本完全重复 | 失败（与 Console builder 去重一致），换一个名或换模板 |

`--yes`：`--name` 可覆盖模板名；不传就用模板名；模板也没有名则失败。

模板路径先调用平台 `reCompile`，使用其返回正文；`--from-file` 则直接读取本地文本。当前 CLI 只传模板报告 UI 的默认参数，不提供时间、金额或事件参数填写。事件 DSL 或参数化模板等待后端给出可接受的编译契约后再设计，不猜测或字符串转换业务语义。TTY 默认不打开编辑器改文本；要自带已验证正文用 `--from-file`。

---

## 4. 提交追加

TTY 摘要：策略名、来源（模板 id 或文件）。确认「添加授权策略」。取消不写平台。

`Resource.update`（`PUT /v2/resources/{resourceId}`）：

```
addPolicies: [{
  policyName: 第 3 步,
  policyText: encodeURIComponent(文本),   // 与 Console 相同，先编码再放进 body
  status: 1
}]
```

不传 `status`（资源上下架）、不传 listing 字段。

失败：打印平台 `msg`。  
成功：再 `Resource.info`（`isLoadPolicyInfo=1`，`isTranslate=1`），打印策略列表（启用的排前面）。结束。不要问「是否立即上架」。

---

## 本命令用到的 tools-lib

| 何时 | 函数 | HTTP |
|------|------|------|
| 门禁 / 已有策略 | `Resource.info` | `GET /v2/resources/{id}` |
| 模板 | `Policy.policyTemplates` | `POST /v2/translate/translate-config/list4Client` |
| 追加 | `Resource.update` | `PUT /v2/resources/{resourceId}` |

`packages/tools-lib/src/service-API/policies.ts`、`resources.ts`。

---

## 禁止

策略编辑器、支付或执行预览。加完就 `online`。`update --status`。合集前缀（暂缓）。在本步改标题封面。
