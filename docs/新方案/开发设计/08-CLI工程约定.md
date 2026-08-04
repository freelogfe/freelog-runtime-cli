# 开发设计：CLI 工程约定

> 所有命令实现必守。业务规则见 [09](./09-业务与CLI技术结合.md)，命令步骤见 [02](./02-命令规格.md)。

## 1. 分层职责

| 层 | 允许 | 禁止 |
|---|---|---|
| `commands/*` | argv、TTY、确认、spinner、输出、exit 映射 | 拼 HTTP body、散落业务校验 |
| `services/*` | 编排、校验、调 platform/adapters、写 manifest/state | UI prompt、直接 `process.exit` |
| `adapters/*` | 纯函数转换 payload、draftData、fingerprint | IO、网络、日志 |
| `platform/*` | `@freelog/tools-lib2/node`、auth/env、错误映射、SHA1 适配 | 资源业务流程 |
| `config/*` | manifest/state schema、原子读写 | 执行用户代码 |

只有 `src/platform/tools-lib.ts` 可以 import `@freelog/tools-lib2/node`。业务代码从本仓 platform facade 取 `FServiceAPI`。

## 2. 交互与 CI

| 规则 | 定稿 |
|---|---|
| TTY prompt | 仅 `process.stdin.isTTY === true` 且未传齐 flags 且无 `--yes` |
| 无 TTY | 缺关键参数 exit 4，不能卡住 |
| `--yes` | 跳过确认，但不代表自动猜缺失业务字段 |
| 破坏性操作 | `offline`、`draft discard`、覆盖文件、`--force` 需要确认或 `--yes` |
| 用户取消 | exit 0 |

多级命令父节点只承载 `subCommands` 和 help 元信息，不实现 `run(){ throw ... }`。实测 citty 在部分场景会在子命令执行后继续触发父级 `run`，导致子命令已成功但进程仍报错。

CI 能力：

| 能力 | 纯自动 | 人机混合 |
|---|---:|---|
| type/init/create/update/version set/publish/policy/online/offline | 是 | 否 |
| draft push/pull/discard | 是 | 与 Console 冲突时人工选择策略 |
| resource import-dir / collection item import-dir | 是 | 否 |
| RSS bind | 否 | 邮箱取码后传 `--code` |
| 付费依赖签约 | 否 | Console |

## 3. 退出码与错误对象

```ts
class CliError extends Error {
  code: 1 | 2 | 3 | 4 | 5;
  hint?: string;
  details?: unknown;
}
```

| Code | 含义 |
|---:|---|
| 0 | 成功或用户取消 |
| 2 | 未登录、环境不匹配、Owner 不符 |
| 3 | 同步或草稿冲突 |
| 4 | 缺参、字段、业务门禁、冻结 |
| 5 | 依赖授权未完成或需要 Console 交互 |
| 1 | 网络、平台、未知错误 |

禁止在 service/adapters 深层直接 `process.exit`。

## 4. stdout / stderr / JSON

| 流 | 用途 |
|---|---|
| stdout | 成功结果；`--json` 时纯 JSON |
| stderr | 进度、spinner、warn、人读错误、debug |

`--json` 失败形态：

```json
{
  "ok": false,
  "code": 4,
  "error": "VALIDATION_ERROR",
  "message": "缺少 resource.typeCode",
  "hint": "运行 freelog-cli type list 后补齐 --resource-type"
}
```

稳定 JSON 契约：`status`、`type info`、`policy list`、`publish` exit 5、`online` 失败体。字段变更必须同步文档。

## 5. 全局选项

| 选项 | 行为 |
|---|---|
| `--cwd <dir>` | 解析为绝对路径；相对文件路径都以 cwd 为基准 |
| `--yes` | 跳过确认 |
| `--json` | 机器输出 |
| `--no-auto-pull` | 关闭自动 pull |
| `--env <prod|test|dev>` / `FREELOG_ENV` | 选择平台环境 |
| `--debug` / `FREELOG_DEBUG=1` | stderr 打印 stack 与脱敏错误详情，不打印 token/password/cookie/authorization |

## 6. 工作目录与文件发现

| 场景 | 规则 |
|---|---|
| 单品命令 | cwd 必须有 `freelog.manifest.json`，且 `subject=resource` |
| 合集命令 | cwd 必须有 `freelog.manifest.json`，且 `subject=collection` |
| `collection item add <path>` | 进入目标 path 读取该资源 manifest/state |
| `--cwd` | 与进入该目录执行等价 |
| 向上查找 | 默认不向上查找，避免子资源误用父合集 |

配置格式：

1. P0 只支持 JSON。
2. 不执行 `.js/.ts/.cjs` 配置。
3. YAML 只用于 `--policy-map` 等声明文件，非项目主配置。

## 7. 写盘

| 文件 | 写法 |
|---|---|
| manifest | 原子写；只改命令负责的用户意图字段；保留未知字段 |
| state | 原子写；CLI 可整体刷新 |
| cache/tmp | `.freelog/cache` / `.freelog/tmp`，finally 清理 |

同一目录不支持多 CLI 进程并发写。若能检测到锁，提示用户串行执行。

## 8. 网络与长任务

| 项 | 定稿 |
|---|---|
| 普通请求超时 | 60s |
| 上传/publish/collection publish | 300s |
| GET 重试 | 最多 2 次指数退避 |
| 写请求重试 | 默认不自动重试 |
| zip 临时文件 | finally 删除 |
| 大文件 SHA1 | 流式计算 |

## 9. 认证

| 规则 | 定稿 |
|---|---|
| 凭据位置 | 默认用户级 `.freelog-auth`；项目目录不得默认写 `.freelog-auth` |
| 凭据内容 | 保存登录响应 Cookie；若平台未来返回可用 token/PAT，可同时保存 Authorization |
| 测试隔离 | 仅测试或临时调试可用 `FREELOG_AUTH_PATH_WORKSPACE` 指向临时凭据文件 |
| 环境隔离 | token 与命令 env 不一致 exit 2 |
| 401 | 清理过期 auth 后 exit 2 |
| 日志 | 不打印 token/cookie |
| status | 展示当前 env 与登录用户 |

## 10. 幂等与安全默认

| 命令 | 规则 |
|---|---|
| `pull` | 可重复，收敛到平台 state |
| `draft push` 同指纹 | no-op 成功 |
| `publish` 同版本重复 | exit 4 |
| `online` 已上架 | exit 0 |
| `offline` 已下架 | exit 0 或 warn + 0 |
| 无 resourceId | 除 create 外不得顺手创建 |

## 11. 测试要求

| 类型 | 覆盖 |
|---|---|
| 单测 | schema、Owner 比较、payload adapter、draft fingerprint、policy encode |
| 命令测 | exit code、stdout/stderr、无 TTY、`--yes` |
| 契约测 | tools-lib2 函数调用 body 与 Console 对齐 |
| 文件测 | 原子写、Windows 路径、中文路径、zip 清理 |
| 集成测 | 测试环境 create/publish/policy/online/offline/collection |

## 12. PR 检查清单

- [ ] 未读取旧配置文件
- [ ] 未执行用户配置代码
- [ ] 业务只走 platform facade
- [ ] Owner -> Sync -> Validate -> API 顺序正确
- [ ] `--json` stdout 无杂讯
- [ ] 非 TTY 不 prompt
- [ ] manifest/state 边界未混
- [ ] token/cookie/password/authorization 未写入项目或日志
- [ ] `.freelog-auth` 未默认写入项目目录
- [ ] `online` 严格门禁
- [ ] 临时文件 finally 清理
