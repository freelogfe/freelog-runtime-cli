# 03. MySQL 数据库配置与操作

本章详细介绍如何配置 Prisma 连接 MySQL 数据库。

## 环境准备

### 使用 Docker 启动 MySQL

```yaml
# docker-compose.yml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: prisma-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: prisma_demo
    ports:
      - '3306:3306'
    volumes:
      - mysql_data:/var/lib/mysql
    command: --default-authentication-plugin=mysql_native_password

volumes:
  mysql_data:
```

```bash
# 启动 MySQL
docker-compose up -d

# 查看日志
docker logs prisma-mysql
```

### 连接字符串格式

```
mysql://USER:PASSWORD@HOST:PORT/DATABASE?参数
```

```env
# 基础连接
DATABASE_URL="mysql://root:password@localhost:3306/prisma_demo"

# 带连接池参数
DATABASE_URL="mysql://root:password@localhost:3306/prisma_demo?connection_limit=10&pool_timeout=20"

# SSL 连接
DATABASE_URL="mysql://root:password@localhost:3306/prisma_demo?sslmode=require"
```

### 连接参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `connection_limit` | 连接池大小 | `num_cpus * 2 + 1` |
| `pool_timeout` | 连接超时（秒） | `10` |
| `connect_timeout` | 连接建立超时（秒） | `5` |
| `socket_timeout` | 套接字超时（秒） | `5` |
| `sslmode` | SSL 模式 | `prefer` |

## Schema 配置

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ============ 用户模块 ============
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique @db.VarChar(255)
  password  String   @db.VarChar(255)
  name      String   @db.VarChar(100)
  avatar    String?  @db.VarChar(500)
  bio       String?  @db.Text
  role      Role     @default(USER)
  isActive  Boolean  @default(true) @map("is_active")
  profile   Profile?
  posts     Post[]
  comments  Comment[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([email])
  @@index([role])
  @@map("users")
}

model Profile {
  id        Int      @id @default(autoincrement())
  phone     String?  @db.VarChar(20)
  address   String?  @db.VarChar(500)
  birthday  DateTime? @db.Date
  userId    Int      @unique @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")

  @@map("profiles")
}

enum Role {
  USER
  ADMIN
  MODERATOR
}

