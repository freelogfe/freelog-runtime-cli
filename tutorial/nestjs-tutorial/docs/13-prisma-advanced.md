# 13. 数据库事务与高级查询

本章深入介绍 Prisma 的事务处理、高级查询技巧和性能优化。

## 事务处理

### 为什么需要事务？

事务确保一组数据库操作要么全部成功，要么全部失败，保证数据一致性。

```
场景：创建订单
1. 创建订单记录
2. 创建订单项
3. 扣减库存
4. 记录日志

如果步骤 3 失败，步骤 1 和 2 的数据应该回滚
```

### 顺序事务（Sequential Operations）

```typescript
// 多个操作按顺序执行，全部成功或全部回滚
const [order, orderItems, updatedProducts] = await prisma.$transaction([
  prisma.order.create({
    data: { userId: 1, totalAmount: 100 },
  }),
  prisma.orderItem.createMany({
    data: [
      { orderId: 1, productId: 1, quantity: 2, price: 50 },
    ],
  }),
  prisma.product.update({
    where: { id: 1 },
    data: { stock: { decrement: 2 } },
  }),
]);
```

### 交互式事务（Interactive Transactions）

更灵活，可以在事务中执行条件逻辑：

```typescript
import { Prisma } from '@prisma/client';

async createOrderWithTransaction(userId: number, items: OrderItemDto[]) {
  return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. 验证用户
    const user = await tx.user.findUnique({
      where: { id: userId },
    });
    
    if (!user || !user.isActive) {
      throw new Error('Invalid user');
    }

    // 2. 验证并获取产品信息
    const productIds = items.map(item => item.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
    });

    // 3. 验证库存
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
    }

    // 4. 计算总金额
    const totalAmount = items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId)!;
      return sum + Number(product.price) * item.quantity;
    }, 0);

    // 5. 创建订单
    const order = await tx.order.create({
      data: {
        orderNo: `ORD${Date.now()}`,
        userId,
        totalAmount,
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

    // 6. 扣减库存
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    return order;
  }, {
    maxWait: 5000,    // 最大等待时间
    timeout: 10000,   // 事务超时时间
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // 隔离级别
  });
}
```

### 事务隔离级别

```typescript
import { Prisma } from '@prisma/client';

// 可用的隔离级别
Prisma.TransactionIsolationLevel.ReadUncommitted  // 读未提交
Prisma.TransactionIsolationLevel.ReadCommitted    // 读已提交
Prisma.TransactionIsolationLevel.RepeatableRead   // 可重复读
Prisma.TransactionIsolationLevel.Serializable     // 串行化

// 使用示例
await prisma.$transaction(
  async (tx) => {
    // 事务操作
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  }
);
```

### 嵌套写入（隐式事务）

Prisma 的嵌套写入自动在事务中执行：

```typescript
// 这是一个隐式事务
const user = await prisma.user.create({
  data: {
    email: 'alice@example.com',
    name: 'Alice',
    profile: {
      create: { bio: 'I am Alice' },
    },
    posts: {
      create: [
        { title: 'Post 1', content: 'Content 1' },
        { title: 'Post 2', content: 'Content 2' },
      ],
    },
  },
  include: {
    profile: true,
    posts: true,
  },
});
```

## 高级查询

### 分页查询

```typescript
// 偏移分页
async findAllWithPagination(page: number, limit: number) {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    this.prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.user.count(),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
}

// 游标分页（更高效，适合大数据集）
async findAllWithCursor(cursor?: number, limit: number = 10) {
  const data = await this.prisma.user.findMany({
    take: limit + 1, // 多取一条判断是否有下一页
    ...(cursor && {
      skip: 1, // 跳过游标本身
      cursor: { id: cursor },
    }),
    orderBy: { id: 'asc' },
  });

  const hasNextPage = data.length > limit;
  if (hasNextPage) {
    data.pop(); // 移除多取的一条
  }

  return {
    data,
    meta: {
      hasNextPage,
      nextCursor: hasNextPage ? data[data.length - 1]?.id : null,
    },
  };
}
```

### 动态条件查询

