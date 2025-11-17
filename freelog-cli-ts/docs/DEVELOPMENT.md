# Freelog CLI 本地开发与调试

只保留脚手架在开发环境下的配置、调试和排障流程，便于快速启动本地工作。

## 1. 环境要求

- Node.js ≥ 16（建议 18/20 LTS）
- pnpm ≥ 8，仓库根目录是 workspace，开发时需在 `freelog-cli-ts` 下执行命令并带 `--ignore-workspace`
- Git、终端（PowerShell、CMD、bash 均可）
- 可选：抓包工具（Fiddler/Charles）用于排查 API

常用环境变量：

| 变量 | 说明 |
| --- | --- |
| `FREELOG_ENV` | `production`（默认）或 `development`。设置成 `development` 等同执行命令时追加 `--test`，会访问测试网 API。 |
| `FREELOG_CRYPTO_KEY` / `FREELOG_CRYPTO_IV` | 覆盖默认的本地加密配置（`src/core/constants.ts` 内置了一套开发值）。 |
| `FREELOG_CONFIG_PATH` | 指定 `freelog.json` 的绝对/相对路径，所有读写都会指向该文件。 |
| `FREELOG_WORKSPACE_ROOT` | 显式声明工作区根目录；CLI 会在该目录定位 `freelog.json` / `.freelog-auth`。 |
| `FREELOG_AUTH_PATH_WORKSPACE` / `FREELOG_AUTH_PATH_GLOBAL` | 覆盖工作区/全局登录缓存的存储位置。 |

## 2. 初始化步骤

```bash
pnpm install --ignore-workspace   # 安装依赖
pnpm dev                          # 开启 Father watch，保持 dist 最新
# 或仅需一次 O 构建时使用 pnpm build

node dist/index.js login -g       # 登录（根据需求带或不带 -g）
node dist/index.js --help         # 检查命令是否可用
```

> 任何命令都可以直接 `node dist/index.js <command>` 运行；若希望以真实的 `freelog-cli` 命令名体验并复用全局调用链，务必使用 `pnpm link --global`（或 `npm link`）把本地包挂到全局，这样 `freelog-cli <cmd>` 就会指向当前源码，方便调试。CLI 也会自动向上查找离当前目录最近的 `freelog.json` 与 `.freelog-auth`，因此在子目录执行命令也能复用同一份配置。

### 全局 link 调试

1. 先执行 `pnpm dev`（实时 watch）或 `pnpm build`（一次性构建），确保 `dist/` 最新。
2. 在 `freelog-cli-ts` 根目录运行：
   ```bash
   pnpm link --global          # macOS / Linux
   # Windows 需以管理员 PowerShell 执行同样的命令
   ```
   若团队仍使用 npm，也可以改用 `npm link`。
3. 之后可在任何目录直接执行 `freelog-cli --test login -g`、`freelog-cli publish -d` 等命令，所有逻辑会回调到当前仓库源码，从而实现“全局命令 + 本地代码”调试。
4. 不再需要时，可运行 `pnpm unlink --global @freelog/cli`（或 `npm unlink -g @freelog/cli`）解除绑定。

## 3. 目录速览

- `src/commands/**`：所有 CLI 命令的实现
- `src/core/**`：HTTP、认证、配置、常量等基础模块
- `src/utils/**`、`src/types/**`：工具方法与类型声明
- `dist/`：Father 输出的 JS 与 d.ts；调试时的入口
- `.freelog-auth`：登录态缓存，按全局/工作区分别写入
- `freelog.json`：作品配置文件，`init/sync/add/update/remove/change` 会读写

## 4. 开发脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | Watch 编译，监听 `src/**` 并写入 `dist/`，推荐开发过程中常开。 |
| `pnpm build` | 生产构建，生成 `dist/` 和类型声明；CI 发布前执行。 |
| `pnpm test` | 目前是占位脚本，默认返回 0，可按需替换为实际测试方案。 |

## 5. 本地调试流程

1. **切换环境**：在终端导出 `FREELOG_ENV=development`（或在命令后加 `--test`）以避免误调用生产接口。
2. **登录**：`node dist/index.js login [-g]`；脚手架会在当前目录生成/更新 `.freelog-auth`，若无需交互可带 `-u/-p`。
3. **准备配置**：`init` 或 `sync` 生成 `freelog.json`，也可以直接编辑该文件，字段定义见 `src/types/index.ts`。
4. **开发命令**：修改 `src/commands/**` 后由 `pnpm dev` 自动编译，可先运行 `node dist/index.js <cmd>` 验证；若已执行 `pnpm link --global`，则直接用 `freelog-cli <cmd>` 触发同一份本地代码，体验与线上一致。
5. **调试 API**：`src/core/http.ts` 注入了 `Authorization`，可以通过 `console.log` 或抓包工具查看请求；若需要自定义 baseURL，可临时在本地修改 `getApiBaseURL()` 返回值。
6. **查看输出**：命令普遍使用 `chalk`/`ora` 打印信息，如需更详细日志可以临时新增 `console.debug`，提交前再清理。

### 调试技巧

- 断点调试：`node --inspect-brk dist/index.js <cmd>`，然后在 VS Code/Chrome DevTools 中附加。
- Source map：Father 默认生成 source map，可在 DevTools 中查看 TS 级别堆栈。
- 快速回归：为常用命令封装 npm scripts（例如 `"cli:login": "freelog-cli login -g"`）；借助 `pnpm link --global`，既保留脚本复用，又能直接验证全局调用链。

## 6. 排障指南

| 问题 | 处理方式 |
| --- | --- |
| 提示“未登录” | 检查 `.freelog-auth` 是否存在；必要时重新执行 `login`。 |
| API 返回 `ret != 0` | 接口返回值中的 `msg` 已透出，直接根据提示排查；若需要更详细响应可在 `src/core/http.ts` 中临时打印。 |
| `pnpm dev` 无输出 | 确认本机可运行 Father；若被缓存阻塞，可执行 `pnpm dlx father doctor`。 |
| `freelog.json` 被覆盖 | `sync` 默认覆盖整份文件，重要字段请提前备份或转为自定义脚本手动 merge。 |
| 网络问题 | 通过 `FREELOG_ENV` 切换到可用环境，或在公司网络设置代理后重试。 |

## 7. 参考

- 命令使用示例：`README.md`
- 需求背景与指令设计：仓库根目录的《脚手架设计 copy.md》

保持文档只聚焦本地开发调试，若后续需要发布/流程类说明，可另建文档，不在此文件展开。
