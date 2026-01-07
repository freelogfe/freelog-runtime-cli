# 03. 状态图 (Statecharts)

状态图（Statecharts）是状态机的扩展，由 David Harel 在 1987 年提出。它解决了传统状态机的局限性，引入了层次状态、并行状态、历史状态等概念。

## 层次状态 (Hierarchical States)

层次状态允许状态包含子状态，形成状态树：

```
Machine
├── idle
├── active
│   ├── loading
│   │   ├── fetching
│   │   └── processing
│   └── ready
└── error
```

### 定义层次状态

```typescript
import { createMachine } from 'xstate';

const machine = createMachine({
  initial: 'idle',
  states: {
    idle: {},
    
    // active 是父状态
    active: {
      initial: 'loading',  // 子状态的初始状态
      states: {
        // loading 是 active 的子状态
        loading: {
          initial: 'fetching',
          states: {
            fetching: {},
            processing: {}
          },
          on: {
            COMPLETE: 'ready'
          }
        },
        ready: {}
      },
      on: {
        DEACTIVATE: 'idle'
      }
    },
    
    error: {}
  }
});
```

### 访问层次状态

```typescript
const actor = createActor(machine);
actor.start();

// 当前状态值
const snapshot = actor.getSnapshot();
console.log(snapshot.value);
// 输出: { active: { loading: 'fetching' } }

// 检查是否在某个状态
snapshot.matches('active');           // true
snapshot.matches({ active: 'loading' }); // true
snapshot.matches({ active: { loading: 'fetching' } }); // true
```

### 事件冒泡

子状态未处理的事件会向上冒泡到父状态：

```typescript
const machine = createMachine({
  initial: 'parent',
  states: {
    parent: {
      initial: 'child1',
      states: {
        child1: {
          // child1 不处理 EVENT_A
        },
        child2: {}
      },
      on: {
        EVENT_A: 'parent'  // 父状态处理 EVENT_A
      }
    }
  }
});
```

## 并行状态 (Parallel States)

并行状态允许状态机同时处于多个状态：

```
Machine
├── [UI State]
│   ├── visible
│   └── hidden
└── [Data State]
    ├── loading
    └── loaded
```

### 定义并行状态

```typescript
const machine = createMachine({
  type: 'parallel',  // 关键：设置为并行类型
  states: {
    ui: {
      initial: 'visible',
      states: {
        visible: {
          on: { HIDE: 'hidden' }
        },
        hidden: {
          on: { SHOW: 'visible' }
        }
      }
    },
    data: {
      initial: 'loading',
      states: {
        loading: {
          on: { LOADED: 'loaded' }
        },
        loaded: {
          on: { RELOAD: 'loading' }
        }
      }
    }
  }
});
```

### 并行状态的值

```typescript
const snapshot = actor.getSnapshot();
console.log(snapshot.value);
// 输出: { ui: 'visible', data: 'loading' }

// 检查并行状态
snapshot.matches({ ui: 'visible' });        // true
snapshot.matches({ data: 'loading' });       // true
snapshot.matches({ ui: 'visible', data: 'loading' }); // true
```

### 实际案例：表单验证

```typescript
const formMachine = createMachine({
  type: 'parallel',
  states: {
    // 表单字段验证状态
    fields: {
      initial: 'validating',
      states: {
        validating: {
          on: {
            VALIDATE_SUCCESS: 'valid',
            VALIDATE_ERROR: 'invalid'
          }
        },
        valid: {},
        invalid: {}
      }
    },
    // 表单提交状态
    submission: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            SUBMIT: 'submitting'
          }
        },
        submitting: {
          on: {
            SUCCESS: 'success',
            ERROR: 'error'
          }
        },
        success: {},
        error: {
          on: {
            RETRY: 'submitting'
          }
        }
      }
    }
  }
});
```

## 历史状态 (History States)

历史状态记住之前的状态，可以返回到之前的状态：

### shallowHistory

记住直接子状态：

