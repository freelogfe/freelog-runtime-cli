# 13. 数据库事务与高级查询

## 事务处理

```typescript
// 交互式事务
async createOrder(userId: number, items: OrderItemDto[]) {
  return this.prisma.$transaction(async (tx) => {
    // 1. 创建订单
    const order = await tx.order.create({
      data: {
        userId,
        total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      },
    });

    // 2. 创建订单项
    await tx.orderItem.createMany({
      data: items.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
    });

    // 3. 更新库存
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

## 高级查询

```typescript
// 分页
async findAll(page: number, limit: number) {
  const [data, total] = await Promise.all([
    this.prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.user.count(),
  ]);
  return { data, total, page, limit };
}

// 条件查询
async search(filters: UserFilters) {
  return this.prisma.user.findMany({
    where: {
      AND: [
        filters.name ? { name: { contains: filters.name } } : {},
        filters.email ? { email: { contains: filters.email } } : {},
        filters.createdAfter ? { createdAt: { gte: filters.createdAfter } } : {},
      ],
    },
  });
}

// 聚合查询
async getStats() {
  return this.prisma.order.aggregate({
    _count: true,
    _sum: { total: true },
    _avg: { total: true },
  });
}

// 分组查询
async getOrdersByStatus() {
  return this.prisma.order.groupBy({
    by: ['status'],
    _count: true,
    _sum: { total: true },
  });
}
```

## 原始 SQL

```typescript
// 查询
const users = await this.prisma.$queryRaw`
  SELECT * FROM users WHERE email LIKE ${`%${keyword}%`}
`;

// 执行
await this.prisma.$executeRaw`
  UPDATE users SET status = 'active' WHERE last_login > NOW() - INTERVAL 30 DAY
`;
```

## 下一步

[👉 14. 完整项目案例说明](./14-project-overview.md)

