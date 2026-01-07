# XState 支付流程示例

这是一个使用 XState 管理支付流程的 Node.js 后端应用示例。

## 功能特性

- ✅ 支付流程状态管理
- ✅ 支付验证
- ✅ 异步支付处理
- ✅ 错误处理与重试
- ✅ Express API 集成

## 技术栈

- Node.js
- TypeScript
- Express
- XState v5

## 安装和运行

```bash
# 安装依赖
pnpm install

# 开发模式（自动重启）
pnpm dev

# 构建
pnpm build

# 生产模式
pnpm start
```

## API 端点

### 创建支付

```bash
POST /payments
Content-Type: application/json

{
  "orderId": "order_123",
  "amount": 100.00,
  "paymentMethod": "credit_card"
}
```

### 查询支付状态

```bash
GET /payments/:paymentId
```

### 重试支付

```bash
POST /payments/:paymentId/retry
```

### 取消支付

```bash
POST /payments/:paymentId/cancel
```

## 状态机流程

```
idle → validating → processing → completed
                    ↓
                  failed → (retry) → processing
                    ↓
                  cancelled
```

## 状态说明

- **idle**: 初始状态，等待支付请求
- **validating**: 验证支付信息
- **processing**: 处理支付（调用支付网关）
- **completed**: 支付完成（最终状态）
- **failed**: 支付失败，可以重试或取消
- **cancelled**: 支付已取消（最终状态）
- **error**: 验证错误，可以重试

## 测试示例

```bash
# 创建支付
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order_123",
    "amount": 100.00,
    "paymentMethod": "credit_card"
  }'

# 查询支付状态（使用返回的 paymentId）
curl http://localhost:3000/payments/pay_1234567890_abc123

# 重试支付
curl -X POST http://localhost:3000/payments/pay_1234567890_abc123/retry
```

## 项目结构

```
src/
├── paymentMachine.ts  # 支付状态机定义
└── index.ts           # Express 服务器和路由
```

## 核心概念

### 状态机

`paymentMachine` 定义了支付流程的所有状态和转换：

- **状态**: `idle`, `validating`, `processing`, `completed`, `failed`, `cancelled`, `error`
- **上下文**: `orderId`, `amount`, `paymentMethod`, `paymentId`, `error`
- **事件**: `INITIATE_PAYMENT`, `RETRY`, `CANCEL`

### 异步处理

使用 `invoke` 处理异步操作（验证和支付处理）。

### 错误处理

状态机自动处理错误并转换到相应的错误状态。

## 扩展练习

1. 添加支付超时处理
2. 实现支付退款流程
3. 添加支付历史记录
4. 集成真实的支付网关（如 Stripe）
5. 添加支付通知功能
