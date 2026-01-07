# 05. Actor 模型

Actor 模型是 XState v5 的核心概念。Actor 是一个独立的计算单元，有自己的状态和行为，通过消息与其他 Actor 通信。

## 什么是 Actor？

Actor 是状态机的运行时实例：

```typescript
import { createMachine, createActor } from 'xstate';

// 1. 定义状态机
const machine = createMachine({
  // ... 状态机配置
});

// 2. 创建 Actor
const actor = createActor(machine);

// 3. 启动 Actor
actor.start();

// 4. 发送消息
actor.send({ type: 'EVENT' });

// 5. 获取状态
const snapshot = actor.getSnapshot();
```

## Actor 生命周期

```
创建 → 启动 → 运行 → 停止
       ↓
    订阅状态变化
       ↓
    发送/接收消息
```

### 创建 Actor

```typescript
const actor = createActor(machine, {
  input: { initialValue: 0 },  // 输入参数
  id: 'myActor'                // Actor ID
});
```

### 启动 Actor

```typescript
actor.start();
```

启动后：
- 进入初始状态
- 执行初始状态的 `entry` 动作
- 开始接收事件

### 停止 Actor

```typescript
actor.stop();
```

停止后：
- 执行当前状态的 `exit` 动作
- 不再接收事件
- 清理资源

### 重置 Actor

```typescript
actor.stop();
actor.start();  // 重新启动，回到初始状态
```

## Actor 快照 (Snapshot)

快照是 Actor 在某个时间点的状态：

```typescript
const snapshot = actor.getSnapshot();

// 快照属性
snapshot.value;        // 当前状态值
snapshot.context;      // 上下文数据
snapshot.status;       // 'active' | 'done' | 'error' | 'stopped'
snapshot.output;       // 输出值（如果已完成）
snapshot.error;        // 错误（如果有）
snapshot.historyValue; // 历史状态值
snapshot.can;          // 可以执行的操作
snapshot.matches;      // 状态匹配函数
```

### 状态匹配

```typescript
const snapshot = actor.getSnapshot();

// 检查是否在某个状态
snapshot.matches('idle');                    // true/false
snapshot.matches({ active: 'loading' });     // true/false

// 检查可以执行的操作
snapshot.can({ type: 'START' });             // true/false
```

## 订阅状态变化

### 基本订阅

```typescript
const subscription = actor.subscribe((snapshot) => {
  console.log('状态:', snapshot.value);
  console.log('上下文:', snapshot.context);
});

// 取消订阅
subscription.unsubscribe();
```

### React 集成示例

```typescript
import { useEffect, useState } from 'react';
import { useActor } from '@xstate/react';

function MyComponent() {
  const [snapshot, send] = useActor(actor);
  
  return (
    <div>
      <p>状态: {snapshot.value}</p>
      <button onClick={() => send({ type: 'START' })}>
        开始
      </button>
    </div>
  );
}
```

## Actor 通信

### 父子 Actor

```typescript
const parentMachine = createMachine({
  initial: 'active',
  invoke: {
    id: 'childActor',
    src: childMachine
  },
  states: {
    active: {
      on: {
        CHILD_EVENT: {
          actions: sendTo('childActor', { type: 'START' })
        }
      }
    }
  }
});
```

### 使用 sendTo

```typescript
import { sendTo } from 'xstate';

const machine = createMachine({
  invoke: {
    id: 'child',
    src: childMachine
  },
  states: {
    active: {
      on: {
        START_CHILD: {
          actions: sendTo('child', { type: 'START' })
        }
      }
    }
  }
});
```

### 接收子 Actor 事件

```typescript
const parentMachine = createMachine({
  invoke: {
    id: 'child',
    src: childMachine,
    onDone: {
      target: 'success',
      actions: ({ event }) => {
        console.log('子 Actor 完成:', event.output);
      }
    },
    onError: {
      target: 'error',
      actions: ({ event }) => {
        console.log('子 Actor 错误:', event.error);
      }
    }
  },
  states: {
    active: {
      on: {
        'child.SUCCESS': {
          actions: ({ event }) => {
            console.log('收到子 Actor 事件:', event);
          }
        }
      }
    }
  }
});
```

## Actor 引用

### 获取 Actor 引用

```typescript
const machine = createMachine({
  invoke: {
    id: 'child',
    src: childMachine
  },
  states: {
    active: {
      entry: ({ spawn }) => {
        const childRef = spawn(childMachine, { id: 'child' });
        // 使用 childRef
      }
    }
  }
});
```

### 动态创建 Actor

