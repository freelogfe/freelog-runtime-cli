# 08. 事务处理

本章详细介绍 Prisma 的事务机制。

## 为什么需要事务？

事务确保多个数据库操作要么全部成功，要么全部回滚。

```
场景：创建订单
1. 创建订单记录
2. 创建订单项
3. 扣减库存
4. 记录日志

如果第 3 步失败，1 和 2 应该回滚
```

## 隐式事务

嵌套写入自动在事务中执行：

```typescript
// 这是一个隐式事务
const user = await prisma.user.create({
  data: {
    email: 'alice@example.com',
    profile: { create: { bio: 'Hello' } },
    posts: {
      create: [{ title: 'Post 1' }, { title: 'Post 2' }],
    },
  },
});
```

## 顺序事务

多个独立操作按顺序执行：

```typescript
const [user, post, comment] = await prisma.$transaction([
  prisma.user.create({ data: { email: 'alice@example.com' } }),
  prisma.post.create({ data: { title: 'Post', authorId: 1 } }),
  prisma.comment.create({ data: { content: 'Hi', postId: 1, authorId: 1 } }),
]);
```

## 交互式事务

更灵活，支持条件逻辑：

```typescript
import { Prisma } from '@prisma/client';

const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
  // 1. 查询用户
  const user = await tx.user.findUnique({ where: { id: 1 } });
  if (!user) throw new Error('User not found');

  // 2. 查询产品
  const product = await tx.product.findUnique({ where: { id: 1 } });
  if (!product || product.stock < 1) {
    throw new Error('Insufficient stock');
  }

  // 3. 创建订单
  const order = await tx.order.create({
    data: {
      userId: user.id,
      totalAmount: product.price,
      items: {
        create: { productId: product.id, quantity: 1, price: product.price },
      },
    },
  });

  // 4. 扣减库存
  await tx.product.update({
    where: { id: product.id },
    data: { stock: { decrement: 1 } },
  });

  return order;
});
```

## 事务选项

```typescript
await prisma.$transaction(
  async (tx) => {
    // 事务操作
  },
  {
    maxWait: 5000,    // 最大等待获取连接时间（毫秒）
    timeout: 10000,   // 事务最大执行时间（毫秒）
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  }
);
```

### 隔离级别

| 级别 | 说明 |
|------|------|
| `ReadUncommitted` | 读未提交 |
| `ReadCommitted` | 读已提交 |
| `RepeatableRead` | 可重复读（MySQL 默认） |
| `Serializable` | 串行化 |

## 完整订单示例

```typescript
interface OrderItem {
  productId: number;
  quantity: number;
}

async function createOrder(userId: number, items: OrderItem[]) {
  return prisma.$transaction(async (tx) => {
    // 获取产品
    const productIds = items.map(i => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
    });

    // 验证库存
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
    }

    // 计算总金额
    const total = items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId)!;
      return sum + Number(product.price) * item.quantity;
    }, 0);

    // 创建订单
    const order = await tx.order.create({
      data: {
        orderNo: `ORD${Date.now()}`,
        userId,
        totalAmount: total,
        items: {
          create: items.map(item => {
            const product = products.find(p => p.id === item.productId)!;
            return {
              productId: item.productId,
              quantity: item.quantity,
              price: product.price,
            };
          }),
        },
      },
      include: { items: true },
    });

    // 扣减库存
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    return order;
  });
}
```

## 错误处理

```typescript
try {
  await prisma.$transaction(async (tx) => {
    // 操作...
  });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // 已知错误
    console.error('Database error:', error.code);
  } else {
    // 其他错误（包括手动抛出的）
    console.error('Transaction failed:', error);
  }
}
```

## 下一步

[👉 09. 高级查询技巧](./09-advanced-queries.md)
