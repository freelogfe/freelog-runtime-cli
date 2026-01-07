# 16. 测试状态机

测试是确保状态机正确工作的重要环节。XState 提供了多种测试方式，从单元测试到集成测试。

## 为什么测试状态机？

状态机的优势之一是**可测试性**：

- 状态和转换都是确定性的
- 可以独立于 UI 测试业务逻辑
- 可以覆盖所有状态和转换路径

## 基本测试方法

### 测试状态转换

```typescript
import { createMachine, createActor } from 'xstate';

const toggleMachine = createMachine({
  initial: 'inactive',
  states: {
    inactive: { on: { TOGGLE: 'active' } },
    active: { on: { TOGGLE: 'inactive' } }
  }
});

// 测试
describe('toggleMachine', () => {
  it('应该从 inactive 开始', () => {
    const actor = createActor(toggleMachine);
    actor.start();
    
    expect(actor.getSnapshot().value).toBe('inactive');
  });

  it('TOGGLE 应该切换状态', () => {
    const actor = createActor(toggleMachine);
    actor.start();
    
    actor.send({ type: 'TOGGLE' });
    expect(actor.getSnapshot().value).toBe('active');
    
    actor.send({ type: 'TOGGLE' });
    expect(actor.getSnapshot().value).toBe('inactive');
  });
});
```

### 测试上下文更新

```typescript
import { createMachine, createActor, assign } from 'xstate';

const counterMachine = createMachine({
  context: { count: 0 },
  initial: 'idle',
  states: {
    idle: {
      on: {
        INCREMENT: {
          actions: assign({ count: ({ context }) => context.count + 1 })
        },
        DECREMENT: {
          actions: assign({ count: ({ context }) => context.count - 1 })
        },
        SET: {
          actions: assign({ count: ({ event }) => event.value })
        }
      }
    }
  }
});

describe('counterMachine', () => {
  it('INCREMENT 应该增加计数', () => {
    const actor = createActor(counterMachine);
    actor.start();
    
    actor.send({ type: 'INCREMENT' });
    expect(actor.getSnapshot().context.count).toBe(1);
    
    actor.send({ type: 'INCREMENT' });
    expect(actor.getSnapshot().context.count).toBe(2);
  });

  it('SET 应该设置特定值', () => {
    const actor = createActor(counterMachine);
    actor.start();
    
    actor.send({ type: 'SET', value: 100 });
    expect(actor.getSnapshot().context.count).toBe(100);
  });

  it('应该支持初始上下文', () => {
    const actor = createActor(counterMachine.provide({
      context: { count: 10 }
    }));
    actor.start();
    
    expect(actor.getSnapshot().context.count).toBe(10);
  });
});
```

### 测试守卫

```typescript
const machine = createMachine({
  context: { count: 0, maxCount: 5 },
  initial: 'counting',
  states: {
    counting: {
      on: {
        INCREMENT: [
          {
            target: 'maxReached',
            guard: ({ context }) => context.count >= context.maxCount
          },
          {
            actions: assign({ count: ({ context }) => context.count + 1 })
          }
        ]
      }
    },
    maxReached: {}
  }
});

describe('守卫测试', () => {
  it('计数达到最大值时应该转换到 maxReached', () => {
    const actor = createActor(machine.provide({
      context: { count: 5, maxCount: 5 }
    }));
    actor.start();
    
    actor.send({ type: 'INCREMENT' });
    expect(actor.getSnapshot().value).toBe('maxReached');
  });

  it('计数未达到最大值时应该继续计数', () => {
    const actor = createActor(machine);
    actor.start();
    
    actor.send({ type: 'INCREMENT' });
    expect(actor.getSnapshot().value).toBe('counting');
    expect(actor.getSnapshot().context.count).toBe(1);
  });
});
```

## 测试异步操作

### 使用 waitFor

```typescript
import { createActor, waitFor } from 'xstate';

const fetchMachine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: { FETCH: 'loading' }
    },
    loading: {
      invoke: {
        src: async () => {
          const response = await fetch('/api/data');
          return response.json();
        },
        onDone: 'success',
        onError: 'error'
      }
    },
    success: {},
    error: {}
  }
});

describe('fetchMachine', () => {
  it('应该成功获取数据', async () => {
    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ data: 'test' })
    });

    const actor = createActor(fetchMachine);
    actor.start();
    
    actor.send({ type: 'FETCH' });
    
    // 等待状态变化
    const snapshot = await waitFor(actor, (state) => 
      state.matches('success')
    );
    
    expect(snapshot.value).toBe('success');
  });

  it('应该处理错误', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('网络错误'));

    const actor = createActor(fetchMachine);
    actor.start();
    
    actor.send({ type: 'FETCH' });
    
    const snapshot = await waitFor(actor, (state) => 
      state.matches('error')
    );
    
    expect(snapshot.value).toBe('error');
  });
});
```

