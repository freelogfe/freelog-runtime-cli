# 04. 事件与转换

事件是状态机中触发状态转换的输入，转换定义了状态如何响应事件。

## 事件类型

### 简单事件

只包含 `type` 属性：

```typescript
{ type: 'START' }
{ type: 'STOP' }
{ type: 'RESET' }
```

### 带数据的事件

包含额外的数据：

```typescript
{ type: 'UPDATE', value: 42 }
{ type: 'LOGIN', username: 'user', password: 'pass' }
{ type: 'ADD_ITEM', item: { id: 1, name: 'Item' } }
```

### 事件对象结构

```typescript
interface Event {
  type: string;
  [key: string]: any;
}
```

## 发送事件

### 基本用法

```typescript
import { createActor } from 'xstate';

const actor = createActor(machine);
actor.start();

// 发送简单事件
actor.send({ type: 'START' });

// 发送带数据的事件
actor.send({ type: 'UPDATE', value: 100 });
```

### 批量发送事件

```typescript
// 方式1: 连续发送
actor.send({ type: 'EVENT1' });
actor.send({ type: 'EVENT2' });
actor.send({ type: 'EVENT3' });

// 方式2: 使用数组（如果支持）
// 注意：XState v5 中需要逐个发送
```

## 转换类型

### 1. 外部转换 (External Transition)

默认转换类型，会退出当前状态并进入目标状态：

```typescript
states: {
  idle: {
    on: {
      START: 'active'  // 外部转换
    }
  },
  active: {}
}
```

转换流程：
1. 执行 `idle` 的 `exit` 动作
2. 执行转换的 `actions`
3. 执行 `active` 的 `entry` 动作

### 2. 内部转换 (Internal Transition)

不退出当前状态，只执行动作：

```typescript
states: {
  counting: {
    on: {
      INCREMENT: {
        target: '.',  // '.' 表示当前状态
        actions: assign({ count: ({ context }) => context.count + 1 })
      }
    }
  }
}
```

或者使用 `internal: true`：

```typescript
on: {
  INCREMENT: {
    target: 'counting',
    internal: true,  // 内部转换
    actions: assign({ count: ({ context }) => context.count + 1 })
  }
}
```

转换流程：
1. 不执行 `exit` 动作
2. 执行转换的 `actions`
3. 不执行 `entry` 动作

### 3. 自转换 (Self Transition)

转换到自身：

```typescript
states: {
  idle: {
    on: {
      REFRESH: 'idle'  // 自转换
    }
  }
}
```

## 转换配置

### 简单转换

```typescript
on: {
  EVENT: 'targetState'  // 最简单形式
}
```

### 对象转换

```typescript
on: {
  EVENT: {
    target: 'targetState',
    guard: 'condition',      // 守卫条件
    actions: 'doSomething',  // 动作
    description: '转换描述'  // 描述（用于文档）
  }
}
```

### 转换数组

多个可能的转换，按顺序检查：

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
    'defaultState'  // 默认转换（无守卫）
  ]
}
```

## 守卫 (Guards)

守卫决定转换是否应该执行：

### 内联守卫

```typescript
on: {
  INCREMENT: {
    target: 'counting',
    guard: ({ context }) => context.count < 100
  }
}
```

### 命名守卫

```typescript
import { createMachine } from 'xstate';

const machine = createMachine({
  // ... 其他配置
  guards: {
    canIncrement: ({ context }) => context.count < 100,
    hasPermission: ({ context, event }) => {
      return context.user?.permissions?.includes(event.permission);
    }
  },
  states: {
    counting: {
      on: {
        INCREMENT: {
          guard: 'canIncrement',  // 使用命名守卫
          actions: assign({ count: ({ context }) => context.count + 1 })
        }
      }
    }
  }
});
```

### 守卫类型

```typescript
type Guard = (params: {
  context: Context;
  event: Event;
  guard: GuardMeta;
}) => boolean;
```

### 守卫示例

```typescript
const machine = createMachine({
  context: {
    count: 0,
    maxCount: 100,
    user: { role: 'admin' }
  },
  guards: {
    // 简单条件
    canIncrement: ({ context }) => context.count < context.maxCount,
    
    // 基于事件
    isValidInput: ({ event }) => event.value > 0,
    
    // 组合条件
    canDelete: ({ context, event }) => {
      return context.user.role === 'admin' && event.itemId;
    },
    
    // 异步守卫（需要配合服务）
    isAuthenticated: ({ context }) => {
      return !!context.token;
    }
  },
  states: {
    idle: {
      on: {
        INCREMENT: [
          {
            target: 'maxReached',
            guard: 'canIncrement'
          },
          {
            target: 'idle',
            guard: ({ context }) => context.count >= context.maxCount
          }
        ]
      }
    }
  }
});
```

## 动作 (Actions)

动作是在转换时执行的副作用：

### 内联动作

```typescript
on: {
  START: {
    target: 'active',
    actions: ({ context, event }) => {
      console.log('开始');
    }
  }
}
```

### 命名动作

```typescript
const machine = createMachine({
  actions: {
    logStart: ({ context, event }) => {
      console.log('开始:', event);
    },
    updateCount: assign({
      count: ({ context }) => context.count + 1
    }),
    sendAnalytics: ({ event }) => {
      analytics.track('event', event.type);
    }
  },
  states: {
    idle: {
      on: {
        START: {
          target: 'active',
          actions: ['logStart', 'updateCount', 'sendAnalytics']
        }
      }
    }
  }
});
```

### 动作类型

#### 1. 赋值动作 (assign)

更新上下文：

```typescript
import { assign } from 'xstate';

