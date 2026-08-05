# Freelog Runtime CLI 交接文档

最后更新：2026-08-05

本文是新会话接手入口。目标是让接手者不用回看历史聊天，也能理解当前设计、代码状态、测试证据和后续注意事项。

## 0. 一屏摘要

当前阶段聚焦 `D:\appinside\freelog-runtime-cli\packages\cli` 的新脚手架。浏览器端项目不改。

核心结论：

1. 新 CLI 没有旧代码兼容负担，不保留旧配置和旧命令入口。
2. CLI 发行流程对齐 Console 的业务契约，不复刻 Console UI 交互。
3. 平台接口统一走 `@freelog/tools-lib2/node`。
4. 本地项目只保留 `freelog.manifest.json` 和 `.freelog/state.json`。
5. `publish` 可以在没有策略时发布版本；`online` 必须有 latestVersion 和至少一条启用策略。
6. `policy apply --from-file` 只新增策略；`policy set` 只启停策略，不编辑已有策略正文或名称。
7. `pull` 默认只刷新 state；`pull --apply-listing` 才把平台 listing 写回 manifest。
8. `.freelog/state.json` 绑定当前 CLI env，防止 dev/test/prod 串资源。
9. tools-lib 已复制到本仓库：`D:\appinside\freelog-runtime-cli\tools-lib`。

## 1. 硬约束

后续接手必须遵守：

1. 不动浏览器项目。
2. 不恢复旧 CLI 配置体系。
3. 不恢复旧命令入口。
4. 不把平台事实写入 manifest。
5. 不把 token、cookie、password 写入项目目录。
6. 不绕过 `online` 门禁。
7. 不伪造 tools-lib/Console 当前不支持的 API 能力。
8. 修改代码前先更新设计文档；修改完成后同步使用说明或交接说明。

禁止恢复：

| 禁止项 | 原因 |
|---|---|
| `freelog.resource.config.*` / `freelog.version.config.*` / `freelog.collection.config.*` | 新方案只认 manifest/state |
| `jiti` 执行用户配置 | 避免执行任意用户 JS/TS |
| `updateVersion` | 已收敛为 `version set` |
| `create --from-dir` | 已收敛为 `resource import-dir` |
| `publish --draft` | 已拆成 `draft push/pull/discard` |
| `syncr` / `syncv` | 已收敛为 `pull` |
| `policy add` | 已改为 `policy apply` |
| 顶层 `contract list` | 复杂/付费授权回 Console，声明式授权走 `dep auth` |
| CLI 自建 `src/api/**` 平行接口层 | 平台接口必须同源 tools-lib2 |

## 2. 关键路径

| 用途 | 路径 |
|---|---|
| 新 CLI 仓库 | `D:\appinside\freelog-runtime-cli` |
| CLI 包 | `D:\appinside\freelog-runtime-cli\packages\cli` |
| 本仓 tools-lib2 副本 | `D:\appinside\freelog-runtime-cli\tools-lib` |
| 新方案文档 | `D:\appinside\freelog-runtime-cli\docs\新方案` |
| 产品/测试简明文档 | `D:\appinside\freelog-runtime-cli\docs\新方案\产品与测试简明说明.md` |
| 场景风险与测试矩阵 | `D:\appinside\freelog-runtime-cli\docs\新方案\场景风险与测试矩阵.md` |
| CLI 使用说明与 Console 差异 | `D:\appinside\freelog-runtime-cli\docs\新方案\CLI使用说明与Console差异.md` |
| Console 资源页源码 | `D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource` |
| Console tools-lib 原始位置 | `D:\appinside\freelogfe-web-repos\packages\@freelog\tools-lib` |
| 旧脚手架源码参考，只能参考 | `D:\appinside\freelog-runtime-cli\backup\freelog-cli-ts-copy\src` |
| 旧脚手架 public 参考，只能参考 | `D:\appinside\freelog-runtime-cli\backup\freelog-cli-ts-copy\public` |
| 主题发布测试项目 | `D:\appinside\freelog-runtime-cli\test\my-freelog-project` |
| 单图片测试文件 | `D:\appinside\freelog-runtime-cli\test\abcdef.png` |

