# 02. Schema 语法详解

Prisma Schema 是定义数据模型的核心文件，使用 Prisma Schema Language (PSL) 编写。

## Schema 文件结构

```prisma
// 1. 生成器配置
generator client {
  provider = "prisma-client-js"
}

// 2. 数据源配置
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// 3. 数据模型定义
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String?
}

// 4. 枚举类型
enum Role {
  USER
  ADMIN
}
```

## Generator 配置

```prisma
generator client {
  provider        = "prisma-client-js"  // 生成器类型
  output          = "./generated/client" // 输出目录（可选）
  previewFeatures = ["fullTextSearch"]   // 预览功能（可选）
  binaryTargets   = ["native"]           // 目标平台（可选）
}
```

### 常用配置

| 属性 | 说明 | 示例 |
|------|------|------|
| `provider` | 生成器类型 | `"prisma-client-js"` |
| `output` | 输出目录 | `"./generated/client"` |
| `previewFeatures` | 预览功能 | `["fullTextSearch"]` |
| `binaryTargets` | 目标平台 | `["native", "linux-musl"]` |

## Datasource 配置

### MySQL

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// .env
// DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE"
// DATABASE_URL="mysql://root:password@localhost:3306/mydb"
```

### MongoDB

```prisma
datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}

// .env
// DATABASE_URL="mongodb://USER:PASSWORD@HOST:PORT/DATABASE"
// DATABASE_URL="mongodb://localhost:27017/mydb"
// MongoDB Atlas: "mongodb+srv://user:pass@cluster.mongodb.net/mydb"
```

### 连接字符串参数

```env
# MySQL 连接参数
DATABASE_URL="mysql://root:password@localhost:3306/mydb?connection_limit=5&connect_timeout=10"

# MongoDB 连接参数
DATABASE_URL="mongodb://localhost:27017/mydb?retryWrites=true&w=majority"
```

## 模型定义

### 基础模型

```prisma
model User {
  id        Int      @id @default(autoincrement())  // 主键，自增
  email     String   @unique                         // 唯一约束
  name      String?                                  // 可选字段
  age       Int      @default(0)                     // 默认值
  isActive  Boolean  @default(true)                  // 布尔类型
  createdAt DateTime @default(now())                 // 创建时间
  updatedAt DateTime @updatedAt                      // 更新时间

  @@map("users")  // 映射到数据库表名
}
```

### 字段类型

| Prisma 类型 | MySQL 类型 | MongoDB 类型 | 说明 |
|-------------|-----------|--------------|------|
| `String` | VARCHAR(191) | String | 字符串 |
| `Int` | INT | Int | 整数 |
| `BigInt` | BIGINT | Long | 大整数 |
| `Float` | DOUBLE | Double | 浮点数 |
| `Decimal` | DECIMAL(65,30) | - | 精确小数 |
| `Boolean` | TINYINT(1) | Bool | 布尔值 |
| `DateTime` | DATETIME(3) | Timestamp | 日期时间 |
| `Json` | JSON | Object | JSON 数据 |
| `Bytes` | LONGBLOB | BinData | 二进制数据 |

### 字段修饰符

| 修饰符 | 说明 | 示例 |
|--------|------|------|
| `?` | 可选字段 | `name String?` |
| `[]` | 数组/列表 | `tags String[]` |
| `@id` | 主键 | `id Int @id` |
| `@unique` | 唯一约束 | `email String @unique` |
| `@default()` | 默认值 | `@default(now())` |
| `@updatedAt` | 自动更新时间 | `updatedAt DateTime @updatedAt` |
| `@map()` | 映射列名 | `@map("user_name")` |
| `@db.` | 数据库原生类型 | `@db.VarChar(255)` |

### 默认值函数

```prisma
model Example {
  // 自增 ID
  id         Int      @id @default(autoincrement())
  
  // UUID
  uuid       String   @id @default(uuid())
  
  // CUID
  cuid       String   @id @default(cuid())
  
  // 当前时间
  createdAt  DateTime @default(now())
  
  // 数据库默认值
  dbDefault  String   @default(dbgenerated("'default_value'"))
}
```

### 数据库原生类型

```prisma
model Product {
  id          Int      @id @default(autoincrement())
  
  // MySQL 原生类型
  name        String   @db.VarChar(200)
  description String?  @db.Text
  price       Decimal  @db.Decimal(10, 2)
  metadata    Json     @db.Json
  
  // 时间类型
  createdAt   DateTime @db.DateTime(0)
  date        DateTime @db.Date
  time        DateTime @db.Time(0)
}
```

## 索引与约束

### 单字段索引

```prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique  // 唯一索引
  name  String
  
  @@index([name])  // 普通索引
}
```

### 复合索引

```prisma
model Post {
  id        Int      @id @default(autoincrement())
  authorId  Int
  category  String
  createdAt DateTime @default(now())
  
  // 复合索引
  @@index([authorId, category])
  @@index([createdAt(sort: Desc)])  // 降序索引
}
```

### 复合唯一约束

```prisma
model Subscription {
  id        Int    @id @default(autoincrement())
  userId    Int
  productId Int
  
  // 复合唯一约束
  @@unique([userId, productId])
}
```

### 复合主键

```prisma
model PostTag {
  postId Int
  tagId  Int
  
  // 复合主键
  @@id([postId, tagId])
}
```

### 全文索引（MySQL）

```prisma
model Article {
  id      Int    @id @default(autoincrement())
  title   String @db.VarChar(255)
  content String @db.Text
  
  @@fulltext([title, content])
}
```

## 枚举类型

```prisma
enum Role {
  USER
  ADMIN
  MODERATOR
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  DELIVERED
  CANCELLED
}