### Mock 服务

```typescript
const machine = createMachine({
  initial: 'loading',
  context: { data: null },
  states: {
    loading: {
      invoke: {
        src: 'fetchData',
        onDone: {
          target: 'success',
          actions: assign({ data: ({ event }) => event.output })
        },
        onError: 'error'
      }
    },
    success: {},
    error: {}
  }
});

describe('使用 mock 服务', () => {
  it('应该使用 mock 数据', async () => {
    const mockData = { id: 1, name: 'Test' };
    
    const actor = createActor(machine.provide({
      actors: {
        fetchData: () => Promise.resolve(mockData)
      }
    }));
    actor.start();
    
    const snapshot = await waitFor(actor, (state) => 
      state.matches('success')
    );
    
    expect(snapshot.context.data).toEqual(mockData);
  });
});
```

## 测试动作

```typescript
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: {
        START: {
          target: 'active',
          actions: 'logStart'
        }
      }
    },
    active: {}
  }
});

describe('动作测试', () => {
  it('START 应该触发 logStart 动作', () => {
    const logStartMock = jest.fn();
    
    const actor = createActor(machine.provide({
      actions: {
        logStart: logStartMock
      }
    }));
    actor.start();
    
    actor.send({ type: 'START' });
    
    expect(logStartMock).toHaveBeenCalled();
  });
});
```

## 测试延迟事件

```typescript
import { createActor, waitFor } from 'xstate';

const timeoutMachine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: { START: 'waiting' }
    },
    waiting: {
      after: {
        1000: 'timeout'
      }
    },
    timeout: {}
  }
});

describe('延迟事件测试', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('应该在1秒后超时', async () => {
    const actor = createActor(timeoutMachine);
    actor.start();
    
    actor.send({ type: 'START' });
    expect(actor.getSnapshot().value).toBe('waiting');
    
    // 快进时间
    jest.advanceTimersByTime(1000);
    
    expect(actor.getSnapshot().value).toBe('timeout');
  });
});
```

## 测试并行状态

```typescript
const parallelMachine = createMachine({
  type: 'parallel',
  states: {
    ui: {
      initial: 'visible',
      states: {
        visible: { on: { HIDE: 'hidden' } },
        hidden: { on: { SHOW: 'visible' } }
      }
    },
    data: {
      initial: 'idle',
      states: {
        idle: { on: { LOAD: 'loading' } },
        loading: { on: { SUCCESS: 'loaded' } },
        loaded: {}
      }
    }
  }
});

describe('并行状态测试', () => {
  it('应该同时处于两个状态', () => {
    const actor = createActor(parallelMachine);
    actor.start();
    
    expect(actor.getSnapshot().value).toEqual({
      ui: 'visible',
      data: 'idle'
    });
  });

  it('状态应该独立转换', () => {
    const actor = createActor(parallelMachine);
    actor.start();
    
    actor.send({ type: 'HIDE' });
    expect(actor.getSnapshot().value).toEqual({
      ui: 'hidden',
      data: 'idle'
    });
    
    actor.send({ type: 'LOAD' });
    expect(actor.getSnapshot().value).toEqual({
      ui: 'hidden',
      data: 'loading'
    });
  });
});
```

## 测试层次状态

```typescript
const hierarchicalMachine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: { START: 'active' }
    },
    active: {
      initial: 'loading',
      states: {
        loading: {
          on: { SUCCESS: 'ready' }
        },
        ready: {
          on: { REFRESH: 'loading' }
        }
      },
      on: {
        STOP: 'idle'
      }
    }
  }
});

describe('层次状态测试', () => {
  it('应该进入子状态', () => {
    const actor = createActor(hierarchicalMachine);
    actor.start();
    
    actor.send({ type: 'START' });
    expect(actor.getSnapshot().value).toEqual({ active: 'loading' });
  });

  it('matches 应该正确匹配层次状态', () => {
    const actor = createActor(hierarchicalMachine);
    actor.start();
    actor.send({ type: 'START' });
    
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches('active')).toBe(true);
    expect(snapshot.matches({ active: 'loading' })).toBe(true);
    expect(snapshot.matches('idle')).toBe(false);
  });
});
```