推荐阅读顺序：

1. 本文。
2. `docs\新方案\产品与测试简明说明.md`。
3. `docs\新方案\场景风险与测试矩阵.md`。
4. `docs\新方案\CLI使用说明与Console差异.md`。
5. `docs\新方案\开发设计\15-资源生命周期拓扑设计.md`。
6. `docs\新方案\开发设计\02-命令规格.md`。
7. `docs\新方案\开发设计\03-字段约束.md`。

## 2.1 Console 对齐工作法

CLI 对齐的是 Console 的平台业务结果，不对齐页面交互形态。

每次改资源业务前，必须优先确认：

1. Console 资源页对应源码：`D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource`。
2. API 对照：`docs\新方案\开发设计\API\Console资源页API对照表.md`。
3. CLI 分叉说明：`docs\新方案\CLI使用说明与Console差异.md`。
4. 场景验收：`docs\新方案\场景风险与测试矩阵.md`。

对齐要求：

| 业务结果 | CLI 必须对齐 |
|---|---|
| 基础信息 | title、intro、coverImages、tags 在 Console 可见一致 |
| 版本 | latestVersion、版本描述、文件 SHA1、依赖授权结果一致 |
| 策略 | 新增策略、启用、停用结果一致 |
| 上下架 | status 结果一致，但 CLI 必须走严格门禁 |
| 合集目录 | itemTitle、排序、目录草稿、正式合集版本结果一致 |

允许分叉：

1. Console 可以页面防抖保存草稿；CLI 必须显式 `draft push/pull/discard`。
2. Console 可以交互式策略 Builder；CLI 只接受最终策略 JSON。
3. Console 可以处理复杂/付费授权；CLI 遇到无法声明式处理的授权时提示回 Console。
4. Console 可能存在软上架入口；CLI 禁止软上架。

## 3. tools-lib2 当前状态

### 3.1 当前事实

用户已经把 tools-lib 复制到 CLI 仓库：

```text
D:\appinside\freelog-runtime-cli\tools-lib
```

该目录 package 信息：

```json
{
  "name": "@freelog/tools-lib2",
  "version": "0.3.0",
  "exports": {
    ".": "...browser...",
    "./browser": "...browser...",
    "./node": "...node..."
  }
}
```

CLI 代码必须从 Node 入口使用：

```ts
import { FServiceAPI, FUtil } from '@freelog/tools-lib2/node';
```

浏览器端仍可使用默认导出或 browser 入口；本项目当前不改浏览器端。

### 3.2 本地 link 约定

最佳当前状态应是：

```yaml
packages:
  - tools-lib
  - packages/*
  - packages/templates/*

overrides:
  '@freelog/tools-lib2': link:./tools-lib
```

`packages/cli/package.json` 仍保留 npm 发布语义：

```json
"@freelog/tools-lib2": "^0.3.0"
```

含义：

1. 本地开发使用仓库内 `tools-lib`。
2. CLI 发布到 npm 后使用 npm 上的 `@freelog/tools-lib2`。
3. tools-lib 有改动时，先发布 `@freelog/tools-lib2`，再发布 CLI。
4. 不要让本仓 CLI 长期 link 到 `freelogfe-web-repos`，否则交接和发布边界会混乱。

### 3.3 tools-lib 双端兼容心智

tools-lib2 通过条件导出兼容浏览器和 Node：

| 入口 | 使用方 | 能力 |
|---|---|---|
| `@freelog/tools-lib2` / `@freelog/tools-lib2/browser` | 浏览器项目 | 浏览器 Request、File/Blob SHA1、Cookie/浏览器环境 |
| `@freelog/tools-lib2/node` | CLI | Node Request、Buffer/Blob/ArrayBuffer SHA1、Cookie/Authorization 注入 |

SHA1 目标：浏览器端 File 和 Node 端读取同一文件内容时，计算结果必须一致。

