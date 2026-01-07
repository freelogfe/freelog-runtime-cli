# 06. CRUD 操作完全指南

本章详细介绍 Prisma 的所有 CRUD 操作。

## Create 创建

### 创建单条记录

```typescript
// 基础创建
const user = await prisma.user.create({
  data: {
    email: 'alice@example.com',
    name: 'Alice',
  },
});

// 创建并返回特定字段
const user = await prisma.user.create({
  data: {
    email: 'bob@example.com',
    name: 'Bob',
  },
  select: {
    id: true,
    email: true,
  },
});
```

### 创建带关联的记录

```typescript
// 创建用户同时创建 Profile
const user = await prisma.user.create({
  data: {
    email: 'alice@example.com',
    name: 'Alice',
    profile: {
      create: {
        bio: 'I am Alice',
        phone: '1234567890',
      },
    },
  },
  include: {
    profile: true,
  },
});

// 创建用户同时创建多篇文章
const user = await prisma.user.create({
  data: {
    email: 'bob@example.com',
    name: 'Bob',
    posts: {
      create: [
        { title: 'Post 1', content: 'Content 1' },
        { title: 'Post 2', content: 'Content 2' },
      ],
    },
  },
  include: {
    posts: true,
  },
});

// 创建并连接已存在的记录
const post = await prisma.post.create({
  data: {
    title: 'New Post',
    author: {
      connect: { id: 1 }, // 连接已存在的用户
    },
    tags: {
      connect: [
        { id: 1 },
        { id: 2 },
      ],
    },
  },
});

// connectOrCreate：连接或创建
const post = await prisma.post.create({
  data: {
    title: 'New Post',
    category: {
      connectOrCreate: {
        where: { name: 'Technology' },
        create: { name: 'Technology', slug: 'technology' },
      },
    },
  },
});
```

### 批量创建

```typescript
// createMany
const result = await prisma.user.createMany({
  data: [
    { email: 'user1@example.com', name: 'User 1' },
    { email: 'user2@example.com', name: 'User 2' },
    { email: 'user3@example.com', name: 'User 3' },
  ],
  skipDuplicates: true, // 跳过重复记录
});

console.log(result.count); // 创建的记录数

// createManyAndReturn (Prisma 5.14+)
const users = await prisma.user.createManyAndReturn({
  data: [
    { email: 'user1@example.com', name: 'User 1' },
    { email: 'user2@example.com', name: 'User 2' },
  ],
});
```

## Read 查询

### 查询单条记录

```typescript
// findUnique - 通过唯一字段查询
const user = await prisma.user.findUnique({
  where: { id: 1 },
});

const user = await prisma.user.findUnique({
  where: { email: 'alice@example.com' },
});

// findUniqueOrThrow - 找不到则抛出异常
const user = await prisma.user.findUniqueOrThrow({
  where: { id: 1 },
});

// findFirst - 查询第一条匹配记录
const user = await prisma.user.findFirst({
  where: { role: 'ADMIN' },
});

// findFirstOrThrow
const user = await prisma.user.findFirstOrThrow({
  where: { role: 'ADMIN' },
});
```

### 查询多条记录

```typescript
// findMany - 查询多条
const users = await prisma.user.findMany();

// 带条件查询
const users = await prisma.user.findMany({
  where: {
    role: 'USER',
    isActive: true,
  },
});

// 排序
const users = await prisma.user.findMany({
  orderBy: { createdAt: 'desc' },
});

// 多字段排序
const users = await prisma.user.findMany({
  orderBy: [
    { role: 'asc' },
    { createdAt: 'desc' },
  ],
});

// 分页
const users = await prisma.user.findMany({
  skip: 0,   // 跳过记录数
  take: 10,  // 获取记录数
});

// 游标分页
const users = await prisma.user.findMany({
  take: 10,
  skip: 1,
  cursor: { id: 100 },
});
```

### 选择字段

```typescript
// select - 选择特定字段
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    name: true,
  },
});

// include - 包含关联数据
const users = await prisma.user.findMany({
  include: {
    profile: true,
    posts: true,
  },
});

// 嵌套选择
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    posts: {
      select: {
        id: true,
        title: true,
      },
      take: 5,
    },
  },
});

// 计数
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    _count: {
      select: {
        posts: true,
        comments: true,
      },
    },
  },
});
```

### 条件查询

```typescript
// 等于
where: { email: 'alice@example.com' }

// 不等于
where: { NOT: { role: 'ADMIN' } }

// 包含
where: { name: { contains: 'alice' } }
where: { name: { contains: 'alice', mode: 'insensitive' } } // 不区分大小写

// 开头/结尾
where: { email: { startsWith: 'alice' } }
where: { email: { endsWith: '@example.com' } }

// 在列表中
where: { role: { in: ['USER', 'ADMIN'] } }
where: { role: { notIn: ['GUEST'] } }

// 比较
where: { age: { gt: 18 } }   // 大于
where: { age: { gte: 18 } }  // 大于等于
where: { age: { lt: 65 } }   // 小于
where: { age: { lte: 65 } }  // 小于等于

// 空值
where: { bio: null }
where: { bio: { not: null } }

// 逻辑组合
where: {
  OR: [
    { email: { contains: 'alice' } },
    { name: { contains: 'alice' } },
  ],
}

where: {
  AND: [
    { role: 'USER' },
    { isActive: true },
  ],
}

// 关系过滤
where: {
  posts: {
    some: { published: true },   // 至少有一个
    every: { published: true },  // 全部都是
    none: { published: false },  // 没有任何一个
  },
}

// 嵌套关系过滤
where: {
  posts: {
    some: {
      comments: {
        some: { content: { contains: 'great' } },
      },
    },
  },
}
```

