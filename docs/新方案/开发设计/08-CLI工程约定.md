# 开发设计：CLI 工程约定

> **所有命令实现必守**（通用横切：TTY/json/原子写/分层）。  
> **业务如何咬合这些机制** → 必读 [09-业务与CLI技术结合](./09-业务与CLI技术结合.md)。  
> 业务步骤 → [02-命令规格](./02-命令规格.md)。现状大量无 `--yes` 短路的 inquirer，迁入时按 08+09 收口。

## 1. 分层职责（禁止串味）

| 层 | 允许 | 禁止 |
|----|------|------|
| `commands/*` | 解析 argv、TTY 判断、确认框、spinner、映射 exit code、打印 | 直接拼 HTTP body；散落校验规则 |
| `services/*` | 编排、校验、调 ServiceAPI/adapters、写 config | UI 库；直接拼 URL |
| `adapters/*` | 纯函数形状转换 | IO、网络、process.exit |
| `platform/service-api/*` | ≅ FServiceAPI：同签名调 `platformRequest` | 读本地 config；弹交互；自创路径 |
| `platform/request` / `tool` | Bearer HTTP；getSHA1Hash 等 | 业务编排 |

失败时：**service 抛类型化错误（含 code）→ command 捕获 → `process.exit(code)`**。禁止在深层随意 `process.exit`。

## 2. 交互与 CI

| 规则 | 定稿 |
|------|------|
| 破坏性 / 不可逆 | 默认确认；`--yes` 跳过 |
| 主路径必可非交互 | create / publish / update / online / policy add / draft * / collection * 均须 flags 或 `--from-file` 可跑通 |
| 无 TTY | 视为 CI：缺必填 flag → exit 4（提示缺什么）；**禁止**卡住等输入 |
| `inquirer` | 仅 TTY 且未传齐 flags 时可选；有 `--yes` 或非 TTY 时不得进入 prompt |
| 取消确认 | 打印取消说明，**exit 0**（用户主动放弃，非失败） |

检测：`process.stdin.isTTY === true`（且未 `--yes`）才允许交互。

### CI 能力矩阵

| 能力 | 可纯自动（flags + `--yes`） | 人机混合 |
|------|------------------------------|----------|
| create / updateVersion / publish / update / online / offline | 是 | — |
| policy add `--from-file` | 是（文件预置） | Builder 文本须事先在 Console 导出 |
| draft push/pull/discard | 是 | 与 Console 防抖交替时人工选 pull/force |
| collection item* / publish / collect-rules | 是 | — |
| RSS `send-code` + `bind --code` | 否 | 邮箱取码后注入 `--code` |
| 依赖签约 Phase1 | 否 | exit 5 → Console；Phase5 才 policy-map 文件 |
| 微应用 / SSE / 防抖草稿 | 非目标 | — |

## 3. 退出码与错误对象

与产品原则一致，**全命令统一**：

| Code | 含义 | 典型 |
|------|------|------|
| 0 | 成功或用户取消确认 | — |
| 2 | 未登录 / Owner 不符 | ensureOwner |
| 3 | 同步或草稿冲突 | ensureSynced / draft push |
| 4 | 字段/业务校验 / 缺参 / 冻结 | 字段约束、argv |
| 5 | 依赖授权未完成 | publish |
| 1 | 未分类（网络、未知、panic） | — |

错误对象约定（service 抛出）：

```ts
class CliError extends Error {
  code: 1 | 2 | 3 | 4 | 5;
  /** 给用户看的下一行动作，如 "freelog-cli login" */
  hint?: string;
  /** --json 时可附带 */
  details?: unknown;
}
```

人读输出：

```text
✖ <一句话原因>
→ <hint 可执行命令或文档锚点>
```

`--debug`：额外打印 stack / 请求 id / 原始 `ret/errCode/msg`（打到 **stderr**）。

## 4. stdout / stderr / --json

| 流 | 用途 |
|----|------|
| stdout | 成功时的结果数据；`--json` 时**仅**一行 JSON（或纯 JSON 文档），禁止夹杂 spinner 字符 |
| stderr | 进度、spinner、warn、人读错误、debug |

| 规则 | 定稿 |
|------|------|
| `--json` | 成功：stdout **仅**约定 schema JSON；失败：stdout 输出 `{"ok":false,"code":N,"message":"...","hint":"..."}`，人读摘要可同时打 stderr；**进程 exit = code** |
| schema 稳定 | `status` / `dep list` / `policy list` / publish exit5 / online 失败体 字段名变更须升文档版本，禁止 silently rename |
| 颜色 | 尊重 `NO_COLOR` / 非 TTY 无色；勿把 ANSI 写进 `--json` |
| spinner | 仅 TTY；`--json` 或非 TTY 禁用 ora |

## 5. 全局选项（实现层）

| 选项 | 行为 |
|------|------|
| `--cwd <dir>` | 解析为绝对路径；不存在 → exit 4；此后所有相对路径相对该目录 |
| `--yes` | 跳过确认 |
| `--no-auto-pull` | 关闭落后自动 pull |
| `--json` | 机器输出模式 |
| `--test` / `FREELOG_ENV` | 测试网 API；与登录态环境一致（测网 token 不可打生产） |
| `--debug` | 详细日志 → stderr |

