# 09. 并行状态与历史状态

## 并行状态 (Parallel States)

并行状态允许状态机同时处于多个独立的状态区域。

## 为什么需要并行状态？

在某些场景中，应用的不同方面是独立的：

- UI 状态（显示/隐藏）和数据状态（加载/已加载）
- 用户认证状态和权限状态
- 表单验证状态和提交状态

使用并行状态可以清晰地管理这些独立的状态维度。

## 定义并行状态

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

## 并行状态的值

并行状态的值是一个对象，包含所有区域的状态：

```typescript
const snapshot = actor.getSnapshot();
console.log(snapshot.value);
// 输出: { ui: 'visible', data: 'loading' }

// 检查并行状态
snapshot.matches({ ui: 'visible' });        // true
snapshot.matches({ data: 'loading' });      // true
snapshot.matches({ ui: 'visible', data: 'loading' }); // true
```

## 事件处理

在并行状态中，事件可以被多个区域处理：

```typescript
const machine = createMachine({
  type: 'parallel',
  states: {
    ui: {
      on: {
        TOGGLE: {
          // UI 区域处理 TOGGLE
        }
      }
    },
    data: {
      on: {
        TOGGLE: {
          // 数据区域也可以处理 TOGGLE
        }
      }
    }
  }
});
```

## 实际案例：表单状态

```typescript
const formMachine = createMachine({
  type: 'parallel',
  states: {
    // 字段验证状态
    validation: {
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
    // 提交状态
    submission: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            SUBMIT: 'submitting'
          }
        },
        submitting: {
          invoke: {
            src: 'submitForm',
            onDone: 'success',
            onError: 'error'
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

历史状态记住之前的状态，允许返回到之前的状态。

## shallowHistory

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

## deepHistory

记住所有子状态（包括嵌套的）：

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

## 历史状态示例：导航菜单

```typescript
const navigationMachine = createMachine({
  initial: 'menu',
  states: {
    menu: {
      initial: 'main',
      states: {
        main: {
          initial: 'home',
          states: {
            home: {},
            products: {},
            about: {}
          }
        },
        settings: {
          initial: 'general',
          states: {
            general: {},
            account: {},
            privacy: {}
          }
        },
        history: {
          type: 'history',
          history: 'deep'
        }
      },
      on: {
        BACK: 'history',  // 返回到历史状态
        EXIT: 'off'
      }
    },
    off: {
      on: { TURN_ON: 'menu' }
    }
  }
});
```

## 组合使用：复杂应用状态

```typescript
const appMachine = createMachine({
  type: 'parallel',
  states: {
    // 认证状态
    auth: {
      initial: 'unauthenticated',
      states: {
        unauthenticated: {
          on: { LOGIN: 'authenticating' }
        },
        authenticating: {
          invoke: {
            src: 'authenticate',
            onDone: 'authenticated',
            onError: 'unauthenticated'
          }
        },
        authenticated: {
          initial: 'profile',
          states: {
            profile: {},
            settings: {},
            history: {
              type: 'history'
            }
          },
          on: {
            LOGOUT: 'unauthenticated',
            BACK: 'history'
          }
        }
      }
    },
    // UI 状态
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
    // 数据加载状态
    data: {
      initial: 'idle',
      states: {
        idle: {
          on: { LOAD: 'loading' }
        },
        loading: {
          invoke: {
            src: 'fetchData',
            onDone: 'loaded',
            onError: 'error'
          }
        },
        loaded: {
          on: { RELOAD: 'loading' }
        },
        error: {
          on: { RETRY: 'loading' }
        }
      }
    }
  }
});
```

## 检查并行状态

```typescript
const snapshot = actor.getSnapshot();

// 检查单个区域
if (snapshot.matches({ auth: 'authenticated' })) {
  // 用户已认证
}

// 检查多个区域
if (snapshot.matches({ 
  auth: 'authenticated',
  ui: 'visible',
  data: 'loaded'
})) {
  // 所有条件都满足
}

// 检查嵌套状态
if (snapshot.matches({ 
  auth: { authenticated: 'profile' }
})) {
  // 在认证状态的 profile 子状态
}
```

## 最佳实践

### 1. 使用并行状态管理独立的状态维度

```typescript
// ✅ 好的：UI 和数据状态独立
type: 'parallel',
states: {
  ui: { /* ... */ },
  data: { /* ... */ }
}

// ❌ 避免：将所有状态扁平化
states: {
  uiVisibleDataLoading: {},
  uiHiddenDataLoading: {},
  // ... 太多组合状态
}
```

### 2. 使用历史状态改善用户体验

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

### 3. 合理使用 deepHistory

```typescript
// ✅ 好的：需要记住深层状态时使用
history: {
  type: 'history',
  history: 'deep'
}

// ✅ 好的：只需要记住直接子状态时使用 shallowHistory
history: {
  type: 'history'  // 默认是 shallow
}
```

## 下一步

[👉 10. 状态持久化与序列化](./10-persistence-serialization.md)
