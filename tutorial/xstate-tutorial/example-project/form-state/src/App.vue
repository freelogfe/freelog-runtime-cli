<template>
  <div class="app">
    <div class="container">
      <h1>多步骤表单</h1>
      <p class="subtitle">使用 XState 管理表单状态</p>

      <!-- 步骤指示器 -->
      <div class="steps">
        <div
          v-for="step in 3"
          :key="step"
          :class="['step', { active: snapshot.context.step === step, completed: snapshot.context.step > step }]"
        >
          <div class="step-number">{{ step }}</div>
          <div class="step-label">
            {{ step === 1 ? '个人信息' : step === 2 ? '地址信息' : '支付信息' }}
          </div>
        </div>
      </div>

      <!-- 表单内容 -->
      <div class="form-content">
        <!-- 步骤 1: 个人信息 -->
        <div v-if="snapshot.matches('step1') || snapshot.matches('validatingStep1')" class="form-step">
          <h2>个人信息</h2>
          <div class="form-group">
            <label>姓名</label>
            <input
              type="text"
              :value="snapshot.context.personalInfo.name"
              @input="updatePersonal('name', ($event.target as HTMLInputElement).value)"
            />
            <span v-if="snapshot.context.errors.name" class="error">
              {{ snapshot.context.errors.name }}
            </span>
          </div>
          <div class="form-group">
            <label>邮箱</label>
            <input
              type="email"
              :value="snapshot.context.personalInfo.email"
              @input="updatePersonal('email', ($event.target as HTMLInputElement).value)"
            />
            <span v-if="snapshot.context.errors.email" class="error">
              {{ snapshot.context.errors.email }}
            </span>
          </div>
          <div class="form-group">
            <label>电话</label>
            <input
              type="tel"
              :value="snapshot.context.personalInfo.phone"
              @input="updatePersonal('phone', ($event.target as HTMLInputElement).value)"
            />
            <span v-if="snapshot.context.errors.phone" class="error">
              {{ snapshot.context.errors.phone }}
            </span>
          </div>
          <div class="form-actions">
            <button @click="send({ type: 'NEXT' })" class="btn-primary">
              下一步
            </button>
          </div>
        </div>

        <!-- 步骤 2: 地址信息 -->
        <div v-if="snapshot.matches('step2') || snapshot.matches('validatingStep2')" class="form-step">
          <h2>地址信息</h2>
          <div class="form-group">
            <label>街道地址</label>
            <input
              type="text"
              :value="snapshot.context.addressInfo.street"
              @input="updateAddress('street', ($event.target as HTMLInputElement).value)"
            />
            <span v-if="snapshot.context.errors.street" class="error">
              {{ snapshot.context.errors.street }}
            </span>
          </div>
          <div class="form-group">
            <label>城市</label>
            <input
              type="text"
              :value="snapshot.context.addressInfo.city"
              @input="updateAddress('city', ($event.target as HTMLInputElement).value)"
            />
            <span v-if="snapshot.context.errors.city" class="error">
              {{ snapshot.context.errors.city }}
            </span>
          </div>
          <div class="form-group">
            <label>邮编</label>
            <input
              type="text"
              :value="snapshot.context.addressInfo.zipCode"
              @input="updateAddress('zipCode', ($event.target as HTMLInputElement).value)"
            />
            <span v-if="snapshot.context.errors.zipCode" class="error">
              {{ snapshot.context.errors.zipCode }}
            </span>
          </div>
          <div class="form-actions">
            <button @click="send({ type: 'PREVIOUS' })" class="btn-secondary">
              上一步
            </button>
            <button @click="send({ type: 'NEXT' })" class="btn-primary">
              下一步
            </button>
          </div>
        </div>

        <!-- 步骤 3: 支付信息 -->
        <div v-if="snapshot.matches('step3') || snapshot.matches('validatingStep3')" class="form-step">
          <h2>支付信息</h2>
          <div class="form-group">
            <label>卡号</label>
            <input
              type="text"
              :value="snapshot.context.paymentInfo.cardNumber"
              @input="updatePayment('cardNumber', ($event.target as HTMLInputElement).value)"
              placeholder="1234 5678 9012 3456"
            />
            <span v-if="snapshot.context.errors.cardNumber" class="error">
              {{ snapshot.context.errors.cardNumber }}
            </span>
          </div>
          <div class="form-group">
            <label>有效期</label>
            <input
              type="text"
              :value="snapshot.context.paymentInfo.expiryDate"
              @input="updatePayment('expiryDate', ($event.target as HTMLInputElement).value)"
              placeholder="MM/YY"
            />
            <span v-if="snapshot.context.errors.expiryDate" class="error">
              {{ snapshot.context.errors.expiryDate }}
            </span>
          </div>
          <div class="form-group">
            <label>CVV</label>
            <input
              type="text"
              :value="snapshot.context.paymentInfo.cvv"
              @input="updatePayment('cvv', ($event.target as HTMLInputElement).value)"
              placeholder="123"
            />
            <span v-if="snapshot.context.errors.cvv" class="error">
              {{ snapshot.context.errors.cvv }}
            </span>
          </div>
          <div class="form-actions">
            <button @click="send({ type: 'PREVIOUS' })" class="btn-secondary">
              上一步
            </button>
            <button
              @click="send({ type: 'SUBMIT' })"
              :disabled="snapshot.matches('submitting')"
              class="btn-primary"
            >
              {{ snapshot.matches('submitting') ? '提交中...' : '提交' }}
            </button>
          </div>
        </div>

        <!-- 提交中 -->
        <div v-if="snapshot.matches('submitting')" class="form-step">
          <div class="loading">
            <p>正在提交表单...</p>
          </div>
        </div>

        <!-- 成功 -->
        <div v-if="snapshot.matches('success')" class="form-step">
          <div class="success">
            <h2>✅ 提交成功！</h2>
            <p>您的表单已成功提交。</p>
            <button @click="reset" class="btn-primary">重新开始</button>
          </div>
        </div>

        <!-- 错误 -->
        <div v-if="snapshot.matches('error')" class="form-step">
          <div class="error-message">
            <h2>❌ 提交失败</h2>
            <p>请重试或返回修改。</p>
            <div class="form-actions">
              <button @click="send({ type: 'RETRY' })" class="btn-primary">
                重试
              </button>
              <button @click="send({ type: 'RESET' })" class="btn-secondary">
                重置
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { createActor } from 'xstate';
import { formMachine, FormEvent } from './formMachine';

