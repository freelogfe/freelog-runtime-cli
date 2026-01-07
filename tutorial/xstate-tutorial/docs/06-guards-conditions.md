# 06. 守卫与条件

守卫（Guards）是决定转换是否应该执行的条件函数。它们提供了一种声明式的方式来控制状态转换。

## 什么是守卫？

守卫是一个返回布尔值的函数，用于决定转换是否应该执行：

```typescript
type Guard = (params: {
  context: Context;
  event: Event;
  guard: GuardMeta;
}) => boolean;
```

如果守卫返回 `true`，转换执行；返回 `false`，转换被跳过。

## 内联守卫

最简单的守卫是直接在转换中定义：

```typescript
const machine = createMachine({
  context: { count: 0 },
  states: {
    counting: {
      on: {
        INCREMENT: {
          guard: ({ context }) => context.count < 100,  // 内联守卫
          actions: assign({ count: ({ context }) => context.count + 1 })
        }
      }
    }
  }
});
```

## 命名守卫

命名守卫在状态机的 `guards` 选项中定义，可以在多个地方复用：

```typescript
const machine = createMachine({
  context: { count: 0, maxCount: 100 },
  guards: {
    // 命名守卫
    canIncrement: ({ context }) => context.count < context.maxCount,
    canDecrement: ({ context }) => context.count > 0,
    isEven: ({ context }) => context.count % 2 === 0
  },
  states: {
    counting: {
      on: {
        INCREMENT: {
          guard: 'canIncrement',  // 使用命名守卫
          actions: assign({ count: ({ context }) => context.count + 1 })
        },
        DECREMENT: {
          guard: 'canDecrement',
          actions: assign({ count: ({ context }) => context.count - 1 })
        }
      }
    }
  }
});
```

## 守卫参数

守卫可以访问：

- `context`: 当前上下文
- `event`: 触发转换的事件
- `guard`: 守卫元数据

```typescript
guards: {
  isValidInput: ({ context, event }) => {
    return event.value !== undefined && event.value > 0;
  },
  hasPermission: ({ context, event }) => {
    return context.user?.permissions?.includes(event.permission);
  },
  isOwner: ({ context, event }) => {
    return context.user?.id === event.item?.ownerId;
  }
}
```

## 多个守卫

一个转换可以有多个守卫，使用数组：

```typescript
on: {
  ACTION: {
    guard: [
      'canIncrement',
      'isValidInput',
      ({ context }) => context.enabled === true
    ],
    actions: 'increment'
  }
}
```

所有守卫都必须返回 `true` 才能执行转换。

## 条件转换

使用守卫实现条件转换：

```typescript
const machine = createMachine({
  context: { count: 0 },
  guards: {
    isMax: ({ context }) => context.count >= 100,
    isMin: ({ context }) => context.count <= 0
  },
  states: {
    counting: {
      on: {
        INCREMENT: [
          {
            target: 'maxReached',
            guard: 'isMax'
          },
          {
            target: '.',  // 保持在当前状态
            guard: ({ context }) => context.count < 100,
            actions: assign({ count: ({ context }) => context.count + 1 })
          }
        ],
        DECREMENT: [
          {
            target: 'minReached',
            guard: 'isMin'
          },
          {
            target: '.',
            guard: ({ context }) => context.count > 0,
            actions: assign({ count: ({ context }) => context.count - 1 })
          }
        ]
      }
    },
    maxReached: {
      on: {
        DECREMENT: 'counting'
      }
    },
    minReached: {
      on: {
        INCREMENT: 'counting'
      }
    }
  }
});
```

## 守卫组合

### 逻辑 AND

```typescript
on: {
  ACTION: {
    guard: [
      'condition1',
      'condition2',
      'condition3'
    ]
  }
}
```

### 逻辑 OR

使用多个转换：

```typescript
on: {
  ACTION: [
    {
      guard: 'condition1',
      target: 'state1'
    },
    {
      guard: 'condition2',
      target: 'state2'
    }
  ]
}
```

### 自定义组合函数

```typescript
guards: {
  and: (...guards) => (params) => {
    return guards.every(guard => guard(params));
  },
  or: (...guards) => (params) => {
    return guards.some(guard => guard(params));
  }
}
```

## 实际案例

### 1. 表单验证

```typescript
const formMachine = createMachine({
  context: {
    email: '',
    password: '',
    errors: {}
  },
  guards: {
    isEmailValid: ({ context }) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(context.email);
    },
    isPasswordValid: ({ context }) => {
      return context.password.length >= 8;
    },
    isFormValid: ({ context }) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(context.email) && context.password.length >= 8;
    }
  },
  states: {
    idle: {
      on: {
        SUBMIT: [
          {
            target: 'validating',
            guard: 'isFormValid'
          },
          {
            target: 'idle',
            actions: assign({
              errors: ({ context }) => ({
                email: context.email ? null : 'Email is required',
                password: context.password.length < 8 ? 'Password must be at least 8 characters' : null
              })
            })
          }
        ]
      }
    },
    validating: {
      // ...
    }
  }
});
```

