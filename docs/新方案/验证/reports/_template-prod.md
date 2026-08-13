# prod 验证报告模板

> 复制为 `YYYY-MM-DD-prod.md` 填写。勿覆盖历史报告。

## 运行上下文

- 日期：
- 环境：`production`（`https://api.freelog.cn`）
- 账号：（loginName，不含密码）
- CLI commit：
- 执行人：

## 结果

| 验证层 | 命令 | 结果 |
|---|---|---|
| L0 本地门禁 | `pnpm verify` | |
| prod smoke | `pnpm --filter @freelog-cli/cli verify:prod-smoke` | |
| dev 全场景（发布前对照） | `node test/run-all-scenarios.mjs --env dev` | |

## PROD smoke 范围

- [ ] login（专用 prod 账号）
- [ ] `status --json` 只读
- [ ] `type list --json` 只读
- [ ] 临时目录 init + `validate --for publish`（**无 create/publish**）
- [ ] 若有 disposable 写测试：Console 确认后下架/删除

## 未纳入

- RSS（产品决策）
- 批量创建 prod 资源
- 付费收银台端到端

## 数据说明

prod 写操作须可回收；报告记录 resourceId 与回收状态。
