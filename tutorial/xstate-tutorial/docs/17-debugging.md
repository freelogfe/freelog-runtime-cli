# 17. 调试与开发工具

XState 提供了强大的调试和可视化工具，帮助你理解和调试状态机。

## Stately Studio

[Stately Studio](https://stately.ai/studio) 是官方提供的可视化状态机编辑器和调试工具。

### 功能特性

- 🎨 **可视化编辑器**: 拖拽式创建状态机
- 🔍 **状态检查器**: 实时查看状态变化
- 📊 **状态流程图**: 自动生成状态流程图
- 🤝 **团队协作**: 支持团队共享和协作
- 📤 **代码导出**: 导出为 XState 代码

### 使用方式

1. 访问 [stately.ai/studio](https://stately.ai/studio)
2. 创建新项目或导入现有状态机
3. 可视化编辑状态机
4. 导出代码到项目中

## @statelyai/inspect

`@statelyai/inspect` 是官方提供的调试检查工具。

### 安装

```bash
pnpm add @statelyai/inspect
```

### 基本使用

```typescript
import { createBrowserInspector } from '@statelyai/inspect';
import { createActor, createMachine } from 'xstate';

// 创建检查器
const inspector = createBrowserInspector();

const machine = createMachine({
  // ... 状态机配置
});

// 创建带检查器的 actor
const actor = createActor(machine, {
  inspect: inspector.inspect
});

actor.start();
```

### 在 React 中使用

```typescript
import { createBrowserInspector } from '@statelyai/inspect';
import { useMachine } from '@xstate/react';

const inspector = createBrowserInspector();

function App() {
  const [state, send] = useMachine(machine, {
    inspect: inspector.inspect
  });

  return (
    // ...
  );
}
```

### 检查器功能

- 查看当前状态
- 查看上下文数据
- 查看事件历史
- 手动发送事件
- 时间旅行调试

## 控制台日志调试

### 简单日志

```typescript
const machine = createMachine({
  states: {
    idle: {
      entry: () => console.log('进入 idle 状态'),
      exit: () => console.log('离开 idle 状态'),
      on: {
        START: {
          target: 'active',
          actions: () => console.log('触发 START 事件')
        }
      }
    },
    active: {
      entry: () => console.log('进入 active 状态')
    }
  }
});
```

### 详细日志

```typescript
const machine = createMachine({
  actions: {
    logStateChange: ({ context, event }) => {
      console.group('状态变化');
      console.log('事件:', event.type);
      console.log('上下文:', context);
      console.log('时间:', new Date().toISOString());
      console.groupEnd();
    }
  },
  states: {
    idle: {
      entry: 'logStateChange',
      // ...
    }
  }
});
```

### 创建日志中间件

```typescript
function createLoggingActor(machine: any) {
  const actor = createActor(machine);
  
  actor.subscribe((snapshot) => {
    console.log('状态:', snapshot.value);
    console.log('上下文:', snapshot.context);
    console.log('状态:', snapshot.status);
  });
  
  // 拦截 send
  const originalSend = actor.send.bind(actor);
  actor.send = (event: any) => {
    console.log('发送事件:', event);
    return originalSend(event);
  };
  
  return actor;
}

// 使用
const actor = createLoggingActor(machine);
actor.start();
```

## 自定义调试工具

### 状态历史记录

```typescript
function createDebugActor(machine: any) {
  const actor = createActor(machine);
  const history: any[] = [];
  
  actor.subscribe((snapshot) => {
    history.push({
      timestamp: Date.now(),
      state: snapshot.value,
      context: { ...snapshot.context }
    });
  });
  
  return {
    actor,
    getHistory: () => history,
    printHistory: () => {
      console.table(history);
    }
  };
}

// 使用
const { actor, printHistory } = createDebugActor(machine);
actor.start();
actor.send({ type: 'START' });
printHistory();
```

### 状态可视化

```typescript
function visualizeState(snapshot: any): string {
  const stateValue = snapshot.value;
  
  function renderState(value: any, indent = 0): string {
    const prefix = '  '.repeat(indent);
    
    if (typeof value === 'string') {
      return `${prefix}[${value}]`;
    }
    
    return Object.entries(value)
      .map(([key, val]) => `${prefix}${key}:\n${renderState(val, indent + 1)}`)
      .join('\n');
  }
  
  return renderState(stateValue);
}

// 使用
actor.subscribe((snapshot) => {
  console.log(visualizeState(snapshot));
});
```

## React DevTools 集成

### 使用 React DevTools

```typescript
import { useMachine } from '@xstate/react';
import { useEffect } from 'react';

function useDebugMachine(machine: any) {
  const [state, send] = useMachine(machine);
  
  useEffect(() => {
    // 在 React DevTools 中可见
    (window as any).__XSTATE_DEBUG__ = {
      state: state.value,
      context: state.context,
      send
    };
  }, [state]);
  
  return [state, send];
}
```

### 自定义 DevTools 面板

```typescript
// DebugPanel.tsx
import { useActor } from '@xstate/react';

function DebugPanel({ actor }: { actor: any }) {
  const [snapshot, send] = useActor(actor);
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      background: '#1a1a2e',
      color: '#eee',
      padding: '1rem',
      borderRadius: '8px 0 0 0',
      maxWidth: '400px',
      maxHeight: '300px',
      overflow: 'auto',
      fontFamily: 'monospace',
      fontSize: '12px'
    }}>
      <h3>XState Debug</h3>
      <div>
        <strong>State:</strong>
        <pre>{JSON.stringify(snapshot.value, null, 2)}</pre>
      </div>
      <div>
        <strong>Context:</strong>
        <pre>{JSON.stringify(snapshot.context, null, 2)}</pre>
      </div>
      <div>
        <strong>Status:</strong> {snapshot.status}
      </div>
      <div>
        <strong>Send Event:</strong>
        <input
          type="text"
          placeholder='{"type": "EVENT"}'
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              try {
                const event = JSON.parse(e.currentTarget.value);
                send(event);
                e.currentTarget.value = '';
              } catch (err) {
                console.error('Invalid JSON');
              }
            }
          }}
        />
      </div>
    </div>
  );
}
```

## 常见调试技巧

### 1. 检查状态可达性

```typescript
// 检查事件是否可以在当前状态下触发
const snapshot = actor.getSnapshot();
if (snapshot.can({ type: 'START' })) {
  console.log('可以发送 START 事件');
} else {
  console.log('不能发送 START 事件');
}
```

### 2. 追踪状态路径

```typescript
const machine = createMachine({
  entry: ({ context, event }) => {
    console.log('Machine started');
    console.trace(); // 打印调用栈
  },
  // ...
});
```

### 3. 断点调试

```typescript
states: {
  problematic: {
    entry: () => {
      debugger; // 浏览器断点
    }
  }
}
```

### 4. 检查转换是否发生

```typescript
let transitionCount = 0;

actor.subscribe((snapshot, event) => {
  transitionCount++;
  console.log(`转换 #${transitionCount}:`, event?.type);
});
```

## 性能调试

### 检测慢转换

```typescript
const machine = createMachine({
  actions: {
    measurePerformance: ({ context, event }) => {
      const start = performance.now();
      
      // 执行操作...
      
      const end = performance.now();
      if (end - start > 16) { // 超过一帧
        console.warn(`慢操作: ${end - start}ms`, event);
      }
    }
  }
});
```

### 内存泄漏检测

```typescript
// 确保 Actor 被正确停止
useEffect(() => {
  const actor = createActor(machine);
  actor.start();
  
  return () => {
    actor.stop(); // 重要：清理 Actor
  };
}, []);
```

## 错误调试

### 捕获状态机错误

```typescript
const machine = createMachine({
  states: {
    loading: {
      invoke: {
        src: async () => {
          throw new Error('测试错误');
        },
        onError: {
          target: 'error',
          actions: ({ event }) => {
            console.error('捕获到错误:', event.error);
            console.error('错误堆栈:', event.error.stack);
          }
        }
      }
    }
  }
});
```

### 全局错误处理

```typescript
const actor = createActor(machine);

actor.subscribe({
  next: (snapshot) => {
    if (snapshot.status === 'error') {
      console.error('Actor 错误:', snapshot.error);
    }
  },
  error: (err) => {
    console.error('订阅错误:', err);
  }
});
```

## 最佳实践

### 1. 开发环境使用详细日志

```typescript
const isDev = process.env.NODE_ENV === 'development';

const machine = createMachine({
  actions: {
    log: isDev 
      ? ({ context, event }) => console.log('Debug:', { context, event })
      : () => {}
  }
});
```

### 2. 使用有意义的状态和事件名称

```typescript
// ✅ 好的
states: {
  fetchingUserData: {},
  userDataLoaded: {}
}

// ❌ 避免
states: {
  state1: {},
  state2: {}
}
```

### 3. 添加状态描述

```typescript
states: {
  loading: {
    description: '正在从服务器获取用户数据',
    // ...
  }
}
```

## 下一步

[👉 18. TypeScript 高级用法](./18-typescript-advanced.md)