### 2. 权限控制

```typescript
const machine = createMachine({
  context: {
    user: {
      role: 'user',
      permissions: ['read']
    }
  },
  guards: {
    isAdmin: ({ context }) => context.user.role === 'admin',
    canEdit: ({ context }) => context.user.permissions.includes('edit'),
    canDelete: ({ context }) => context.user.permissions.includes('delete'),
    isOwner: ({ context, event }) => {
      return context.user.id === event.item?.ownerId;
    }
  },
  states: {
    viewing: {
      on: {
        EDIT: [
          {
            target: 'editing',
            guard: 'canEdit'
          },
          {
            target: 'viewing',
            actions: () => alert('没有编辑权限')
          }
        ],
        DELETE: [
          {
            target: 'deleting',
            guard: ['canDelete', 'isOwner']
          },
          {
            target: 'viewing',
            actions: () => alert('没有删除权限')
          }
        ]
      }
    }
  }
});
```

### 3. 资源限制

```typescript
const machine = createMachine({
  context: {
    items: [],
    maxItems: 10,
    currentSize: 0,
    maxSize: 1000  // MB
  },
  guards: {
    canAddItem: ({ context, event }) => {
      const itemSize = event.item?.size || 0;
      return context.items.length < context.maxItems &&
             context.currentSize + itemSize <= context.maxSize;
    },
    hasSpace: ({ context, event }) => {
      return context.currentSize + event.item?.size <= context.maxSize;
    },
    underItemLimit: ({ context }) => {
      return context.items.length < context.maxItems;
    }
  },
  states: {
    idle: {
      on: {
        ADD_ITEM: [
          {
            target: 'adding',
            guard: 'canAddItem',
            actions: assign({
              items: ({ context, event }) => [...context.items, event.item],
              currentSize: ({ context, event }) => context.currentSize + event.item.size
            })
          },
          {
            target: 'idle',
            actions: ({ context, event }) => {
              if (context.items.length >= context.maxItems) {
                alert('已达到最大项目数');
              } else {
                alert('空间不足');
              }
            }
          }
        ]
      }
    }
  }
});
```

## 守卫与性能

### 避免复杂计算

```typescript
// ❌ 避免：每次转换都执行复杂计算
guard: ({ context }) => {
  return expensiveCalculation(context.data);
}

// ✅ 好的：缓存结果
context: {
  cachedResult: null
},
guards: {
  isValid: ({ context }) => {
    if (context.cachedResult === null) {
      context.cachedResult = expensiveCalculation(context.data);
    }
    return context.cachedResult;
  }
}
```

### 提前返回

```typescript
guards: {
  isValid: ({ context, event }) => {
    // 快速检查
    if (!event.value) return false;
    if (event.value < 0) return false;
    
    // 复杂检查
    return complexValidation(event.value);
  }
}
```

## 测试守卫

```typescript
import { createMachine, createActor } from 'xstate';

const machine = createMachine({
  guards: {
    canIncrement: ({ context }) => context.count < 100
  },
  // ...
});

// 测试守卫
const actor = createActor(machine, {
  input: { initialCount: 99 }
});
actor.start();

// 测试可以执行
const snapshot = actor.getSnapshot();
expect(snapshot.can({ type: 'INCREMENT' })).toBe(true);

// 测试不能执行
actor.send({ type: 'INCREMENT' });
const newSnapshot = actor.getSnapshot();
expect(newSnapshot.can({ type: 'INCREMENT' })).toBe(false);
```

## 最佳实践

### 1. 使用命名守卫提高可读性

```typescript
// ✅ 好的
guard: 'canIncrement'

// ❌ 避免：复杂的内联守卫
guard: ({ context }) => context.count < context.maxCount && context.enabled && !context.paused
```

### 2. 守卫应该是纯函数

```typescript
// ✅ 好的：纯函数
guard: ({ context }) => context.count < 100

// ❌ 避免：副作用
guard: ({ context }) => {
  console.log('检查中...');  // 副作用
  return context.count < 100;
}
```

### 3. 使用描述性的守卫名称

```typescript
// ✅ 好的
guards: {
  canIncrement: ...,
  hasPermission: ...,
  isFormValid: ...
}

// ❌ 避免
guards: {
  check1: ...,
  guard: ...,
  condition: ...
}
```

## 下一步

[👉 07. 动作与副作用](./07-actions-effects.md)
