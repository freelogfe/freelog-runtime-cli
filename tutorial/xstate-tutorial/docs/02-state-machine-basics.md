# 02. 状态机基础

## 状态机的组成部分

一个完整的 XState 状态机包含以下部分：

```typescript
import { createMachine } from 'xstate';

const machine = createMachine({
  // 1. 状态机 ID（可选，用于调试）
  id: 'myMachine',
  
  // 2. 初始状态
  initial: 'idle',
  
  // 3. 上下文数据（可选）
  context: {
    count: 0,
    user: null,
  },
  
  // 4. 状态定义
  states: {
    idle: {
      // 状态配置
    },
    active: {
      // 状态配置
    }
  }
});
```

## 状态定义

### 基本状态

最简单的状态定义：

```typescript
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: {},  // 空状态，无法转换
    active: {} // 空状态，无法转换
  }
});
```

### 带事件的状态

状态可以响应事件并转换到其他状态：

```typescript
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: {
        START: 'active'  // 收到 START 事件，转换到 active
      }
    },
    active: {
      on: {
        STOP: 'idle'     // 收到 STOP 事件，转换到 idle
      }
    }
  }
});
```

### 多个事件处理

一个状态可以响应多个事件：

```typescript
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: {
        START: 'active',
        RESET: 'idle',      // 可以转换到自己
        ERROR: 'error'
      }
    },
    active: {
      on: {
        PAUSE: 'paused',
        STOP: 'idle',
        ERROR: 'error'
      }
    },
    paused: {
      on: {
        RESUME: 'active',
        STOP: 'idle'
      }
    },
    error: {
      on: {
        RETRY: 'idle',
        RESET: 'idle'
      }
    }
  }
});
```

## 事件

### 事件类型

事件是一个对象，必须包含 `type` 属性：

```typescript
// 简单事件
{ type: 'START' }

// 带数据的事件
{ type: 'UPDATE', value: 42 }
{ type: 'LOGIN', username: 'user', password: 'pass' }
```

### 发送事件

```typescript
import { createActor } from 'xstate';

const actor = createActor(machine);
actor.start();

// 发送简单事件
actor.send({ type: 'START' });

// 发送带数据的事件
actor.send({ type: 'UPDATE', value: 100 });
```

### 事件对象结构

```typescript
interface Event {
  type: string;        // 必需：事件类型
  [key: string]: any;  // 可选：其他数据
}
```

## 上下文 (Context)

上下文用于存储状态机的数据：

### 定义上下文

```typescript
const counterMachine = createMachine({
  initial: 'idle',
  context: {
    count: 0,
    step: 1,
    maxCount: 100
  },
  states: {
    idle: {
      on: {
        INCREMENT: {
          actions: assign({
            count: ({ context }) => context.count + context.step
          })
        }
      }
    }
  }
});
```

### 访问上下文

```typescript
import { assign } from 'xstate';

const machine = createMachine({
  context: {
    count: 0
  },
  states: {
    counting: {
      on: {
        INCREMENT: {
          // 方式1: 使用函数
          actions: assign({
            count: ({ context }) => context.count + 1
          }),
          
          // 方式2: 使用对象
          actions: assign({
            count: ({ context }) => context.count + 1,
            step: 2
          }),
          
          // 方式3: 使用函数返回整个上下文
          actions: assign(({ context, event }) => ({
            ...context,
            count: context.count + (event.step || 1)
          }))
        }
      }
    }
  }
});
```

### 获取上下文快照

```typescript
const actor = createActor(machine);
actor.start();

const snapshot = actor.getSnapshot();
console.log(snapshot.context); // { count: 0, step: 1, maxCount: 100 }
```

## 转换 (Transitions)

转换定义了状态如何响应事件：

### 简单转换

```typescript
states: {
  idle: {
    on: {
      START: 'active'  // 简单转换：事件 -> 目标状态
    }
  }
}
```

### 条件转换（使用守卫）

```typescript
import { createMachine } from 'xstate';

const machine = createMachine({
  context: { count: 0 },
  initial: 'idle',
  states: {
    idle: {
      on: {
        INCREMENT: [
          {
            target: 'maxReached',
            guard: ({ context }) => context.count >= 100
          },
          {
            target: 'counting',
            guard: ({ context }) => context.count < 100
          }
        ]
      }
    },
    counting: {
      on: {
        INCREMENT: {
          actions: assign({ count: ({ context }) => context.count + 1 })
        }
      }
    },
    maxReached: {}
  }
});
```

### 转换数组

当多个转换可能匹配时，按顺序检查：

