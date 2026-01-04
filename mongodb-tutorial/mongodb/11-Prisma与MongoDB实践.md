# 第十一章：Prisma 配合 MongoDB 从入门到精通

## 11.1 Prisma 简介与核心概念

### 什么是 Prisma？

Prisma 是一个现代化的数据库工具包，提供了类型安全的数据库访问。它包含三个主要组件：

1. **Prisma Client**：类型安全的数据库查询客户端
2. **Prisma Migrate**：数据库迁移工具
3. **Prisma Studio**：可视化数据库管理工具

### Prisma vs Mongoose/Typegoose

| 特性 | Prisma | Mongoose/Typegoose |
|------|--------|-------------------|
| 类型安全 | ✅ 完全类型安全，自动生成 | ⚠️ 需要手动定义类型 |
| 代码生成 | ✅ 自动生成 TypeScript 类型 | ❌ 手动定义 Schema |
| 查询构建器 | ✅ 流畅的 API，智能提示 | ⚠️ 链式调用，需要记忆方法 |
| MongoDB 支持 | ⚠️ Prisma 6.x 完全支持 | ✅ 完全支持 |
| 事务支持 | ✅ 需要副本集 | ✅ 需要副本集 |
| 迁移工具 | ⚠️ MongoDB 支持有限 | ✅ 完全支持 |
| 学习曲线 | ⚠️ 中等 | ✅ 较低 |
| 性能 | ✅ 优秀 | ✅ 优秀 |

### 为什么选择 Prisma？

1. **类型安全**：自动生成的类型确保编译时类型检查
2. **开发体验**：优秀的 IDE 支持和智能提示
3. **代码生成**：Schema 变更后自动更新类型
4. **现代化**：专为 TypeScript 设计
5. **团队协作**：Schema 文件作为单一数据源

## 11.2 环境准备与安装

### 系统要求

- Node.js >= 18.x
- MongoDB >= 4.4（推荐 6.0+）
- TypeScript >= 5.0（推荐）

### 安装 Prisma

```bash
# 使用 npm
npm install prisma@6.19.1 @prisma/client@6.19.1

# 使用 pnpm（推荐）
pnpm add prisma@6.19.1 @prisma/client@6.19.1

# 使用 yarn
yarn add prisma@6.19.1 @prisma/client@6.19.1
```

**重要**：Prisma 7.x 对 MongoDB 的支持有限，推荐使用 Prisma 6.x。

### 初始化 Prisma

```bash
# 初始化 Prisma 项目
npx prisma init

# 这会创建：
# - prisma/schema.prisma（Schema 文件）
# - .env（环境变量文件）
```

### MongoDB 配置要求

**重要**：Prisma 需要 MongoDB 以副本集模式运行（即使单节点也需要）。

#### 单节点副本集配置（开发环境）

```bash
# 1. 编辑 MongoDB 配置文件（mongod.cfg）
# Windows: C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg
# Linux: /etc/mongod.conf

# 添加以下配置
replication:
  replSetName: rs0

# 2. 重启 MongoDB 服务
# Windows
net stop MongoDB
net start MongoDB

# Linux
sudo systemctl restart mongod

# 3. 连接到 MongoDB Shell
mongosh

# 4. 初始化副本集
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" }
  ]
})

# 5. 验证副本集状态
rs.status()
```

#### 使用 MongoDB Atlas（生产环境推荐）

MongoDB Atlas 默认已配置副本集，无需额外配置：

```env
DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority"
```

## 11.3 Schema 设计详解

### 基本 Schema 结构

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  name      String
  email     String   @unique
  age       Int?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
  @@index([email])
}
```

### 字段类型详解

#### 基本类型

```prisma
model Example {
  // 字符串类型
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  name      String
  email     String?  // 可选字段
  
  // 数值类型
  age       Int?     // 32位整数
  price     Float?   // 双精度浮点数
  
  // 布尔类型
  active    Boolean  @default(true)
  
  // 日期时间类型
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // 数组类型
  tags      String[]
  scores    Int[]
  
  // 枚举类型
  status    Status   @default(PENDING)
  
  // JSON 类型（MongoDB 特有）
  metadata  Json?
}

enum Status {
  PENDING
  ACTIVE
  INACTIVE
}
```

#### MongoDB 特有类型

```prisma
model Document {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  
  // ObjectId 引用
  userId    String   @db.ObjectId
  authorId  String?  @db.ObjectId
  
  // 日期（仅日期，不含时间）
  birthDate DateTime @db.Date
  
  // 二进制数据
  // 注意：Prisma 对二进制数据支持有限，建议使用 GridFS
}
```

### 关系定义

#### 一对一关系

```prisma
model User {
  id      String   @id @default(auto()) @map("_id") @db.ObjectId
  email   String   @unique
  profile Profile?
}

