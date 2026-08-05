# CLI 验收执行计划

最后更新：2026-08-05

本文是当前阶段的执行清单。目标是用产品用户视角和高级测试视角验证 CLI 是否真正覆盖主题/插件、图片/视频、批量资源、合集、Console 协作和异常边界。

## 1. 执行原则

1. 不修改浏览器项目；Console 源码只作为业务对齐参考。
2. dev 环境测试使用交接文档记录的 `freelog-test11` 账号。
3. 登录凭据写入临时 `FREELOG_AUTH_PATH_WORKSPACE`，不写入测试项目目录。
4. 每个真实环境用例使用唯一资源名，避免误操作历史资源。
5. 实测资源可以留在 dev 环境；测试结束后尽量恢复 offline。
6. 任何代码改动前先更新设计/验收文档；执行后回写结果。

## 2. 本地验证

发布前统一执行：

```bash
pnpm verify
```

`pnpm verify` 会串行执行 CLI 包的单测、类型检查、模板兼容检查、构建和 `npm pack --dry-run`。下面的 L1-L6 是它的展开项，定位失败时可单独执行。

| 编号 | 任务 | 验收 |
|---|---|---|
| L1 | `pnpm --filter @freelog-cli/cli test` | 全部单测通过 |
| L2 | `pnpm --filter @freelog-cli/cli typecheck` | 类型检查通过 |
| L3 | `pnpm --filter @freelog-cli/cli check:compat` | 模板兼容检查通过 |
| L4 | `pnpm --filter @freelog-cli/cli build` | 构建通过 |
| L5 | `pnpm --filter @freelog-cli/cli pack:dry-run` | npm 包内容包含 `dist`、`compat`、bin 入口和声明文件 |
| L6 | `pnpm --filter @freelog-cli/cli why @freelog/tools-lib2` | 指向仓库内 `tools-lib` link |

2026-08-05 已完成一次根仓库 `pnpm verify`：21 files / 98 tests passed，`check:compat ✔ (11 templates)`，构建通过，`npm pack --dry-run` 显示 tarball 包含 `dist/bin/index.js`、`dist/index.d.ts`、`compat/template-compat.json` 等 11 个文件。当前仅剩本机 npm 读取 pnpm `.npmrc` 时输出的未知配置 warning，不影响包内容。

## 3. dev 环境正向场景

| 编号 | 场景 | 关键命令 | 验收 |
|---|---|---|---|
| D1 | 登录和类型发现 | `login`、`type search/info` | 能拿到图片、主题、合集类型能力 |
| D2 | 单图片/单视频资源 | `init -> create -> version set -> publish -> policy apply -> online -> offline` | Console/API 状态 latestVersion、策略、status 正确 |
| D3 | 主题/插件项目发布 | 构建产物发布 | 目录压缩上传，SHA1 记录，发版成功 |
| D4 | 模板创建主题/插件 | `init --scaffold runtime --template ...` | 模板生成、安装/跳过安装、构建、发布符合预期 |
| D5 | 文件夹多个单品 | `resource import-dir` | 每个文件一个资源，成功项写子目录 |
| D6 | 图片/视频合集 | `collection create -> item import-dir --item-policy-file -> version set --description -> publish -> policy apply -> online -> offline` | 子资源先用 item policy 加策略并上架，目录草稿合并，合集再用自身 policy 上架后恢复下架 |

2026-08-05 已完成 D6 dev 实测：`codex-e2e-album-20260805122251` / `6a72ba982ead4b0030dd88d1`，最终 `itemCount=2`、`latestVersion=1.0.0`、`enabledPolicyCount=1`，上下架成功。

2026-08-05 补充实测：