```typescript
interface UserFilters {
  name?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
}

async search(filters: UserFilters, page = 1, limit = 10) {
  // 构建 where 条件
  const where: Prisma.UserWhereInput = {};

  if (filters.name) {
    where.name = { contains: filters.name, mode: 'insensitive' };
  }

  if (filters.email) {
    where.email = { contains: filters.email, mode: 'insensitive' };
  }

  if (filters.role) {
    where.role = filters.role as any;
  }

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters.createdAfter || filters.createdBefore) {
    where.createdAt = {};
    if (filters.createdAfter) {
      where.createdAt.gte = filters.createdAfter;
    }
    if (filters.createdBefore) {
      where.createdAt.lte = filters.createdBefore;
    }
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    this.prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.user.count({ where }),
  ]);

  return { data, total, page, limit };
}
```

### 复杂关系查询

```typescript
// 查询用户及其订单统计
async getUserWithOrderStats(userId: number) {
  return this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          orders: true,
        },
      },
      orders: {
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: { product: true },
          },
        },
      },
    },
  });
}

// 查询有订单的用户
async findUsersWithOrders() {
  return this.prisma.user.findMany({
    where: {
      orders: {
        some: {}, // 至少有一个订单
      },
    },
    include: {
      _count: { select: { orders: true } },
    },
  });
}

// 查询特定状态订单的用户
async findUsersWithPendingOrders() {
  return this.prisma.user.findMany({
    where: {
      orders: {
        some: {
          status: 'PENDING',
        },
      },
    },
  });
}

// 查询所有订单都已完成的用户
async findUsersWithAllCompletedOrders() {
  return this.prisma.user.findMany({
    where: {
      orders: {
        every: {
          status: 'COMPLETED',
        },
      },
    },
  });
}
```

### 聚合查询

```typescript
// 基础聚合
async getOrderStats() {
  return this.prisma.order.aggregate({
    _count: true,
    _sum: { totalAmount: true },
    _avg: { totalAmount: true },
    _min: { totalAmount: true },
    _max: { totalAmount: true },
  });
}

// 条件聚合
async getOrderStatsByStatus(status: string) {
  return this.prisma.order.aggregate({
    where: { status: status as any },
    _count: true,
    _sum: { totalAmount: true },
    _avg: { totalAmount: true },
  });
}

// 分组聚合
async getOrdersByStatus() {
  return this.prisma.order.groupBy({
    by: ['status'],
    _count: true,
    _sum: { totalAmount: true },
    _avg: { totalAmount: true },
    orderBy: {
      _count: { status: 'desc' },
    },
  });
}

// 按日期分组
async getOrdersByDate(startDate: Date, endDate: Date) {
  const orders = await this.prisma.order.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      createdAt: true,
      totalAmount: true,
    },
  });

  // 按日期分组统计
  const grouped = orders.reduce((acc, order) => {
    const date = order.createdAt.toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = { count: 0, total: 0 };
    }
    acc[date].count++;
    acc[date].total += Number(order.totalAmount);
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  return grouped;
}

// 多字段分组
async getOrdersByUserAndStatus() {
  return this.prisma.order.groupBy({
    by: ['userId', 'status'],
    _count: true,
    _sum: { totalAmount: true },
    having: {
      totalAmount: {
        _sum: { gt: 100 }, // 只返回总金额大于 100 的分组
      },
    },
  });
}
```

### 原始 SQL 查询

```typescript
// 查询
async rawQuery(keyword: string) {
  // 使用模板字符串（自动防 SQL 注入）
  const users = await this.prisma.$queryRaw<User[]>`
    SELECT * FROM users 
    WHERE name LIKE ${`%${keyword}%`}
    ORDER BY created_at DESC
    LIMIT 10
  `;
  return users;
}

// 复杂查询
async getTopCustomers(limit: number) {
  return this.prisma.$queryRaw<{ userId: number; totalSpent: number; orderCount: number }[]>`
    SELECT 
      user_id as "userId",
      SUM(total_amount) as "totalSpent",
      COUNT(*) as "orderCount"
    FROM orders
    WHERE status = 'COMPLETED'
    GROUP BY user_id
    ORDER BY "totalSpent" DESC
    LIMIT ${limit}
  `;
}

// 执行（无返回值）
async updateInactiveUsers(days: number) {
  const result = await this.prisma.$executeRaw`
    UPDATE users 
    SET is_active = false 
    WHERE last_login < NOW() - INTERVAL ${days} DAY
  `;
  return result; // 返回受影响的行数
}

// 使用 Prisma.sql 构建动态查询
async dynamicRawQuery(table: string, conditions: Record<string, any>) {
  const whereClause = Object.entries(conditions)
    .map(([key, value]) => Prisma.sql`${Prisma.raw(key)} = ${value}`)
    .reduce((acc, curr, i) => 
      i === 0 ? curr : Prisma.sql`${acc} AND ${curr}`
    );

  return this.prisma.$queryRaw`
    SELECT * FROM ${Prisma.raw(table)} WHERE ${whereClause}
  `;
}
```