model Profile {
  id     String @id @default(auto()) @map("_id") @db.ObjectId
  userId String @unique @db.ObjectId
  bio    String?
  avatar String?
  
  user   User   @relation(fields: [userId], references: [id])
}
```

#### 一对多关系

```prisma
model User {
  id    String @id @default(auto()) @map("_id") @db.ObjectId
  email String @unique
  posts Post[]
}

model Post {
  id       String @id @default(auto()) @map("_id") @db.ObjectId
  title    String
  content  String
  authorId String @db.ObjectId
  
  author   User   @relation(fields: [authorId], references: [id])
}
```

#### 多对多关系

```prisma
model Post {
  id       String      @id @default(auto()) @map("_id") @db.ObjectId
  title    String
  tags     PostTag[]
}

model Tag {
  id    String    @id @default(auto()) @map("_id") @db.ObjectId
  name  String    @unique
  posts PostTag[]
}

model PostTag {
  id     String @id @default(auto()) @map("_id") @db.ObjectId
  postId String @db.ObjectId
  tagId  String @db.ObjectId
  
  post   Post   @relation(fields: [postId], references: [id])
  tag    Tag    @relation(fields: [tagId], references: [id])
  
  @@unique([postId, tagId])
  @@index([postId])
  @@index([tagId])
}
```

### 索引定义

```prisma
model User {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  email     String   @unique  // 唯一索引
  age       Int?
  createdAt DateTime @default(now())
  
  // 单字段索引
  @@index([email])
  
  // 复合索引
  @@index([age, createdAt(sort: Desc)])
  
  // 文本索引（MongoDB 特有，需要原生查询创建）
  // @@index([name, bio], type: Text)  // Prisma 不支持，需手动创建
}
```

### 默认值和约束

```prisma
model User {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  name      String
  email     String   @unique
  age       Int?     @default(18)           // 默认值
  active    Boolean  @default(true)         // 默认值
  createdAt DateTime @default(now())        // 创建时自动设置
  updatedAt DateTime @updatedAt             // 更新时自动更新
  tags      String[] @default([])           // 数组默认值
}
```

### 集合映射

```prisma
model User {
  id String @id @default(auto()) @map("_id") @db.ObjectId
  
  @@map("users")  // 映射到 MongoDB 集合 "users"
}
```

## 11.4 Prisma Client 基础操作

### 初始化 Prisma Client

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'info' },
    { emit: 'stdout', level: 'warn' },
  ],
  errorFormat: 'colorless',
});

// 监听查询事件
prisma.$on('query' as never, (e: any) => {
  console.log('Query: ' + e.query);
  console.log('Duration: ' + e.duration + 'ms');
});
```

### 创建操作（Create）

#### 创建单个文档

```typescript
// 基本创建
const user = await prisma.user.create({
  data: {
    name: "张三",
    email: "zhangsan@example.com",
    age: 25
  }
});

// 创建时设置默认值
const user = await prisma.user.create({
  data: {
    name: "李四",
    email: "lisi@example.com"
    // age 会使用默认值 18
  }
});

// 创建时包含关系
const user = await prisma.user.create({
  data: {
    name: "王五",
    email: "wangwu@example.com",
    profile: {
      create: {
        bio: "这是我的个人简介",
        avatar: "https://example.com/avatar.jpg"
      }
    },
    posts: {
      create: [
        {
          title: "第一篇文章",
          content: "内容..."
        },
        {
          title: "第二篇文章",
          content: "内容..."
        }
      ]
    }
  },
  include: {
    profile: true,
    posts: true
  }
});
```

#### 批量创建

```typescript
// 批量创建（不返回创建的文档）
await prisma.user.createMany({
  data: [
    { name: "用户1", email: "user1@example.com" },
    { name: "用户2", email: "user2@example.com" },
    { name: "用户3", email: "user3@example.com" }
  ],
  skipDuplicates: true  // 跳过重复的 email
});

// 批量创建并返回结果（需要循环）
const users = await Promise.all([
  prisma.user.create({ data: { name: "用户1", email: "user1@example.com" } }),
  prisma.user.create({ data: { name: "用户2", email: "user2@example.com" } }),
  prisma.user.create({ data: { name: "用户3", email: "user3@example.com" } })
]);
```