```typescript
const machine = createMachine({
  context: {
    children: []
  },
  states: {
    active: {
      on: {
        CREATE_CHILD: {
          actions: assign({
            children: ({ context, spawn }) => [
              ...context.children,
              spawn(childMachine, { id: `child-${Date.now()}` })
            ]
          })
        }
      }
    }
  }
});
```

## Actor 输入 (Input)

Actor 可以接收输入参数：

```typescript
const machine = createMachine({
  types: {
    input: {} as { initialCount: number }
  },
  context: ({ input }) => ({
    count: input.initialCount || 0
  }),
  // ... 其他配置
});

// 创建时传入输入
const actor = createActor(machine, {
  input: { initialCount: 10 }
});
```

## Actor 输出 (Output)

Actor 完成时可以输出结果：

```typescript
const machine = createMachine({
  // ... 配置
  states: {
    processing: {
      on: {
        COMPLETE: 'done'
      }
    },
    done: {
      type: 'final',
      output: ({ context }) => ({
        result: context.result
      })
    }
  }
});

// 获取输出
const snapshot = actor.getSnapshot();
if (snapshot.status === 'done') {
  console.log('输出:', snapshot.output);
}
```

## Actor 错误处理

### 捕获错误

```typescript
const machine = createMachine({
  states: {
    active: {
      invoke: {
        src: asyncService,
        onError: {
          target: 'error',
          actions: ({ event }) => {
            console.error('错误:', event.error);
          }
        }
      }
    },
    error: {
      on: {
        RETRY: 'active'
      }
    }
  }
});
```

### 错误状态

```typescript
const snapshot = actor.getSnapshot();

if (snapshot.status === 'error') {
  console.error('Actor 错误:', snapshot.error);
}
```

## Actor 组合

### 多个 Actor

```typescript
const machine = createMachine({
  type: 'parallel',
  states: {
    actor1: {
      invoke: {
        id: 'actor1',
        src: actor1Machine
      }
    },
    actor2: {
      invoke: {
        id: 'actor2',
        src: actor2Machine
      }
    }
  }
});
```

### Actor 协调

```typescript
const coordinatorMachine = createMachine({
  invoke: {
    id: 'worker1',
    src: workerMachine
  },
  states: {
    coordinating: {
      on: {
        'worker1.DONE': {
          actions: sendTo('worker2', { type: 'START' })
        }
      }
    }
  }
});
```

## 实际案例：任务队列

```typescript
import { createMachine, createActor, assign, sendTo } from 'xstate';

// 任务 Actor
const taskMachine = createMachine({
  types: {
    input: {} as { id: string; data: any }
  },
  context: ({ input }) => ({
    id: input.id,
    data: input.data,
    result: null,
    error: null
  }),
  initial: 'pending',
  states: {
    pending: {
      on: {
        START: 'processing'
      }
    },
    processing: {
      invoke: {
        src: async ({ context }) => {
          // 执行任务
          return await processTask(context.data);
        },
        onDone: {
          target: 'completed',
          actions: assign({
            result: ({ event }) => event.output
          })
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error
          })
        }
      }
    },
    completed: {
      type: 'final',
      output: ({ context }) => context.result
    },
    failed: {
      on: {
        RETRY: 'processing'
      }
    }
  }
});

// 队列 Actor
const queueMachine = createMachine({
  context: {
    tasks: [],
    activeTasks: []
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        ADD_TASK: {
          actions: assign({
            tasks: ({ context, event, spawn }) => [
              ...context.tasks,
              spawn(taskMachine, {
                id: event.taskId,
                input: { id: event.taskId, data: event.data }
              })
            ]
          })
        },
        START_PROCESSING: 'processing'
      }
    },
    processing: {
      entry: ({ context, self }) => {
        // 启动所有任务
        context.tasks.forEach((task) => {
          task.send({ type: 'START' });
        });
      },
      on: {
        '*.completed': {
          actions: ({ event, context }) => {
            console.log('任务完成:', event.output);
          }
        },
        '*.failed': {
          actions: ({ event }) => {
            console.error('任务失败:', event.error);
          }
        }
      }
    }
  }
});
```

## 最佳实践

### 1. 使用有意义的 Actor ID

```typescript
// ✅ 好的
spawn(childMachine, { id: 'userProfile' })

// ❌ 避免
spawn(childMachine, { id: 'child1' })
```

### 2. 及时清理 Actor

```typescript
useEffect(() => {
  const actor = createActor(machine);
  actor.start();
  
  return () => {
    actor.stop();  // 清理
  };
}, []);
```

### 3. 使用类型安全的 Actor

```typescript
const machine = createMachine({
  types: {
    context: {} as { count: number },
    events: {} as { type: 'INCREMENT' } | { type: 'DECREMENT' }
  },
  // ... 配置
});
```

## 下一步

[👉 06. 守卫与条件](./06-guards-conditions.md)
