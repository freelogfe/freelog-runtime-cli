# Freelog Runtime CLI 交接文档

最后更新：2026-08-04

## 1. 当前目标

当前阶段只专注 `D:\appinside\freelog-runtime-cli\packages\cli` 的新脚手架实现与验证。

目标不是兼容旧 CLI，而是做一套干净的新 CLI：

1. 与 Console 资源发行链路对齐。
2. 平台接口统一走 `@freelog/tools-lib2/node`。
3. 项目本地只保留 `freelog.manifest.json` + `.freelog/state.json`。
4. 凭据默认只写用户级 `.freelog-auth`，项目目录不得产生凭据文件。
5. 不保留旧配置文件、旧命令入口、旧手写 API 分叉。

浏览器端项目暂不需要改造；浏览器端继续使用 workspace 里的默认导出即可。

## 2. 关键路径

| 用途 | 路径 |
|---|---|
| 新 CLI 实现仓库 | `D:\appinside\freelog-runtime-cli` |
| CLI 包 | `D:\appinside\freelog-runtime-cli\packages\cli` |
| 新方案文档 | `D:\appinside\freelog-runtime-cli\docs\新方案` |
| Console 对照源码 | `D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource` |
| tools-lib2 源码 | `D:\appinside\freelogfe-web-repos\packages\@freelog\tools-lib` |
| 旧脚手架参考，只能参考不能继承 | `D:\appinside\freelog-runtime-cli\backup\freelog-cli-ts-copy\src` |
| 旧脚手架 public 参考，只能参考不能继承 | `D:\appinside\freelog-runtime-cli\backup\freelog-cli-ts-copy\public` |

## 3. tools-lib2 依赖状态

当前开发态 CLI 使用本地 link：

```text
@freelog-cli/cli -> @freelog/tools-lib2 link:../../../freelogfe-web-repos/packages/@freelog/tools-lib
```

确认命令：

```bash
pnpm --filter @freelog-cli/cli why @freelog/tools-lib2
```

`packages/cli/package.json` 仍保留 npm 发布语义：

```json
"@freelog/tools-lib2": "^0.3.0"
```

这表示：

1. 本地联调优先验证 `D:\appinside\freelogfe-web-repos\packages\@freelog\tools-lib` 的当前源码。
2. CLI 发包后会解析 npm 上的 `@freelog/tools-lib2` 版本。
3. tools-lib2 有接口或 Node adapter 改动时，必须先确认 npm 版本已发布，再发布 CLI。

## 4. 环境与账号

### 三个环境

| CLI 环境值 | 站点 | API Base URL | 说明 |
|---|---|
| `production` / `prod` | `freelog.cn` | `https://api.freelog.cn` | 生产环境 |
| `test` | `testfreelog.com` | `https://api.testfreelog.com` | 测试环境 |
| `dev` / `development` | `devfreelog.com` | `https://api.devfreelog.com` | 当前联调环境 |

本轮真实联调使用 `devfreelog.com`，所以 CLI 必须使用：

```bash
freelog-cli login --env dev
```

或：

```bash
FREELOG_ENV=dev freelog-cli login
```

不要把 `devfreelog.com` 误写成 `--test`。

### 当前联调账号

| 项 | 值 |
|---|---|
| 目标环境 | `devfreelog.com` |
| CLI 环境值 | `dev` |
| 测试账号 | `freelog-test11` |
| 测试密码 | `freelog-test1111` |

该账号密码仅用于 dev 环境联调与冒烟测试，不要用于 production。
不要把密码写入 `freelog.manifest.json`、`.freelog/state.json`、README、测试快照或命令输出日志。
CLI 登录成功后，凭据默认写入用户级 `.freelog-auth`；只有测试隔离时才允许用 `FREELOG_AUTH_PATH_WORKSPACE` 指向临时文件。
dev 环境实测 `/v2/passport/login` 返回的 `Set-Cookie` 才能通过后续资源接口鉴权，`tokenSn` 不能直接作为 Bearer token 使用。

本地登录建议使用交互式输入：

```bash
freelog-cli login --env dev
```

非交互调试时可以由本机 Secret、临时环境变量或 CI Secret 注入，再传给 CLI：

```bash
freelog-cli login --env dev --login-name freelog-test11 --password freelog-test1111 --yes
```

当前 CLI 的环境映射在 `packages/cli/src/core/env.ts`：

```text
production -> https://api.freelog.cn
dev        -> https://api.devfreelog.com
test       -> https://api.testfreelog.com
```

所以 `devfreelog.com` 必须使用 `--env dev` 或 `FREELOG_ENV=dev`，不要误用 `--test`。