## 4. 环境与账号

### 4.1 三个环境

| CLI 环境值 | 站点 | API Base URL | 说明 |
|---|---|---|---|
| `production` / `prod` | `freelog.cn` | `https://api.freelog.cn` | 生产环境 |
| `test` | `testfreelog.com` | `https://api.testfreelog.com` | 测试环境 |
| `dev` / `development` | `devfreelog.com` | `https://api.devfreelog.com` | 当前联调环境 |

当前真实联调使用 dev：

```bash
freelog-cli login --env dev
```

不要把 `devfreelog.com` 误写成 `--test`。

### 4.2 当前 dev 联调账号

| 项 | 值 |
|---|---|
| 目标环境 | `devfreelog.com` |
| CLI 环境值 | `dev` |
| 测试账号 | `freelog-test11` |
| 测试密码 | `freelog-test1111` |

说明：

1. 该账号只用于 dev 环境联调和冒烟。
2. 密码可写在交接文档，方便新会话测试；但不得写入 manifest、state、测试快照、README 或命令输出日志。
3. CLI 登录成功后，凭据默认写入用户级 `.freelog-auth`。
4. 测试隔离时可以用 `FREELOG_AUTH_PATH_WORKSPACE` 指向临时凭据文件。
5. dev 环境实测登录响应中的 `Set-Cookie` 才能通过后续资源接口鉴权，不能只拿 `tokenSn` 当 Bearer token。

非交互登录示例：

```bash
freelog-cli login --env dev --login-name freelog-test11 --password freelog-test1111 --yes
```

## 5. 本地文件模型

### 5.1 `freelog.manifest.json`

manifest 是用户意图，应提交 git。

允许保存：

1. `subject`：`resource` 或 `collection`。
2. 短授权名。
3. 资源类型 code。
4. 标题、简介、标签、封面等 listing 意图。
5. 版本意图：版本号、文件路径、运行时版本、依赖、自定义属性等。
6. 合集发布意图：合集版本、描述、展示字段等。

禁止保存：

1. `resourceId`
2. `userId`
3. `username`
4. `latestVersion`
5. `policyId`
6. `fileSha1`
7. `filename`
8. `versionId`
9. `draftSync`
10. token、cookie、password

### 5.2 `.freelog/state.json`

state 是平台事实缓存，不提交 git，可由 `pull` 重建。

允许保存：

1. 当前 `env`。
2. 平台 `resourceId`、完整 `resourceName`。
3. owner 信息。
4. status、latestVersion、policies。
5. 已发布文件 SHA1、filename、versionId。
6. draftSync。
7. `sync.listingFingerprint`、platformUpdateDate。
8. 合集目录草稿缓存、collectRules、rss 状态。

环境规则：

1. manifest 不绑定环境，可以跨 dev/test/prod 复用。
2. state 绑定当前 CLI env。
3. 读取到非空 `state.env` 且与当前 `--env` 不一致时，命令必须失败，避免串资源。

## 6. 当前命令面

| 类型 | 命令 |
|---|---|
| 全局 | `login`、`logout`、`status`、`pull` |
| 类型 | `type list`、`type search`、`type info` |
| 初始化 | `init` |
| 单品 | `create`、`update`、`version set`、`publish`、`draft *`、`dep *`、`policy *`、`online`、`offline`、`version edit` |
| 多资源 | `resource import-dir` |
| 合集 | `collection create`、`collection item *`、`collection version set --description`、`collection publish`、`collection collect-rules *`、`collection rss *` |

## 7. 核心业务规则

### 7.1 create / publish / policy / online 分离

标准顺序：

```text
init -> create -> version set -> publish -> policy apply --from-file -> online
```

规则：

1. `create` 只创建资源壳。
2. `version set` 只改本地下一版意图。
3. `publish` 创建正式版本，不要求本资源已有策略。
4. `policy apply --from-file` 新增策略。
5. `policy set` 启停策略。
6. `online` 严格上架，要求 latestVersion + 至少一条启用策略。
7. `offline` 下架。

