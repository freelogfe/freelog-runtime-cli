# 15. 延迟事件与定时器

XState 提供了强大的延迟事件和定时器功能，可以轻松实现超时、定时任务、去抖动等功能。

## after - 延迟转换

`after` 属性允许在指定时间后自动触发状态转换。

### 基本语法

```typescript
import { createMachine } from 'xstate';

const machine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      after: {
        1000: 'timeout'  // 1秒后自动转换到 timeout 状态
      }
    },
    timeout: {
      // ...
    }
  }
});
```

### 动态延迟时间

可以根据上下文动态设置延迟时间：

```typescript
const machine = createMachine({
  context: {
    delayMs: 3000
  },
  initial: 'loading',
  states: {
    loading: {
      after: {
        // 使用函数返回延迟时间
        TIMEOUT: {
          delay: ({ context }) => context.delayMs,
          target: 'error'
        }
      },
      on: {
        SUCCESS: 'success'
      }
    },
    success: {},
    error: {}
  }
});
```

### 多个延迟转换

一个状态可以有多个延迟转换：

```typescript
states: {
  waiting: {
    after: {
      1000: {
        target: 'warning',
        guard: 'shouldShowWarning'
      },
      5000: 'timeout'  // 5秒后超时
    }
  }
}
```

## 命名延迟

使用命名延迟更容易管理和配置：

```typescript
const machine = createMachine({
  delays: {
    TIMEOUT: 5000,
    WARNING: 3000,
    ANIMATION: 300
  },
  initial: 'loading',
  states: {
    loading: {
      after: {
        WARNING: {
          target: 'loadingSlow',
          actions: () => console.log('加载较慢...')
        },
        TIMEOUT: {
          target: 'error',
          actions: () => console.log('加载超时')
        }
      }
    },
    loadingSlow: {
      after: {
        TIMEOUT: 'error'
      }
    },
    error: {}
  }
});
```

### 动态命名延迟

```typescript
const machine = createMachine({
  context: {
    retryCount: 0
  },
  delays: {
    // 指数退避
    RETRY_DELAY: ({ context }) => {
      return Math.min(1000 * Math.pow(2, context.retryCount), 30000);
    }
  },
  states: {
    error: {
      after: {
        RETRY_DELAY: 'retrying'
      }
    },
    retrying: {
      // ...
    }
  }
});
```

## 实际案例

### 1. 登录超时

```typescript
const loginMachine = createMachine({
  delays: {
    SESSION_TIMEOUT: 30 * 60 * 1000,  // 30分钟
    INACTIVITY_WARNING: 25 * 60 * 1000  // 25分钟显示警告
  },
  initial: 'loggedIn',
  states: {
    loggedIn: {
      initial: 'active',
      states: {
        active: {
          after: {
            INACTIVITY_WARNING: 'warning'
          },
          on: {
            USER_ACTIVITY: 'active'  // 重置计时器
          }
        },
        warning: {
          after: {
            // 5分钟后退出
            300000: '#loginMachine.loggedOut'
          },
          on: {
            CONTINUE_SESSION: 'active'
          }
        }
      }
    },
    loggedOut: {
      type: 'final'
    }
  }
});
```

### 2. 轮询机制

```typescript
const pollingMachine = createMachine({
  context: {
    data: null,
    pollInterval: 5000
  },
  delays: {
    POLL_INTERVAL: ({ context }) => context.pollInterval
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        START_POLLING: 'polling'
      }
    },
    polling: {
      invoke: {
        src: async () => {
          const response = await fetch('/api/data');
          return response.json();
        },
        onDone: {
          target: 'waiting',
          actions: assign({
            data: ({ event }) => event.output
          })
        },
        onError: 'error'
      }
    },
    waiting: {
      after: {
        POLL_INTERVAL: 'polling'  // 等待后继续轮询
      },
      on: {
        STOP_POLLING: 'idle'
      }
    },
    error: {
      after: {
        10000: 'polling'  // 错误后10秒重试
      },
      on: {
        STOP_POLLING: 'idle'
      }
    }
  }
});
```

### 3. 通知自动消失

```typescript
const notificationMachine = createMachine({
  context: {
    message: '',
    type: 'info',
    duration: 5000
  },
  delays: {
    AUTO_DISMISS: ({ context }) => context.duration
  },
  initial: 'hidden',
  states: {
    hidden: {
      on: {
        SHOW: {
          target: 'visible',
          actions: assign({
            message: ({ event }) => event.message,
            type: ({ event }) => event.type || 'info',
            duration: ({ event }) => event.duration || 5000
          })
        }
      }
    },
    visible: {
      after: {
        AUTO_DISMISS: 'hiding'
      },
      on: {
        DISMISS: 'hiding',
        MOUSE_ENTER: 'paused'  // 鼠标悬停时暂停
      }
    },
    paused: {
      on: {
        MOUSE_LEAVE: 'visible',
        DISMISS: 'hiding'
      }
    },
    hiding: {
      after: {
        300: 'hidden'  // 动画时间
      }
    }
  }
});
```

