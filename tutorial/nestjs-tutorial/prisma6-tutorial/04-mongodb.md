# 04. MongoDB 数据库配置与操作

本章详细介绍如何配置 Prisma 连接 MongoDB 数据库。

## 环境准备

### 使用 Docker 启动 MongoDB

```yaml
# docker-compose.yml
version: '3.8'

services:
  mongodb:
    image: mongo:6.0
    container_name: prisma-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: password
    ports:
      - '27017:27017'
    volumes:
      - mongo_data:/data/db

  # 可选：MongoDB 管理界面
  mongo-express:
    image: mongo-express
    container_name: prisma-mongo-express
    restart: unless-stopped
    ports:
      - '8081:8081'
    environment:
      ME_CONFIG_MONGODB_ADMINUSERNAME: root
      ME_CONFIG_MONGODB_ADMINPASSWORD: password
      ME_CONFIG_MONGODB_URL: mongodb://root:password@mongodb:27017/
    depends_on:
      - mongodb

volumes:
  mongo_data:
```

```bash
# 启动 MongoDB
docker-compose up -d

# 访问 Mongo Express: http://localhost:8081
```

### 连接字符串格式

```
mongodb://USER:PASSWORD@HOST:PORT/DATABASE?参数
mongodb+srv://USER:PASSWORD@CLUSTER/DATABASE?参数
```

```env
# 本地 MongoDB
DATABASE_URL="mongodb://localhost:27017/prisma_demo"

# 带认证的本地 MongoDB
DATABASE_URL="mongodb://root:password@localhost:27017/prisma_demo?authSource=admin"

# MongoDB Atlas
DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/prisma_demo?retryWrites=true&w=majority"

# 副本集
DATABASE_URL="mongodb://host1:27017,host2:27017,host3:27017/prisma_demo?replicaSet=rs0"
```

### 连接参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `authSource` | 认证数据库 | `admin` |
| `retryWrites` | 重试写入 | `true` |
| `w` | 写入确认 | `majority` |
| `replicaSet` | 副本集名称 | `rs0` |
| `maxPoolSize` | 最大连接数 | `10` |
| `minPoolSize` | 最小连接数 | `5` |

## MongoDB 与 MySQL 的差异

| 特性 | MySQL | MongoDB |
|------|-------|---------|
| 主键 | `@id @default(autoincrement())` | `@id @default(auto()) @map("_id") @db.ObjectId` |
| 自增 ID | 支持 | 不支持，使用 ObjectId |
| 外键约束 | 支持 | 不支持（应用层处理） |
| 事务 | 完全支持 | 需要副本集 |
| 嵌套文档 | 不支持 | 原生支持 |
| 数组字段 | JSON | 原生支持 |
| 迁移 | `migrate dev` | `db push` |

## Schema 配置

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}

// ============ 活动日志 ============
model ActivityLog {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      Int      // 关联 MySQL 用户 ID（跨库引用）
  action      String   // CREATE, READ, UPDATE, DELETE, LOGIN, LOGOUT
  resource    String   // user, post, order
  resourceId  String?  // 资源 ID
  oldData     Json?    // 修改前的数据
  newData     Json?    // 修改后的数据
  metadata    Json?    // 额外元数据
  ip          String?
  userAgent   String?
  duration    Int?     // 操作耗时（毫秒）
  status      String   @default("success") // success, failure
  errorMessage String?
  timestamp   DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([resource])
  @@index([timestamp])
  @@map("activity_logs")
}

// ============ 系统配置 ============
model SystemConfig {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  key         String   @unique
  value       Json
  description String?
  category    String   @default("general")
  isPublic    Boolean  @default(false)
  updatedBy   Int?
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())

  @@index([category])
  @@map("system_configs")
}

// ============ 用户会话 ============
model UserSession {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  userId       Int
  token        String   @unique
  refreshToken String?  @unique
  deviceInfo   DeviceInfo?  // 嵌入式文档
  ip           String?
  userAgent    String?
  expiresAt    DateTime
  lastActiveAt DateTime @default(now())
  createdAt    DateTime @default(now())

  @@index([userId])
  @@index([token])
  @@index([expiresAt])
  @@map("user_sessions")
}

