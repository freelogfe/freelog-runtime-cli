# 01. XState 简介与核心概念

## 什么是 XState？

XState 是一个用于创建、解释和执行**有限状态机（Finite State Machines）**和**状态图（Statecharts）**的 JavaScript/TypeScript 库。它由 David Khourshid 创建，现在是 Stately 团队维护的开源项目。

### 为什么需要状态机？

在传统的应用开发中，状态管理往往通过简单的变量和条件判断来实现：

```typescript
// ❌ 传统方式 - 容易出错
let isLoading = false;
let data = null;
let error = null;

function fetchData() {
  if (isLoading) return; // 可能重复请求
  isLoading = true;
  // ... 异步操作
  // 如果出错，isLoading 可能忘记重置
}
```

这种方式的问题：
- ❌ 状态不明确，容易出现无效状态（如 `isLoading=true` 且 `error!=null`）
- ❌ 难以追踪状态变化
- ❌ 容易遗漏边界情况
- ❌ 测试困难

使用状态机后：

```typescript
// ✅ 使用 XState - 清晰、可预测
const fetchMachine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: { FETCH: 'loading' }
    },
    loading: {
      on: {
        SUCCESS: 'success',
        ERROR: 'error'
      }
    },
    success: {},
    error: {
      on: { RETRY: 'loading' }
    }
  }
});
```

## 核心概念

### 1. 状态机 (State Machine)

状态机是一个数学模型，由以下部分组成：

- **状态（States）**: 系统可能处于的所有状态
- **事件（Events）**: 触发状态转换的输入
- **转换（Transitions）**: 状态之间的转换规则
- **初始状态（Initial State）**: 系统的起始状态

```
┌─────────┐
│  idle   │ ← 初始状态
└────┬────┘
     │ FETCH
     ▼
┌─────────┐
│ loading │
└────┬────┘
     │ SUCCESS
     ▼
┌─────────┐
│ success │
└─────────┘
```

### 2. 状态图 (Statecharts)

状态图是状态机的扩展，由 David Harel 在 1987 年提出，增加了：

- **层次状态（Hierarchical States）**: 状态可以包含子状态
- **并行状态（Parallel States）**: 多个状态可以同时激活
- **历史状态（History States）**: 记住之前的状态
- **守卫（Guards）**: 条件判断
- **动作（Actions）**: 状态转换时执行的操作

```
┌─────────────────────┐
│   Machine           │
│  ┌───────────────┐  │
│  │  idle         │  │
│  └───────┬───────┘  │
│          │ FETCH    │
│          ▼          │
│  ┌───────────────┐  │
│  │  loading      │  │
│  │  ┌─────────┐  │  │
│  │  │fetching │  │  │
│  │  └─────────┘  │  │
│  └───────┬───────┘  │
│          │ SUCCESS  │
│          ▼          │
│  ┌───────────────┐  │
│  │  success      │  │
│  └───────────────┘  │
└─────────────────────┘
```

### 3. Actor 模型

XState v5 引入了 Actor 模型，这是状态机的进一步抽象：

- **Actor**: 一个独立的计算单元，有自己的状态和行为
- **消息传递**: Actor 之间通过消息通信
- **隔离性**: 每个 Actor 的状态和行为是独立的

## XState 版本

### XState v4 vs v5

| 特性 | v4 | v5 |
|------|----|----|
| API 风格 | 面向对象 | 函数式 |
| Actor 模型 | 部分支持 | 完整支持 |
| TypeScript | 良好支持 | 完整类型推断 |
| 性能 | 良好 | 更优 |
| 学习曲线 | 中等 | 稍高 |

本教程主要基于 **XState v5**，这是当前推荐使用的版本。

## 安装与设置

### 1. 安装 XState

```bash
# npm
npm install xstate

# pnpm (推荐)
pnpm add xstate

# yarn
yarn add xstate
```

### 2. TypeScript 配置

确保 `tsconfig.json` 包含：

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node"
  }
}
```

### 3. 第一个状态机

创建一个简单的开关状态机：

```typescript
import { createMachine } from 'xstate';

const toggleMachine = createMachine({
  id: 'toggle',
  initial: 'inactive',
  states: {
    inactive: {
      on: {
        TOGGLE: 'active'
      }
    },
    active: {
      on: {
        TOGGLE: 'inactive'
      }
    }
  }
});
```

### 4. 创建 Actor 并运行

```typescript
import { createActor } from 'xstate';

// 创建 actor
const toggleActor = createActor(toggleMachine);

// 启动 actor
toggleActor.start();

// 发送事件
toggleActor.send({ type: 'TOGGLE' });

// 获取当前状态
console.log(toggleActor.getSnapshot().value); // 'active'

// 停止 actor
toggleActor.stop();
```

## 核心 API

### createMachine

创建状态机定义：

```typescript
import { createMachine } from 'xstate';

const machine = createMachine({
  id: 'machine-id',
  initial: 'stateName',
  states: {
    stateName: {
      // 状态配置
    }
  }
});
```

### createActor

创建可执行的 Actor 实例：

```typescript
import { createActor } from 'xstate';

const actor = createActor(machine);
actor.start();
```

### Actor 方法

```typescript
// 启动
actor.start();

// 停止
actor.stop();

// 发送事件
actor.send({ type: 'EVENT_NAME', data: {} });

// 获取快照
const snapshot = actor.getSnapshot();
console.log(snapshot.value); // 当前状态值
console.log(snapshot.context); // 上下文数据

// 订阅状态变化
actor.subscribe((snapshot) => {
  console.log('状态变化:', snapshot.value);
});
```

## 状态机 vs 传统状态管理

### Redux/Zustand 方式

```typescript
// Redux
const [state, dispatch] = useReducer(reducer, initialState);

// Zustand
const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

### XState 方式

```typescript
const counterMachine = createMachine({
  initial: 'idle',
  context: { count: 0 },
  states: {
    idle: {
      on: {
        INCREMENT: {
          actions: assign({ count: ({ context }) => context.count + 1 })
        }
      }
    }
  }
});
```

### 对比

| 特性 | Redux/Zustand | XState |
|------|---------------|--------|
| 状态定义 | 分散 | 集中定义 |
| 状态转换 | 手动管理 | 自动验证 |
| 无效状态 | 可能发生 | 不可能 |
| 可视化 | 困难 | 支持 |
| 类型安全 | 需要配置 | 开箱即用 |
| 学习曲线 | 低 | 中等 |

## 适用场景

### ✅ 适合使用 XState 的场景

1. **复杂的状态转换逻辑**
   - 表单多步骤流程
   - 支付流程
   - 认证流程

2. **需要严格状态管理**
   - 游戏状态
   - 工作流引擎
   - 状态机协议实现

3. **需要可视化状态**
   - 团队协作
   - 文档化需求
   - 调试复杂流程

### ❌ 不适合的场景

1. **简单的状态管理**
   - 计数器
   - 简单的开关
   - 单一状态值

2. **性能敏感场景**
   - 高频更新
   - 大量小状态

## 下一步

[👉 02. 状态机基础](./02-state-machine-basics.md)
