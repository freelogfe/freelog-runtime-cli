import { createMachine, assign } from 'xstate';

export interface PaymentContext {
  orderId: string;
  amount: number;
  paymentMethod: string;
  paymentId: string | null;
  error: string | null;
}

export type PaymentEvent =
  | { type: 'INITIATE_PAYMENT'; orderId: string; amount: number; paymentMethod: string }
  | { type: 'RETRY' }
  | { type: 'CANCEL' };

// 模拟支付网关
const mockPaymentGateway = {
  async charge(paymentData: { amount: number; orderId: string; paymentMethod: string }) {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模拟支付成功/失败（90% 成功率）
    if (Math.random() > 0.1) {
      return {
        paymentId: `pay_${Date.now()}`,
        status: 'succeeded',
        transactionId: `txn_${Date.now()}`
      };
    } else {
      throw new Error('Payment gateway error: Insufficient funds');
    }
  }
};

export const paymentMachine = createMachine({
  types: {
    context: {} as PaymentContext,
    events: {} as PaymentEvent
  },
  id: 'payment',
  initial: 'idle',
  context: {
    orderId: '',
    amount: 0,
    paymentMethod: '',
    paymentId: null,
    error: null
  },
  states: {
    idle: {
      on: {
        INITIATE_PAYMENT: {
          target: 'validating',
          actions: assign({
            orderId: ({ event }) => event.orderId,
            amount: ({ event }) => event.amount,
            paymentMethod: ({ event }) => event.paymentMethod,
            error: null
          })
        }
      }
    },
    validating: {
      invoke: {
        src: async ({ context }) => {
          // 验证支付信息
          if (context.amount <= 0) {
            throw new Error('Invalid amount: Amount must be greater than 0');
          }
          if (!context.paymentMethod) {
            throw new Error('Payment method is required');
          }
          if (!['credit_card', 'debit_card', 'paypal'].includes(context.paymentMethod)) {
            throw new Error('Invalid payment method');
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
          console.log(`Processing payment for order ${context.orderId}...`);
          const result = await mockPaymentGateway.charge({
            amount: context.amount,
            orderId: context.orderId,
            paymentMethod: context.paymentMethod
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
        console.log(`✅ Payment completed for order ${context.orderId}`);
        console.log(`   Payment ID: ${context.paymentId}`);
      }
    },
    failed: {
      on: {
        RETRY: {
          target: 'processing',
          actions: assign({ error: null })
        },
        CANCEL: 'cancelled'
      }
    },
    cancelled: {
      type: 'final',
      entry: ({ context }) => {
        console.log(`❌ Payment cancelled for order ${context.orderId}`);
      }
    },
    error: {
      on: {
        RETRY: 'validating'
      }
    }
  }
});
