# 10. 状态持久化与序列化

状态持久化允许将状态机的状态保存到存储中，并在需要时恢复。这对于用户体验和状态恢复非常重要。

## 为什么需要持久化？

- **页面刷新**: 用户刷新页面后保持状态
- **会话恢复**: 用户重新打开应用时恢复之前的状态
- **离线支持**: 在离线时保存状态，上线后同步
- **调试**: 保存状态快照用于调试

## 基本持久化

### 保存状态

```typescript
import { createActor } from 'xstate';

const actor = createActor(machine);
actor.start();

// 订阅状态变化并保存
actor.subscribe((snapshot) => {
  const state = {
    value: snapshot.value,
    context: snapshot.context
  };
  localStorage.setItem('appState', JSON.stringify(state));
});
```

### 恢复状态

```typescript
// 从存储中恢复
const savedState = localStorage.getItem('appState');
if (savedState) {
  const state = JSON.parse(savedState);
  const actor = createActor(machine, {
    snapshot: state
  });
  actor.start();
} else {
  const actor = createActor(machine);
  actor.start();
}
```

## 使用快照

### 创建快照

```typescript
const snapshot = actor.getSnapshot();

// 快照包含完整状态信息
const stateToSave = {
  value: snapshot.value,
  context: snapshot.context,
  status: snapshot.status
};
```

### 从快照恢复

```typescript
import { createActor, fromPromise } from 'xstate';

const savedSnapshot = JSON.parse(localStorage.getItem('appState'));

const actor = createActor(machine, {
  snapshot: savedSnapshot
});
actor.start();
```

## 序列化上下文

### 基本序列化

```typescript
// 保存
const state = {
  value: snapshot.value,
  context: JSON.stringify(snapshot.context)
};
localStorage.setItem('appState', JSON.stringify(state));

// 恢复
const saved = JSON.parse(localStorage.getItem('appState'));
const context = JSON.parse(saved.context);
```

### 处理不可序列化的数据

某些数据不能直接序列化（如函数、Date 对象等）：

```typescript
const machine = createMachine({
  context: {
    count: 0,
    timestamp: new Date(),  // Date 对象需要特殊处理
    callback: () => {}      // 函数不能序列化
  }
});

// 序列化时转换
const serializeState = (snapshot) => {
  return {
    value: snapshot.value,
    context: {
      ...snapshot.context,
      timestamp: snapshot.context.timestamp.toISOString(),
      // 不保存 callback
    }
  };
};

// 反序列化时恢复
const deserializeState = (saved) => {
  return {
    value: saved.value,
    context: {
      ...saved.context,
      timestamp: new Date(saved.context.timestamp)
    }
  };
};
```

## 实际案例：待办事项应用

```typescript
import { createMachine, createActor, assign } from 'xstate';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

interface TodoContext {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
}

const todoMachine = createMachine({
  types: {
    context: {} as TodoContext
  },
  context: {
    todos: [],
    filter: 'all'
  },
  states: {
    idle: {
      on: {
        ADD_TODO: {
          actions: assign({
            todos: ({ context, event }) => [
              ...context.todos,
              {
                id: Date.now().toString(),
                text: event.text,
                completed: false
              }
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
        },
        DELETE_TODO: {
          actions: assign({
            todos: ({ context, event }) =>
              context.todos.filter(todo => todo.id !== event.id)
          })
        },
        SET_FILTER: {
          actions: assign({
            filter: ({ event }) => event.filter
          })
        }
      }
    }
  }
});

// 持久化工具
const STORAGE_KEY = 'todoAppState';

const saveState = (snapshot: any) => {
  const state = {
    value: snapshot.value,
    context: snapshot.context
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const loadState = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (error) {
      console.error('Failed to load state:', error);
      return null;
    }
  }
  return null;
};

// 使用
const savedState = loadState();
const actor = createActor(todoMachine, {
  snapshot: savedState || undefined
});
actor.start();

// 订阅并保存
actor.subscribe((snapshot) => {
  saveState(snapshot);
});
```

