# XState 待办事项应用

这是一个使用 XState 管理状态的待办事项应用示例。

## 功能特性

- ✅ 添加、编辑、删除待办事项
- ✅ 标记完成/未完成
- ✅ 过滤（全部/进行中/已完成）
- ✅ 本地存储持久化
- ✅ 状态机管理所有状态

## 技术栈

- React 18
- TypeScript
- XState v5
- Vite

## 安装和运行

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 预览构建结果
pnpm preview
```

## 项目结构

```
src/
├── todoMachine.ts    # 状态机定义
├── App.tsx           # 主组件
├── TodoItem.tsx      # 待办事项项组件
├── TodoFilter.tsx    # 过滤器组件
└── main.tsx          # 入口文件
```

## 核心概念

### 状态机

`todoMachine` 定义了应用的所有状态和转换：

- **状态**: `idle` - 应用处于空闲状态
- **上下文**: `todos` 数组和 `filter` 过滤器
- **事件**: `ADD_TODO`, `TOGGLE_TODO`, `DELETE_TODO`, `EDIT_TODO`, `SET_FILTER`, `CLEAR_COMPLETED`

### 持久化

状态机会自动将待办事项保存到 `localStorage`，页面刷新后数据不会丢失。

## 学习要点

1. **状态机定义**: 查看 `todoMachine.ts` 了解如何定义状态机
2. **React 集成**: 查看 `App.tsx` 了解如何在 React 中使用 `useMachine`
3. **事件发送**: 了解如何通过 `send` 函数发送事件
4. **状态订阅**: 了解如何通过 `snapshot` 访问当前状态

## 扩展练习

1. 添加待办事项优先级
2. 添加截止日期功能
3. 添加分类/标签功能
4. 实现拖拽排序
5. 添加搜索功能
