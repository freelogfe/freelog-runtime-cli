# 10. 性能优化

本章介绍 Prisma 的性能优化技巧。

## 连接池配置

```env
# MySQL
DATABASE_URL="mysql://root:pass@localhost:3306/db?connection_limit=10&pool_timeout=20"

# MongoDB
DATABASE_URL="mongodb://localhost:27017/db?maxPoolSize=10&minPoolSize=5"
```

## 查询优化

### 只选择需要的字段

```typescript
// ❌ 查询所有字段
const users = await prisma.user.findMany();

// ✅ 只查询需要的字段
const users = await prisma.user.findMany({
  select: { id: true, name: true, email: true },
});
```

### 避免 N+1 问题

```typescript
// ❌ N+1 问题
const users = await prisma.user.findMany();
for (const user of users) {
  const posts = await prisma.post.findMany({ where: { authorId: user.id } });
}

// ✅ 使用 include
const users = await prisma.user.findMany({
  include: { posts: true },
});
```

### 使用索引

```prisma
model User {
  id    Int    @id
  email String @unique  // 自动索引
  name  String
  role  String

  @@index([role])
  @@index([name, role])
}
```

### 限制返回数量

```typescript
const users = await prisma.user.findMany({
  take: 100,  // 限制最大返回数
});
```

## 批量操作

```typescript
// 批量创建
await prisma.user.createMany({ data: users });

// 批量更新
await prisma.user.updateMany({
  where: { role: 'GUEST' },
  data: { isActive: false },
});

// 批量删除
await prisma.user.deleteMany({
  where: { isActive: false },
});
```

## 查询日志

```typescript
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
  ],
});

prisma.$on('query', (e) => {
  console.log(`Query: ${e.query}`);
  console.log(`Duration: ${e.duration}ms`);
  
  // 慢查询警告
  if (e.duration > 100) {
    console.warn('Slow query detected!');
  }
});
```

## 中间件

```typescript
// 查询耗时统计
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;
  
  console.log(`${params.model}.${params.action}: ${duration}ms`);
  return result;
});

// 软删除
prisma.$use(async (params, next) => {
  if (params.model === 'User') {
    if (params.action === 'delete') {
      params.action = 'update';
      params.args.data = { deletedAt: new Date() };
    }
    if (params.action === 'findMany') {
      params.args.where = { ...params.args.where, deletedAt: null };
    }
  }
  return next(params);
});
```

## 缓存策略

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, any>({ max: 1000, ttl: 60000 });

async function getUserCached(id: number) {
  const key = `user:${id}`;
  
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const user = await prisma.user.findUnique({ where: { id } });
  if (user) cache.set(key, user);
  
  return user;
}
```

## 下一步

[👉 11. NestJS 集成](./11-nestjs-integration.md)

