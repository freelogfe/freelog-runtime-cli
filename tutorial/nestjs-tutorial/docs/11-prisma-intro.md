# 11. Prisma 6 入门

Prisma 是一个现代化的 Node.js 和 TypeScript ORM，提供类型安全的数据库访问、迁移管理和数据建模。

## 什么是 Prisma？

Prisma 由三个主要部分组成：

1. **Prisma Client** - 自动生成的类型安全查询构建器
2. **Prisma Migrate** - 数据库迁移系统
3. **Prisma Studio** - 可视化数据库管理工具

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                        │
├─────────────────────────────────────────────────────────────┤
│                     Prisma Client                           │
│              (Type-safe Database Queries)                   │
├─────────────────────────────────────────────────────────────┤
│                    Prisma Engine                            │
│           (Query Engine & Migration Engine)                 │
├─────────────────────────────────────────────────────────────┤
│                      Database                               │
│        (PostgreSQL, MySQL, MongoDB, SQLite, etc.)          │
└─────────────────────────────────────────────────────────────┘
```

## 为什么选择 Prisma？

| 特性 | Prisma | TypeORM | Sequelize |
|------|--------|---------|-----------|
| 类型安全 | ✅ 完全类型安全 | ⚠️ 部分 | ❌ |
| 自动补全 | ✅ 优秀 | ⚠️ 一般 | ❌ |
| 学习曲线 | 低 | 中 | 中 |
| 迁移工具 | ✅ 内置 | ✅ 内置 | ✅ 内置 |
| 支持数据库 | 多种 | 多种 | 多种 |
| 性能 | 优秀 | 良好 | 良好 |

## 安装 Prisma

### 1. 安装依赖

```bash
# 安装 Prisma CLI 作为开发依赖
npm install prisma --save-dev

# 安装 Prisma Client
npm install @prisma/client
```

### 2. 初始化 Prisma

```bash
# 初始化 Prisma（默认 PostgreSQL）
npx prisma init

# 指定数据库类型
npx prisma init --datasource-provider mysql
npx prisma init --datasource-provider mongodb
npx prisma init --datasource-provider sqlite
```

初始化后会创建：
- `prisma/schema.prisma` - Prisma Schema 文件
- `.env` - 环境变量文件

## Prisma Schema 基础

### 数据源配置

```prisma
// prisma/schema.prisma

// 生成器配置
generator client {
  provider = "prisma-client-js"
  // Prisma 6 可以指定输出目录
  // output   = "../generated/prisma-client"
}

// 数据源配置
datasource db {
  provider = "mysql"  // postgresql, mysql, mongodb, sqlite, sqlserver
  url      = env("DATABASE_URL")
}
```

### 模型定义

```prisma
// 基础模型
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?  // 可选字段
  role      Role     @default(USER)
  posts     Post[]   // 一对多关系
  profile   Profile? // 一对一关系
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users") // 映射到数据库表名
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String   @db.VarChar(255)
  content   String?  @db.Text
  published Boolean  @default(false)
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  tags      Tag[]    // 多对多关系
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([authorId])
  @@map("posts")
}

model Profile {
  id     Int    @id @default(autoincrement())
  bio    String?
  userId Int    @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("profiles")
}

model Tag {
  id    Int    @id @default(autoincrement())
  name  String @unique
  posts Post[]

  @@map("tags")
}

// 枚举类型
enum Role {
  USER
  ADMIN
  MODERATOR
}
```

### 字段类型

| Prisma 类型 | MySQL | PostgreSQL | MongoDB |
|-------------|-------|------------|---------|
| String | VARCHAR(191) | TEXT | String |
| Int | INT | INTEGER | Int |
| BigInt | BIGINT | BIGINT | Long |
| Float | DOUBLE | DOUBLE PRECISION | Double |
| Decimal | DECIMAL | DECIMAL | - |
| Boolean | TINYINT(1) | BOOLEAN | Bool |
| DateTime | DATETIME(3) | TIMESTAMP(3) | Timestamp |
| Json | JSON | JSONB | Object |
| Bytes | LONGBLOB | BYTEA | BinData |

### 字段属性

```prisma
model Example {
  // 主键
  id        Int      @id @default(autoincrement())
  uuid      String   @id @default(uuid())
  cuid      String   @id @default(cuid())
  
  // 唯一约束
  email     String   @unique
  
  // 默认值
  role      String   @default("user")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // 数据库原生类型
  price     Decimal  @db.Decimal(10, 2)
  content   String   @db.Text
  status    String   @db.VarChar(50)
  
  // 映射到数据库列名
  firstName String   @map("first_name")
  
  // 索引
  @@index([email])
  @@index([createdAt])
  
  // 复合唯一约束
  @@unique([email, role])
  
  // 复合主键
  // @@id([field1, field2])
}
```

### 关系定义

```prisma
// 一对一
model User {
  id      Int      @id @default(autoincrement())
  profile Profile?
}