### 查询操作（Read）

#### 查询单个文档

```typescript
// 根据唯一字段查询
const user = await prisma.user.findUnique({
  where: {
    id: userId
    // 或 email: "zhangsan@example.com"
  }
});

// 查询第一个匹配的文档
const user = await prisma.user.findFirst({
  where: {
    age: { gte: 18 }
  }
});

// 查询或创建（upsert）
const user = await prisma.user.upsert({
  where: {
    email: "zhangsan@example.com"
  },
  update: {
    age: 26
  },
  create: {
    name: "张三",
    email: "zhangsan@example.com",
    age: 25
  }
});
```

#### 查询多个文档

```typescript
// 基本查询
const users = await prisma.user.findMany();

// 条件查询
const users = await prisma.user.findMany({
  where: {
    age: { gte: 18 }
  }
});

// 排序
const users = await prisma.user.findMany({
  orderBy: {
    createdAt: 'desc'  // 或 'asc'
  }
});

// 复合排序
const users = await prisma.user.findMany({
  orderBy: [
    { age: 'desc' },
    { createdAt: 'asc' }
  ]
});

// 分页
const users = await prisma.user.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize
});

// 限制返回数量
const users = await prisma.user.findMany({
  take: 10
});
```

#### 条件查询操作符

```typescript
const users = await prisma.user.findMany({
  where: {
    // 等于
    age: 25,
    
    // 不等于
    age: { not: 25 },
    
    // 大于、大于等于
    age: { gt: 18 },
    age: { gte: 18 },
    
    // 小于、小于等于
    age: { lt: 65 },
    age: { lte: 65 },
    
    // 在数组中
    age: { in: [18, 25, 30] },
    
    // 不在数组中
    age: { notIn: [18, 25] },
    
    // 字符串包含（MongoDB 不支持 case-insensitive）
    name: { contains: "张" },
    
    // 字符串开头
    email: { startsWith: "zhang" },
    
    // 字符串结尾
    email: { endsWith: "@example.com" },
    
    // 逻辑运算符
    AND: [
      { age: { gte: 18 } },
      { age: { lte: 65 } }
    ],
    OR: [
      { name: { contains: "张" } },
      { name: { contains: "李" } }
    ],
    NOT: {
      active: false
    },
    
    // 数组操作
    tags: {
      has: "javascript"  // 数组包含某个值
    },
    tags: {
      hasEvery: ["javascript", "typescript"]  // 数组包含所有值
    },
    tags: {
      hasSome: ["javascript", "python"]  // 数组包含任一值
    },
    tags: {
      isEmpty: false  // 数组不为空
    },
    
    // 关系查询
    posts: {
      some: {
        title: { contains: "MongoDB" }
      }
    },
    
    // 嵌套条件
    profile: {
      is: {
        bio: { contains: "开发者" }
      }
    }
  }
});
```

#### 选择字段

```typescript
// 只选择特定字段
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true
  }
});

// 排除特定字段
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    age: false  // 排除 age
  }
});
```

#### 包含关系

```typescript
// 包含关系数据
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    profile: true,
    posts: {
      where: {
        published: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    }
  }
});

// 嵌套包含
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    posts: {
      include: {
        tags: true
      }
    }
  }
});
```

### 更新操作（Update）

#### 更新单个文档

```typescript
// 基本更新
const user = await prisma.user.update({
  where: { id: userId },
  data: {
    age: 26,
    name: "新名字"
  }
});

// 更新数组（替换整个数组）
const user = await prisma.user.update({
  where: { id: userId },
  data: {
    tags: ["javascript", "typescript", "nodejs"]
  }
});

// 更新关系
const user = await prisma.user.update({
  where: { id: userId },
  data: {
    profile: {
      upsert: {
        create: {
          bio: "新简介"
        },
        update: {
          bio: "更新的简介"
        }
      }
    }
  }
});
```

#### 更新多个文档

```typescript
// 批量更新
const result = await prisma.user.updateMany({
  where: {
    age: { lt: 18 }
  },
  data: {
    active: false
  }
});

console.log(`更新了 ${result.count} 个文档`);
```

#### 数组操作（MongoDB 特有）

Prisma 对数组操作支持有限，需要使用原生查询：

