# 07. 关系查询与嵌套写入

本章详细介绍 Prisma 中的关系操作。

## 关系类型回顾

```prisma
// 一对一
model User {
  id      Int      @id
  profile Profile?
}
model Profile {
  id     Int  @id
  userId Int  @unique
  user   User @relation(fields: [userId], references: [id])
}

// 一对多
model User {
  id    Int    @id
  posts Post[]
}
model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}

// 多对多
model Post {
  id   Int   @id
  tags Tag[]
}
model Tag {
  id    Int    @id
  posts Post[]
}
```

## Include 包含关联

```typescript
// 包含单个关联
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: { profile: true },
});

// 包含多个关联
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: {
    profile: true,
    posts: true,
  },
});

// 嵌套包含
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: {
    posts: {
      include: {
        comments: true,
        tags: true,
      },
    },
  },
});

// 带条件的包含
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: {
    posts: {
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    },
  },
});
```

## Select 选择关联字段

```typescript
const user = await prisma.user.findUnique({
  where: { id: 1 },
  select: {
    id: true,
    name: true,
    posts: {
      select: {
        id: true,
        title: true,
      },
    },
  },
});
```

## 关系过滤

```typescript
// some - 至少有一个匹配
const users = await prisma.user.findMany({
  where: {
    posts: { some: { published: true } },
  },
});

// every - 全部匹配
const users = await prisma.user.findMany({
  where: {
    posts: { every: { published: true } },
  },
});

// none - 没有匹配
const users = await prisma.user.findMany({
  where: {
    posts: { none: { published: false } },
  },
});

// is / isNot - 一对一关系
const users = await prisma.user.findMany({
  where: {
    profile: { is: { bio: { contains: 'developer' } } },
  },
});
```

## 嵌套写入

### Create 嵌套创建

```typescript
// 创建用户同时创建 profile
const user = await prisma.user.create({
  data: {
    email: 'alice@example.com',
    profile: {
      create: { bio: 'Hello!' },
    },
  },
});

// 创建用户同时创建多篇文章
const user = await prisma.user.create({
  data: {
    email: 'bob@example.com',
    posts: {
      create: [
        { title: 'Post 1' },
        { title: 'Post 2' },
      ],
    },
  },
});
```

### Connect 连接已有记录

```typescript
// 创建文章并连接已有用户
const post = await prisma.post.create({
  data: {
    title: 'New Post',
    author: { connect: { id: 1 } },
  },
});

// 连接多个标签
const post = await prisma.post.create({
  data: {
    title: 'New Post',
    tags: {
      connect: [{ id: 1 }, { id: 2 }],
    },
  },
});
```

### ConnectOrCreate

```typescript
const post = await prisma.post.create({
  data: {
    title: 'New Post',
    category: {
      connectOrCreate: {
        where: { name: 'Tech' },
        create: { name: 'Tech', slug: 'tech' },
      },
    },
  },
});
```

### Update 嵌套更新

```typescript
// 更新用户同时更新 profile
const user = await prisma.user.update({
  where: { id: 1 },
  data: {
    profile: {
      update: { bio: 'Updated bio' },
    },
  },
});

// upsert 关联
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
```

### Set 设置关联（多对多）

```typescript
// 替换所有标签
const post = await prisma.post.update({
  where: { id: 1 },
  data: {
    tags: { set: [{ id: 1 }, { id: 2 }] },
  },
});

// 清空关联
const post = await prisma.post.update({
  where: { id: 1 },
  data: {
    tags: { set: [] },
  },
});
```

### Disconnect 断开关联

```typescript
const post = await prisma.post.update({
  where: { id: 1 },
  data: {
    tags: { disconnect: [{ id: 1 }] },
  },
});
```

### Delete 嵌套删除

```typescript
const user = await prisma.user.update({
  where: { id: 1 },
  data: {
    posts: {
      delete: [{ id: 1 }, { id: 2 }],
    },
  },
});

// deleteMany
const user = await prisma.user.update({
  where: { id: 1 },
  data: {
    posts: {
      deleteMany: { published: false },
    },
  },
});
```

## 计数关联

```typescript
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

// 带条件计数
const users = await prisma.user.findMany({
  select: {
    id: true,
    _count: {
      select: {
        posts: { where: { published: true } },
      },
    },
  },
});
```

## 下一步

[👉 08. 事务处理](./08-transactions.md)
