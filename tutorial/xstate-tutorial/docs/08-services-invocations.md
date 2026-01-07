# 08. 服务与调用

服务（Services）是状态机中用于处理异步操作、调用外部 API、创建子 Actor 等的机制。在 XState 中，服务通过 `invoke` 配置。

## 什么是服务？

服务是在状态激活时启动的异步操作或 Actor。它们可以：

- 调用 API
- 执行异步计算
- 创建子 Actor
- 监听事件流
- 执行定时任务

## invoke 基础

### 基本语法

```typescript
states: {
  loading: {
    invoke: {
      src: 'fetchData',  // 服务源
      onDone: 'success', // 成功时转换
      onError: 'error'    // 错误时转换
    }
  }
}
```

### 服务源类型

1. **函数**
2. **Promise**
3. **Observable**
4. **Actor**
5. **回调函数**

## 函数服务

最简单的服务形式：

```typescript
const machine = createMachine({
  states: {
    loading: {
      invoke: {
        src: async ({ context, event }) => {
          const response = await fetch('/api/data');
          return response.json();
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
});
```

## 命名服务

在 `services` 选项中定义：

```typescript
const machine = createMachine({
  services: {
    fetchUser: async ({ context, event }) => {
      const response = await fetch(`/api/users/${event.userId}`);
      return response.json();
    },
    processData: async ({ context }) => {
      // 处理数据
      return processedData;
    }
  },
  states: {
    loading: {
      invoke: {
        src: 'fetchUser',  // 使用命名服务
        onDone: 'success',
        onError: 'error'
      }
    }
  }
});
```

## Promise 服务

直接使用 Promise：

```typescript
states: {
  loading: {
    invoke: {
      src: ({ context, event }) => 
        fetch('/api/data')
          .then(res => res.json())
          .then(data => ({ data, timestamp: Date.now() })),
      onDone: {
        target: 'success',
        actions: assign({
          data: ({ event }) => event.output.data
        })
      }
    }
  }
}
```

## Actor 服务

调用其他状态机作为服务：

```typescript
const childMachine = createMachine({
  // ... 子状态机配置
});

const parentMachine = createMachine({
  states: {
    active: {
      invoke: {
        id: 'child',
        src: childMachine,
        onDone: 'success',
        onError: 'error'
      },
      on: {
        'child.SUCCESS': {
          actions: ({ event }) => {
            console.log('子 Actor 成功:', event);
          }
        }
      }
    }
  }
});
```

## 回调服务

用于处理事件流或 WebSocket：

```typescript
states: {
  connected: {
    invoke: {
      src: ({ context, event, self }) => (callback, receive) => {
        // 设置 WebSocket
        const ws = new WebSocket('ws://example.com');
        
        ws.onmessage = (event) => {
          callback({ type: 'MESSAGE', data: JSON.parse(event.data) });
        };
        
        ws.onerror = (error) => {
          callback({ type: 'ERROR', error });
        };
        
        // 接收来自状态机的事件
        receive((event) => {
          if (event.type === 'SEND') {
            ws.send(JSON.stringify(event.data));
          }
        });
        
        // 清理函数
        return () => {
          ws.close();
        };
      },
      onDone: 'disconnected',
      onError: 'error'
    },
    on: {
      MESSAGE: {
        actions: ({ event }) => {
          console.log('收到消息:', event.data);
        }
      },
      SEND: {
        // 发送消息到服务
      },
      DISCONNECT: 'disconnected'
    }
  }
}
```

## 服务输入

服务可以接收输入：

```typescript
states: {
  loading: {
    invoke: {
      src: 'fetchData',
      input: ({ context, event }) => ({
        userId: event.userId,
        options: context.options
      }),
      onDone: 'success'
    }
  }
}
```

## 服务输出

服务完成后可以输出数据：

```typescript
states: {
  loading: {
    invoke: {
      src: async ({ context, event }) => {
        const data = await fetchData();
        return { data, timestamp: Date.now() };
      },
      onDone: {
        target: 'success',
        actions: assign({
          result: ({ event }) => event.output
        })
      }
    }
  }
}
```

## 错误处理

### 基本错误处理

```typescript
states: {
  loading: {
    invoke: {
      src: 'fetchData',
      onError: {
        target: 'error',
        actions: assign({
          error: ({ event }) => event.error
        })
      }
    }
  },
  error: {
    on: {
      RETRY: 'loading'
    }
  }
}
```

### 重试机制

```typescript
const machine = createMachine({
  context: {
    retryCount: 0,
    maxRetries: 3
  },
  states: {
    loading: {
      invoke: {
        src: 'fetchData',
        onError: [
          {
            target: 'loading',
            guard: ({ context }) => context.retryCount < context.maxRetries,
            actions: assign({
              retryCount: ({ context }) => context.retryCount + 1
            })
          },
          {
            target: 'error'
          }
        ]
      }
    }
  }
});
```

## 多个服务

一个状态可以调用多个服务：