```typescript
// ❌ Prisma 不支持直接数组操作
// await prisma.user.update({
//   where: { id: userId },
//   data: {
//     tags: { push: "新标签" }  // 不支持
//   }
// });

// ✅ 方法1：读取、修改、更新
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { tags: true }
});

const updatedTags = [...user.tags, "新标签"];

await prisma.user.update({
  where: { id: userId },
  data: {
    tags: updatedTags
  }
});

// ✅ 方法2：使用原生查询
await prisma.$runCommandRaw({
  update: 'users',
  updates: [{
    q: { _id: { $oid: userId } },
    u: { $push: { tags: "新标签" } }
  }]
});
```

### 删除操作（Delete）

```typescript
// 删除单个文档
await prisma.user.delete({
  where: { id: userId }
});

// 批量删除
const result = await prisma.user.deleteMany({
  where: {
    active: false
  }
});

// 软删除（推荐）
await prisma.user.update({
  where: { id: userId },
  data: {
    isDeleted: true,
    deletedAt: new Date()
  }
});
```

### 计数和聚合

```typescript
// 计数
const count = await prisma.user.count({
  where: {
    age: { gte: 18 }
  }
});

// 分组统计
const stats = await prisma.user.groupBy({
  by: ['age'],
  where: {
    active: true
  },
  _count: {
    age: true
  },
  _avg: {
    age: true
  },
  _sum: {
    age: true
  },
  _min: {
    age: true
  },
  _max: {
    age: true
  }
});
```

## 11.5 事务处理

### 基本事务

```typescript
// 交互式事务
const result = await prisma.$transaction(async (tx) => {
  // 创建用户
  const user = await tx.user.create({
    data: {
      name: "张三",
      email: "zhangsan@example.com"
    }
  });

  // 创建个人资料
  const profile = await tx.profile.create({
    data: {
      userId: user.id,
      bio: "个人简介"
    }
  });

  // 创建文章
  const post = await tx.post.create({
    data: {
      title: "第一篇文章",
      content: "内容",
      authorId: user.id
    }
  });

  return { user, profile, post };
});
```

### 转账示例

```typescript
async function transferMoney(
  fromUserId: string,
  toUserId: string,
  amount: number
) {
  return await prisma.$transaction(async (tx) => {
    // 检查余额
    const fromUser = await tx.user.findUnique({
      where: { id: fromUserId },
      select: { balance: true }
    });

    if (!fromUser || fromUser.balance < amount) {
      throw new Error('余额不足');
    }

    // 扣除转出账户
    await tx.user.update({
      where: { id: fromUserId },
      data: {
        balance: { decrement: amount }
      }
    });

    // 增加转入账户
    await tx.user.update({
      where: { id: toUserId },
      data: {
        balance: { increment: amount }
      }
    });

    // 记录交易
    await tx.transaction.create({
      data: {
        fromUserId,
        toUserId,
        amount,
        type: 'transfer'
      }
    });
  });
}
```

### 事务选项

```typescript
// 设置超时时间
await prisma.$transaction(
  async (tx) => {
    // 事务操作
  },
  {
    maxWait: 5000,  // 等待锁的最大时间（毫秒）
    timeout: 10000  // 事务超时时间（毫秒）
  }
);
```

## 11.6 原生查询和聚合管道

### 原生 MongoDB 查询

```typescript
// 使用 $runCommandRaw 执行 MongoDB 命令
const result = await prisma.$runCommandRaw({
  find: 'users',
  filter: {
    age: { $gte: 18 }
  },
  limit: 10
});

// 聚合管道
const result = await prisma.$runCommandRaw({
  aggregate: 'users',
  pipeline: [
    {
      $match: {
        age: { $gte: 18 }
      }
    },
    {
      $group: {
        _id: '$age',
        count: { $sum: 1 },
        avgAge: { $avg: '$age' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ],
  cursor: {}
});
```

### 数组操作（原生查询）

```typescript
// 添加数组元素
await prisma.$runCommandRaw({
  update: 'users',
  updates: [{
    q: { _id: { $oid: userId } },
    u: { $push: { tags: "新标签" } }
  }]
});

// 删除数组元素
await prisma.$runCommandRaw({
  update: 'users',
  updates: [{
    q: { _id: { $oid: userId } },
    u: { $pull: { tags: "旧标签" } }
  }]
});

// 更新数组中的元素
await prisma.$runCommandRaw({
  update: 'users',
  updates: [{
    q: { _id: { $oid: userId } },
    u: { $set: { "tags.$[element]": "更新的标签" } },
    arrayFilters: [{ element: "旧标签" }]
  }]
});
```

## 11.7 NestJS 集成实践

