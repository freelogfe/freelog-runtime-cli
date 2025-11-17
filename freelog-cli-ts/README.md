# Freelog CLI

Freelog 平台的命令行工具，用于资源发布、依赖管理和项目配置。

---

## 安装与启动

```bash
pnpm install --ignore-workspace   # 安装依赖
pnpm build                        # 一次性编译
pnpm dev                          # 开发期 watch（可选）
node dist/index.js --help         # 查看命令
```

> 命令可追加 `--test`（或在终端导出 `FREELOG_ENV=development`）以使用测试网 API。

## 必备概念

- `.freelog-auth`：登录缓存，`login` 命令会根据全局/工作区选项写入。
- `freelog.json`：作品与依赖配置文件，`init`/`sync`/`add`/`update` 等命令都会读写。
- `src/index.ts`：命令注册入口（了解命令行为时可参考）。

## 常用命令

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 全局登录 | `node dist/index.js login -g` | 交互式输入或通过 `-u/-p` 传参 |
| 工作区登录 | `node dist/index.js login` | 不带 `-g` 仅写入当前目录 |
| 查看登录状态 | `node dist/index.js status` | 展示用户名、ID、作用域 |
| 登出 | `node dist/index.js logout [-g]` | 清除对应作用域的 `.freelog-auth` |
| 初始化项目 | `node dist/index.js init [name]` | 生成基础结构与 `freelog.json` |
| 同步作品配置 | `node dist/index.js sync <resource> [-v <ver>]` | 拉取线上信息并覆盖 `freelog.json` |
| 发布作品 | `node dist/index.js publish [-d] [-m <msg>]` | 默认正式版，加 `-d` 为草稿 |
| 分析文件属性 | `node dist/index.js analyze [path]` | 不传路径时从 `freelog.json` 推断 |
| 添加依赖 | `node dist/index.js add <resource[@version]>` | 支持策略选择、签约、支付 |
| 更新依赖 | `node dist/index.js update <resources...>` | 批量指定或交互式选择版本 |
| 删除依赖 | `node dist/index.js remove <resources...>` | 传多个以空格分隔 |
| 查看依赖列表 | `node dist/index.js list [-r] [-v <ver>]` | `-r` 查看线上，默认本地 |
| 修改依赖策略 | `node dist/index.js change <resource>` | 支持选择新策略或套用合约 |

## 常见问题

- **提示未登录**：重新执行 `login`，或确认 `.freelog-auth` 是否在当前目录/用户目录存在。
- **同步/依赖命令失败**：大多会返回 Freelog API 的 `msg`，按提示排查即可。
- **需要本地调试说明**：参考 `DEVELOPMENT.md`，其中包含调试、环境变量和排障指南。

---

## 📚 开发与测试文档

### 开发文档
需要了解项目架构、本地调试或贡献代码，请查看：

- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - 开发指南、架构说明、调试方法
- **[tests/README.md](./tests/README.md)** - 测试编写和运行指南

### 测试文档
准备测试新功能或修复问题，请查看：

- **[测试文档索引.md](./测试文档索引.md)** - 测试文档导航（从这里开始）
- **[快速开始测试.md](./快速开始测试.md)** - 5分钟快速测试核心功能
- **[测试流程文档.md](./测试流程文档.md)** - 完整的测试流程和步骤
- **[测试问题追踪.md](./测试问题追踪.md)** - 记录和追踪测试问题

### 项目文档
了解配置文件拆分项目的详细信息：

- **[配置拆分完成.md](./配置拆分完成.md)** - 项目完成总结（中文）
- **[FINAL_COMPLETION_REPORT.md](./FINAL_COMPLETION_REPORT.md)** - 完整完成报告（英文）
- **[CONFIG_SPLIT_ARCHITECTURE.md](./CONFIG_SPLIT_ARCHITECTURE.md)** - 架构设计文档
- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - 迁移指南