一个资源可以不添加策略就发布版本；但不能无策略上架。

### 7.2 策略边界

Console/tools-lib 当前稳定契约：

| 能力 | API |
|---|---|
| 新增策略 | `Resource.update(addPolicies)` |
| 启停策略 | `Resource.update(updatePolicies: [{ policyId, status }])` |

CLI 约定：

1. `policy apply --from-file` 只新增策略。
2. `policy set <policyId> --status 0/1` 只启停策略。
3. 不支持修改已有策略正文或名称。
4. 修改已有策略正文/名称请回 Console，或新增一条策略再切换启用状态。
5. 已上架资源不能停用最后一条启用策略。

### 7.3 pull / listing 同步

`pull` 默认只刷新 state，不改 manifest。

只有以下命令能改 manifest listing：

1. `update`
2. `collection update`
3. `pull --apply-listing`

`pull --apply-listing` 使用三方判断：

1. `state.sync.listingFingerprint` 是上次平台 listing 基线。
2. manifest 相对基线没改，平台改了，可以直接采用平台 listing。
3. manifest 和平台都改过 listing，默认 exit 3。
4. 用户确认采用平台值时加 `--force`。

### 7.4 合集规则

合集有两个不同草稿：

| 草稿 | CLI 命令 | 含义 |
|---|---|---|
| 目录草稿 | `collection item *` | 合集条目、排序、标题等 |
| 发版表单草稿 | `draft --collection` | 合集下一版表单数据 |

合集发布流程：

```text
collection create
collection item add/import-dir/update/reorder
collection version set --description
collection publish
policy apply --from-file
online
```

规则：

1. `collection publish` 不要求合集自身已有策略。
2. `collection online` 仍要求 latestVersion + 启用策略。
3. 目录项授权缺口可以阻断 `collection publish`。
4. 官方 `updateCollection` 接口明确合集固定版本，不传 `version`；`collection version set` 只写 manifest 中下一次 publish 的描述意图，不调用平台。

## 8. 常见场景

### 8.1 已有主题/插件项目发布

```bash
cd my-react-theme
pnpm build
freelog-cli init . --scaffold none --resource-type <themeCode> --runtime 0.5 --yes --env dev
freelog-cli create --yes --env dev
freelog-cli version set --version 1.0.0 --file dist --runtime 0.5 --env dev
freelog-cli publish --yes --env dev
freelog-cli policy apply --from-file ./policy.json --yes --env dev
freelog-cli online --yes --env dev
```

### 8.2 模板创建主题/插件

```bash
freelog-cli init my-theme --scaffold runtime --template vite-react-ts --resource-type <themeCode> --runtime 0.5 --yes --env dev
cd my-theme
pnpm install
pnpm build
freelog-cli create --yes --env dev
freelog-cli publish --yes --env dev
```

当前模板运行时档：主推 `0.5`。实测 `--runtime 0.4` 会被拒绝并提示使用 `0.5`。

### 8.3 单图片/单视频发布

```bash
freelog-cli init . --scaffold none --resource-type <imageOrVideoCode> --yes --env dev
freelog-cli create --yes --env dev
freelog-cli version set --version 1.0.0 --file ./photo.png --env dev
freelog-cli publish --yes --env dev
freelog-cli policy apply --from-file ./policy.json --yes --env dev
freelog-cli online --yes --env dev
```

### 8.4 文件夹作为多个独立资源

```bash
freelog-cli resource import-dir ./photos --resource-type <imageCode> --title-prefix "照片 " --yes --env dev
```

### 8.5 文件夹作为合集

```bash
freelog-cli init photo-album --scaffold collection --resource-type <collectionCode> --yes --env dev
cd photo-album
freelog-cli collection create --yes --env dev
freelog-cli collection item import-dir ../photos --resource-type <imageCode> --title-prefix "照片 " --item-policy-file ./item-policy.json --yes --env dev
freelog-cli collection version set --description "首版合集" --env dev
freelog-cli collection publish --yes --env dev
freelog-cli policy apply --from-file ./policy.json --yes --env dev
freelog-cli online --yes --env dev
```