// 嵌入式文档类型
type DeviceInfo {
  deviceType  String   // mobile, tablet, desktop
  os          String?
  osVersion   String?
  browser     String?
  browserVersion String?
  deviceId    String?
}

// ============ 通知消息 ============
model Notification {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    Int
  type      String   // order, system, promotion, social
  title     String
  content   String
  data      Json?    // 附加数据
  actions   NotificationAction[]  // 嵌入式数组
  isRead    Boolean  @default(false)
  readAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([type])
  @@index([isRead])
  @@index([createdAt])
  @@map("notifications")
}

type NotificationAction {
  label String
  url   String
  type  String  // primary, secondary, danger
}

// ============ 聊天消息 ============
model ChatMessage {
  id           String        @id @default(auto()) @map("_id") @db.ObjectId
  conversationId String      @db.ObjectId
  senderId     Int
  content      String
  messageType  String        @default("text") // text, image, file, system
  attachments  Attachment[]  // 嵌入式数组
  readBy       ReadReceipt[] // 已读回执
  isDeleted    Boolean       @default(false)
  deletedAt    DateTime?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([conversationId])
  @@index([senderId])
  @@index([createdAt])
  @@map("chat_messages")
}

type Attachment {
  name     String
  url      String
  type     String   // image, video, document
  size     Int      // 字节
  mimeType String?
}

type ReadReceipt {
  userId  Int
  readAt  DateTime
}

// ============ 评论（嵌套结构示例）============
model Comment {
  id        String    @id @default(auto()) @map("_id") @db.ObjectId
  postId    String    // 文章 ID（可以是 MySQL 的 ID）
  authorId  Int
  content   String
  likes     Int       @default(0)
  likedBy   Int[]     // 点赞用户 ID 数组
  replies   Reply[]   // 嵌入式回复
  isDeleted Boolean   @default(false)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([postId])
  @@index([authorId])
  @@map("comments")
}

type Reply {
  id        String
  authorId  Int
  content   String
  createdAt DateTime
}

// ============ 搜索历史 ============
model SearchHistory {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      Int?
  sessionId   String?
  keyword     String
  category    String?
  filters     Json?
  resultCount Int?
  timestamp   DateTime @default(now())

  @@index([userId])
  @@index([keyword])
  @@index([timestamp])
  @@map("search_histories")
}

// ============ 分析数据 ============
model PageView {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  path      String
  userId    Int?
  sessionId String
  referrer  String?
  ip        String?
  userAgent String?
  duration  Int?     // 停留时间（秒）
  metadata  Json?
  timestamp DateTime @default(now())

  @@index([path])
  @@index([userId])
  @@index([sessionId])
  @@index([timestamp])
  @@map("page_views")
}
```

## 数据库同步

MongoDB 不支持 `prisma migrate`，使用 `db push`：

```bash
# 同步 Schema 到 MongoDB
npx prisma db push

# 生成 Prisma Client
npx prisma generate
```

## 嵌入式文档操作

### 创建带嵌入式文档的记录

```typescript
// 创建带设备信息的会话
const session = await prisma.userSession.create({
  data: {
    userId: 1,
    token: 'jwt-token-xxx',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    deviceInfo: {
      deviceType: 'mobile',
      os: 'iOS',
      osVersion: '17.0',
      browser: 'Safari',
      browserVersion: '17.0',
    },
  },
});

// 创建带操作按钮的通知
const notification = await prisma.notification.create({
  data: {
    userId: 1,
    type: 'order',
    title: '订单已发货',
    content: '您的订单 ORD123 已发货，请注意查收。',
    actions: [
      { label: '查看详情', url: '/orders/123', type: 'primary' },
      { label: '联系客服', url: '/support', type: 'secondary' },
    ],
  },
});
```

### 查询嵌入式文档

```typescript
// 查询特定设备类型的会话
const mobileSessions = await prisma.userSession.findMany({
  where: {
    deviceInfo: {
      is: {
        deviceType: 'mobile',
      },
    },
  },
});

