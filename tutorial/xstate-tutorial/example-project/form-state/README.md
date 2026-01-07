# XState 表单状态管理示例

这是一个使用 XState 管理多步骤表单状态的 Vue 3 应用示例。

## 功能特性

- ✅ 多步骤表单（3步）
- ✅ 表单验证
- ✅ 状态持久化（本地存储）
- ✅ Vue 3 Composition API
- ✅ 状态机管理所有状态

## 技术栈

- Vue 3
- TypeScript
- XState v5
- Vite

## 安装和运行

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 预览构建结果
pnpm preview
```

## 表单步骤

1. **个人信息**: 姓名、邮箱、电话
2. **地址信息**: 街道、城市、邮编
3. **支付信息**: 卡号、有效期、CVV

## 项目结构

```
src/
├── formMachine.ts  # 表单状态机定义
├── App.vue         # 主组件
└── main.ts         # 入口文件
```

## 核心概念

### 状态机

`formMachine` 定义了表单的所有状态和转换：

- **状态**: `step1`, `step2`, `step3`, `validatingStep1`, `validatingStep2`, `validatingStep3`, `submitting`, `success`, `error`
- **上下文**: `step`, `personalInfo`, `addressInfo`, `paymentInfo`, `errors`
- **事件**: `NEXT`, `PREVIOUS`, `UPDATE_PERSONAL`, `UPDATE_ADDRESS`, `UPDATE_PAYMENT`, `SUBMIT`, `RESET`

### 验证流程

每个步骤都有验证状态，确保数据正确后才允许进入下一步。

### 持久化

表单数据自动保存到 `localStorage`，刷新页面后数据不会丢失。

## 学习要点

1. **状态机定义**: 查看 `formMachine.ts` 了解如何定义复杂的状态机
2. **Vue 集成**: 查看 `App.vue` 了解如何在 Vue 中使用 XState
3. **表单验证**: 了解如何使用守卫和验证状态
4. **状态持久化**: 了解如何保存和恢复状态

## 扩展练习

1. 添加更多表单字段
2. 实现表单字段的动态验证
3. 添加表单进度条
4. 实现表单数据的服务器端保存
5. 添加表单字段的自动保存功能