合集导入目录时，平台要求目录项单品已经上架。Console 是批量创建单品后只选择 online 资源进入合集授权流程；CLI 用 `--item-policy-file` 自动为每个子资源添加启用策略并上架，再写入合集目录草稿。dev 实测中，`--item-policy-file` 推荐使用 Console 内置“永久免费”模板文本；合集自身 `policy apply --from-file` 继续使用普通资源/合集可通过的策略文件。

## 9. 当前代码实现状态

已完成的关键实现：

1. `packages/cli/src/config/project.ts`：manifest/state 统一读写层。
2. `packages/cli/src/core/env.ts`：prod/test/dev 环境映射。
3. `packages/cli/src/core/auth.ts`：用户级凭据、环境校验、敏感信息隔离。
4. `packages/cli/src/core/command.ts`：统一全局 flags、JSON 错误输出、debug 脱敏。
5. `packages/cli/src/platform/*`：tools-lib2 Node 入口接入。
6. `type list/search/info`：资源类型发现。
7. `init`：runtime/package/none/collection 脚手架。
8. `create` / `collection create`：创建平台资源壳。
9. `version set`：单品本地版本意图；`collection version set --description`：合集发布说明意图。
10. `publish` / `collection publish`：正式发版。
11. `draft push/pull/discard`：显式草稿同步。
12. `policy apply/list/set`：策略新增、列表、启停。
13. `online/offline`：严格上下架。
14. `resource import-dir`：文件夹批量独立资源。
15. `collection item *`：合集目录草稿维护。
16. `dep *`：依赖声明和声明式免费授权。

关键实现点：

| 文件 | 作用 |
|---|---|
| `packages/cli/src/config/project.ts` | manifest/state 分层、state.env 校验、listingFingerprint |
| `packages/cli/src/services/syncService.ts` | owner/sync/pull、`assertApplyListingAllowed` |
| `packages/cli/src/services/policyService.ts` | `policy apply` 新增策略、`policy set` 启停保护 |
| `packages/cli/src/services/collectionService.ts` | 合集 create/item/publish/policy/rss/collectRules |
| `packages/cli/src/commands/collection.ts` | `collection version set` 等合集命令 |
| `packages/cli/src/services/onlineService.ts` | 严格 online/offline |
| `packages/cli/src/services/publishService.ts` | 单品发布、版本号大于 latestVersion 校验 |
| `packages/cli/src/services/processFile.ts` | 文件/目录压缩、SHA1、上传前处理 |

## 10. 当前验证证据

### 10.1 自动化验证

最近一轮通过：

```bash
pnpm --filter @freelog-cli/cli check:compat
pnpm --filter @freelog-cli/cli exec tsc --noEmit
pnpm --filter @freelog-cli/cli test
pnpm --filter @freelog-cli/cli build
```

测试结果：

```text
18 test files passed
82 tests passed
```

说明：测试过程中有一个已知 warning：

```text
[warn] 自定义属性 radio/checkbox 推入草稿后将变为 select（有损）
```

这是当前 adapter 的已知提示，不是失败。

### 10.2 dev 真实冒烟

已在 devfreelog.com 验证：

1. `login --env dev` 成功。
2. `type list --env dev` 成功返回类型树。
3. 可看到主题 `RT001`、插件 `RT002`、自动化独立资源 `RT024`、自动化集合资源类型 `RT025` 等类型。
4. `test/my-freelog-project` 是已绑定 dev 平台资源的主题测试项目。
5. 该项目资源：
   - resourceId: `6a71856b2ead4b0030dc2a53`
   - resourceName: `freelog-test11/codex-theme-20260804142342`
   - latestVersion 已从 `1.0.2` 发布到 `1.0.3`
   - status 已还原为下架
   - enabledPolicyCount: 1
