# 11. React 集成

XState 与 React 集成非常简单，提供了 `@xstate/react` 包来简化在 React 应用中使用状态机。

## 安装

```bash
pnpm add xstate @xstate/react
```

## useMachine Hook

`useMachine` 是最基本的 Hook，用于在 React 组件中使用状态机：

```typescript
import { useMachine } from '@xstate/react';
import { createMachine } from 'xstate';

const toggleMachine = createMachine({
  initial: 'inactive',
  states: {
    inactive: {
      on: { TOGGLE: 'active' }
    },
    active: {
      on: { TOGGLE: 'inactive' }
    }
  }
});

function Toggle() {
  const [snapshot, send] = useMachine(toggleMachine);

  return (
    <button onClick={() => send({ type: 'TOGGLE' })}>
      {snapshot.value === 'active' ? 'ON' : 'OFF'}
    </button>
  );
}
```

## useActor Hook

`useActor` 用于使用已创建的 Actor：

```typescript
import { useActor } from '@xstate/react';
import { createActor } from 'xstate';

const actor = createActor(machine);

function MyComponent() {
  const [snapshot, send] = useActor(actor);

  return (
    <div>
      <p>状态: {snapshot.value}</p>
      <button onClick={() => send({ type: 'START' })}>开始</button>
    </div>
  );
}
```

## 完整示例：计数器

```typescript
import { useMachine } from '@xstate/react';
import { createMachine, assign } from 'xstate';

const counterMachine = createMachine({
  types: {
    context: {} as { count: number }
  },
  context: { count: 0 },
  states: {
    idle: {
      on: {
        INCREMENT: {
          actions: assign({ count: ({ context }) => context.count + 1 })
        },
        DECREMENT: {
          actions: assign({ count: ({ context }) => context.count - 1 })
        },
        RESET: {
          actions: assign({ count: 0 })
        }
      }
    }
  }
});

function Counter() {
  const [snapshot, send] = useMachine(counterMachine);

  return (
    <div>
      <h2>计数: {snapshot.context.count}</h2>
      <button onClick={() => send({ type: 'INCREMENT' })}>+</button>
      <button onClick={() => send({ type: 'DECREMENT' })}>-</button>
      <button onClick={() => send({ type: 'RESET' })}>重置</button>
    </div>
  );
}
```

## 表单示例

```typescript
import { useMachine } from '@xstate/react';
import { createMachine, assign } from 'xstate';

const formMachine = createMachine({
  types: {
    context: {} as {
      email: string;
      password: string;
      errors: Record<string, string>;
    }
  },
  context: {
    email: '',
    password: '',
    errors: {}
  },
  states: {
    idle: {
      on: {
        INPUT_EMAIL: {
          actions: assign({
            email: ({ event }) => event.value,
            errors: ({ context }) => ({
              ...context.errors,
              email: ''
            })
          })
        },
        INPUT_PASSWORD: {
          actions: assign({
            password: ({ event }) => event.value,
            errors: ({ context }) => ({
              ...context.errors,
              password: ''
            })
          })
        },
        SUBMIT: 'validating'
      }
    },
    validating: {
      entry: assign({
        errors: ({ context }) => {
          const errors: Record<string, string> = {};
          if (!context.email) {
            errors.email = 'Email is required';
          }
          if (!context.password) {
            errors.password = 'Password is required';
          }
          return errors;
        }
      }),
      always: [
        {
          target: 'submitting',
          guard: ({ context }) => Object.keys(context.errors).length === 0
        },
        {
          target: 'idle'
        }
      ]
    },
    submitting: {
      invoke: {
        src: async ({ context }) => {
          const response = await fetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({
              email: context.email,
              password: context.password
            })
          });
          return response.json();
        },
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
});

function LoginForm() {
  const [snapshot, send] = useMachine(formMachine);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      send({ type: 'SUBMIT' });
    }}>
      <div>
        <input
          type="email"
          value={snapshot.context.email}
          onChange={(e) => send({
            type: 'INPUT_EMAIL',
            value: e.target.value
          })}
        />
        {snapshot.context.errors.email && (
          <span>{snapshot.context.errors.email}</span>
        )}
      </div>
      <div>
        <input
          type="password"
          value={snapshot.context.password}
          onChange={(e) => send({
            type: 'INPUT_PASSWORD',
            value: e.target.value
          })}
        />
        {snapshot.context.errors.password && (
          <span>{snapshot.context.errors.password}</span>
        )}
      </div>
      <button
        type="submit"
        disabled={snapshot.matches('submitting')}
      >
        {snapshot.matches('submitting') ? '提交中...' : '登录'}
      </button>
      {snapshot.matches('error') && (
        <p>登录失败，请重试</p>
      )}
    </form>
  );
}
```

## 条件渲染

```typescript
function MyComponent() {
  const [snapshot, send] = useMachine(machine);

  return (
    <div>
      {snapshot.matches('idle') && <IdleView />}
      {snapshot.matches('loading') && <LoadingView />}
      {snapshot.matches('success') && <SuccessView />}
      {snapshot.matches('error') && <ErrorView />}
    </div>
  );
}
```

## 使用 useSelector

`useSelector` 用于选择性地订阅状态的一部分：

```typescript
import { useSelector } from '@xstate/react';

function CountDisplay() {
  const count = useSelector(actor, (snapshot) => snapshot.context.count);

  return <div>计数: {count}</div>;
}
```

这样可以避免不必要的重渲染。

## 性能优化

### 使用 useMemo