## 测试 Actor 通信

```typescript
const childMachine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: { START: 'running' }
    },
    running: {
      on: {
        COMPLETE: 'done'
      }
    },
    done: {
      type: 'final'
    }
  }
});

const parentMachine = createMachine({
  initial: 'active',
  states: {
    active: {
      invoke: {
        id: 'child',
        src: childMachine,
        onDone: 'completed'
      }
    },
    completed: {}
  }
});

describe('Actor 通信测试', () => {
  it('子 Actor 完成时父 Actor 应该转换', async () => {
    const actor = createActor(parentMachine);
    actor.start();
    
    // 获取子 Actor 引用并发送事件
    const childRef = actor.getSnapshot().children.child;
    childRef.send({ type: 'START' });
    childRef.send({ type: 'COMPLETE' });
    
    const snapshot = await waitFor(actor, (state) => 
      state.matches('completed')
    );
    
    expect(snapshot.value).toBe('completed');
  });
});
```

## 测试工具函数

### 创建测试辅助函数

```typescript
// testUtils.ts
import { createActor, AnyStateMachine, waitFor } from 'xstate';

export function createTestActor<T extends AnyStateMachine>(
  machine: T,
  options?: { context?: any }
) {
  const testMachine = options?.context 
    ? machine.provide({ context: options.context })
    : machine;
  
  const actor = createActor(testMachine);
  actor.start();
  return actor;
}

export async function expectState(actor: any, expectedState: string | object) {
  const snapshot = actor.getSnapshot();
  expect(snapshot.matches(expectedState)).toBe(true);
}

export async function sendAndWait(
  actor: any,
  event: { type: string; [key: string]: any },
  expectedState: string | object
) {
  actor.send(event);
  const snapshot = await waitFor(actor, (state) => 
    state.matches(expectedState)
  );
  return snapshot;
}

// 使用
describe('使用测试工具', () => {
  it('应该简化测试代码', async () => {
    const actor = createTestActor(machine, { context: { count: 0 } });
    
    await expectState(actor, 'idle');
    await sendAndWait(actor, { type: 'START' }, 'active');
  });
});
```

## 覆盖率测试

测试所有可能的状态路径：

```typescript
describe('完整覆盖率测试', () => {
  // 测试所有状态
  it.each([
    ['idle', []],
    ['loading', [{ type: 'START' }]],
    ['success', [{ type: 'START' }, { type: 'SUCCESS' }]],
    ['error', [{ type: 'START' }, { type: 'ERROR' }]]
  ])('应该能够到达状态 %s', (expectedState, events) => {
    const actor = createActor(machine);
    actor.start();
    
    events.forEach(event => actor.send(event));
    
    expect(actor.getSnapshot().value).toBe(expectedState);
  });

  // 测试所有事件
  it.each([
    ['idle', 'START', 'loading'],
    ['loading', 'SUCCESS', 'success'],
    ['loading', 'ERROR', 'error'],
    ['error', 'RETRY', 'loading']
  ])('在 %s 状态下 %s 应该转换到 %s', (from, event, to) => {
    // 设置初始状态...
    const actor = createActor(machine);
    actor.start();
    
    // 到达初始状态
    // ...
    
    actor.send({ type: event });
    expect(actor.getSnapshot().value).toBe(to);
  });
});
```

## 最佳实践

### 1. 独立测试状态逻辑

```typescript
// ✅ 好的：独立于 UI 测试状态逻辑
describe('业务逻辑', () => {
  it('应该正确处理状态转换', () => {
    // 只测试状态机
  });
});

// ❌ 避免：在 UI 测试中测试状态逻辑
```

### 2. 使用 Mock 替换外部依赖

```typescript
// ✅ 好的：Mock 外部服务
const actor = createActor(machine.provide({
  actors: {
    fetchData: () => Promise.resolve(mockData)
  }
}));
```

### 3. 测试边界情况

```typescript
// ✅ 好的：测试边界情况
it('当计数为0时不应该减少', () => {
  // ...
});

it('当达到最大值时应该停止增加', () => {
  // ...
});
```

## 下一步

[👉 17. 调试与开发工具](./17-debugging.md)