`--cwd` 与「在子目录执行」等价；config 查找从 cwd 起，不向上误用父合集 config（合集命令除外，见下）。

## 6. 工作目录与配置发现

| 场景 | 规则 |
|------|------|
| 单品命令 | 在 cwd 读 `freelog.resource.config.*` + `freelog.version.config.*`；缺则 exit 4 |
| 合集命令 | 在 cwd 读 `freelog.collection.config.*`；`item add <相对路径>` 再进子目录读单品 config |
| 扩展名 | 支持 `.js` / `.ts` / `.cjs`（与现状一致）；读写同一扩展，禁止静默换后缀 |
| 路径 | 一律 `path.resolve`；Windows 下比较路径用规范化（大小写/分隔符） |
| 禁止 | 手改 config 作为产品能力；实现可覆盖写入，但须来自 API/命令意图 |

### 配置写盘

| 规则 | 定稿 |
|------|------|
| 原子写 | 写临时文件 → rename 覆盖（防写到一半崩溃） |
| 写回字段 | 只更新命令触及的字段 + 管线规定的 owner/draftSync；禁止整文件从脏内存盲写抹掉未知键（保留未知键更安全） |
| 密钥 | **禁止**把 token / cookie 写入 freelog.*.config |
| 并发 | 同一目录不保证多进程并行写；文档声明「同目录串行」；能检测到文件锁则 warn |

## 7. 网络与长任务

| 规则 | 定稿 |
|------|------|
| 超时 | 普通请求 60s；上传/publish 300s；超时 → exit 1 + hint 重试 |
| 重试 | GET 最多 2 次指数退避；写类 POST/PUT/DELETE **不**自动重试 |
| 上传 | 临时 zip `try/finally` 删除 |
| 进度 | 仅 TTY；`--json` 禁用 |
| 部分失败 | `--from-dir` 跑完汇总；任一项失败 → exit 4；成功项保留 config；**无** `--fail-fast` |

## 8. 认证

| 规则 | 定稿 |
|------|------|
| 优先级 | workspace auth > global auth |
| 环境隔离 | token 与 baseURL 环境必须一致，否则 exit 2（详见 [09](./09-业务与CLI技术结合.md)） |
| 未登录 / 401 | exit 2；清除过期 auth；hint `login` |
| 展示 | status 打印登录用户与环境；勿打印 token |

## 9. 日志与文案

| 级别 | 用法 |
|------|------|
| 成功 | `✔` + 关键结果（id、version） |
| 信息 | `ℹ` 自动 pull、跳过上传等 |
| 警告 | `⚠` 有损映射、username 不一致已按平台覆盖 |
| 错误 | `✖` + hint |

文案要求：**可行动**（下一步命令），避免只抛 HTTP 原文。平台 `msg` 可附在第二行。

中文为主（与现 CLI 一致）；`--json` 字段名用稳定英文 camelCase。

## 10. 幂等与安全默认

| 规则 | 定稿 |
|------|------|
| pull | 可重复执行，结果收敛到平台态 |
| draft push 同指纹 | 可 no-op 成功（exit 0） |
| publish | 同版本号重复 → exit 4（非幂等成功） |
| online 已上架 | 可 exit 0 + ℹ 已是上架 |
| 删除类 | discard / offline 须 `--yes` 或确认 |
| 不静默建资源 | 无 resourceId 时除 `create` 外不得「顺便 create」 |

## 11. 测试要求（开发自测）

每个新命令至少：

| 类型 | 内容 |
|------|------|
| 单测 | service/adapter：校验、指纹、Owner 比较（string/number） |
| 防抖草稿 | 模拟远端有草稿 + `localDraftSync` 空 → `status` JSON 含 `draftAdvice`；无 force 的 push 冲突 |
| policy 文件 | 非法 `policy.json`（缺名/空文本）→ exit 4 |
| 非交互 | `CI=1` 或非 TTY 模拟：缺 flag → 4；齐 flag + `--yes` → 不进 inquirer |
| 退出码 | 至少覆盖 2/3/4/5 一条路径；exit5 JSON shape 与 [02 §publish](./02-命令规格.md) 一致 |
| Windows | `--cwd`、中文路径、`path.join` 用例（本仓库主力 Win） |

## 12. 命令实现检查清单（PR 前勾选）

- [ ] 无 TTY + `--yes` 可跑通主路径  
- [ ] 失败走 CliError.code，未裸 `process.exit` 在 service  
- [ ] `--json` 时 stdout 无杂讯  
- [ ] 写 config 原子写；不写 token  
- [ ] 临时文件 finally 清理  
- [ ] 错误含 hint  
- [ ] Owner → Sync → 校验 → API 顺序未跳过  
- [ ] 未引入 batch/syncr/publish --draft  
- [ ] 单测覆盖纯逻辑  

## 13. 与其它文档

| 主题 | 文档 |
|------|------|
| 写管线 / 模块 | [00-总览与模块](./00-总览与模块.md) |
| Owner / pull | [01-Owner与同步](./01-Owner与同步.md) |
| 每命令业务步骤 | [02-命令规格](./02-命令规格.md) |
| 字段 | [03-字段约束](./03-字段约束.md) |
| 草稿 | [04-草稿转换层](./04-草稿转换层.md) |