```typescript
import { useMemo } from 'react';
import { useMachine } from '@xstate/react';

function MyComponent() {
  const machine = useMemo(() => createMachine({
    // ... 配置
  }), []);

  const [snapshot, send] = useMachine(machine);
  // ...
}
```

### 使用 useSelector 避免重渲染

```typescript
function ExpensiveComponent() {
  // 只订阅 count，其他状态变化不会导致重渲染
  const count = useSelector(actor, (snapshot) => snapshot.context.count);

  return <div>{count}</div>;
}
```

## 上下文提供者模式

```typescript
import { createContext, useContext } from 'react';
import { useMachine } from '@xstate/react';

const MachineContext = createContext(null);

function MachineProvider({ children }) {
  const [snapshot, send] = useMachine(machine);

  return (
    <MachineContext.Provider value={{ snapshot, send }}>
      {children}
    </MachineContext.Provider>
  );
}

function useMachineContext() {
  const context = useContext(MachineContext);
  if (!context) {
    throw new Error('useMachineContext must be used within MachineProvider');
  }
  return context;
}

// 使用
function App() {
  return (
    <MachineProvider>
      <MyComponent />
    </MachineProvider>
  );
}

function MyComponent() {
  const { snapshot, send } = useMachineContext();
  // ...
}
```

## useActorRef Hook

`useActorRef` 用于创建一个持久化的 Actor 引用：

```typescript
import { useActorRef } from '@xstate/react';

function MyComponent() {
  // Actor 在组件生命周期内保持不变
  const actorRef = useActorRef(machine);
  
  return (
    <div>
      <button onClick={() => actorRef.send({ type: 'START' })}>
        开始
      </button>
      <ChildComponent actorRef={actorRef} />
    </div>
  );
}

function ChildComponent({ actorRef }) {
  const [snapshot] = useActor(actorRef);
  return <div>状态: {snapshot.value}</div>;
}
```

## createActorContext

创建一个 React Context 来共享 Actor：

```typescript
import { createActorContext } from '@xstate/react';

// 创建 Context
const CounterContext = createActorContext(counterMachine);

// Provider
function App() {
  return (
    <CounterContext.Provider>
      <Counter />
      <Display />
    </CounterContext.Provider>
  );
}

// 消费者 - 使用 useSelector
function Display() {
  const count = CounterContext.useSelector((state) => state.context.count);
  return <div>计数: {count}</div>;
}

// 消费者 - 使用 useActorRef
function Counter() {
  const actorRef = CounterContext.useActorRef();
  
  return (
    <button onClick={() => actorRef.send({ type: 'INCREMENT' })}>
      增加
    </button>
  );
}
```

## 带初始状态的 useMachine

```typescript
function MyComponent({ initialCount }) {
  const [snapshot, send] = useMachine(counterMachine, {
    input: { initialCount }
  });
  
  // ...
}
```

## 状态持久化

```typescript
import { useMachine } from '@xstate/react';

function App() {
  const [snapshot, send, actorRef] = useMachine(machine, {
    // 从 localStorage 恢复状态
    snapshot: JSON.parse(localStorage.getItem('state') || 'null')
  });

  // 保存状态到 localStorage
  useEffect(() => {
    const subscription = actorRef.subscribe((state) => {
      localStorage.setItem('state', JSON.stringify(state));
    });
    return () => subscription.unsubscribe();
  }, [actorRef]);

  return (
    // ...
  );
}
```

## DevTools 集成

### 使用 @statelyai/inspect

```typescript
import { createBrowserInspector } from '@statelyai/inspect';
import { useMachine } from '@xstate/react';

const inspector = createBrowserInspector();

function App() {
  const [snapshot, send] = useMachine(machine, {
    inspect: inspector.inspect
  });

  return (
    // ...
  );
}
```

### 自定义 DevTools

```typescript
function useDebugMachine(machine) {
  const [snapshot, send, actorRef] = useMachine(machine);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      window.__XSTATE_ACTOR__ = actorRef;
      
      const subscription = actorRef.subscribe((state) => {
        console.log('XState:', {
          value: state.value,
          context: state.context
        });
      });

      return () => subscription.unsubscribe();
    }
  }, [actorRef]);

  return [snapshot, send, actorRef];
}
```

## 与 React Query 结合

```typescript
import { useMachine } from '@xstate/react';
import { useQuery } from '@tanstack/react-query';

function UserProfile({ userId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId)
  });

  const [snapshot, send] = useMachine(userMachine, {
    input: { user: data }
  });

  useEffect(() => {
    if (data) {
      send({ type: 'USER_LOADED', user: data });
    }
    if (error) {
      send({ type: 'USER_ERROR', error });
    }
  }, [data, error, send]);

  return (
    // ...
  );
}
```

## 表单与状态机

```typescript
import { useMachine } from '@xstate/react';
import { useForm } from 'react-hook-form';

function FormWithMachine() {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [snapshot, send] = useMachine(formMachine);

  const onSubmit = (data) => {
    send({ type: 'SUBMIT', data });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email', { required: true })} />
      {errors.email && <span>邮箱必填</span>}
      
      <button 
        type="submit" 
        disabled={snapshot.matches('submitting')}
      >
        {snapshot.matches('submitting') ? '提交中...' : '提交'}
      </button>
      
      {snapshot.matches('success') && <p>提交成功！</p>}
      {snapshot.matches('error') && <p>提交失败</p>}
    </form>
  );
}
```

## 下一步

[👉 12. Vue 集成](./12-vue-integration.md)