6. `online --env dev` 成功后已执行 `offline --env dev` 还原。
7. `version set --version 1.0.3` + `publish` 成功，返回过：
   - fileSha1: `d843bd91fedd027996b538ee360a905e689f0b72`
   - filename: `freelog-test11_codex-theme-20260804142342-1.0.3.zip`
   - versionId: `dfd43a114107d9954add66f7f83b788b`
8. 模板创建验证：
   - `--runtime 0.4` 正确失败，提示使用 `0.5`
   - `--runtime 0.5` 成功创建模板项目
   - 新 state 写入 `"env": "dev"`
9. 跨环境读取验证：
   - dev state 下用 `--env test` 读取会失败，JSON code 为 2。

注意：命令执行工具可能把 Node `process.exit(2)` 显示成通用 Exit code 1，但 CLI JSON 输出里的 `code:2` 是业务退出码证据。

## 11. 测试目录状态

### 11.1 `test/my-freelog-project`

用途：主题发布、更新、上下架冒烟。

当前状态：

1. manifest 版本意图：`1.0.3`
2. state env：`dev`
3. 平台 latestVersion：`1.0.3`
4. 平台状态：已下架
5. 已有启用策略：1 条

可继续测试：

```bash
node packages\cli\dist\bin\index.js status --env dev --cwd test\my-freelog-project --json
node packages\cli\dist\bin\index.js pull --env dev --cwd test\my-freelog-project --json
node packages\cli\dist\bin\index.js online --env dev --cwd test\my-freelog-project --yes --json
node packages\cli\dist\bin\index.js offline --env dev --cwd test\my-freelog-project --yes --json
```

发布新版本时必须使用大于平台 latestVersion 的版本号，例如下一次应使用 `1.0.4` 或更高。

### 11.2 临时模板冒烟目录

测试过程中创建过：

```text
test/codex-template-smoke-20260804153949
test/codex-template-smoke-20260804154418
```

它们只是临时测试产物。之前尝试删除时被安全策略拦截。后续可以手动确认后删除，不影响 CLI 代码。

## 12. 产品/测试口径

给产品经理和测试人员看：

```text
docs\新方案\产品与测试简明说明.md
```

该文档覆盖：

1. 产品目标。
2. 关键概念。
3. 与 Console 差异。
4. 主题/插件、单文件、批量独立资源、合集发布流程。
5. 更新类流程。
6. 必测负向用例。
7. 验收通过标准。

## 13. 下一步建议

已完成的仓库内 tools-lib 接入：

1. `pnpm-workspace.yaml` 已包含 `tools-lib` workspace。
2. `@freelog/tools-lib2` override 已改为 `link:./tools-lib`。
3. `pnpm install` 已刷新 lockfile。
4. `pnpm --filter @freelog-cli/cli why @freelog/tools-lib2` 已确认指向 `link:../../tools-lib`。
5. 已重新验证：
   ```bash
   pnpm --filter @freelog-cli/cli check:compat
   pnpm --filter @freelog-cli/cli exec tsc --noEmit
   pnpm --filter @freelog-cli/cli test
   pnpm --filter @freelog-cli/cli build
   ```

后续优先级建议：

1. 用 `test/abcdef.png` 做单图片资源冒烟。
2. 做 `resource import-dir` 批量独立资源冒烟。
3. 做图片合集 `collection item import-dir --item-policy-file` + `collection publish` 冒烟。
4. 到 Console 资源页核对资源基础信息、版本、策略、上下架状态。
5. tools-lib2 发布前，确认 `@freelog/tools-lib2@0.3.0` npm 包包含 Node 入口与当前本地一致。

最近一次 dev 实测结果（2026-08-05）：

- 图片合集从零跑通：`codex-e2e-album-20260805122251`，resourceId `6a72ba982ead4b0030dd88d1`。
- `collection item import-dir` 成功创建并上架 2 个图片子资源，再加入目录草稿。
- `collection publish` 返回 `itemCount=2`。
- 合集自身应用策略后 `online` 成功，`status` 显示 `latestVersion=1.0.0`、`status=1`、`enabledPolicyCount=1`、`collection.itemCount=2`，随后 `offline` 成功。
- 重要平台差异：子资源导入合集的 item policy 使用 Console 内置“永久免费”模板文本；合集自身 policy 使用普通资源/合集可通过的 uppercase 策略文本。

