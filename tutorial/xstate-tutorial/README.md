# XState 完整教程 + 实战案例

这是一个全面的 XState 教程，从基础概念到高级实践，并包含多个完整的项目案例。

## 📚 教程目录

### 入门篇
- [01. XState 简介与核心概念](./docs/01-introduction.md)
- [02. 状态机基础](./docs/02-state-machine-basics.md)
- [03. 状态图 (Statecharts)](./docs/03-statecharts.md)
- [04. 事件与转换](./docs/04-events-transitions.md)
- [05. Actor 模型](./docs/05-actors.md)

### 进阶篇
- [06. 守卫与条件](./docs/06-guards-conditions.md)
- [07. 动作与副作用](./docs/07-actions-effects.md)
- [08. 服务与调用](./docs/08-services-invocations.md)
- [09. 并行状态与历史状态](./docs/09-parallel-history.md)
- [10. 状态持久化与序列化](./docs/10-persistence-serialization.md)

### 实战篇
- [11. React 集成](./docs/11-react-integration.md)
- [12. Vue 集成](./docs/12-vue-integration.md)
- [13. Node.js 后端应用](./docs/13-nodejs-backend.md)
- [14. 完整项目案例说明](./docs/14-project-overview.md)

### 高级篇
- [15. 延迟事件与定时器](./docs/15-delayed-events.md) ⭐ 新增
- [16. 测试状态机](./docs/16-testing.md) ⭐ 新增
- [17. 调试与开发工具](./docs/17-debugging.md) ⭐ 新增
- [18. TypeScript 高级用法](./docs/18-typescript-advanced.md) ⭐ 新增

## 🚀 项目案例

### 案例 1: 待办事项应用 (React)
`example-project/todo-app/` 目录包含一个使用 XState 管理的待办事项应用：

- ✅ React + TypeScript
- ✅ XState v5
- ✅ 状态机管理待办事项状态
- ✅ 本地存储持久化
- ✅ 完整的 CRUD 操作

### 案例 2: 支付流程状态机 (Node.js)
`example-project/payment-flow/` 目录包含一个支付流程状态机：

- ✅ Node.js + TypeScript
- ✅ XState v5
- ✅ 支付流程状态管理
- ✅ 异步操作处理
- ✅ 错误处理与重试

### 案例 3: 表单状态管理 (Vue)
`example-project/form-state/` 目录包含一个表单状态管理案例：

- ✅ Vue 3 + TypeScript
- ✅ XState v5
- ✅ 复杂表单验证
- ✅ 多步骤表单流程

## 快速开始

### 安装 XState

```bash
# npm
npm install xstate

# pnpm (推荐)
pnpm add xstate

# yarn
yarn add xstate
```

### 运行案例项目

#### 待办事项应用 (React)

```bash
cd example-project/todo-app
pnpm install
pnpm dev
```

#### 支付流程 (Node.js)

```bash
cd example-project/payment-flow
pnpm install
pnpm dev
```

#### 表单状态管理 (Vue)

```bash
cd example-project/form-state
pnpm install
pnpm dev
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| XState | 5.x | 状态机库 |
| TypeScript | 5.x | 开发语言 |
| React | 18.x | UI 框架（案例1） |
| Vue | 3.x | UI 框架（案例3） |
| Node.js | 18.x+ | 运行时环境 |

## 什么是 XState？

XState 是一个用于创建、解释和执行有限状态机和状态图的 JavaScript/TypeScript 库。它帮助你：

- 🎯 **管理复杂状态** - 清晰地定义应用的所有可能状态
- 🔒 **类型安全** - 完整的 TypeScript 支持
- 🧪 **可测试** - 状态机易于测试和调试
- 📊 **可视化** - 可以在 Stately Studio 中可视化状态机
- 🔄 **可预测** - 状态转换完全可预测和可追踪

## 适合人群

- 想系统学习 XState 的开发者
- 需要管理复杂应用状态的团队
- 希望提高代码可维护性和可测试性的开发者
- 对状态机模式感兴趣的开发者

## 官方资源

- 📖 [官方文档](https://stately.ai/docs)
- 🎨 [Stately Studio](https://stately.ai/studio) - 可视化状态机编辑器
- 💬 [社区讨论](https://github.com/statelyai/xstate/discussions)
- 📺 [视频教程](https://stately.ai/videos)

## 学习路径建议

1. **初学者**: 从 [01. XState 简介](./docs/01-introduction.md) 开始，按顺序学习基础篇
2. **有经验的开发者**: 快速浏览基础篇，重点关注 [06-10 进阶篇](./docs/06-guards-conditions.md)
3. **实战导向**: 直接查看 [案例项目](./example-project/)，结合文档理解实现

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个教程！