model Profile {
  id     Int  @id @default(autoincrement())
  userId Int  @unique
  user   User @relation(fields: [userId], references: [id])
}

// 一对多
model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}

// 多对多（隐式）
model Post {
  id   Int   @id @default(autoincrement())
  tags Tag[]
}

model Tag {
  id    Int    @id @default(autoincrement())
  posts Post[]
}

// 多对多（显式，可添加额外字段）
model Post {
  id       Int           @id @default(autoincrement())
  postTags PostOnTags[]
}

model Tag {
  id       Int           @id @default(autoincrement())
  postTags PostOnTags[]
}

model PostOnTags {
  postId    Int
  tagId     Int
  post      Post     @relation(fields: [postId], references: [id])
  tag       Tag      @relation(fields: [tagId], references: [id])
  assignedAt DateTime @default(now())

  @@id([postId, tagId])
}

// 自引用关系
model User {
  id         Int     @id @default(autoincrement())
  managerId  Int?
  manager    User?   @relation("Management", fields: [managerId], references: [id])
  subordinates User[] @relation("Management")
}
```

## 数据库迁移

### 开发环境

```bash
# 创建迁移并应用
npx prisma migrate dev --name init

# 创建迁移但不应用
npx prisma migrate dev --name add_user_table --create-only

# 重置数据库（危险！会删除所有数据）
npx prisma migrate reset
```

### 生产环境

```bash
# 应用所有待处理的迁移
npx prisma migrate deploy

# 检查迁移状态
npx prisma migrate status
```

### 原型开发（不创建迁移文件）

```bash
# 直接同步 Schema 到数据库（开发用）
npx prisma db push

# 从数据库拉取 Schema
npx prisma db pull
```

## 生成 Prisma Client

```bash
# 生成 Prisma Client
npx prisma generate

# 每次修改 schema.prisma 后都需要重新生成
```

## 基础 CRUD 操作

### 创建记录

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 创建单条记录
const user = await prisma.user.create({
  data: {
    email: 'alice@example.com',
    name: 'Alice',
  },
});

// 创建带关联的记录
const userWithProfile = await prisma.user.create({
  data: {
    email: 'bob@example.com',
    name: 'Bob',
    profile: {
      create: {
        bio: 'I am Bob',
      },
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

// 批量创建
const users = await prisma.user.createMany({
  data: [
    { email: 'user1@example.com', name: 'User 1' },
    { email: 'user2@example.com', name: 'User 2' },
    { email: 'user3@example.com', name: 'User 3' },
  ],
  skipDuplicates: true, // 跳过重复记录
});
```

### 查询记录

```typescript
// 查询单条记录
const user = await prisma.user.findUnique({
  where: { email: 'alice@example.com' },
});

// 查询单条或抛出错误
const user = await prisma.user.findUniqueOrThrow({
  where: { id: 1 },
});

// 查询第一条匹配记录
const user = await prisma.user.findFirst({
  where: { role: 'ADMIN' },
});

// 查询多条记录
const users = await prisma.user.findMany({
  where: {
    email: { contains: '@example.com' },
  },
  orderBy: { createdAt: 'desc' },
  skip: 0,
  take: 10,
});

// 包含关联数据
const userWithPosts = await prisma.user.findUnique({
  where: { id: 1 },
  include: {
    posts: true,
    profile: true,
  },
});

// 选择特定字段
const userNames = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    _count: {
      select: { posts: true },
    },
  },
});
```