## 5. 当前代码实现状态

已完成第一轮核心改造：

1. 新增统一项目读写层：`packages/cli/src/config/project.ts`。
2. 删除旧配置读写层：`read.ts`、`writeShell.ts`、`paths.ts`。
3. 删除旧命令：`updateVersion`。
4. 移除旧 `create --from-dir`，改为 `resource import-dir`。
5. 移除旧 `publish --draft`，发布与上线流程分离。
6. `policy add` 改为 `policy apply`。
7. 新增 `policy set <policyId> --status <0|1>`。
8. 新增 `type list/search/info`。
9. 新增 `collection item import-dir`。
10. `@freelog/tools-lib2` 只从 Node 入口接入：`@freelog/tools-lib2/node`。
11. 移除 CLI 对 `jiti` 的直接依赖。
12. 正式命令面不暴露顶层 `contract list`；依赖授权收敛到 `dep auth`，付费/复杂交互回 Console。
13. 通用 `--debug` 正式支持，但必须对 token/password/cookie/authorization 脱敏。
14. dev 登录响应中 `tokenSn` 不是有效 Bearer token 来源；CLI 必须保存登录响应 `Set-Cookie` 并由 tools-lib2 Node adapter 注入 `Cookie` header。
15. citty 父命令只注册 `subCommands`，不要写抛错型 `run`，否则子命令成功后可能继续触发父命令报错。
16. 普通资源与合集共用 `freelog.manifest.json`，业务分流必须读取 `subject`，不能只用 manifest 文件是否存在判断。

## 6. 本地文件模型

### `freelog.manifest.json`

用户拥有的项目意图文件，应该提交 git。

允许保存：

1. 项目类型：普通资源、版本资源、合集。
2. 资源短授权名。
3. 标题、简介、标签、封面等基础信息。
4. 版本意图：版本号、文件路径、运行时版本等。
5. 依赖、策略、合集条目等用户希望表达的内容。

禁止保存：

1. `resourceId`
2. `userId`
3. `username`
4. `fileSha1`
5. `filename`
6. `draftSync`
7. token、cookie、password
8. `.freelog-auth`

### `.freelog/state.json`

CLI 拥有的平台状态文件，不提交 git。

允许保存：

1. 平台返回的 `resourceId`
2. owner 信息
3. 最新版本状态
4. 远端 draft 同步状态
5. 已上传文件的 SHA1 / filename 等平台状态

项目初始化和批量生成目录时，需要自动维护 `.gitignore`：

```text
.freelog/state.json
.freelog/cache/
.freelog/tmp/
```

## 7. 命令边界

### 全局

```bash
freelog-cli login --env dev
freelog-cli logout
freelog-cli status
freelog-cli pull <resourceId>
```

### 类型查询

```bash
freelog-cli type list
freelog-cli type search <keyword>
freelog-cli type info <resourceTypeCode>
```

### 单资源：主题、插件、图片、视频

```bash
freelog-cli init <dir> --scaffold runtime --template vite-react-ts --resource-type <typeCode> --runtime <runtimeVersion> --yes
freelog-cli init . --scaffold none --resource-type <typeCode> --runtime <runtimeVersion> --yes
cd <dir>
pnpm build
freelog-cli create
freelog-cli version set --version 1.0.0 --file dist --runtime <runtimeVersion>
freelog-cli publish
freelog-cli policy apply --from-file ./policy.json --yes
freelog-cli online --yes
```

图片、视频这类单文件资源也走同一条链路，只是 `version set --file` 指向具体文件。

### 文件夹批量资源

每个文件生成一个独立资源：

```bash
freelog-cli resource import-dir ./photos --resource-type <imageTypeCode> --title-prefix "照片" --yes
```

### 合集

```bash
freelog-cli init album --scaffold collection --resource-type <collectionTypeCode> --yes
cd album
freelog-cli collection create
freelog-cli collection item import-dir ../photos --resource-type <imageTypeCode> --yes
freelog-cli collection publish --yes
freelog-cli policy apply --from-file ./policy.json --yes
freelog-cli online --yes
```

`collection item import-dir` 的语义是：

1. 文件夹内每个文件先创建为独立资源。
2. 每个资源发布版本。
3. 再把这些资源加入当前合集草稿。

## 8. 发布与上线规则

`publish` 与 `online` 必须分开理解：

1. `publish`：创建/更新版本、推资源草稿，不要求策略。
2. `policy apply`：应用策略到资源或合集。
3. `online`：上架，必须满足严格门禁。

上线门禁：