on: {
  UPDATE: {
    actions: assign({
      // 方式1: 直接赋值
      count: 10,
      
      // 方式2: 函数
      count: ({ context }) => context.count + 1,
      
      // 方式3: 使用事件数据
      count: ({ event }) => event.value
    })
  }
}
```

#### 2. 发送动作 (sendTo)

向其他 Actor 发送事件：

```typescript
import { sendTo } from 'xstate';

actions: sendTo('childActor', { type: 'START' })
```

#### 3. 延迟动作 (delay)

延迟执行：

```typescript
import { delay } from 'xstate';

actions: delay(1000)  // 延迟 1 秒
```

#### 4. 自定义动作

```typescript
actions: ({ context, event }) => {
  // 任何副作用
  localStorage.setItem('state', JSON.stringify(context));
  fetch('/api/update', { method: 'POST', body: JSON.stringify(event) });
}
```

### 动作执行顺序

```typescript
on: {
  EVENT: {
    target: 'targetState',
    actions: [
      'action1',  // 1. 先执行
      'action2',  // 2. 再执行
      ({ context }) => { /* action3 */ }  // 3. 最后执行
    ]
  }
}
```

## 转换元数据

转换可以包含元数据：

```typescript
on: {
  EVENT: {
    target: 'targetState',
    guard: 'condition',
    actions: 'doSomething',
    description: '当条件满足时转换到目标状态',
    meta: {
      label: '转换标签',
      documentation: '详细文档'
    }
  }
}
```

## 完整示例：登录流程

```typescript
import { createMachine, assign } from 'xstate';

const loginMachine = createMachine({
  id: 'login',
  initial: 'idle',
  context: {
    username: '',
    password: '',
    error: null,
    token: null
  },
  guards: {
    isValidInput: ({ context }) => {
      return context.username.length > 0 && context.password.length > 0;
    },
    isAuthenticated: ({ context }) => {
      return !!context.token;
    }
  },
  actions: {
    clearError: assign({ error: null }),
    setError: assign({
      error: ({ event }) => event.error
    }),
    setCredentials: assign({
      username: ({ event }) => event.username,
      password: ({ event }) => event.password
    }),
    setToken: assign({
      token: ({ event }) => event.token
    }),
    logSuccess: ({ context }) => {
      console.log('登录成功:', context.username);
    }
  },
  states: {
    idle: {
      on: {
        INPUT: {
          actions: 'setCredentials'
        },
        SUBMIT: [
          {
            target: 'validating',
            guard: 'isValidInput',
            actions: 'clearError'
          },
          {
            target: 'idle',
            actions: assign({
              error: '请输入用户名和密码'
            })
          }
        ]
      }
    },
    validating: {
      entry: ({ context }) => {
        console.log('验证中...');
      },
      on: {
        VALIDATION_SUCCESS: {
          target: 'authenticating',
          actions: 'clearError'
        },
        VALIDATION_ERROR: {
          target: 'idle',
          actions: 'setError'
        }
      }
    },
    authenticating: {
      entry: ({ context }) => {
        console.log('认证中...');
      },
      on: {
        AUTH_SUCCESS: {
          target: 'authenticated',
          actions: ['setToken', 'logSuccess']
        },
        AUTH_ERROR: {
          target: 'idle',
          actions: 'setError'
        }
      }
    },
    authenticated: {
      type: 'final',
      entry: ({ context }) => {
        console.log('已认证，token:', context.token);
      }
    }
  }
});
```

## 事件匹配

### 精确匹配

```typescript
on: {
  EVENT_TYPE: 'targetState'  // 只匹配 type === 'EVENT_TYPE'
}
```

### 通配符匹配

```typescript
on: {
  '*': 'targetState'  // 匹配所有事件
}
```

### 条件匹配

```typescript
on: {
  EVENT: {
    guard: ({ event }) => event.value > 0,
    target: 'targetState'
  }
}
```

## 最佳实践

### 1. 使用命名事件类型

```typescript
// ✅ 好的
{ type: 'USER_LOGIN' }
{ type: 'USER_LOGOUT' }

// ❌ 避免
{ type: 'login' }
{ type: 'logout' }
```

### 2. 事件数据应该是不变的

```typescript
// ✅ 好的
actor.send({ type: 'UPDATE', value: 42 });

// ❌ 避免
const event = { type: 'UPDATE', value: 42 };
event.value = 100;  // 不要修改事件
actor.send(event);
```

### 3. 使用守卫而不是在动作中判断

```typescript
// ✅ 好的
on: {
  INCREMENT: {
    guard: ({ context }) => context.count < 100,
    actions: assign({ count: ({ context }) => context.count + 1 })
  }
}

// ❌ 避免
on: {
  INCREMENT: {
    actions: ({ context }) => {
      if (context.count < 100) {
        context.count++;  // 副作用，难以追踪
      }
    }
  }
}
```

## 下一步

[👉 05. Actor 模型](./05-actors.md)
