# 18. TypeScript 高级用法

XState v5 提供了完整的 TypeScript 支持，可以实现类型安全的状态机。

## 基础类型定义

### 定义上下文和事件类型

```typescript
import { createMachine, assign } from 'xstate';

// 定义上下文类型
interface TodoContext {
  todos: Array<{
    id: string;
    text: string;
    completed: boolean;
  }>;
  filter: 'all' | 'active' | 'completed';
}

// 定义事件类型
type TodoEvent =
  | { type: 'ADD_TODO'; text: string }
  | { type: 'TOGGLE_TODO'; id: string }
  | { type: 'DELETE_TODO'; id: string }
  | { type: 'SET_FILTER'; filter: 'all' | 'active' | 'completed' }
  | { type: 'CLEAR_COMPLETED' };

// 使用 types 属性定义类型
const todoMachine = createMachine({
  types: {
    context: {} as TodoContext,
    events: {} as TodoEvent
  },
  context: {
    todos: [],
    filter: 'all'
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        ADD_TODO: {
          actions: assign({
            // TypeScript 自动推断 context 和 event 类型
            todos: ({ context, event }) => [
              ...context.todos,
              { id: Date.now().toString(), text: event.text, completed: false }
            ]
          })
        },
        TOGGLE_TODO: {
          actions: assign({
            todos: ({ context, event }) =>
              context.todos.map(todo =>
                todo.id === event.id
                  ? { ...todo, completed: !todo.completed }
                  : todo
              )
          })
        }
      }
    }
  }
});
```

## 输入和输出类型

### 定义输入类型

```typescript
interface MachineInput {
  initialCount: number;
  maxCount: number;
}

interface MachineContext {
  count: number;
  maxCount: number;
}

const counterMachine = createMachine({
  types: {
    context: {} as MachineContext,
    input: {} as MachineInput
  },
  context: ({ input }) => ({
    count: input.initialCount,
    maxCount: input.maxCount
  }),
  // ...
});

// 创建 Actor 时必须提供正确类型的 input
const actor = createActor(counterMachine, {
  input: { initialCount: 0, maxCount: 100 }
});
```

### 定义输出类型

```typescript
interface MachineOutput {
  result: string;
  timestamp: number;
}

const machine = createMachine({
  types: {
    output: {} as MachineOutput
  },
  // ...
  states: {
    done: {
      type: 'final',
      output: ({ context }): MachineOutput => ({
        result: context.data,
        timestamp: Date.now()
      })
    }
  }
});

// 获取输出时类型安全
const snapshot = actor.getSnapshot();
if (snapshot.status === 'done') {
  const output: MachineOutput = snapshot.output;
}
```

## 守卫类型

```typescript
import { createMachine, type GuardPredicate } from 'xstate';

interface Context {
  count: number;
  maxCount: number;
}

type Event = 
  | { type: 'INCREMENT' }
  | { type: 'DECREMENT' };

// 定义类型安全的守卫
const canIncrement: GuardPredicate<Context, Event> = ({ context }) => {
  return context.count < context.maxCount;
};

const machine = createMachine({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  context: { count: 0, maxCount: 10 },
  initial: 'counting',
  states: {
    counting: {
      on: {
        INCREMENT: {
          guard: canIncrement,
          actions: assign({ count: ({ context }) => context.count + 1 })
        }
      }
    }
  }
});
```

## 动作类型

```typescript
import { createMachine, assign, type ActionFunction } from 'xstate';

interface Context {
  items: string[];
}

type Event = { type: 'ADD_ITEM'; item: string };

// 类型安全的动作
const logItem: ActionFunction<Context, Event, Event, never, never, never, never, never, never> = ({ event }) => {
  console.log('添加项目:', event.item);
};

const machine = createMachine({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  context: { items: [] },
  initial: 'idle',
  states: {
    idle: {
      on: {
        ADD_ITEM: {
          actions: [
            logItem,
            assign({
              items: ({ context, event }) => [...context.items, event.item]
            })
          ]
        }
      }
    }
  }
});
```

