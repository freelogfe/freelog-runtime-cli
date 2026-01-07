import { createMachine, assign } from 'xstate';

export interface FormContext {
  step: number;
  personalInfo: {
    name: string;
    email: string;
    phone: string;
  };
  addressInfo: {
    street: string;
    city: string;
    zipCode: string;
  };
  paymentInfo: {
    cardNumber: string;
    expiryDate: string;
    cvv: string;
  };
  errors: Record<string, string>;
}

export type FormEvent =
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'UPDATE_PERSONAL'; data: Partial<FormContext['personalInfo']> }
  | { type: 'UPDATE_ADDRESS'; data: Partial<FormContext['addressInfo']> }
  | { type: 'UPDATE_PAYMENT'; data: Partial<FormContext['paymentInfo']> }
  | { type: 'SUBMIT' }
  | { type: 'RESET' };

const STORAGE_KEY = 'xstate-form';

// 从本地存储加载
const loadFormData = (): Partial<FormContext> | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

// 保存到本地存储
const saveFormData = (context: FormContext) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  } catch (error) {
    console.error('Failed to save form data:', error);
  }
};

export const formMachine = createMachine({
  types: {
    context: {} as FormContext,
    events: {} as FormEvent
  },
  id: 'form',
  initial: 'step1',
  context: (() => {
    const saved = loadFormData();
    return {
      step: saved?.step || 1,
      personalInfo: saved?.personalInfo || {
        name: '',
        email: '',
        phone: ''
      },
      addressInfo: saved?.addressInfo || {
        street: '',
        city: '',
        zipCode: ''
      },
      paymentInfo: saved?.paymentInfo || {
        cardNumber: '',
        expiryDate: '',
        cvv: ''
      },
      errors: {}
    };
  })(),
  states: {
    step1: {
      on: {
        UPDATE_PERSONAL: {
          actions: [
            assign({
              personalInfo: ({ context, event }) => ({
                ...context.personalInfo,
                ...event.data
              }),
              errors: ({ context }) => ({
                ...context.errors,
                ...Object.keys(event.data).reduce((acc, key) => {
                  acc[key] = '';
                  return acc;
                }, {} as Record<string, string>)
              })
            }),
            ({ context }) => saveFormData(context)
          ]
        },
        NEXT: {
          target: 'validatingStep1',
          guard: ({ context }) => {
            return !!(
              context.personalInfo.name &&
              context.personalInfo.email &&
              context.personalInfo.phone
            );
          }
        }
      }
    },
    validatingStep1: {
      entry: assign({
        errors: ({ context }) => {
          const errors: Record<string, string> = {};
          if (!context.personalInfo.name) {
            errors.name = '姓名是必填项';
          }
          if (!context.personalInfo.email) {
            errors.email = '邮箱是必填项';
          } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.personalInfo.email)) {
            errors.email = '邮箱格式不正确';
          }
          if (!context.personalInfo.phone) {
            errors.phone = '电话是必填项';
          } else if (!/^\d{11}$/.test(context.personalInfo.phone)) {
            errors.phone = '电话格式不正确（11位数字）';
          }
          return errors;
        }
      }),
      always: [
        {
          target: 'step2',
          guard: ({ context }) => Object.keys(context.errors).length === 0
        },
        {
          target: 'step1'
        }
      ]
    },
    step2: {
      on: {
        UPDATE_ADDRESS: {
          actions: [
            assign({
              addressInfo: ({ context, event }) => ({
                ...context.addressInfo,
                ...event.data
              }),
              errors: ({ context }) => ({
                ...context.errors,
                ...Object.keys(event.data).reduce((acc, key) => {
                  acc[key] = '';
                  return acc;
                }, {} as Record<string, string>)
              })
            }),
            ({ context }) => saveFormData(context)
          ]
        },
        PREVIOUS: 'step1',
        NEXT: {
          target: 'validatingStep2',
          guard: ({ context }) => {
            return !!(
              context.addressInfo.street &&
              context.addressInfo.city &&
              context.addressInfo.zipCode
            );
          }
        }
      }
    },
    validatingStep2: {
      entry: assign({
        errors: ({ context }) => {
          const errors: Record<string, string> = {};
          if (!context.addressInfo.street) {
            errors.street = '街道地址是必填项';
          }
          if (!context.addressInfo.city) {
            errors.city = '城市是必填项';
          }
          if (!context.addressInfo.zipCode) {
            errors.zipCode = '邮编是必填项';
          } else if (!/^\d{6}$/.test(context.addressInfo.zipCode)) {
            errors.zipCode = '邮编格式不正确（6位数字）';
          }
          return errors;
        }
      }),
      always: [
        {
          target: 'step3',
          guard: ({ context }) => Object.keys(context.errors).length === 0
        },
        {
          target: 'step2'
        }
      ]
    },
    step3: {
      on: {
        UPDATE_PAYMENT: {
          actions: [
            assign({
              paymentInfo: ({ context, event }) => ({
                ...context.paymentInfo,
                ...event.data
              }),
              errors: ({ context }) => ({
                ...context.errors,
                ...Object.keys(event.data).reduce((acc, key) => {
                  acc[key] = '';
                  return acc;
                }, {} as Record<string, string>)
              })
            }),
            ({ context }) => saveFormData(context)
          ]
        },
        PREVIOUS: 'step2',
        SUBMIT: {
          target: 'validatingStep3',
          guard: ({ context }) => {
            return !!(
              context.paymentInfo.cardNumber &&
              context.paymentInfo.expiryDate &&
              context.paymentInfo.cvv
            );
          }
        }
      }
    },
    validatingStep3: {
      entry: assign({
        errors: ({ context }) => {
          const errors: Record<string, string> = {};
          if (!context.paymentInfo.cardNumber) {
            errors.cardNumber = '卡号是必填项';
          } else if (!/^\d{16}$/.test(context.paymentInfo.cardNumber.replace(/\s/g, ''))) {
            errors.cardNumber = '卡号格式不正确（16位数字）';
          }
          if (!context.paymentInfo.expiryDate) {
            errors.expiryDate = '有效期是必填项';
          } else if (!/^\d{2}\/\d{2}$/.test(context.paymentInfo.expiryDate)) {
            errors.expiryDate = '有效期格式不正确（MM/YY）';
          }
          if (!context.paymentInfo.cvv) {
            errors.cvv = 'CVV 是必填项';
          } else if (!/^\d{3}$/.test(context.paymentInfo.cvv)) {
            errors.cvv = 'CVV 格式不正确（3位数字）';
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
          target: 'step3'
        }
      ]
    },
    submitting: {
      invoke: {
        src: async ({ context }) => {
          // 模拟 API 调用
          await new Promise(resolve => setTimeout(resolve, 2000));
          return {
            success: true,
            orderId: `order_${Date.now()}`
          };
        },
        onDone: 'success',
        onError: 'error'
      }
    },
    success: {
      type: 'final',
      entry: ({ context }) => {
        localStorage.removeItem(STORAGE_KEY);
        console.log('表单提交成功！');
      }
    },
    error: {
      on: {
        RETRY: 'submitting',
        RESET: {
          target: 'step1',
          actions: assign({
            step: 1,
            errors: {}
          })
        }
      }
    }
  }
});
