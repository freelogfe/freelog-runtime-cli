# L3-G TTY 字段约束 — 人工验收签字模板

> 文档角色：可复制填写的 L3-G 运行证据。复制为 `YYYY-MM-DD-l3g-tty.md` 或粘贴进当日 dev 报告。**勿**覆盖历史报告。
>
> 步骤定义：[探索测试清单](../探索测试清单.md) §L3-G；规格：[CLI交互与字段约束](../../开发/CLI交互与字段约束.md)。

## 1. 运行上下文

| 项 | 填写 |
|---|---|
| 日期 | |
| 环境 | `dev`（`freelog-cli login --env dev`） |
| 执行人 | |
| CLI 路径 | `node packages/cli/dist/bin/index.js` 或全局 `freelog-cli` |
| CLI commit | `git rev-parse HEAD` → |
| Console 对照 commit | `d74121e647f0223203f1f0bb317354b4191266f1`（verify:console-forms 锚点） |
| 终端 | □ Windows Terminal □ iTerm □ 其它：________ |
| 测试工作目录 | （仓库外临时路径，勿在 repo 根跑 init/create） |

**约定：** 本节全部用 **真实 TTY**；不加 `--yes` / `--json`（G5 除外）。

## 2. 自动化预检（须先 PASS 再人工）

```bash
pnpm --filter @freelog-cli/cli exec vitest run tests/fieldConstraints.test.ts tests/preflightSummary.test.ts tests/onlineGates.test.ts tests/onlineService.test.ts
pnpm --filter @freelog-cli/cli verify:console-forms
```

| 命令 | 结果 | 备注 |
|---|---|---|
| TTY 相关单测（22 项） | □ PASS □ FAIL | |
| `verify:console-forms` 21/21 | □ PASS □ FAIL | |

预检未 PASS **不得**签字 L3-G。

## 3. 逐条验收（G1–G5）

**图例：** □通过 □失败 □跳过（无 fixture / 无适用工程，须写原因）

### G1 — init / import / collection folder（P1）

| # | 操作 | 输入 | 结果 | 实际观察 / 截图 ID |
|---|---|---|---|---|
| G1-1 | 交互 `init` → 资源标题 | 101×`a` | □ | |
| G1-2 | 交互 `init` → 授权标识 | `My theme@$#` | □ | 须见 info「将自动转换为 `My_theme_`」 |
| G1-3 | 交互 `init` → 授权标识 | 含 `/` 或 61 字 | □ | |
| G1-4 | 交互 `init` → 授权标识 message | 只看 hint | □ | 含 `rqr_input_resourceauthid_hint` 语义 |
| G1-5 | `resource import-dir` → 标题前缀 | 101 字 | □ | |
| G1-6 | `resource import-dir` → 标题前缀 | 空 | □ | |
| G1-7 | `collection init-from-folder` → 合集标题 | 101 字 | □ | |
| G1-8 | `collection init-from-folder` → 合集短名 | `foo bar` | □ | 同 G1-2 规范化 |

**Console 并排（G1-2 必做）：**

| 项 | Console Step1 | CLI | 一致 |
|---|---|---|---|
| 输入 `My theme@$#` 后最终授权标识 | | `My_theme_` | □是 □否 |
| 自动转换提示 | `input_resourceauthid_automodified_msg` | CLI info 文案 | □是 □否 |

### G2 — 旗标 TTY 向导（P2）

| # | 操作 | 结果 | 实际观察 |
|---|---|---|---|
| G2-1 | 工程目录 `create`（无 title/type/name） | □ | type → title → name 向导 |
| G2-2 | `update`（无 listing flag）；intro 201 字 | □ | 多选 + intro 拒绝 |
| G2-3 | `collection update`（无 flag） | □ | listing + display 多选 |
| G2-4 | RSS 托管资源/合集 `update` | □ □跳过 | 须 info「feed 托管」→ code 4；resourceId= |

### G3 — confirm 前 preflight（P3）

| # | 操作 | 结果 | confirm 前是否见摘要 |
|---|---|---|---|
| G3-1 | `online`（无 `--yes`） | □ | `latestVersion=` / 启用策略 / 缺版本文案 |
| G3-2 | `collection publish`（无 `--yes`） | □ | 「发行预检」行 |
| G3-3 | `draft push --force`（无 `--yes`） | □ | preflight 后再 confirm |

### G4 — --help / 动态提示（P4/P5）

| # | 操作 | 结果 | 实际观察 |
|---|---|---|---|
| G4-1 | `create --help` | □ | title/name 含约束摘要 |
| G4-2 | `update --help` | □ | intro 含「200」 |
| G4-3 | `version set --file <存在文件>` | □ □跳过 | 大小上限 / 属性 key info |
| G4-4 | `publish`（manifest 有 filePath） | □ □跳过 | 上传前同 G4-3 |

### G5 — 非 TTY 回归

| # | 操作 | 结果 | exit / 文案 |
|---|---|---|---|
| G5-1 | 完整 manifest 下 `create --yes` | □ | 成功，不重复要求三 flag |
| G5-1b | manifest 与 flags 合并后仍缺字段 | □ | code 4，指出缺失字段 |
| G5-2 | `update --yes` 无 listing | □ | code 4 |

## 4. 已知计划内边界（不计入 L3-G 失败）

签字时确认已理解，**不**因下列项判 L3-G 失败：

- `FORM-POL-NAME`：无独立 TTY prompt（策略走文件）
- `resource publish`：无 confirm，仅有 TTY 文件 hint（collection publish 有 preflight+confirm）
- `FORM-VER-INPUT` / RSS ENV：CLI 已提示；RSS 专项 ENV 未在本模板覆盖

## 5. 差异记录（有则必填）

| # | 步骤 | 预期 | 实际 | 是否阻塞签字 |
|---|---|---|---|---|
| 1 | | | | □是 □否 |
| 2 | | | | □是 □否 |

## 6. 分组结论

| 分组 | 通过项 / 总项 | 结论 |
|---|---|---|
| G1 P1 | /8 | □通过 □差异 |
| G2 P2 | /4 | □通过 □差异 □含跳过 |
| G3 P3 | /3 | □通过 □差异 |
| G4 P4/P5 | /4 | □通过 □差异 □含跳过 |
| G5 回归 | /2 | □通过 □差异 |
| **与 Console Step1/Step4 一致** | — | □是 □否 |

## 7. 总签字

| 检查人 | 日期 | L3-G 总结论 | 关联 dev 报告 |
|---|---|---|---|
| | | □**PASS** □**FAIL**（阻塞项见 §5） | `reports/YYYY-MM-DD-dev.md` |

**签字条件：** §2 预检 PASS；§5 无阻塞差异；G1-2 Console 并排 □是。

---

*模板版本：2026-08-14 · 对 [探索测试清单](../探索测试清单.md) L3-G*
