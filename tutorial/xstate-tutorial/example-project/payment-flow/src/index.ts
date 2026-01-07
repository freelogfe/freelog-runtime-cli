import express from 'express';
import { createActor } from 'xstate';
import { paymentMachine, PaymentEvent } from './paymentMachine.js';

const app = express();
app.use(express.json());

// 存储支付 Actor
const paymentActors = new Map<string, ReturnType<typeof createActor>>();

// 生成唯一 ID
function generateId(): string {
  return `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 创建支付
app.post('/payments', async (req, res) => {
  try {
    const { orderId, amount, paymentMethod } = req.body;

    if (!orderId || !amount || !paymentMethod) {
      return res.status(400).json({
        error: 'Missing required fields: orderId, amount, paymentMethod'
      });
    }

    const paymentId = generateId();
    const actor = createActor(paymentMachine);
    
    actor.start();
    actor.send({
      type: 'INITIATE_PAYMENT',
      orderId,
      amount: Number(amount),
      paymentMethod
    } as PaymentEvent);
    
    paymentActors.set(paymentId, actor);

    // 等待状态变化
    const result = await new Promise((resolve) => {
      const subscription = actor.subscribe((snapshot) => {
        if (snapshot.status === 'done' || snapshot.matches('failed')) {
          subscription.unsubscribe();
          resolve({
            paymentId,
            status: snapshot.value,
            context: snapshot.context,
            output: snapshot.output
          });
        }
      });
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 查询支付状态
app.get('/payments/:paymentId', (req, res) => {
  const actor = paymentActors.get(req.params.paymentId);
  
  if (!actor) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  const snapshot = actor.getSnapshot();
  res.json({
    paymentId: req.params.paymentId,
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

  const snapshot = actor.getSnapshot();
  
  if (!snapshot.can({ type: 'RETRY' })) {
    return res.status(400).json({
      error: 'Cannot retry payment in current state',
      currentState: snapshot.value
    });
  }

  actor.send({ type: 'RETRY' });
  
  res.json({
    message: 'Retry initiated',
    paymentId: req.params.paymentId
  });
});

// 取消支付
app.post('/payments/:paymentId/cancel', (req, res) => {
  const actor = paymentActors.get(req.params.paymentId);
  
  if (!actor) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  const snapshot = actor.getSnapshot();
  
  if (!snapshot.can({ type: 'CANCEL' })) {
    return res.status(400).json({
      error: 'Cannot cancel payment in current state',
      currentState: snapshot.value
    });
  }

  actor.send({ type: 'CANCEL' });
  
  res.json({
    message: 'Payment cancelled',
    paymentId: req.params.paymentId
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Payment API server running on http://localhost:${PORT}`);
  console.log('\n可用端点:');
  console.log('  POST   /payments              - 创建支付');
  console.log('  GET    /payments/:paymentId   - 查询支付状态');
  console.log('  POST   /payments/:paymentId/retry  - 重试支付');
  console.log('  POST   /payments/:paymentId/cancel - 取消支付');
});