### Prisma Service

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
      ],
      errorFormat: 'colorless',
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Database connected successfully');
    } catch (error) {
      this.logger.error('❌ Database connection failed', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  async enableShutdownHooks(app: any) {
    this.$on('beforeExit' as never, async () => {
      await app.close();
    });
  }
}
```

### Prisma Module

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### Service 使用示例

```typescript
// src/todo/todo.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TodoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTodoDto: CreateTodoDto) {
    return await this.prisma.todo.create({
      data: createTodoDto
    });
  }

  async findAll(query: {
    userId?: string;
    completed?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { userId, completed, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TodoWhereInput = {
      isDeleted: false,
    };

    if (userId) {
      where.userId = userId;
    }

    if (completed !== undefined) {
      where.completed = completed;
    }

    const [data, total] = await Promise.all([
      this.prisma.todo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.todo.count({ where })
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findOne(id: string) {
    const todo = await this.prisma.todo.findFirst({
      where: {
        id,
        isDeleted: false
      }
    });

    if (!todo) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }

    return todo;
  }

  async update(id: string, updateTodoDto: UpdateTodoDto) {
    await this.findOne(id);

    return await this.prisma.todo.update({
      where: { id },
      data: updateTodoDto
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return await this.prisma.todo.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });
  }
}
```

## 11.8 数据迁移和种子

### 使用 db push（开发环境）

```bash
# 推送 schema 变更到数据库
npx prisma db push

# 生成 Prisma Client
npx prisma generate

# 重置数据库（危险操作）
npx prisma db push --force-reset
```

### 数据种子

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 创建用户
  const user = await prisma.user.create({
    data: {
      name: "张三",
      email: "zhangsan@example.com",
      age: 25,
      profile: {
        create: {
          bio: "这是我的个人简介"
        }
      },
      posts: {
        create: [
          {
            title: "第一篇文章",
            content: "内容..."
          },
          {
            title: "第二篇文章",
            content: "内容..."
          }
        ]
      }
    }
  });

  console.log('Seeded user:', user);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

```json
// package.json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

```bash
# 运行种子
npx prisma db seed
```

## 11.9 性能优化技巧

### 1. 使用索引

```prisma
model User {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  email     String   @unique
  age       Int?
  createdAt DateTime @default(now())

  // 单字段索引
  @@index([email])
  
  // 复合索引
  @@index([age, createdAt(sort: Desc)])
  
  // 文本索引（需要手动创建）
  // db.users.createIndex({ name: "text", bio: "text" })
}
```

### 2. 选择字段

```typescript
// ❌ 差：返回所有字段
const users = await prisma.user.findMany();

// ✅ 好：只返回需要的字段
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true
  }
});
```

### 3. 批量操作

```typescript
// ❌ 差：循环插入
for (const data of userData) {
  await prisma.user.create({ data });
}

// ✅ 好：批量插入
await prisma.user.createMany({
  data: userData,
  skipDuplicates: true
});
```

### 4. 并行查询

```typescript
// ❌ 差：串行查询
const users = await prisma.user.findMany();
const posts = await prisma.post.findMany();
const comments = await prisma.comment.findMany();

// ✅ 好：并行查询
const [users, posts, comments] = await Promise.all([
  prisma.user.findMany(),
  prisma.post.findMany(),
  prisma.comment.findMany()
]);
```

### 5. 使用原生查询优化复杂查询

```typescript
// 对于复杂聚合，使用原生查询
const stats = await prisma.$runCommandRaw({
  aggregate: 'users',
  pipeline: [
    { $match: { active: true } },
    { $group: { _id: '$age', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ],
  cursor: {}
});
```

## 11.10 常见问题和解决方案

### 问题 1：Prisma 7.x 不支持 MongoDB

**错误信息**：
```
PrismaClientConstructorValidationError: Using engine type "client" requires either "adapter" or "accelerateUrl" to be provided
```

**解决方案**：使用 Prisma 6.x

```bash
pnpm add prisma@6.19.1 @prisma/client@6.19.1
```

### 问题 2：事务需要副本集

**错误信息**：
```
Prisma needs to perform transactions, which requires your MongoDB server to be run as a replica set.
Error code: P2031
```

**解决方案**：配置 MongoDB 副本集（见 11.2 节）

### 问题 3：数组操作限制

**问题**：Prisma 不支持直接数组操作（如 `$push`、`$pull`）

**解决方案**：

```typescript
// 方法1：读取、修改、更新
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { tags: true }
});
const updatedTags = [...user.tags, "新标签"];
await prisma.user.update({
  where: { id: userId },
  data: { tags: updatedTags }
});

// 方法2：使用原生查询
await prisma.$runCommandRaw({
  update: 'users',
  updates: [{
    q: { _id: { $oid: userId } },
    u: { $push: { tags: "新标签" } }
  }]
});
```

### 问题 4：ObjectId 转换

**问题**：字符串 ID 需要转换为 ObjectId

**解决方案**：

```typescript
import { ObjectId } from 'mongodb';

// 在查询中使用
const user = await prisma.user.findUnique({
  where: { id: userId }  // Prisma 自动处理
});

// 在原生查询中使用
await prisma.$runCommandRaw({
  find: 'users',
  filter: {
    _id: { $oid: userId }  // 需要手动转换
  }
});
```

### 问题 5：连接池耗尽

**问题**：Too many connections

**解决方案**：

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + "?connection_limit=10"
    }
  }
});
```

## 11.11 最佳实践

### 1. Schema 设计

```prisma
// ✅ 好：清晰的模型定义
model User {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
  @@index([email])
}