## 性能优化

### 选择性查询（减少数据传输）

```typescript
// ❌ 不好：查询所有字段
const users = await prisma.user.findMany();

// ✅ 好：只查询需要的字段
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
  },
});
```

### 批量操作

```typescript
// ❌ 不好：循环单条插入
for (const user of users) {
  await prisma.user.create({ data: user });
}

// ✅ 好：批量插入
await prisma.user.createMany({
  data: users,
  skipDuplicates: true,
});

// ❌ 不好：循环单条更新
for (const id of ids) {
  await prisma.user.update({
    where: { id },
    data: { isActive: false },
  });
}

// ✅ 好：批量更新
await prisma.user.updateMany({
  where: { id: { in: ids } },
  data: { isActive: false },
});
```

### 避免 N+1 问题

```typescript
// ❌ N+1 问题
const users = await prisma.user.findMany();
for (const user of users) {
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
  });
}

// ✅ 使用 include
const users = await prisma.user.findMany({
  include: {
    orders: true,
  },
});

// ✅ 或使用单独查询 + 手动关联
const users = await prisma.user.findMany();
const userIds = users.map(u => u.id);
const orders = await prisma.order.findMany({
  where: { userId: { in: userIds } },
});
// 手动关联数据
```

### 索引优化

```prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique // 自动创建唯一索引
  name  String
  role  String
  
  // 单字段索引
  @@index([role])
  
  // 复合索引
  @@index([role, createdAt])
  
  // 全文索引（MySQL）
  @@fulltext([name])
}
```

### 连接池配置

```typescript
// prisma.service.ts
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=10&pool_timeout=20',
    },
  },
});
```

## 软删除实现

```typescript
// 使用中间件实现软删除
prisma.$use(async (params, next) => {
  // 查询时自动过滤已删除记录
  if (params.model === 'User') {
    if (params.action === 'findUnique' || params.action === 'findFirst') {
      params.action = 'findFirst';
      params.args.where = { ...params.args.where, deletedAt: null };
    }
    if (params.action === 'findMany') {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      params.args.where.deletedAt = null;
    }
  }

  // 删除时改为更新 deletedAt
  if (params.model === 'User' && params.action === 'delete') {
    params.action = 'update';
    params.args.data = { deletedAt: new Date() };
  }

  if (params.model === 'User' && params.action === 'deleteMany') {
    params.action = 'updateMany';
    params.args.data = { deletedAt: new Date() };
  }

  return next(params);
});
```

## 数据验证中间件

```typescript
// 在保存前验证数据
prisma.$use(async (params, next) => {
  if (params.model === 'User' && ['create', 'update'].includes(params.action)) {
    const data = params.args.data;
    
    // 验证邮箱格式
    if (data.email && !isValidEmail(data.email)) {
      throw new Error('Invalid email format');
    }
    
    // 自动处理
    if (data.email) {
      data.email = data.email.toLowerCase().trim();
    }
  }
  
  return next(params);
});
```

## 查询日志和调试

```typescript
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'info' },
    { emit: 'stdout', level: 'warn' },
    { emit: 'stdout', level: 'error' },
  ],
});

// 监听查询事件
prisma.$on('query', (e) => {
  console.log('Query: ' + e.query);
  console.log('Params: ' + e.params);
  console.log('Duration: ' + e.duration + 'ms');
});

// 慢查询警告
prisma.$on('query', (e) => {
  if (e.duration > 100) {
    console.warn(`Slow query (${e.duration}ms): ${e.query}`);
  }
});
```

## 下一步

[👉 14. 完整项目案例说明](./14-project-overview.md)
