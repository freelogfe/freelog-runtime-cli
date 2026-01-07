# 14. 完整项目案例说明

本教程包含三个完整的项目案例，展示了 XState 在不同场景下的实际应用。

## 案例 1: 待办事项应用 (React)

**位置**: `example-project/todo-app/`

### 功能特性

- ✅ 添加、编辑、删除待办事项
- ✅ 标记完成/未完成
- ✅ 过滤（全部/进行中/已完成）
- ✅ 本地存储持久化
- ✅ 状态机管理所有状态

### 技术栈

- React 18
- TypeScript
- XState v5
- Vite

### 核心状态机

```typescript
const todoMachine = createMachine({
  context: {
    todos: [],
    filter: 'all'
  },
  states: {
    idle: {
      on: {
        ADD_TODO: { /* ... */ },
        TOGGLE_TODO: { /* ... */ },
        DELETE_TODO: { /* ... */ },
        SET_FILTER: { /* ... */ }
      }
    }
  }
});
```

### 运行

```bash
cd example-project/todo-app
pnpm install
pnpm dev
```

## 案例 2: 支付流程状态机 (Node.js)

**位置**: `example-project/payment-flow/`

### 功能特性

- ✅ 支付流程状态管理
- ✅ 支付验证
- ✅ 异步支付处理
- ✅ 错误处理与重试
- ✅ Express API 集成

### 技术栈

- Node.js
- TypeScript
- Express
- XState v5

### 核心状态机

```typescript
const paymentMachine = createMachine({
  states: {
    idle: { /* ... */ },
    validating: { /* ... */ },
    processing: { /* ... */ },
    completed: { /* ... */ },
    failed: { /* ... */ }
  }
});
```

### 运行

```bash
cd example-project/payment-flow
pnpm install
pnpm dev
```

## 案例 3: 表单状态管理 (Vue)

**位置**: `example-project/form-state/`

### 功能特性

- ✅ 多步骤表单
- ✅ 表单验证
- ✅ 状态持久化
- ✅ Vue 3 Composition API

### 技术栈

- Vue 3
- TypeScript
- XState v5
- Vite

### 核心状态机

```typescript
const formMachine = createMachine({
  states: {
    step1: { /* ... */ },
    step2: { /* ... */ },
    step3: { /* ... */ },
    validating: { /* ... */ },
    submitting: { /* ... */ }
  }
});
```

### 运行

```bash
cd example-project/form-state
pnpm install
pnpm dev
```

## 学习建议

1. **初学者**: 从案例 1（待办事项）开始，这是最简单的例子
2. **中级**: 学习案例 3（表单），了解复杂状态管理
3. **高级**: 研究案例 2（支付流程），学习后端应用

## 下一步

- 阅读各个案例的 README 了解详细说明
- 运行案例并尝试修改
- 参考教程文档深入理解 XState