### 更新记录

```typescript
// 更新单条记录
const user = await prisma.user.update({
  where: { id: 1 },
  data: { name: 'Alice Updated' },
});

// 更新或创建（upsert）
const user = await prisma.user.upsert({
  where: { email: 'alice@example.com' },
  update: { name: 'Alice Updated' },
  create: { email: 'alice@example.com', name: 'Alice' },
});

// 批量更新
const result = await prisma.user.updateMany({
  where: { role: 'USER' },
  data: { role: 'MEMBER' },
});

// 数值操作
await prisma.post.update({
  where: { id: 1 },
  data: {
    viewCount: { increment: 1 },  // 增加
    // viewCount: { decrement: 1 }, // 减少
    // viewCount: { multiply: 2 },  // 乘法
    // viewCount: { divide: 2 },    // 除法
  },
});
```

### 删除记录

```typescript
// 删除单条记录
const user = await prisma.user.delete({
  where: { id: 1 },
});

// 批量删除
const result = await prisma.user.deleteMany({
  where: {
    email: { contains: '@test.com' },
  },
});

// 删除所有记录
await prisma.user.deleteMany();
```

## 高级查询条件

```typescript
// 条件操作符
const users = await prisma.user.findMany({
  where: {
    // 等于
    email: 'alice@example.com',
    
    // 不等于
    NOT: { role: 'ADMIN' },
    
    // 包含
    name: { contains: 'alice' },
    
    // 开头/结尾
    email: { startsWith: 'alice' },
    email: { endsWith: '@example.com' },
    
    // 在列表中
    role: { in: ['USER', 'ADMIN'] },
    role: { notIn: ['GUEST'] },
    
    // 比较
    createdAt: { gt: new Date('2024-01-01') },
    createdAt: { gte: new Date('2024-01-01') },
    createdAt: { lt: new Date('2024-12-31') },
    createdAt: { lte: new Date('2024-12-31') },
    
    // 空值
    profile: { isNot: null },
    bio: { is: null },
    
    // 逻辑组合
    OR: [
      { email: { contains: 'alice' } },
      { name: { contains: 'alice' } },
    ],
    AND: [
      { role: 'USER' },
      { createdAt: { gt: new Date('2024-01-01') } },
    ],
  },
});

// 关系过滤
const usersWithPosts = await prisma.user.findMany({
  where: {
    posts: {
      some: { published: true },  // 至少有一篇已发布
      // every: { published: true }, // 所有都已发布
      // none: { published: false }, // 没有未发布的
    },
  },
});
```

## 在 NestJS 中使用

### 创建 Prisma 服务

```typescript
// prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    // 连接数据库
    await this.$connect();
    this.logger.log('Database connected');

    // 查询日志（开发环境）
    if (process.env.NODE_ENV === 'development') {
      this.$on('query' as never, (e: Prisma.QueryEvent) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
```

### 创建 Prisma 模块

```typescript
// prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### 在服务中使用

```typescript
// users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: createUserDto,
    });
  }

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { posts: true } } },
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
      },
    };
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        posts: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    await this.findOne(id); // 确保存在

    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
  }

  async remove(id: number) {
    await this.findOne(id); // 确保存在

    return this.prisma.user.delete({
      where: { id },
    });
  }
}
```

## Prisma Studio

```bash
# 启动 Prisma Studio（可视化数据库管理）
npx prisma studio
```

## 常用命令总结

| 命令 | 说明 |
|------|------|
| `npx prisma init` | 初始化 Prisma |
| `npx prisma generate` | 生成 Prisma Client |
| `npx prisma migrate dev` | 创建并应用迁移（开发） |
| `npx prisma migrate deploy` | 应用迁移（生产） |
| `npx prisma db push` | 同步 Schema（不创建迁移） |
| `npx prisma db pull` | 从数据库拉取 Schema |
| `npx prisma studio` | 启动可视化管理工具 |
| `npx prisma format` | 格式化 Schema 文件 |
| `npx prisma validate` | 验证 Schema 文件 |

## 下一步

[👉 12. Prisma 双数据库配置](./12-prisma-multidb.md)