// 查询包含特定操作的通知
const notifications = await prisma.notification.findMany({
  where: {
    actions: {
      some: {
        type: 'primary',
      },
    },
  },
});
```

### 更新嵌入式文档

```typescript
// 更新设备信息
await prisma.userSession.update({
  where: { id: sessionId },
  data: {
    deviceInfo: {
      deviceType: 'tablet',
      os: 'iPadOS',
      osVersion: '17.0',
      browser: 'Safari',
      browserVersion: '17.0',
    },
  },
});
```

## 数组字段操作

### 创建带数组的记录

```typescript
// 创建评论（带点赞用户数组）
const comment = await prisma.comment.create({
  data: {
    postId: 'post-123',
    authorId: 1,
    content: '这是一条评论',
    likedBy: [1, 2, 3],  // 点赞用户 ID
    replies: [
      {
        id: 'reply-1',
        authorId: 2,
        content: '回复内容',
        createdAt: new Date(),
      },
    ],
  },
});
```

### 数组操作

```typescript
// 添加元素到数组
await prisma.comment.update({
  where: { id: commentId },
  data: {
    likedBy: {
      push: 4,  // 添加用户 ID 4
    },
  },
});

// 设置数组
await prisma.comment.update({
  where: { id: commentId },
  data: {
    likedBy: {
      set: [1, 2, 3, 4, 5],
    },
  },
});
```

### 数组查询

```typescript
// 查询包含特定元素的记录
const comments = await prisma.comment.findMany({
  where: {
    likedBy: {
      has: 1,  // 包含用户 ID 1
    },
  },
});

// 查询包含任意一个元素
const comments = await prisma.comment.findMany({
  where: {
    likedBy: {
      hasSome: [1, 2, 3],  // 包含 1, 2, 3 中的任意一个
    },
  },
});

// 查询包含所有元素
const comments = await prisma.comment.findMany({
  where: {
    likedBy: {
      hasEvery: [1, 2],  // 同时包含 1 和 2
    },
  },
});

// 查询空数组
const comments = await prisma.comment.findMany({
  where: {
    likedBy: {
      isEmpty: true,
    },
  },
});
```

## ObjectId 处理

```typescript
import { ObjectId } from 'mongodb';

// 生成新的 ObjectId
const newId = new ObjectId().toString();

// 查询时使用字符串形式的 ObjectId
const log = await prisma.activityLog.findUnique({
  where: { id: '507f1f77bcf86cd799439011' },
});

// 验证 ObjectId 格式
function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}
```

## MongoDB 特有查询

### 文本搜索

```typescript
// 需要先创建文本索引
// db.collection.createIndex({ content: "text" })

const results = await prisma.$runCommandRaw({
  find: 'comments',
  filter: {
    $text: { $search: 'prisma mongodb' },
  },
});
```

### 聚合管道

```typescript
// 使用原始命令执行聚合
const stats = await prisma.$runCommandRaw({
  aggregate: 'activity_logs',
  pipeline: [
    { $match: { action: 'LOGIN' } },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ],
  cursor: {},
});

// 按日期分组统计
const dailyStats = await prisma.$runCommandRaw({
  aggregate: 'page_views',
  pipeline: [
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        count: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: 30 },
  ],
  cursor: {},
});
```

## 性能优化

### 索引策略

```prisma
model ActivityLog {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    Int
  action    String
  timestamp DateTime @default(now())

  // 单字段索引
  @@index([userId])
  @@index([timestamp])
  
  // 复合索引（查询时按索引顺序使用）
  @@index([userId, action, timestamp])
}
```

### 查询优化

```typescript
// 1. 使用投影减少数据传输
const logs = await prisma.activityLog.findMany({
  where: { userId: 1 },
  select: {
    id: true,
    action: true,
    timestamp: true,
  },
});

// 2. 使用游标分页（大数据集）
const logs = await prisma.activityLog.findMany({
  take: 20,
  skip: 1,
  cursor: { id: lastId },
  orderBy: { timestamp: 'desc' },
});

// 3. 限制返回数量
const logs = await prisma.activityLog.findMany({
  take: 100,
  orderBy: { timestamp: 'desc' },
});
```

## 下一步

[👉 05. 双数据库配置](./05-multi-database.md)