## React 集成示例

```typescript
import { useEffect, useMemo } from 'react';
import { useActor } from '@xstate/react';
import { createActor } from 'xstate';

const STORAGE_KEY = 'todoAppState';

function TodoApp() {
  // 从存储中恢复状态
  const savedState = useMemo(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  }, []);

  // 创建 Actor
  const actor = useMemo(() => {
    return createActor(todoMachine, {
      snapshot: savedState || undefined
    });
  }, []);

  const [snapshot, send] = useActor(actor);

  // 保存状态
  useEffect(() => {
    const state = {
      value: snapshot.value,
      context: snapshot.context
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [snapshot.value, snapshot.context]);

  return (
    <div>
      {/* UI */}
    </div>
  );
}
```

## 部分状态恢复

有时只需要恢复部分状态：

```typescript
const restorePartialState = (savedState, machine) => {
  // 只恢复上下文，不恢复状态值
  return {
    value: machine.initialState.value,  // 使用初始状态
    context: savedState.context          // 恢复上下文
  };
};
```

## 状态迁移

当状态机结构改变时，需要处理状态迁移：

```typescript
const migrateState = (oldState, version) => {
  switch (version) {
    case 1:
      // v1 到 v2 的迁移
      return {
        ...oldState,
        context: {
          ...oldState.context,
          newField: 'defaultValue'
        }
      };
    case 2:
      // v2 到 v3 的迁移
      return {
        ...oldState,
        context: {
          ...oldState.context,
          renamedField: oldState.context.oldField
        }
      };
    default:
      return oldState;
  }
};

const loadStateWithMigration = () => {
  const saved = localStorage.getItem('appState');
  if (!saved) return null;

  const state = JSON.parse(saved);
  const currentVersion = 3;
  
  if (state.version < currentVersion) {
    return migrateState(state, state.version);
  }
  
  return state;
};
```

## 服务端持久化

### 保存到服务器

```typescript
const saveToServer = async (snapshot) => {
  const state = {
    value: snapshot.value,
    context: snapshot.context,
    userId: getCurrentUserId()
  };

  await fetch('/api/save-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  });
};

// 订阅并保存
actor.subscribe((snapshot) => {
  saveToServer(snapshot);
});
```

### 从服务器恢复

```typescript
const loadFromServer = async (userId) => {
  const response = await fetch(`/api/load-state?userId=${userId}`);
  const state = await response.json();
  return state;
};

// 应用启动时
const savedState = await loadFromServer(currentUserId);
const actor = createActor(machine, {
  snapshot: savedState
});
actor.start();
```

## 性能优化

### 防抖保存

```typescript
import { debounce } from 'lodash';

const debouncedSave = debounce((snapshot) => {
  localStorage.setItem('appState', JSON.stringify({
    value: snapshot.value,
    context: snapshot.context
  }));
}, 500);

actor.subscribe((snapshot) => {
  debouncedSave(snapshot);
});
```

### 选择性保存

```typescript
actor.subscribe((snapshot) => {
  // 只保存重要的状态变化
  if (snapshot.status === 'done' || snapshot.changed) {
    saveState(snapshot);
  }
});
```

## 最佳实践

### 1. 版本化状态

```typescript
const state = {
  version: 1,
  value: snapshot.value,
  context: snapshot.context
};
```

### 2. 错误处理

```typescript
const loadState = () => {
  try {
    const saved = localStorage.getItem('appState');
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error('Failed to load state:', error);
    localStorage.removeItem('appState');  // 清除损坏的数据
    return null;
  }
};
```

### 3. 数据验证

```typescript
const validateState = (state) => {
  if (!state || !state.value || !state.context) {
    return false;
  }
  // 更多验证...
  return true;
};

const loadState = () => {
  const saved = localStorage.getItem('appState');
  if (!saved) return null;

  const state = JSON.parse(saved);
  if (!validateState(state)) {
    return null;
  }

  return state;
};
```

## 下一步

[👉 11. React 集成](./11-react-integration.md)