补充 dev 实测结果（2026-08-05）：

- 单视频：`codex-e2e-video-20260805142911` / `6a72d8342ead4b0030ddab98`，发布、策略、上下架成功。
- 视频合集：`codex-e2e-video-album-20260805142938` / `6a72d84f2ead4b0030ddabdd`，`itemCount=2`，上下架成功。
- React 主题模板：`vite-react-ts + RT001`，`codex-e2e-template-react-theme-20260805143046` / `6a72da2e2ead4b0030ddae72`，安装、构建、发布、上下架成功。
- Vue 插件模板：`vite-vue-ts + RT002`，`codex-e2e-template-vue-plugin-20260805143046` / `6a72da782ead4b0030ddaed8`，安装、构建、发布、上下架成功。
- Console 协作：模拟平台改标题后 `status` 显示 `behind`，`pull --apply-listing` 采纳远端；双边冲突时默认失败，`--force` 成功。
- 视频边界：本轮没有真实视频素材，视频实测只证明 CLI/platform 上传、发版、策略和上下架链路。Console 资源页未体现前端转码业务；后续真实视频专项只验证原文件上传、平台格式/大小限制、资源详情页链接可访问，以及必要时 listing cover/视频封面口径。

## 14. 常见踩坑

| 现象 | 原因 | 处理 |
|---|---|---|
| dev 登录后资源接口 401 | 只保存了 tokenSn，没有保存 Cookie | 确认 login 保存 Set-Cookie，并由 tools-lib2 Node adapter 注入 |
| `online` 失败 | 缺 latestVersion 或启用策略 | 先 `publish`，再 `policy apply` 或 `policy set --status 1` |
| `collection item import-dir` 提示子资源门禁不满足 | 子资源没有正式 latestVersion 或没有启用策略 | CLI 已在 `createBatch` 后显式补 `createVersion`；确认使用最新构建和 `--item-policy-file` |
| `collection item import-dir` 平台报 `serviceState` | 子资源策略文本不是 Console 免费模板产物 | `--item-policy-file` 使用 Console 内置“永久免费”模板文本 |
| `publish` 版本冲突 | manifest.version 不大于平台 latestVersion | `version set --version <更高版本>` |
| `policy apply` 想传 policyId 更新旧策略 | 设计不支持 | 新增策略或回 Console 修改 |
| `pull --apply-listing` 冲突 | 本地和平台 listing 都改过 | 手动合并或确认覆盖后加 `--force` |
| 同目录换 `--env` 失败 | state 绑定环境 | 切回原 env，或确认后清理 `.freelog/state.json` |
| 模板 runtime 0.4 失败 | 当前模板主推 0.5 | 使用 `--runtime 0.5` |
| 在仓库 `test` 目录内用 `pnpm install --dir <模板项目>` | 会被根 workspace 捕获，可能不在模板目录生成正确依赖 | repo 内模板验收用 `npm install`，真实用户在仓库外可按模板包管理器使用 |
| 浏览器项目负责人担心要改大量文件 | 浏览器端不需要改 | tools-lib2 保留 browser/default 入口 |

## 15. 接手原则

1. 先查文档，再改代码。
2. 先对照 Console 源码，再判断 CLI 是否要实现。
3. 先保证业务拓扑正确，再优化交互体验。
4. 任何平台事实写入都走 state。
5. 任何用户意图写入都走 manifest。
6. 任何新增命令都要有非交互 `--yes --json` 路径。
7. 任何可能串环境、串 owner、绕过授权的行为都必须失败。
8. 最终以自动化验证和 dev 冒烟结果为准。

如果本文与代码或 Console 源码冲突，以代码和 Console 源码证据为准，并立即更新本文。