### 4. 去抖动 (Debounce)

```typescript
const searchMachine = createMachine({
  context: {
    query: '',
    results: [],
    debounceMs: 300
  },
  delays: {
    DEBOUNCE: ({ context }) => context.debounceMs
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        INPUT: {
          target: 'debouncing',
          actions: assign({
            query: ({ event }) => event.value
          })
        }
      }
    },
    debouncing: {
      after: {
        DEBOUNCE: 'searching'
      },
      on: {
        INPUT: {
          target: 'debouncing',  // 重置去抖计时器
          actions: assign({
            query: ({ event }) => event.value
          })
        }
      }
    },
    searching: {
      invoke: {
        src: async ({ context }) => {
          const response = await fetch(`/api/search?q=${context.query}`);
          return response.json();
        },
        onDone: {
          target: 'idle',
          actions: assign({
            results: ({ event }) => event.output
          })
        },
        onError: 'idle'
      }
    }
  }
});
```

### 5. 节流 (Throttle)

```typescript
const throttleMachine = createMachine({
  context: {
    lastValue: null,
    throttleMs: 1000
  },
  delays: {
    THROTTLE: ({ context }) => context.throttleMs
  },
  initial: 'ready',
  states: {
    ready: {
      on: {
        ACTION: {
          target: 'throttling',
          actions: [
            assign({ lastValue: ({ event }) => event.value }),
            ({ event }) => {
              // 执行操作
              console.log('执行:', event.value);
            }
          ]
        }
      }
    },
    throttling: {
      after: {
        THROTTLE: 'ready'
      },
      on: {
        ACTION: {
          actions: assign({ lastValue: ({ event }) => event.value })
          // 只更新值，不执行操作
        }
      }
    }
  }
});
```

### 6. 重试机制（指数退避）

```typescript
const retryMachine = createMachine({
  context: {
    retryCount: 0,
    maxRetries: 5,
    data: null,
    error: null
  },
  delays: {
    RETRY_DELAY: ({ context }) => {
      // 指数退避：1s, 2s, 4s, 8s, 16s
      return Math.min(1000 * Math.pow(2, context.retryCount), 30000);
    }
  },
  initial: 'fetching',
  states: {
    fetching: {
      invoke: {
        src: async () => {
          const response = await fetch('/api/data');
          if (!response.ok) throw new Error('请求失败');
          return response.json();
        },
        onDone: {
          target: 'success',
          actions: assign({
            data: ({ event }) => event.output,
            retryCount: 0
          })
        },
        onError: [
          {
            target: 'retrying',
            guard: ({ context }) => context.retryCount < context.maxRetries,
            actions: assign({
              error: ({ event }) => event.error,
              retryCount: ({ context }) => context.retryCount + 1
            })
          },
          {
            target: 'failure',
            actions: assign({
              error: ({ event }) => event.error
            })
          }
        ]
      }
    },
    retrying: {
      entry: ({ context }) => {
        console.log(`第 ${context.retryCount} 次重试，${Math.pow(2, context.retryCount)} 秒后执行...`);
      },
      after: {
        RETRY_DELAY: 'fetching'
      },
      on: {
        CANCEL: 'failure'
      }
    },
    success: {
      type: 'final'
    },
    failure: {
      on: {
        RETRY: {
          target: 'fetching',
          actions: assign({ retryCount: 0 })
        }
      }
    }
  }
});
```

## 取消延迟

当状态转换时，相关的延迟会自动取消：

```typescript
states: {
  waiting: {
    after: {
      5000: 'timeout'  // 5秒后超时
    },
    on: {
      CANCEL: 'cancelled'  // 取消会自动停止延迟
    }
  }
}
```

## 与 invoke 结合

```typescript
states: {
  loading: {
    invoke: {
      src: fetchData,
      onDone: 'success',
      onError: 'error'
    },
    after: {
      10000: {
        target: 'timeout',
        actions: () => console.log('请求超时')
      }
    }
  }
}
```

## 最佳实践

### 1. 使用命名延迟

```typescript
// ✅ 好的
delays: {
  TIMEOUT: 5000,
  ANIMATION: 300
}

// ❌ 避免
after: {
  5000: 'timeout'  // 魔法数字
}
```

### 2. 提取延迟配置

```typescript
const DELAYS = {
  SESSION_TIMEOUT: 30 * 60 * 1000,
  WARNING: 25 * 60 * 1000,
  ANIMATION: 300
} as const;

const machine = createMachine({
  delays: DELAYS,
  // ...
});
```

### 3. 根据环境调整延迟

```typescript
delays: {
  TIMEOUT: process.env.NODE_ENV === 'development' ? 1000 : 5000
}
```

## 下一步

[👉 16. 测试状态机](./16-testing.md)