1. 已登录，且 token 环境与当前 CLI 环境一致。
2. 本地项目已经绑定远端 `resourceId`。
3. 平台 owner 与当前登录用户一致。
4. 存在已发布的 latestVersion。
5. 至少存在一个启用状态的策略。

原因：一个资源可以先不添加策略而发布版本，但上架必须具备可用策略，否则运行时授权不可闭环。

## 9. 与 Console 的对齐原则

CLI 对齐 Console 的业务契约，不照搬 UI 操作细节。

| Console | CLI |
|---|---|
| 浏览器 cookie | CLI 登录会话 Cookie；显式 token/PAT 以后可作为扩展 |
| 表单防抖草稿 | 显式命令写草稿 |
| 创建时 UI 收集字段 | manifest 表达用户意图 |
| 用户点击上架 | `online` 严格门禁 |
| 页面状态提示 | `status --json` / exit code |
| 文件上传与 SHA1 | `@freelog/tools-lib2/node` + Node 文件适配 |

核心原则：

1. 接口和字段 shape 与 Console 保持同源。
2. CLI 不维护一套平行手写 API。
3. CLI 不模仿 Console 的页面防抖、临时态、局部 UI 草稿。
4. CLI 面向可重复执行、可审计、可 CI 化。

## 10. 禁止回退项

后续开发不要重新引入以下内容：

1. `freelog.resource.config.ts`
2. `freelog.version.config.ts`
3. `freelog.collection.config.ts`
4. `jiti` 执行用户配置
5. `updateVersion`
6. `create --from-dir`
7. `publish --draft`
8. `syncr`
9. `syncv`
10. `policy add`
11. `collection policy add`
12. CLI 自建 `src/api/**` 平行接口层
13. 顶层 `contract list` 用户入口
14. 项目目录默认保存 `.freelog-auth`

如果发现某个场景必须补能力，优先扩展 manifest/state/project 层和现有命令，不要恢复旧配置体系。

## 11. 已验证命令

当前已通过：

```bash
pnpm --filter @freelog-cli/cli exec tsc --noEmit
pnpm --filter @freelog-cli/cli test
pnpm --filter @freelog-cli/cli build
git diff --check -- packages/cli pnpm-lock.yaml
```

单测结果：

```text
17 test files passed
65 tests passed
```

残留扫描通过，源码、README、package、dist 中未发现旧配置和旧命令入口。

## 12. 下一步冒烟验证清单

用 `devfreelog.com` 环境做真实端到端验证：

1. `freelog-cli login --env dev`
2. `freelog-cli type search 图片`
3. `freelog-cli type search 视频`
4. `freelog-cli type search 主题`
5. `freelog-cli type search 插件`
6. 创建单图片资源并发布。
7. 创建单视频资源并发布。
8. 用 `test/my-freelog-project` 验证已有 React 主题：`init . --scaffold none --runtime 0.5` 不生成 `-` 子目录，build 后发布 zip。
9. 用 `packages/templates/vite-react-ts`、`packages/templates/vite-vue-ts` 验证模板创建主题/插件：`init <dir> --scaffold runtime --template ... --skip-install` 生成 manifest/state，安装依赖后可 build。
10. Vite 模板构建不得出现 `__dirname` native config loader 警告；路径别名用 `import.meta.dirname`。
10. 创建图片合集，用 `collection item import-dir` 导入图片文件夹。
11. 创建视频合集，用 `collection item import-dir` 导入视频文件夹。
12. 对每类资源执行 `policy apply`。
13. 对每类资源执行 `online`。
14. 到 Console 资源页检查资源基础信息、版本、策略、上下架状态是否一致。

冒烟失败时优先定位：

1. tools-lib2 Node adapter 是否拿到了正确 env 和 Cookie/Authorization。
2. Console 对应接口 shape 是否与当前 CLI adapter 期望一致。
3. manifest 是否只保存用户意图，state 是否只保存平台状态。
4. resourceName 是否误用了 `username/name` 写入 manifest。
5. publish 与 online 是否被错误合并。

## 13. 代码维护原则

1. 一切平台调用从 `packages/cli/src/platform/index.ts` 暴露的 `FServiceAPI` 进入。
2. 一切项目文件读写从 `packages/cli/src/config/project.ts` 进入。
3. 命令层只做参数解析、交互确认、输出和错误处理。
4. 服务层负责业务流程编排。
5. adapter 负责 Console draft shape 转换。
6. 校验逻辑集中在 service/validation/adapter，不分散到命令层。
7. 新增场景先补测试，再改实现。
8. 不为了少改文件牺牲边界；但也不要做无关重构。

这份文档作为后续接手入口。若代码和文档冲突，以当前代码和 Console 源码证据为准，然后更新本文档。
