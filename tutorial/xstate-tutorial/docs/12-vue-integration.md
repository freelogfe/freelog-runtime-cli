# 12. Vue 集成

XState 可以与 Vue 3 很好地集成，使用 Composition API 可以轻松地在 Vue 组件中使用状态机。

## 安装

```bash
pnpm add xstate
```

## 基本用法

### 使用 useMachine (Composition API)

```typescript
<script setup lang="ts">
import { useMachine } from '@xstate/vue';
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

const { state, send } = useMachine(toggleMachine);
</script>

<template>
  <button @click="send({ type: 'TOGGLE' })">
    {{ state.value === 'active' ? 'ON' : 'OFF' }}
  </button>
</template>
```

## 完整示例：计数器

```typescript
<script setup lang="ts">
import { useMachine } from '@xstate/vue';
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

const { state, send } = useMachine(counterMachine);
</script>

<template>
  <div>
    <h2>计数: {{ state.context.count }}</h2>
    <button @click="send({ type: 'INCREMENT' })">+</button>
    <button @click="send({ type: 'DECREMENT' })">-</button>
    <button @click="send({ type: 'RESET' })">重置</button>
  </div>
</template>
```

## 表单示例

```typescript
<script setup lang="ts">
import { useMachine } from '@xstate/vue';
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

const { state, send } = useMachine(formMachine);

const handleSubmit = (e: Event) => {
  e.preventDefault();
  send({ type: 'SUBMIT' });
};
</script>

<template>
  <form @submit="handleSubmit">
    <div>
      <input
        type="email"
        :value="state.context.email"
        @input="send({ type: 'INPUT_EMAIL', value: ($event.target as HTMLInputElement).value })"
      />
      <span v-if="state.context.errors.email">
        {{ state.context.errors.email }}
      </span>
    </div>
    <div>
      <input
        type="password"
        :value="state.context.password"
        @input="send({ type: 'INPUT_PASSWORD', value: ($event.target as HTMLInputElement).value })"
      />
      <span v-if="state.context.errors.password">
        {{ state.context.errors.password }}
      </span>
    </div>
    <button type="submit" :disabled="state.matches('submitting')">
      {{ state.matches('submitting') ? '提交中...' : '登录' }}
    </button>
    <p v-if="state.matches('error')">登录失败，请重试</p>
  </form>
</template>
```

## 条件渲染

```vue
<template>
  <div>
    <div v-if="state.matches('idle')">
      <IdleView />
    </div>
    <div v-else-if="state.matches('loading')">
      <LoadingView />
    </div>
    <div v-else-if="state.matches('success')">
      <SuccessView />
    </div>
    <div v-else-if="state.matches('error')">
      <ErrorView />
    </div>
  </div>
</template>
```

## 使用 provide/inject

```typescript
// machine.ts
import { provide, inject } from 'vue';
import { useMachine } from '@xstate/vue';

const MachineSymbol = Symbol('machine');

export function provideMachine(machine: any) {
  const { state, send } = useMachine(machine);
  provide(MachineSymbol, { state, send });
}

export function useMachineContext() {
  const context = inject(MachineSymbol);
  if (!context) {
    throw new Error('useMachineContext must be used within a provider');
  }
  return context;
}

// App.vue
<script setup lang="ts">
import { provideMachine } from './machine';
import { counterMachine } from './counterMachine';

provideMachine(counterMachine);
</script>

// ChildComponent.vue
<script setup lang="ts">
import { useMachineContext } from './machine';

const { state, send } = useMachineContext();
</script>
```

## 下一步

[👉 13. Node.js 后端应用](./13-nodejs-backend.md)