// ❌ 差：缺少索引和映射
model User {
  id    String @id @default(auto()) @map("_id") @db.ObjectId
  email String
}
```

### 2. Service 层封装

```typescript
// ✅ 好：封装业务逻辑
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return await this.prisma.user.findUnique({
      where: { email }
    });
  }

  async createWithProfile(userData: CreateUserDto, profileData: CreateProfileDto) {
    return await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: userData });
      const profile = await tx.profile.create({
        data: { ...profileData, userId: user.id }
      });
      return { user, profile };
    });
  }
}
```

### 3. 错误处理

```typescript
// ✅ 好：适当的错误处理
async findOne(id: string) {
  const user = await this.prisma.user.findUnique({
    where: { id }
  });

  if (!user) {
    throw new NotFoundException(`User with ID ${id} not found`);
  }

  return user;
}

// ✅ 好：处理 Prisma 错误
try {
  await prisma.user.create({ data });
} catch (error) {
  if (error.code === 'P2002') {
    throw new ConflictException('Email already exists');
  }
  throw error;
}
```

### 4. 类型安全

```typescript
// ✅ 好：使用 Prisma 生成的类型
import { User, Prisma } from '@prisma/client';

type UserWithPosts = Prisma.UserGetPayload<{
  include: { posts: true }
}>;

type UserCreateInput = Prisma.UserCreateInput;
type UserUpdateInput = Prisma.UserUpdateInput;
```

### 5. 软删除模式

```prisma
model Todo {
  id        String    @id @default(auto()) @map("_id") @db.ObjectId
  title     String
  isDeleted Boolean   @default(false)
  deletedAt DateTime?

  @@index([isDeleted])
}
```

```typescript
// 查询时排除已删除的文档
const todos = await prisma.todo.findMany({
  where: {
    isDeleted: false
  }
});
```

### 6. 连接管理

```typescript
// ✅ 好：在应用关闭时断开连接
async onModuleDestroy() {
  await this.$disconnect();
}

// ✅ 好：处理应用关闭钩子
async enableShutdownHooks(app: any) {
  this.$on('beforeExit' as never, async () => {
    await app.close();
  });
}
```

## 11.12 实际项目示例

查看 `examples/todo-nestjs-prisma/` 了解完整的 Prisma + MongoDB + NestJS 项目示例，包括：

- ✅ 完整的 CRUD 操作
- ✅ 复杂查询和过滤
- ✅ 数组操作
- ✅ 软删除实现
- ✅ 统计和聚合
- ✅ 事务处理
- ✅ 错误处理
- ✅ 类型安全

## 11.13 总结

Prisma 配合 MongoDB 提供了：

1. **类型安全**：自动生成的类型确保编译时检查
2. **开发体验**：优秀的 IDE 支持和智能提示
3. **代码生成**：Schema 变更后自动更新类型
4. **现代化**：专为 TypeScript 设计
5. **灵活性**：支持原生查询处理复杂场景

虽然 Prisma 6.x 对 MongoDB 的支持有一些限制（如数组操作），但通过结合原生查询，可以满足大部分需求。对于需要复杂 MongoDB 特性的场景，建议：

- 使用 Prisma 处理常规 CRUD 操作
- 使用原生查询处理复杂聚合和数组操作
- 合理使用索引优化查询性能
- 遵循最佳实践确保代码质量

查看 `examples/11-prisma-mongodb.js` 了解完整的 Prisma + MongoDB 示例。