### 聚合查询

```typescript
// count
const count = await prisma.user.count();
const count = await prisma.user.count({
  where: { role: 'USER' },
});

// aggregate
const result = await prisma.order.aggregate({
  _count: true,
  _sum: { totalAmount: true },
  _avg: { totalAmount: true },
  _min: { totalAmount: true },
  _max: { totalAmount: true },
});

// groupBy
const result = await prisma.order.groupBy({
  by: ['status'],
  _count: true,
  _sum: { totalAmount: true },
});

// groupBy with having
const result = await prisma.order.groupBy({
  by: ['userId'],
  _sum: { totalAmount: true },
  having: {
    totalAmount: {
      _sum: { gt: 1000 },
    },
  },
});
```

## Update 更新

### 更新单条记录

```typescript
// update
const user = await prisma.user.update({
  where: { id: 1 },
  data: { name: 'Alice Updated' },
});

// 数值操作
await prisma.post.update({
  where: { id: 1 },
  data: {
    viewCount: { increment: 1 },  // 增加
    // viewCount: { decrement: 1 }, // 减少
    // viewCount: { multiply: 2 },  // 乘法
    // viewCount: { divide: 2 },    // 除法
    // viewCount: { set: 100 },     // 设置
  },
});
```

### 更新关联

```typescript
// 更新并创建关联
const user = await prisma.user.update({
  where: { id: 1 },
  data: {
    profile: {
      create: { bio: 'New bio' },
    },
  },
});

// 更新或创建关联
const user = await prisma.user.update({
  where: { id: 1 },
  data: {
    profile: {
      upsert: {
        create: { bio: 'New bio' },
        update: { bio: 'Updated bio' },
      },
    },
  },
});

// 连接/断开关联
const post = await prisma.post.update({
  where: { id: 1 },
  data: {
    tags: {
      connect: [{ id: 3 }, { id: 4 }],
      disconnect: [{ id: 1 }],
    },
  },
});

// 设置关联（替换所有）
const post = await prisma.post.update({
  where: { id: 1 },
  data: {
    tags: {
      set: [{ id: 1 }, { id: 2 }],
    },
  },
});

// 删除所有关联
const post = await prisma.post.update({
  where: { id: 1 },
  data: {
    tags: {
      set: [],
    },
  },
});
```

### 批量更新

```typescript
// updateMany
const result = await prisma.user.updateMany({
  where: { role: 'GUEST' },
  data: { isActive: false },
});

console.log(result.count); // 更新的记录数
```

### Upsert

```typescript
// upsert - 存在则更新，不存在则创建
const user = await prisma.user.upsert({
  where: { email: 'alice@example.com' },
  update: { name: 'Alice Updated' },
  create: {
    email: 'alice@example.com',
    name: 'Alice',
  },
});
```

## Delete 删除

### 删除单条记录

```typescript
// delete
const user = await prisma.user.delete({
  where: { id: 1 },
});
```

### 批量删除

```typescript
// deleteMany
const result = await prisma.user.deleteMany({
  where: { isActive: false },
});

console.log(result.count); // 删除的记录数

// 删除所有
await prisma.user.deleteMany();
```

### 级联删除

```prisma
// Schema 中定义级联删除
model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
```

```typescript
// 删除用户时会自动删除其所有文章
await prisma.user.delete({
  where: { id: 1 },
});
```

## 原始 SQL

```typescript
// 查询
const users = await prisma.$queryRaw<User[]>`
  SELECT * FROM users WHERE email LIKE ${`%${keyword}%`}
`;

// 执行
const result = await prisma.$executeRaw`
  UPDATE users SET is_active = false WHERE last_login < ${date}
`;

// 使用 Prisma.sql
import { Prisma } from '@prisma/client';

const columns = Prisma.sql`id, email, name`;
const users = await prisma.$queryRaw`SELECT ${columns} FROM users`;
```

## 完整示例

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create
  const user = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      name: 'Alice',
      profile: { create: { bio: 'Hello!' } },
    },
    include: { profile: true },
  });

  // Read
  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: { _count: { select: { posts: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Update
  await prisma.user.update({
    where: { id: user.id },
    data: { name: 'Alice Updated' },
  });

  // Delete
  await prisma.user.delete({
    where: { id: user.id },
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

## 下一步

[👉 07. 关系查询与嵌套写入](./07-relations.md)