## Actor 类型

### 子 Actor 类型

```typescript
import { createMachine, createActor, type ActorRefFrom } from 'xstate';

const childMachine = createMachine({
  types: {
    context: {} as { value: number }
  },
  context: { value: 0 },
  initial: 'idle',
  states: {
    idle: {}
  }
});

// 获取 Actor 引用类型
type ChildActorRef = ActorRefFrom<typeof childMachine>;

interface ParentContext {
  childRef: ChildActorRef | null;
}

const parentMachine = createMachine({
  types: {
    context: {} as ParentContext
  },
  context: { childRef: null },
  initial: 'active',
  states: {
    active: {
      invoke: {
        id: 'child',
        src: childMachine
      }
    }
  }
});
```

### 从状态机推断类型

```typescript
import { createMachine, type SnapshotFrom, type EventFrom, type ContextFrom } from 'xstate';

const machine = createMachine({
  types: {
    context: {} as { count: number },
    events: {} as { type: 'INCREMENT' } | { type: 'DECREMENT' }
  },
  context: { count: 0 },
  initial: 'idle',
  states: { idle: {} }
});

// 从状态机推断类型
type MachineSnapshot = SnapshotFrom<typeof machine>;
type MachineEvent = EventFrom<typeof machine>;
type MachineContext = ContextFrom<typeof machine>;

// 使用推断的类型
function handleSnapshot(snapshot: MachineSnapshot) {
  console.log('状态:', snapshot.value);
  console.log('计数:', snapshot.context.count);
}

function sendEvent(send: (event: MachineEvent) => void) {
  send({ type: 'INCREMENT' });
}
```

## 服务类型

```typescript
import { createMachine, fromPromise } from 'xstate';

interface User {
  id: string;
  name: string;
  email: string;
}

interface FetchUserInput {
  userId: string;
}

// 定义类型安全的服务
const fetchUser = fromPromise<User, FetchUserInput>(async ({ input }) => {
  const response = await fetch(`/api/users/${input.userId}`);
  return response.json();
});

const userMachine = createMachine({
  types: {
    context: {} as { user: User | null; error: Error | null }
  },
  context: { user: null, error: null },
  initial: 'loading',
  states: {
    loading: {
      invoke: {
        src: fetchUser,
        input: { userId: '123' },
        onDone: {
          target: 'success',
          actions: assign({
            user: ({ event }) => event.output // User 类型
          })
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error
          })
        }
      }
    },
    success: {},
    error: {}
  }
});
```

## 状态值类型

```typescript
import { createMachine, type StateValue } from 'xstate';

const machine = createMachine({
  initial: 'idle',
  states: {
    idle: {},
    active: {
      initial: 'loading',
      states: {
        loading: {},
        ready: {}
      }
    }
  }
});

// 定义状态值类型
type MachineStateValue = 
  | 'idle'
  | { active: 'loading' }
  | { active: 'ready' };

function handleState(value: MachineStateValue) {
  if (value === 'idle') {
    // ...
  } else if ('active' in value) {
    // ...
  }
}
```

## 泛型状态机

```typescript
// 创建可复用的泛型状态机
function createFetchMachine<T>() {
  return createMachine({
    types: {
      context: {} as {
        data: T | null;
        error: Error | null;
      },
      events: {} as 
        | { type: 'FETCH' }
        | { type: 'SUCCESS'; data: T }
        | { type: 'ERROR'; error: Error }
        | { type: 'RETRY' }
    },
    context: {
      data: null,
      error: null
    },
    initial: 'idle',
    states: {
      idle: {
        on: { FETCH: 'loading' }
      },
      loading: {
        on: {
          SUCCESS: {
            target: 'success',
            actions: assign({
              data: ({ event }) => event.data
            })
          },
          ERROR: {
            target: 'error',
            actions: assign({
              error: ({ event }) => event.error
            })
          }
        }
      },
      success: {},
      error: {
        on: { RETRY: 'loading' }
      }
    }
  });
}

// 使用
interface User {
  id: string;
  name: string;
}

const userFetchMachine = createFetchMachine<User>();
const productFetchMachine = createFetchMachine<Product>();
```

