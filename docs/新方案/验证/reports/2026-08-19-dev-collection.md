# 2026-08-19 dev 合集真实验证报告

> 文档角色：日期化运行证据。本文只记录本次合集真实环境执行结果，不定义产品范围或长期完成状态。

## 运行上下文

- 日期：2026-08-19（Asia/Shanghai）
- 环境：`dev`
- 基线 commit：`d0b7eb9ee28c03973fd82d86bd23eeebd2236455`
- 当前工作区：基线 commit + 未提交实现/文档改动
- 执行入口：`pnpm build`，随后 `node ./scripts/verify-collection-parity.mjs --env dev --case all`
- 实际执行入口：`packages/cli/dist/bin/index.js`
- 打包入口 SHA256：`2E12EA6C9571F136CF00DB5ADBD2154FEC11CD9D9EAA31C92016C3F32008E991`
- 凭据：ignored 本地凭据文件，通过 stdin 登录；本报告不记录密码、token、cookie 或账号标识。

## 结果

| 真实 dev 流程 | 结果 | 证明点 |
|---|---|---|
| `merge1` 合集主链 | PASS | 真实创建合集、从目录创建并导入两个子资源、策略/上架门禁、`collect-rules set/get` 回读、`collection publish` 成功；dry-run 返回 `isMergeCatalogueDraft=1`。 |
| `merge0` 无目录变化发布 | PASS | 在首版发布后只修改 description；`collect-rules` 真实 round-trip；dry-run 返回 `isMergeCatalogueDraft=0`。 |
| Console payload 契约 | PASS | 两个分支生成的 `updateCollection` body 均通过 Console Step2 字段契约校验。 |

脚本退出码：`0`。本次验证在 dev 创建了带时间戳的测试合集及子资源；脚本仅清理本地临时目录，远端对象按既有 dev 证据策略保留，未触碰 production。

## 未覆盖项

- RSS 完整闭环仍需要受控 feed、owner 邮箱和一次性验证码，不能用账号登录替代。
- frozen 状态仍需要 Console 预置自有冻结资源。
- 浏览器金样并排检查是该脚本的可选 `--browser-golden` 入口，本次未执行。