- 单视频链路跑通：`codex-e2e-video-20260805142911` / `6a72d8342ead4b0030ddab98`，`latestVersion=1.0.0`，上下架成功。测试文件为小 `.mp4` 链路文件，只证明平台上传/发版/策略/上下架链路；真实视频专项验证原文件上传、平台格式/大小限制和资源详情页链接可访问。
- 视频合集跑通：`codex-e2e-video-album-20260805142938` / `6a72d84f2ead4b0030ddabdd`，`itemCount=2`，上下架成功。
- React 主题模板跑通：`vite-react-ts + RT001`，`codex-e2e-template-react-theme-20260805143046` / `6a72da2e2ead4b0030ddae72`，安装、构建、压缩发布、上下架成功。
- Vue 插件模板跑通：`vite-vue-ts + RT002`，`codex-e2e-template-vue-plugin-20260805143046` / `6a72da782ead4b0030ddaed8`，安装、构建、压缩发布、上下架成功。
- Console 协作 listing 跑通：模拟平台侧改标题后 `status` 返回 `sync=behind`；`pull --apply-listing` 可采纳远端；本地和平台都改时默认失败，`--force` 后才覆盖。

## 4. dev 环境负向场景

| 编号 | 场景 | 验收 |
|---|---|---|
| N1 | `collection version set --version` | 必须失败，提示合集固定版本 |
| N2 | 无版本直接 `online` | 必须失败 |
| N3 | 无启用策略直接 `online` | 必须失败 |
| N4 | 重复发布同版本 | 必须失败 |
| N5 | 错误格式文件发布 | 上传前失败 |
| N6 | 已绑定目录重复 `init --yes` | 必须拒绝覆盖 |
| N7 | `collection item import-dir` 不传 `--item-policy-file` | 必须失败，提示平台要求合集条目单品已上架 |
| N8 | state env 与当前 env 不一致 | 必须失败 |

## 5. Console 协作场景

| 编号 | 场景 | 验收 |
|---|---|---|
| C1 | CLI 更新基础信息 | Console 侧可见同样 title/intro/tags/cover |
| C2 | Console 修改 listing 后 CLI `status` | CLI 能展示 behind |
| C3 | `pull --apply-listing` | manifest 被平台 listing 覆盖；冲突时需要 `--force` |
| C4 | Console 草稿与 CLI 草稿 | `draft pull/push/discard` 行为符合冲突策略 |

2026-08-05 已完成 C4 单品草稿 dev live 验收，资源 `codex-e2e-photo-20260805115333` / `6a72b3ce2ead4b0030dd76f4`：

- `draft push` 首次保存返回 `reason=no-remote`。
- 重复 `draft push` 返回 `reason=aligned`，不会重复写远端。
- 第二份本地目录模拟远端变更后，原目录 `status` 返回 `draftAdvice=draft_pull`。
- `draft pull` 可拉回远端描述，并保留本地 `filePath=unique-photo.png`。
- 远端和本地都变更时，普通 `draft push --json` 返回 `DRAFT_CONFLICT / both-dirty`，真实退出码为 3。
- `draft push --force --yes` 返回 `reason=force`。
- `draft discard --yes` 删除平台草稿；修复后远端无草稿时再次 discard 也会幂等清空本地 `localDraftSync`。

2026-08-05 已完成 C4 合集发版表单草稿 dev live 验收，资源 `codex-e2e-album-20260805122251` / `6a72ba982ead4b0030dd88d1`：

- `draft push --collection` 首次保存返回 `reason=no-remote`，重复 push 返回 `reason=aligned`。
- 第二份本地目录模拟远端变更后，原目录 `status` 返回 `collection.draftAdvice=draft_pull`，并输出平台表单草稿指纹。
- `draft pull --collection` 可拉回远端合集版本说明。
- 远端和本地都变更时，`status` 返回 `collection.draftAdvice=draft_conflict`，普通 `draft push --collection --json` 返回 `DRAFT_CONFLICT`，真实退出码为 3。
- `draft push --collection --force --yes` 返回 `reason=force`。
- `draft discard --collection --yes` 删除平台草稿并清空 `collection.draftSync`。

## 6. 当前重点风险

1. 大合集分页仍需验证是否超过 500 项时会漏数据。
2. 依赖授权和付费授权需要另开专项；复杂授权按设计回 Console。
3. 视频大文件上传缺进度展示，当前只能用阶段结果判断；真实视频素材专项只验证原文件上传、平台格式/大小限制和资源详情页链接可访问。CLI 不承担转码，也不在终端内做播放预览。
4. `type list/search` 对禁用类型的展示策略仍需产品确认是否默认过滤。