model User {
  id   Int  @id @default(autoincrement())
  role Role @default(USER)
}

model Order {
  id     Int         @id @default(autoincrement())
  status OrderStatus @default(PENDING)
}
```

## 关系定义

### 一对一关系

```prisma
model User {
  id      Int      @id @default(autoincrement())
  email   String   @unique
  profile Profile?  // 可选的一对一关系
}

model Profile {
  id     Int    @id @default(autoincrement())
  bio    String?
  userId Int    @unique  // 外键必须唯一
  user   User   @relation(fields: [userId], references: [id])
}
```

### 一对多关系

```prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]  // 一个用户有多篇文章
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
  
  @@index([authorId])
}
```

### 多对多关系（隐式）

```prisma
model Post {
  id    Int    @id @default(autoincrement())
  title String
  tags  Tag[]   // 多对多
}

model Tag {
  id    Int    @id @default(autoincrement())
  name  String @unique
  posts Post[]  // 多对多
}
```

### 多对多关系（显式，可添加额外字段）

```prisma
model Post {
  id       Int           @id @default(autoincrement())
  title    String
  postTags PostOnTags[]
}

model Tag {
  id       Int           @id @default(autoincrement())
  name     String        @unique
  postTags PostOnTags[]
}

model PostOnTags {
  postId     Int
  tagId      Int
  post       Post     @relation(fields: [postId], references: [id])
  tag        Tag      @relation(fields: [tagId], references: [id])
  assignedAt DateTime @default(now())  // 额外字段
  assignedBy String?                    // 额外字段

  @@id([postId, tagId])
}
```

### 自引用关系

```prisma
model Category {
  id       Int        @id @default(autoincrement())
  name     String
  parentId Int?
  parent   Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children Category[] @relation("CategoryHierarchy")
}

model User {
  id          Int    @id @default(autoincrement())
  name        String
  managerId   Int?
  manager     User?  @relation("Management", fields: [managerId], references: [id])
  subordinates User[] @relation("Management")
}
```

### 关系属性

```prisma
model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id], onDelete: Cascade, onUpdate: Cascade)
}
```

| 属性 | 说明 | 可选值 |
|------|------|--------|
| `onDelete` | 删除时的行为 | `Cascade`, `Restrict`, `NoAction`, `SetNull`, `SetDefault` |
| `onUpdate` | 更新时的行为 | `Cascade`, `Restrict`, `NoAction`, `SetNull`, `SetDefault` |

## 模型属性

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String
  firstName String   @map("first_name")
  lastName  String   @map("last_name")
  createdAt DateTime @default(now()) @map("created_at")

  @@map("users")                    // 表名映射
  @@index([email])                  // 索引
  @@unique([firstName, lastName])   // 复合唯一
  @@id([field1, field2])           // 复合主键
}
```

## 多 Schema 文件（Prisma 6）

Prisma 6 支持将 Schema 拆分为多个文件：

```
prisma/
├── schema.prisma      # 主配置
├── user.prisma        # 用户模型
├── post.prisma        # 文章模型
└── order.prisma       # 订单模型
```

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["prismaSchemaFolder"]
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

## 下一步

[👉 03. MySQL 数据库配置与操作](./03-mysql.md)
