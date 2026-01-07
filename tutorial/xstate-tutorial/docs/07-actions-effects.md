# 07. 动作与副作用

动作（Actions）是在状态转换时执行的副作用。它们用于更新上下文、调用 API、记录日志等。

## 动作类型

### 1. 进入动作 (entry)

进入状态时执行：

```typescript
states: {
  active: {
    entry: ({ context, event }) => {
      console.log('进入 active 状态');
    }
  }
}
```

### 2. 退出动作 (exit)

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

### 3. 转换动作

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

## 赋值动作 (assign)

`assign` 用于更新上下文：

### 基本用法

```typescript
import { assign } from 'xstate';

const machine = createMachine({
  context: { count: 0 },
  states: {
    counting: {
      on: {
        INCREMENT: {
          actions: assign({
            count: ({ context }) => context.count + 1
          })
        }
      }
    }
  }
});
```

### 多种赋值方式

```typescript
on: {
  UPDATE: {
    actions: assign({
      // 方式1: 直接值
      count: 10,
      
      // 方式2: 函数（推荐）
      count: ({ context }) => context.count + 1,
      
      // 方式3: 使用事件数据
      count: ({ event }) => event.value,
      
      // 方式4: 组合
      count: ({ context, event }) => context.count + (event.step || 1)
    })
  }
}
```

### 更新多个字段

```typescript
assign({
  count: ({ context }) => context.count + 1,
  step: 2,
  lastUpdated: () => Date.now()
})
```

### 使用函数返回整个上下文

```typescript
assign(({ context, event }) => ({
  ...context,
  count: context.count + 1,
  history: [...context.history, { count: context.count, timestamp: Date.now() }]
}))
```

## 命名动作