// ============ 文章模块 ============
model Post {
  id          Int       @id @default(autoincrement())
  title       String    @db.VarChar(255)
  slug        String    @unique @db.VarChar(255)
  content     String?   @db.LongText
  excerpt     String?   @db.VarChar(500)
  coverImage  String?   @db.VarChar(500) @map("cover_image")
  published   Boolean   @default(false)
  viewCount   Int       @default(0) @map("view_count")
  authorId    Int       @map("author_id")
  author      User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  categoryId  Int?      @map("category_id")
  category    Category? @relation(fields: [categoryId], references: [id])
  tags        Tag[]
  comments    Comment[]
  publishedAt DateTime? @map("published_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@index([authorId])
  @@index([categoryId])
  @@index([published])
  @@index([createdAt])
  @@fulltext([title, content])
  @@map("posts")
}

model Category {
  id        Int        @id @default(autoincrement())
  name      String     @unique @db.VarChar(100)
  slug      String     @unique @db.VarChar(100)
  parentId  Int?       @map("parent_id")
  parent    Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children  Category[] @relation("CategoryHierarchy")
  posts     Post[]
  createdAt DateTime   @default(now()) @map("created_at")

  @@map("categories")
}

model Tag {
  id        Int      @id @default(autoincrement())
  name      String   @unique @db.VarChar(50)
  slug      String   @unique @db.VarChar(50)
  posts     Post[]
  createdAt DateTime @default(now()) @map("created_at")

  @@map("tags")
}

model Comment {
  id        Int       @id @default(autoincrement())
  content   String    @db.Text
  postId    Int       @map("post_id")
  post      Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  authorId  Int       @map("author_id")
  author    User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parentId  Int?      @map("parent_id")
  parent    Comment?  @relation("CommentReplies", fields: [parentId], references: [id])
  replies   Comment[] @relation("CommentReplies")
  createdAt DateTime  @default(now()) @map("created_at")

  @@index([postId])
  @@index([authorId])
  @@map("comments")
}

// ============ 订单模块 ============
model Product {
  id          Int         @id @default(autoincrement())
  name        String      @db.VarChar(200)
  description String?     @db.Text
  price       Decimal     @db.Decimal(10, 2)
  stock       Int         @default(0)
  sku         String      @unique @db.VarChar(50)
  images      Json?       // 存储图片数组
  isActive    Boolean     @default(true) @map("is_active")
  orderItems  OrderItem[]
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  @@index([price])
  @@index([isActive])
  @@map("products")
}

model Order {
  id              Int         @id @default(autoincrement())
  orderNo         String      @unique @db.VarChar(50) @map("order_no")
  userId          Int         @map("user_id")
  status          OrderStatus @default(PENDING)
  totalAmount     Decimal     @db.Decimal(10, 2) @map("total_amount")
  shippingAddress String?     @db.Text @map("shipping_address")
  note            String?     @db.VarChar(500)
  items           OrderItem[]
  paidAt          DateTime?   @map("paid_at")
  shippedAt       DateTime?   @map("shipped_at")
  completedAt     DateTime?   @map("completed_at")
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  @@index([userId])
  @@index([status])
  @@index([orderNo])
  @@index([createdAt])
  @@map("orders")
}

model OrderItem {
  id        Int     @id @default(autoincrement())
  orderId   Int     @map("order_id")
  order     Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId Int     @map("product_id")
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  price     Decimal @db.Decimal(10, 2)

  @@index([orderId])
  @@index([productId])
  @@map("order_items")
}

enum OrderStatus {
  PENDING      // 待支付
  PAID         // 已支付
  PROCESSING   // 处理中
  SHIPPED      // 已发货
  DELIVERED    // 已送达
  COMPLETED    // 已完成
  CANCELLED    // 已取消
  REFUNDED     // 已退款
}
```

## 数据库迁移

### 开发环境迁移

```bash
# 创建迁移
npx prisma migrate dev --name init

# 创建迁移但不应用
npx prisma migrate dev --name add_user_table --create-only

# 应用待处理的迁移
npx prisma migrate dev
```

### 生产环境迁移

```bash
# 应用所有迁移
npx prisma migrate deploy

# 检查迁移状态
npx prisma migrate status

# 解决迁移问题
npx prisma migrate resolve --applied "migration_name"
```

### 快速同步（开发用）

```bash
# 直接同步 Schema 到数据库（不创建迁移文件）
npx prisma db push

# 从数据库拉取 Schema
npx prisma db pull
```

## MySQL 特有功能

### 全文搜索

```prisma
model Post {
  id      Int    @id @default(autoincrement())
  title   String @db.VarChar(255)
  content String @db.Text

  @@fulltext([title, content])
}
```

```typescript
// 全文搜索查询
const posts = await prisma.post.findMany({
  where: {
    title: {
      search: 'prisma database',
    },
  },
});

// 多字段全文搜索
const posts = await prisma.post.findMany({
  where: {
    OR: [
      { title: { search: 'prisma' } },
      { content: { search: 'prisma' } },
    ],
  },
});
```

### JSON 字段操作

```prisma
model Product {
  id       Int   @id @default(autoincrement())
  metadata Json? // JSON 字段
}
```

```typescript
// 创建带 JSON 的记录
const product = await prisma.product.create({
  data: {
    name: 'Product 1',
    metadata: {
      colors: ['red', 'blue'],
      sizes: ['S', 'M', 'L'],
      specs: {
        weight: '500g',
        dimensions: '10x20x30',
      },
    },
  },
});

// 查询 JSON 字段
const products = await prisma.product.findMany({
  where: {
    metadata: {
      path: ['colors'],
      array_contains: 'red',
    },
  },
});

// 更新 JSON 字段
await prisma.product.update({
  where: { id: 1 },
  data: {
    metadata: {
      ...existingMetadata,
      newField: 'value',
    },
  },
});
```

### 原生 SQL

```typescript
// 查询
const users = await prisma.$queryRaw`
  SELECT * FROM users 
  WHERE email LIKE ${`%${keyword}%`}
  LIMIT ${limit}
`;

// 执行
const result = await prisma.$executeRaw`
  UPDATE users 
  SET is_active = false 
  WHERE last_login < DATE_SUB(NOW(), INTERVAL 30 DAY)
`;

// 使用 Prisma.sql 构建动态查询
import { Prisma } from '@prisma/client';

const orderBy = Prisma.sql`ORDER BY created_at DESC`;
const users = await prisma.$queryRaw`
  SELECT * FROM users ${orderBy}
`;
```

## 性能优化

### 连接池配置

```env
# 推荐的连接池配置
DATABASE_URL="mysql://root:password@localhost:3306/mydb?connection_limit=10&pool_timeout=20"
```

### 查询优化

```typescript
// 1. 只选择需要的字段
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    email: true,
  },
});

// 2. 使用索引字段查询
const user = await prisma.user.findUnique({
  where: { email: 'test@example.com' }, // email 有唯一索引
});

// 3. 分页查询
const users = await prisma.user.findMany({
  skip: 0,
  take: 10,
  orderBy: { createdAt: 'desc' },
});

// 4. 批量操作
await prisma.user.createMany({
  data: users,
  skipDuplicates: true,
});
```

## 下一步

[👉 04. MongoDB 数据库配置与操作](./04-mongodb.md)