## React 集成类型

```typescript
import { useMachine, useActor, useSelector } from '@xstate/react';
import { createMachine, createActor, type SnapshotFrom } from 'xstate';

const machine = createMachine({
  types: {
    context: {} as { count: number },
    events: {} as { type: 'INCREMENT' } | { type: 'DECREMENT' }
  },
  context: { count: 0 },
  initial: 'idle',
  states: { idle: {} }
});

// useMachine 自动推断类型
function Counter() {
  const [snapshot, send] = useMachine(machine);
  
  // snapshot.context.count 是 number
  // send({ type: 'INCREMENT' }) 类型检查
  
  return (
    <button onClick={() => send({ type: 'INCREMENT' })}>
      {snapshot.context.count}
    </button>
  );
}

// useSelector 类型安全
const actor = createActor(machine);

function CountDisplay() {
  // 类型推断: number
  const count = useSelector(actor, (snapshot) => snapshot.context.count);
  
  return <div>{count}</div>;
}
```

## 类型工具

### 提取状态机类型

```typescript
import { 
  type EventFromLogic,
  type ContextFrom,
  type SnapshotFrom,
  type ActorRefFrom
} from 'xstate';

const machine = createMachine({
  // ... 配置
});

// 提取类型
type Events = EventFromLogic<typeof machine>;
type Context = ContextFrom<typeof machine>;
type Snapshot = SnapshotFrom<typeof machine>;
type ActorRef = ActorRefFrom<typeof machine>;
```

### 创建类型安全的工厂函数

```typescript
import { createMachine, type MachineConfig } from 'xstate';

function createTypedMachine<
  TContext extends object,
  TEvent extends { type: string }
>(config: MachineConfig<TContext, TEvent>) {
  return createMachine({
    types: {
      context: {} as TContext,
      events: {} as TEvent
    },
    ...config
  });
}

// 使用
const machine = createTypedMachine<
  { count: number },
  { type: 'INCREMENT' } | { type: 'DECREMENT' }
>({
  context: { count: 0 },
  initial: 'idle',
  states: { idle: {} }
});
```

## 常见类型错误及解决

### 1. 事件类型不匹配

```typescript
// ❌ 错误
actor.send({ type: 'UNKNOWN_EVENT' });

// ✅ 正确
actor.send({ type: 'INCREMENT' });
```

### 2. 上下文属性不存在

```typescript
// ❌ 错误
assign({ unknownProp: 'value' })

// ✅ 正确
assign({ count: ({ context }) => context.count + 1 })
```

### 3. 守卫返回值类型

```typescript
// ❌ 错误
guard: ({ context }) => context.count  // 返回 number

// ✅ 正确
guard: ({ context }) => context.count > 0  // 返回 boolean
```

## 最佳实践

### 1. 使用 types 定义所有类型

```typescript
const machine = createMachine({
  types: {
    context: {} as Context,
    events: {} as Event,
    input: {} as Input,
    output: {} as Output
  },
  // ...
});
```

### 2. 导出推断的类型

```typescript
// machine.ts
export const machine = createMachine({ /* ... */ });
export type MachineSnapshot = SnapshotFrom<typeof machine>;
export type MachineEvent = EventFrom<typeof machine>;
```

### 3. 使用严格的 TypeScript 配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitAny": true
  }
}
```

## 下一步

恭喜！你已经完成了 XState 完整教程的学习。现在可以：

- 查看 [项目案例](./14-project-overview.md) 实践所学知识
- 访问 [Stately Studio](https://stately.ai/studio) 创建可视化状态机
- 阅读 [官方文档](https://stately.ai/docs) 了解更多高级特性