```typescript
states: {
  loading: {
    type: 'parallel',
    states: {
      user: {
        invoke: {
          src: 'fetchUser',
          onDone: 'loaded'
        }
      },
      posts: {
        invoke: {
          src: 'fetchPosts',
          onDone: 'loaded'
        }
      }
    }
  }
}
```

## 实际案例

### 1. API 调用

```typescript
const apiMachine = createMachine({
  context: {
    data: null,
    error: null,
    loading: false
  },
  services: {
    fetchData: async ({ context, event }) => {
      const response = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event.payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    }
  },
  states: {
    idle: {
      on: {
        FETCH: {
          target: 'loading',
          actions: assign({ loading: true, error: null })
        }
      }
    },
    loading: {
      invoke: {
        src: 'fetchData',
        onDone: {
          target: 'success',
          actions: [
            assign({
              data: ({ event }) => event.output,
              loading: false
            }),
            ({ event }) => console.log('数据加载成功:', event.output)
          ]
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error.message,
            loading: false
          })
        }
      }
    },
    success: {
      on: {
        FETCH: 'loading'
      }
    },
    error: {
      on: {
        RETRY: 'loading',
        RESET: 'idle'
      }
    }
  }
});
```

### 2. WebSocket 连接

```typescript
const wsMachine = createMachine({
  context: {
    messages: [],
    connectionStatus: 'disconnected'
  },
  states: {
    disconnected: {
      on: {
        CONNECT: 'connecting'
      }
    },
    connecting: {
      invoke: {
        src: ({ context, event, self }) => (callback, receive) => {
          const ws = new WebSocket(event.url || 'ws://localhost:8080');
          
          ws.onopen = () => {
            callback({ type: 'CONNECTED' });
          };
          
          ws.onmessage = (event) => {
            callback({
              type: 'MESSAGE_RECEIVED',
              data: JSON.parse(event.data)
            });
          };
          
          ws.onerror = (error) => {
            callback({ type: 'ERROR', error });
          };
          
          ws.onclose = () => {
            callback({ type: 'DISCONNECTED' });
          };
          
          receive((event) => {
            if (event.type === 'SEND_MESSAGE') {
              ws.send(JSON.stringify(event.data));
            }
          });
          
          return () => {
            ws.close();
          };
        }
      },
      on: {
        CONNECTED: 'connected',
        ERROR: 'error',
        DISCONNECTED: 'disconnected'
      }
    },
    connected: {
      entry: assign({ connectionStatus: 'connected' }),
      on: {
        MESSAGE_RECEIVED: {
          actions: assign({
            messages: ({ context, event }) => [
              ...context.messages,
              event.data
            ]
          })
        },
        SEND_MESSAGE: {
          // 消息发送到服务
        },
        DISCONNECT: 'disconnecting'
      }
    },
    disconnecting: {
      invoke: {
        src: () => (callback) => {
          // 清理逻辑
          callback({ type: 'DISCONNECTED' });
        }
      },
      on: {
        DISCONNECTED: 'disconnected'
      }
    },
    error: {
      on: {
        RETRY: 'connecting'
      }
    }
  }
});
```

### 3. 定时器服务

```typescript
const timerMachine = createMachine({
  context: {
    elapsed: 0,
    interval: 1000
  },
  states: {
    idle: {
      on: {
        START: 'running'
      }
    },
    running: {
      invoke: {
        src: ({ context }) => (callback) => {
          const intervalId = setInterval(() => {
            callback({ type: 'TICK' });
          }, context.interval);
          
          return () => {
            clearInterval(intervalId);
          };
        }
      },
      on: {
        TICK: {
          actions: assign({
            elapsed: ({ context }) => context.elapsed + 1
          })
        },
        STOP: 'idle',
        PAUSE: 'paused'
      }
    },
    paused: {
      on: {
        RESUME: 'running'
      }
    }
  }
});
```

## 服务清理

服务返回的清理函数会在状态退出时自动调用：

```typescript
invoke: {
  src: () => (callback) => {
    const subscription = observable.subscribe(callback);
    
    // 返回清理函数
    return () => {
      subscription.unsubscribe();
    };
  }
}
```

## 最佳实践

### 1. 使用命名服务提高可读性

```typescript
// ✅ 好的
services: {
  fetchUser: async () => { /* ... */ }
}

// ❌ 避免：内联复杂逻辑
invoke: {
  src: async () => { /* 大量代码 */ }
}
```

### 2. 正确处理错误

```typescript
// ✅ 好的
onError: {
  target: 'error',
  actions: assign({ error: ({ event }) => event.error })
}

// ❌ 避免：忽略错误
invoke: {
  src: 'fetchData'
  // 没有错误处理
}
```

### 3. 清理资源

```typescript
// ✅ 好的
invoke: {
  src: () => (callback) => {
    const ws = new WebSocket('...');
    return () => ws.close();  // 清理
  }
}
```

## 下一步

[👉 09. 并行状态与历史状态](./09-parallel-history.md)