```typescript
on: {
  EVENT: [
    {
      target: 'state1',
      guard: 'condition1'  // 先检查这个
    },
    {
      target: 'state2',
      guard: 'condition2'  // 再检查这个
    },
    'defaultState'  // 默认转换
  ]
}
```

## 动作 (Actions)

动作是在状态转换时执行的副作用：

### 进入动作 (entry)

进入状态时执行：

```typescript
states: {
  active: {
    entry: ({ context, event }) => {
      console.log('进入 active 状态');
      console.log('上下文:', context);
    }
  }
}
```

### 退出动作 (exit)

离开状态时执行：

```typescript
states: {
  active: {
    exit: ({ context, event }) => {
      console.log('离开 active 状态');
      // 清理工作
    }
  }
}
```

### 转换动作

在转换时执行：

```typescript
states: {
  idle: {
    on: {
      START: {
        target: 'active',
        actions: ({ context, event }) => {
          console.log('开始转换');
        }
      }
    }
  }
}
```

### 动作数组

可以执行多个动作：

```typescript
on: {
  START: {
    target: 'active',
    actions: [
      ({ context }) => console.log('动作1'),
      ({ context }) => console.log('动作2'),
      assign({ count: ({ context }) => context.count + 1 })
    ]
  }
}
```

## 完整示例：计数器状态机

```typescript
import { createMachine, createActor, assign } from 'xstate';

const counterMachine = createMachine({
  id: 'counter',
  initial: 'idle',
  context: {
    count: 0,
    step: 1
  },
  states: {
    idle: {
      entry: () => console.log('计数器就绪'),
      on: {
        START: {
          target: 'counting',
          actions: () => console.log('开始计数')
        },
        RESET: {
          actions: assign({ count: 0 })
        }
      }
    },
    counting: {
      entry: ({ context }) => {
        console.log(`当前计数: ${context.count}`);
      },
      on: {
        INCREMENT: {
          actions: [
            assign({
              count: ({ context }) => context.count + context.step
            }),
            ({ context }) => console.log(`计数增加到: ${context.count}`)
          ]
        },
        DECREMENT: {
          guard: ({ context }) => context.count > 0,
          actions: assign({
            count: ({ context }) => context.count - context.step
          })
        },
        SET_STEP: {
          actions: assign({
            step: ({ event }) => event.step
          })
        },
        STOP: {
          target: 'idle',
          actions: () => console.log('停止计数')
        },
        RESET: {
          target: 'idle',
          actions: assign({ count: 0 })
        }
      },
      exit: () => console.log('离开计数状态')
    }
  }
});

// 使用
const counterActor = createActor(counterMachine);
counterActor.start();

// 订阅状态变化
counterActor.subscribe((snapshot) => {
  console.log('状态:', snapshot.value);
  console.log('计数:', snapshot.context.count);
});

// 发送事件
counterActor.send({ type: 'START' });
counterActor.send({ type: 'INCREMENT' });
counterActor.send({ type: 'INCREMENT' });
counterActor.send({ type: 'SET_STEP', step: 5 });
counterActor.send({ type: 'INCREMENT' });
counterActor.send({ type: 'STOP' });
```

## 状态快照

快照（Snapshot）包含状态机的当前状态：

```typescript
const snapshot = actor.getSnapshot();

// 快照属性
snapshot.value;        // 当前状态值
snapshot.context;     // 上下文数据
snapshot.status;       // 'active' | 'done' | 'error' | 'stopped'
snapshot.output;       // 输出值（如果状态机已完成）
snapshot.error;        // 错误（如果有）
snapshot.historyValue; // 历史状态值
```

## 类型安全

使用 TypeScript 可以获得完整的类型推断：

```typescript
import { createMachine, createActor } from 'xstate';

// 定义上下文类型
interface CounterContext {
  count: number;
  step: number;
}

// 定义事件类型
type CounterEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'INCREMENT' }
  | { type: 'DECREMENT' }
  | { type: 'SET_STEP'; step: number };

const counterMachine = createMachine({
  types: {
    context: {} as CounterContext,
    events: {} as CounterEvent
  },
  context: {
    count: 0,
    step: 1
  },
  // ... 状态定义
});

// TypeScript 会推断类型
const actor = createActor(counterMachine);
actor.send({ type: 'SET_STEP', step: 5 }); // ✅ 类型正确
actor.send({ type: 'SET_STEP' }); // ❌ 类型错误：缺少 step
```

## 下一步

[👉 03. 状态图 (Statecharts)](./03-statecharts.md)