```typescript
const machine = createMachine({
  initial: 'menu',
  states: {
    menu: {
      initial: 'main',
      states: {
        main: {
          on: { GOTO_SETTINGS: 'settings' }
        },
        settings: {
          on: { BACK: 'history' }  // 返回到历史状态
        },
        history: {
          type: 'history'  // shallowHistory
        }
      },
      on: {
        EXIT: 'off'
      }
    },
    off: {
      on: { TURN_ON: 'menu' }
    }
  }
});
```

### deepHistory

记住所有子状态：

```typescript
states: {
  menu: {
    initial: 'main',
    states: {
      main: {
        initial: 'home',
        states: {
          home: {},
          about: {}
        }
      },
      settings: {},
      history: {
        type: 'history',
        history: 'deep'  // deepHistory
      }
    }
  }
}
```

## 最终状态 (Final States)

最终状态表示状态机已完成：

```typescript
const machine = createMachine({
  initial: 'processing',
  states: {
    processing: {
      on: {
        COMPLETE: 'done'
      }
    },
    done: {
      type: 'final'  // 最终状态
    }
  }
});

// 检查是否完成
const snapshot = actor.getSnapshot();
if (snapshot.status === 'done') {
  console.log('状态机已完成');
}
```

## 组合示例：下载管理器

```typescript
import { createMachine, assign } from 'xstate';

const downloadMachine = createMachine({
  id: 'download',
  initial: 'idle',
  context: {
    progress: 0,
    file: null,
    error: null
  },
  states: {
    idle: {
      on: {
        START_DOWNLOAD: {
          target: 'downloading',
          actions: assign({
            file: ({ event }) => event.file,
            progress: 0
          })
        }
      }
    },
    
    downloading: {
      initial: 'connecting',
      states: {
        connecting: {
          on: {
            CONNECTED: 'downloading',
            CONNECTION_ERROR: 'error'
          }
        },
        downloading: {
          on: {
            PROGRESS: {
              actions: assign({
                progress: ({ event }) => event.progress
              })
            },
            COMPLETE: '#download.success',
            ERROR: 'error'
          }
        },
        error: {
          on: {
            RETRY: 'connecting'
          }
        }
      },
      on: {
        CANCEL: 'idle',
        PAUSE: 'paused'
      }
    },
    
    paused: {
      on: {
        RESUME: 'downloading.downloading',
        CANCEL: 'idle'
      }
    },
    
    success: {
      type: 'final',
      entry: ({ context }) => {
        console.log(`下载完成: ${context.file}`);
      }
    }
  }
});
```

## 状态 ID

可以使用 ID 来引用状态：

```typescript
const machine = createMachine({
  states: {
    state1: {
      id: 'myState',  // 设置 ID
      on: {
        EVENT: '#myState'  // 使用 ID 引用
      }
    },
    state2: {
      on: {
        EVENT: '#myState'  // 引用其他状态
      }
    }
  }
});
```

## 状态值类型

状态值可以是：

1. **字符串**: `'idle'`
2. **对象（层次）**: `{ active: 'loading' }`
3. **对象（并行）**: `{ ui: 'visible', data: 'loading' }`
4. **嵌套对象**: `{ parent: { child: 'deep' } }`

```typescript
// 类型定义
type StateValue =
  | string
  | { [key: string]: StateValue };
```

## 最佳实践

### 1. 使用层次状态组织复杂逻辑

```typescript
// ✅ 好的：使用层次状态
states: {
  active: {
    initial: 'loading',
    states: {
      loading: {},
      ready: {}
    }
  }
}

// ❌ 避免：扁平化所有状态
states: {
  activeLoading: {},
  activeReady: {}
}
```

### 2. 并行状态用于独立的状态维度

```typescript
// ✅ 好的：UI 和数据状态独立
type: 'parallel',
states: {
  ui: { /* ... */ },
  data: { /* ... */ }
}
```

### 3. 使用历史状态改善用户体验

```typescript
// ✅ 好的：记住用户之前的位置
states: {
  menu: {
    states: {
      history: { type: 'history' }
    }
  }
}
```

## 下一步

[👉 04. 事件与转换](./04-events-transitions.md)