在 `actions` 选项中定义，可以在多个地方复用：

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
    },
    saveToStorage: ({ context }) => {
      localStorage.setItem('state', JSON.stringify(context));
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

## 动作执行顺序

```typescript
on: {
  EVENT: {
    target: 'targetState',
    actions: [
      'action1',      // 1. 先执行
      'action2',      // 2. 再执行
      ({ context }) => { /* action3 */ }  // 3. 最后执行
    ]
  }
}
```

执行顺序：
1. 当前状态的 `exit` 动作
2. 转换的 `actions`
3. 目标状态的 `entry` 动作

## 异步动作

### 使用 invoke

```typescript
states: {
  loading: {
    invoke: {
      src: async ({ context, event }) => {
        const data = await fetch('/api/data').then(r => r.json());
        return data;
      },
      onDone: {
        target: 'success',
        actions: assign({
          data: ({ event }) => event.output
        })
      },
      onError: {
        target: 'error',
        actions: assign({
          error: ({ event }) => event.error
        })
      }
    }
  }
}
```

### 在动作中调用异步函数

```typescript
actions: {
  asyncAction: async ({ context, event }) => {
    try {
      const result = await someAsyncOperation();
      // 注意：不能直接更新上下文，需要通过事件
    } catch (error) {
      // 错误处理
    }
  }
}
```

## 副作用动作

### 日志记录

```typescript
actions: {
  logStateChange: ({ context, event }) => {
    console.log('状态变化:', {
      event: event.type,
      context: context,
      timestamp: Date.now()
    });
  },
  logError: ({ event }) => {
    console.error('错误:', event.error);
    errorTracking.captureException(event.error);
  }
}
```

### API 调用

```typescript
actions: {
  fetchUser: ({ context, event, self }) => {
    fetch(`/api/users/${event.userId}`)
      .then(res => res.json())
      .then(user => {
        self.send({ type: 'USER_LOADED', user });
      })
      .catch(error => {
        self.send({ type: 'USER_ERROR', error });
      });
  }
}
```

### 本地存储

```typescript
actions: {
  saveToLocalStorage: ({ context }) => {
    localStorage.setItem('appState', JSON.stringify(context));
  },
  loadFromLocalStorage: assign({
    savedData: () => {
      const saved = localStorage.getItem('appState');
      return saved ? JSON.parse(saved) : null;
    }
  })
}
```

### DOM 操作

```typescript
actions: {
  focusInput: () => {
    document.getElementById('input')?.focus();
  },
  scrollToTop: () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
```

## 发送动作 (sendTo)

向其他 Actor 发送事件：

```typescript
import { sendTo } from 'xstate';

const machine = createMachine({
  invoke: {
    id: 'childActor',
    src: childMachine
  },
  states: {
    active: {
      on: {
        START_CHILD: {
          actions: sendTo('childActor', { type: 'START' })
        }
      }
    }
  }
});
```

### 带数据的发送

```typescript
sendTo('childActor', ({ context, event }) => ({
  type: 'UPDATE',
  data: context.data
}))
```

## 延迟动作 (delay)

延迟执行动作：

```typescript
import { delay } from 'xstate';

actions: [
  delay(1000),  // 延迟 1 秒
  'doSomething'
]
```

## 条件动作

根据条件执行不同动作：

```typescript
on: {
  UPDATE: {
    actions: [
      ({ context, event }) => {
        if (event.value > 100) {
          console.log('值过大');
        } else {
          console.log('值正常');
        }
      }
    ]
  }
}
```

## 实际案例

### 1. 表单提交

```typescript
const formMachine = createMachine({
  context: {
    formData: {},
    errors: {},
    submitting: false
  },
  actions: {
    validateForm: assign({
      errors: ({ context }) => {
        const errors = {};
        if (!context.formData.email) {
          errors.email = 'Email is required';
        }
        if (!context.formData.password) {
          errors.password = 'Password is required';
        }
        return errors;
      }
    }),
    submitForm: ({ context, self }) => {
      fetch('/api/submit', {
        method: 'POST',
        body: JSON.stringify(context.formData)
      })
        .then(res => res.json())
        .then(data => {
          self.send({ type: 'SUBMIT_SUCCESS', data });
        })
        .catch(error => {
          self.send({ type: 'SUBMIT_ERROR', error });
        });
    },
    logSuccess: ({ event }) => {
      console.log('提交成功:', event.data);
      analytics.track('form_submitted');
    },
    logError: ({ event }) => {
      console.error('提交失败:', event.error);
      errorTracking.captureException(event.error);
    }
  },
  states: {
    idle: {
      on: {
        SUBMIT: [
          {
            target: 'validating',
            guard: ({ context }) => Object.keys(context.errors).length === 0
          },
          {
            target: 'idle',
            actions: 'validateForm'
          }
        ]
      }
    },
    validating: {
      entry: 'validateForm',
      on: {
        VALIDATION_PASSED: 'submitting',
        VALIDATION_FAILED: 'idle'
      }
    },
    submitting: {
      entry: ['submitForm', assign({ submitting: true })],
      on: {
        SUBMIT_SUCCESS: {
          target: 'success',
          actions: 'logSuccess'
        },
        SUBMIT_ERROR: {
          target: 'error',
          actions: 'logError'
        }
      },
      exit: assign({ submitting: false })
    },
    success: {},
    error: {
      on: {
        RETRY: 'submitting'
      }
    }
  }
});
```

### 2. 定时器

```typescript
const timerMachine = createMachine({
  context: {
    elapsed: 0,
    interval: 1000
  },
  actions: {
    startTimer: ({ context, self }) => {
      const intervalId = setInterval(() => {
        self.send({ type: 'TICK' });
      }, context.interval);
      
      // 存储 intervalId 以便清理
      return () => clearInterval(intervalId);
    },
    stopTimer: ({ context }) => {
      // 清理定时器
    },
    updateElapsed: assign({
      elapsed: ({ context }) => context.elapsed + 1
    })
  },
  states: {
    idle: {
      on: {
        START: 'running'
      }
    },
    running: {
      entry: 'startTimer',
      exit: 'stopTimer',
      on: {
        TICK: {
          actions: 'updateElapsed'
        },
        STOP: 'idle',
        RESET: {
          target: 'idle',
          actions: assign({ elapsed: 0 })
        }
      }
    }
  }
});
```

### 3. 购物车

```typescript
const cartMachine = createMachine({
  context: {
    items: [],
    total: 0
  },
  actions: {
    addItem: assign({
      items: ({ context, event }) => [...context.items, event.item],
      total: ({ context, event }) => context.total + event.item.price
    }),
    removeItem: assign({
      items: ({ context, event }) => 
        context.items.filter(item => item.id !== event.itemId),
      total: ({ context, event }) => {
        const item = context.items.find(i => i.id === event.itemId);
        return context.total - (item?.price || 0);
      }
    }),
    updateQuantity: assign({
      items: ({ context, event }) =>
        context.items.map(item =>
          item.id === event.itemId
            ? { ...item, quantity: event.quantity }
            : item
        ),
      total: ({ context }) =>
        context.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    }),
    saveCart: ({ context }) => {
      localStorage.setItem('cart', JSON.stringify(context.items));
    },
    loadCart: assign({
      items: () => {
        const saved = localStorage.getItem('cart');
        return saved ? JSON.parse(saved) : [];
      },
      total: ({ context }) =>
        context.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    })
  },
  states: {
    idle: {
      entry: 'loadCart',
      on: {
        ADD_ITEM: {
          actions: ['addItem', 'saveCart']
        },
        REMOVE_ITEM: {
          actions: ['removeItem', 'saveCart']
        },
        UPDATE_QUANTITY: {
          actions: ['updateQuantity', 'saveCart']
        }
      }
    }
  }
});
```

## 最佳实践

### 1. 动作应该是纯函数（除了副作用）

```typescript
// ✅ 好的：副作用明确
actions: {
  log: ({ context }) => console.log(context),  // 副作用：日志
  save: ({ context }) => localStorage.setItem('data', JSON.stringify(context))  // 副作用：存储
}

// ❌ 避免：隐藏的副作用
actions: {
  update: ({ context }) => {
    context.count++;  // 直接修改上下文，应该使用 assign
  }
}
```

### 2. 使用 assign 更新上下文

```typescript
// ✅ 好的
actions: assign({ count: ({ context }) => context.count + 1 })

// ❌ 避免
actions: ({ context }) => { context.count++; }
```

### 3. 异步操作使用 invoke

```typescript
// ✅ 好的
invoke: {
  src: async () => { /* ... */ },
  onDone: 'success',
  onError: 'error'
}

// ❌ 避免：在动作中处理异步
actions: {
  fetch: async () => {
    const data = await fetch('/api');
    // 难以处理错误和状态更新
  }
}
```

## 下一步

[👉 08. 服务与调用](./08-services-invocations.md)