const actor = createActor(formMachine);
const snapshot = ref(actor.getSnapshot());

onMounted(() => {
  actor.start();
  
  const subscription = actor.subscribe((newSnapshot) => {
    snapshot.value = newSnapshot;
  });
  
  return () => subscription.unsubscribe();
});

const send = (event: FormEvent) => {
  actor.send(event);
};

const updatePersonal = (field: string, value: string) => {
  send({
    type: 'UPDATE_PERSONAL',
    data: { [field]: value }
  });
};

const updateAddress = (field: string, value: string) => {
  send({
    type: 'UPDATE_ADDRESS',
    data: { [field]: value }
  });
};

const updatePayment = (field: string, value: string) => {
  send({
    type: 'UPDATE_PAYMENT',
    data: { [field]: value }
  });
};

const reset = () => {
  actor.stop();
  actor.start();
  send({ type: 'RESET' });
};
</script>

<style scoped>
.app {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 2rem;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  padding: 2rem;
  width: 100%;
  max-width: 600px;
}

h1 {
  color: #333;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
  margin-bottom: 2rem;
}

.steps {
  display: flex;
  justify-content: space-between;
  margin-bottom: 2rem;
  position: relative;
}

.steps::before {
  content: '';
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  height: 2px;
  background: #e0e0e0;
  z-index: 0;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 1;
}

.step-number {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e0e0e0;
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.step.active .step-number {
  background: #667eea;
  color: white;
}

.step.completed .step-number {
  background: #4ecdc4;
  color: white;
}

.step-label {
  font-size: 0.85rem;
  color: #666;
}

.form-content {
  margin-top: 2rem;
}

.form-step h2 {
  margin-bottom: 1.5rem;
  color: #333;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #666;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

.error {
  display: block;
  color: #ff6b6b;
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #5568d3;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #e0e0e0;
  color: #666;
}

.btn-secondary:hover {
  background: #d0d0d0;
}

.loading,
.success,
.error-message {
  text-align: center;
  padding: 2rem;
}

.success h2,
.error-message h2 {
  margin-bottom: 1rem;
}
</style>
