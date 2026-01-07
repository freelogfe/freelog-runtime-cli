# 13. Node.js 后端应用

XState 不仅可以在前端使用，也可以在后端 Node.js 应用中用于管理复杂的状态逻辑。

## 为什么在后端使用 XState？

- **工作流引擎**: 管理复杂的业务流程
- **状态机协议**: 实现状态机协议（如 WebSocket）
- **订单处理**: 管理订单状态转换
- **审批流程**: 管理审批工作流
- **游戏服务器**: 管理游戏状态

## 基本用法

### 创建状态机

```typescript
import { createMachine, createActor } from 'xstate';

const orderMachine = createMachine({
  id: 'order',
  initial: 'pending',
  context: {
    orderId: null,
    amount: 0,
    paymentId: null
  },
  states: {
    pending: {
      on: {
        PAY: 'processing'
      }
    },
    processing: {
      invoke: {
        src: 'processPayment',
        onDone: 'paid',
        onError: 'failed'
      }
    },
    paid: {
      type: 'final'
    },
    failed: {
      on: {
        RETRY: 'processing'
      }
    }
  }
});
```

### 在 Express 中使用

```typescript
import express from 'express';
import { createActor } from 'xstate';

const app = express();
app.use(express.json());

// 存储订单 Actor
const orderActors = new Map<string, any>();

app.post('/orders', (req, res) => {
  const orderId = generateOrderId();
  const actor = createActor(orderMachine, {
    input: {
      orderId,
      amount: req.body.amount
    }
  });
  
  actor.start();
  orderActors.set(orderId, actor);
  
  res.json({ orderId, status: actor.getSnapshot().value });
});

app.post('/orders/:orderId/pay', async (req, res) => {
  const actor = orderActors.get(req.params.orderId);
  if (!actor) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  actor.send({ type: 'PAY', paymentData: req.body });
  
  // 等待状态变化
  const subscription = actor.subscribe((snapshot) => {
    if (snapshot.status === 'done') {
      subscription.unsubscribe();
      res.json({ status: snapshot.value, output: snapshot.output });
    }
  });
});
```

## 实际案例：支付流程

```typescript
import { createMachine, createActor, assign } from 'xstate';

interface PaymentContext {
  orderId: string;
  amount: number;
  paymentMethod: string;
  paymentId: string | null;
  error: string | null;
}

const paymentMachine = createMachine({
  types: {
    context: {} as PaymentContext
  },
  context: {
    orderId: '',
    amount: 0,
    paymentMethod: '',
    paymentId: null,
    error: null
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        INITIATE_PAYMENT: {
          target: 'validating',
          actions: assign({
            orderId: ({ event }) => event.orderId,
            amount: ({ event }) => event.amount,
            paymentMethod: ({ event }) => event.paymentMethod
          })
        }
      }
    },
    validating: {
      invoke: {
        src: async ({ context }) => {
          // 验证支付信息
          if (context.amount <= 0) {
            throw new Error('Invalid amount');
          }
          if (!context.paymentMethod) {
            throw new Error('Payment method required');
          }
          return true;
        },
        onDone: 'processing',
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error.message
          })
        }
      }
    },
    processing: {
      invoke: {
        src: async ({ context }) => {
          // 调用支付网关
          const paymentGateway = getPaymentGateway(context.paymentMethod);
          const result = await paymentGateway.charge({
            amount: context.amount,
            orderId: context.orderId
          });
          return result;
        },
        onDone: {
          target: 'completed',
          actions: assign({
            paymentId: ({ event }) => event.output.paymentId
          })
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error.message
          })
        }
      }
    },
    completed: {
      type: 'final',
      entry: ({ context }) => {
        console.log(`Payment completed for order ${context.orderId}`);
      }
    },
    failed: {
      on: {
        RETRY: 'processing',
        CANCEL: 'cancelled'
      }
    },
    cancelled: {
      type: 'final'
    },
    error: {
      on: {
        RETRY: 'validating'
      }
    }
  }
});
```

## Express 路由集成

```typescript
import express from 'express';
import { createActor } from 'xstate';

const app = express();
app.use(express.json());

const paymentActors = new Map<string, any>();

// 创建支付
app.post('/payments', async (req, res) => {
  const paymentId = generateId();
  const actor = createActor(paymentMachine, {
    input: {
      orderId: req.body.orderId,
      amount: req.body.amount,
      paymentMethod: req.body.paymentMethod
    }
  });
  
  actor.start();
  actor.send({ type: 'INITIATE_PAYMENT', ...req.body });
  paymentActors.set(paymentId, actor);
  
  // 等待完成或失败
  const result = await new Promise((resolve) => {
    const subscription = actor.subscribe((snapshot) => {
      if (snapshot.status === 'done' || snapshot.matches('failed')) {
        subscription.unsubscribe();
        resolve({
          status: snapshot.value,
          context: snapshot.context
        });
      }
    });
  });
  
  res.json({ paymentId, ...result });
});

// 查询支付状态
app.get('/payments/:paymentId', (req, res) => {
  const actor = paymentActors.get(req.params.paymentId);
  if (!actor) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  
  const snapshot = actor.getSnapshot();
  res.json({
    status: snapshot.value,
    context: snapshot.context
  });
});

// 重试支付
app.post('/payments/:paymentId/retry', (req, res) => {
  const actor = paymentActors.get(req.params.paymentId);
  if (!actor) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  
  actor.send({ type: 'RETRY' });
  res.json({ message: 'Retry initiated' });
});
```

## 数据库持久化

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 保存状态
const saveState = async (actorId: string, snapshot: any) => {
  await prisma.stateMachine.upsert({
    where: { id: actorId },
    update: {
      state: snapshot.value,
      context: snapshot.context,
      updatedAt: new Date()
    },
    create: {
      id: actorId,
      state: snapshot.value,
      context: snapshot.context
    }
  });
};

// 恢复状态
const restoreState = async (actorId: string) => {
  const saved = await prisma.stateMachine.findUnique({
    where: { id: actorId }
  });
  
  if (saved) {
    return {
      value: saved.state,
      context: saved.context
    };
  }
  return null;
};

// 使用
app.post('/payments', async (req, res) => {
  const paymentId = generateId();
  const savedState = await restoreState(paymentId);
  
  const actor = createActor(paymentMachine, {
    snapshot: savedState || undefined
  });
  
  actor.start();
  
  // 订阅并保存
  actor.subscribe((snapshot) => {
    saveState(paymentId, snapshot);
  });
  
  // ...
});
```

## 下一步

[👉 14. 完整项目案例说明](./14-project-overview.md)
