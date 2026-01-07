# 09. 高级查询技巧

本章介绍 Prisma 的高级查询功能。

## 分页

### 偏移分页

```typescript
async function paginate(page: number, limit: number) {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count(),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

### 游标分页（大数据集推荐）

```typescript
async function cursorPaginate(cursor?: number, limit = 10) {
  const data = await prisma.user.findMany({
    take: limit + 1,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    orderBy: { id: 'asc' },
  });

  const hasMore = data.length > limit;
  if (hasMore) data.pop();

  return {
    data,
    nextCursor: hasMore ? data[data.length - 1]?.id : null,
  };
}
```

## 动态查询

```typescript
interface Filters {
  name?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
}

async function search(filters: Filters) {
  const where: Prisma.UserWhereInput = {};

  if (filters.name) {
    where.name = { contains: filters.name, mode: 'insensitive' };
  }
  if (filters.email) {
    where.email = { contains: filters.email };
  }
  if (filters.role) {
    where.role = filters.role as any;
  }
  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  return prisma.user.findMany({ where });
}
```

## 聚合查询

```typescript
// 基础聚合
const stats = await prisma.order.aggregate({
  _count: true,
  _sum: { totalAmount: true },
  _avg: { totalAmount: true },
  _min: { totalAmount: true },
  _max: { totalAmount: true },
});

// 分组聚合
const byStatus = await prisma.order.groupBy({
  by: ['status'],
  _count: true,
  _sum: { totalAmount: true },
});

// 带条件的分组
const topUsers = await prisma.order.groupBy({
  by: ['userId'],
  _sum: { totalAmount: true },
  having: {
    totalAmount: { _sum: { gt: 1000 } },
  },
  orderBy: { _sum: { totalAmount: 'desc' } },
  take: 10,
});
```

## 原始 SQL

```typescript
// 查询
const users = await prisma.$queryRaw<User[]>`
  SELECT * FROM users 
  WHERE email LIKE ${`%${keyword}%`}
  LIMIT ${limit}
`;

// 执行
const count = await prisma.$executeRaw`
  UPDATE users SET is_active = false 
  WHERE last_login < ${date}
`;

// 动态 SQL
import { Prisma } from '@prisma/client';

const orderBy = Prisma.sql`ORDER BY created_at DESC`;
const users = await prisma.$queryRaw`
  SELECT * FROM users ${orderBy}
`;
```

## 全文搜索（MySQL）

```prisma
model Post {
  id      Int    @id
  title   String
  content String
  
  @@fulltext([title, content])
}
```

```typescript
const posts = await prisma.post.findMany({
  where: {
    title: { search: 'prisma database' },
  },
});
```

## 批量操作优化

```typescript
// ❌ 不好
for (const user of users) {
  await prisma.user.create({ data: user });
}

// ✅ 好
await prisma.user.createMany({
  data: users,
  skipDuplicates: true,
});

// ❌ 不好
for (const id of ids) {
  await prisma.user.update({ where: { id }, data: { isActive: false } });
}

// ✅ 好
await prisma.user.updateMany({
  where: { id: { in: ids } },
  data: { isActive: false },
});
```

## 下一步

[👉 10. 性能优化](./10-performance.md)

