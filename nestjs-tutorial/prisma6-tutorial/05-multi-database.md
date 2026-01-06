# 05. 双数据库配置 (MySQL + MongoDB)

本章介绍如何在一个项目中同时使用 MySQL 和 MongoDB。

## 项目结构

```
project/
├── prisma/
│   ├── mysql/
│   │   └── schema.prisma      # MySQL Schema
│   └── mongo/
│       └── schema.prisma      # MongoDB Schema
├── generated/
│   ├── client-mysql/          # MySQL Prisma Client
│   └── client-mongo/          # MongoDB Prisma Client
├── src/
│   ├── prisma/
│   │   ├── prisma-mysql.ts    # MySQL 服务
│   │   └── prisma-mongo.ts    # MongoDB 服务
│   └── index.ts
├── .env
└── package.json
```

## Schema 配置

### MySQL Schema

```prisma
// prisma/mysql/schema.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../generated/client-mysql"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL_MYSQL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique @db.VarChar(255)
  password  String   @db.VarChar(255)
  name      String   @db.VarChar(100)
  role      Role     @default(USER)
  isActive  Boolean  @default(true)
  orders    Order[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
  @@map("users")
}

model Product {
  id          Int         @id @default(autoincrement())
  name        String      @db.VarChar(200)
  description String?     @db.Text
  price       Decimal     @db.Decimal(10, 2)
  stock       Int         @default(0)
  orderItems  OrderItem[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@map("products")
}

model Order {
  id          Int         @id @default(autoincrement())
  orderNo     String      @unique @db.VarChar(50)
  userId      Int
  user        User        @relation(fields: [userId], references: [id])
  status      OrderStatus @default(PENDING)
  totalAmount Decimal     @db.Decimal(10, 2)
  items       OrderItem[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([userId])
  @@map("orders")
}

model OrderItem {
  id        Int     @id @default(autoincrement())
  orderId   Int
  order     Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId Int
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  price     Decimal @db.Decimal(10, 2)

  @@map("order_items")
}

enum Role {
  USER
  ADMIN
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  COMPLETED
  CANCELLED
}
```

### MongoDB Schema

```prisma
// prisma/mongo/schema.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../generated/client-mongo"
}

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL_MONGO")
}

model ActivityLog {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    Int
  action    String
  resource  String
  resourceId String?
  oldData   Json?
  newData   Json?
  ip        String?
  userAgent String?
  timestamp DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([timestamp])
  @@map("activity_logs")
}

model SystemConfig {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  key         String   @unique
  value       Json
  description String?
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())

  @@map("system_configs")
}

model Notification {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    Int
  type      String
  title     String
  content   String
  data      Json?
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([isRead])
  @@map("notifications")
}

model UserSession {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  userId       Int
  token        String   @unique
  deviceInfo   Json?
  expiresAt    DateTime
  lastActiveAt DateTime @default(now())
  createdAt    DateTime @default(now())

  @@index([userId])
  @@index([token])
  @@map("user_sessions")
}
```

## 环境变量

```env
# .env
DATABASE_URL_MYSQL="mysql://root:password@localhost:3306/myapp"
DATABASE_URL_MONGO="mongodb://localhost:27017/myapp_logs"
```

## Package.json 脚本

```json
{
  "scripts": {
    "prisma:generate:mysql": "prisma generate --schema=prisma/mysql/schema.prisma",
    "prisma:generate:mongo": "prisma generate --schema=prisma/mongo/schema.prisma",
    "prisma:generate": "npm run prisma:generate:mysql && npm run prisma:generate:mongo",
    
    "prisma:push:mysql": "prisma db push --schema=prisma/mysql/schema.prisma",
    "prisma:push:mongo": "prisma db push --schema=prisma/mongo/schema.prisma",
    "prisma:push": "npm run prisma:push:mysql && npm run prisma:push:mongo",
    
    "prisma:migrate:mysql": "prisma migrate dev --schema=prisma/mysql/schema.prisma",
    "prisma:migrate:deploy": "prisma migrate deploy --schema=prisma/mysql/schema.prisma",
    
    "prisma:studio:mysql": "prisma studio --schema=prisma/mysql/schema.prisma --port 5555",
    "prisma:studio:mongo": "prisma studio --schema=prisma/mongo/schema.prisma --port 5556"
  }
}
```

## Prisma Client 封装

### MySQL Client

```typescript
// src/prisma/prisma-mysql.ts
import { PrismaClient } from '../../generated/client-mysql';

class PrismaMysql extends PrismaClient {
  private static instance: PrismaMysql;

  private constructor() {
    super({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
  }

  static getInstance(): PrismaMysql {
    if (!PrismaMysql.instance) {
      PrismaMysql.instance = new PrismaMysql();
    }
    return PrismaMysql.instance;
  }

  async connect() {
    await this.$connect();
    console.log('MySQL connected');
  }

  async disconnect() {
    await this.$disconnect();
    console.log('MySQL disconnected');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

export const mysqlClient = PrismaMysql.getInstance();
```

### MongoDB Client

```typescript
// src/prisma/prisma-mongo.ts
import { PrismaClient } from '../../generated/client-mongo';

class PrismaMongo extends PrismaClient {
  private static instance: PrismaMongo;

  private constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
  }

  static getInstance(): PrismaMongo {
    if (!PrismaMongo.instance) {
      PrismaMongo.instance = new PrismaMongo();
    }
    return PrismaMongo.instance;
  }

  async connect() {
    await this.$connect();
    console.log('MongoDB connected');
  }

  async disconnect() {
    await this.$disconnect();
    console.log('MongoDB disconnected');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.$runCommandRaw({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }
}

export const mongoClient = PrismaMongo.getInstance();
```

### 统一导出

```typescript
// src/prisma/index.ts
export { mysqlClient } from './prisma-mysql';
export { mongoClient } from './prisma-mongo';

// 初始化函数
export async function initDatabases() {
  const { mysqlClient, mongoClient } = await import('./index');
  await Promise.all([
    mysqlClient.connect(),
    mongoClient.connect(),
  ]);
}

// 关闭函数
export async function closeDatabases() {
  const { mysqlClient, mongoClient } = await import('./index');
  await Promise.all([
    mysqlClient.disconnect(),
    mongoClient.disconnect(),
  ]);
}
```

## 业务使用示例

### 用户服务

```typescript
// src/services/user.service.ts
import { mysqlClient, mongoClient } from '../prisma';
import { Prisma } from '../../generated/client-mysql';

interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

interface RequestInfo {
  ip: string;
  userAgent: string;
}

export class UserService {
  // 创建用户（MySQL）+ 记录日志（MongoDB）
  async createUser(dto: CreateUserDto, requestInfo: RequestInfo) {
    // 1. 在 MySQL 创建用户
    const user = await mysqlClient.user.create({
      data: {
        email: dto.email,
        password: dto.password, // 实际应该加密
        name: dto.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    // 2. 在 MongoDB 记录活动日志
    await mongoClient.activityLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        resource: 'user',
        resourceId: String(user.id),
        newData: { email: user.email, name: user.name },
        ip: requestInfo.ip,
        userAgent: requestInfo.userAgent,
      },
    });

    // 3. 创建欢迎通知
    await mongoClient.notification.create({
      data: {
        userId: user.id,
        type: 'system',
        title: '欢迎加入',
        content: `你好 ${user.name}，欢迎加入我们的平台！`,
      },
    });

    return user;
  }

  // 查询用户列表
  async findUsers(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      mysqlClient.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      mysqlClient.user.count(),
    ]);

    return { users, total, page, limit };
  }

  // 获取用户活动日志
  async getUserLogs(userId: number, limit = 50) {
    return mongoClient.activityLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  // 获取用户未读通知
  async getUnreadNotifications(userId: number) {
    return mongoClient.notification.findMany({
      where: {
        userId,
        isRead: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```

### 订单服务

```typescript
// src/services/order.service.ts
import { mysqlClient, mongoClient } from '../prisma';
import { Prisma } from '../../generated/client-mysql';

interface OrderItemDto {
  productId: number;
  quantity: number;
}

interface CreateOrderDto {
  items: OrderItemDto[];
}

export class OrderService {
  async createOrder(userId: number, dto: CreateOrderDto, requestInfo: { ip: string; userAgent: string }) {
    // 使用 MySQL 事务
    const order = await mysqlClient.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. 获取产品信息并验证库存
      const products = await tx.product.findMany({
        where: { id: { in: dto.items.map(i => i.productId) } },
      });

      // 验证库存
      for (const item of dto.items) {
        const product = products.find(p => p.id === item.productId);
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }
      }

      // 2. 计算总金额
      const totalAmount = dto.items.reduce((sum, item) => {
        const product = products.find(p => p.id === item.productId)!;
        return sum + Number(product.price) * item.quantity;
      }, 0);

      // 3. 创建订单
      const order = await tx.order.create({
        data: {
          orderNo: `ORD${Date.now()}`,
          userId,
          totalAmount,
          items: {
            create: dto.items.map(item => {
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

      // 4. 扣减库存
      for (const item of dto.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return order;
    });

    // 记录日志（MongoDB，事务外）
    await mongoClient.activityLog.create({
      data: {
        userId,
        action: 'CREATE',
        resource: 'order',
        resourceId: String(order.id),
        newData: {
          orderNo: order.orderNo,
          totalAmount: Number(order.totalAmount),
          itemCount: order.items.length,
        },
        ip: requestInfo.ip,
        userAgent: requestInfo.userAgent,
      },
    });

    // 发送通知
    await mongoClient.notification.create({
      data: {
        userId,
        type: 'order',
        title: '订单创建成功',
        content: `您的订单 ${order.orderNo} 已创建，请尽快支付。`,
        data: { orderId: order.id, orderNo: order.orderNo },
      },
    });

    return order;
  }

  // 获取订单统计
  async getOrderStats() {
    const [mysqlStats, recentLogs] = await Promise.all([
      // MySQL 聚合
      mysqlClient.order.groupBy({
        by: ['status'],
        _count: true,
        _sum: { totalAmount: true },
      }),
      // MongoDB 最近日志
      mongoClient.activityLog.findMany({
        where: { resource: 'order' },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
    ]);

    return { stats: mysqlStats, recentLogs };
  }
}
```

## 健康检查

```typescript
// src/health.ts
import { mysqlClient, mongoClient } from './prisma';

export async function checkHealth() {
  const [mysqlOk, mongoOk] = await Promise.all([
    mysqlClient.healthCheck(),
    mongoClient.healthCheck(),
  ]);

  return {
    status: mysqlOk && mongoOk ? 'healthy' : 'unhealthy',
    databases: {
      mysql: mysqlOk ? 'connected' : 'disconnected',
      mongodb: mongoOk ? 'connected' : 'disconnected',
    },
    timestamp: new Date().toISOString(),
  };
}
```

## 主程序入口

```typescript
// src/index.ts
import { initDatabases, closeDatabases } from './prisma';
import { UserService } from './services/user.service';
import { OrderService } from './services/order.service';
import { checkHealth } from './health';

async function main() {
  // 初始化数据库连接
  await initDatabases();

  // 健康检查
  const health = await checkHealth();
  console.log('Health:', health);

  // 使用服务
  const userService = new UserService();
  const orderService = new OrderService();

  // 示例：创建用户
  const user = await userService.createUser(
    { email: 'test@example.com', password: 'password123', name: 'Test User' },
    { ip: '127.0.0.1', userAgent: 'Test Client' }
  );
  console.log('Created user:', user);

  // 示例：获取用户日志
  const logs = await userService.getUserLogs(user.id);
  console.log('User logs:', logs);
}

main()
  .catch(console.error)
  .finally(() => closeDatabases());
```

## Docker Compose 完整配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: app-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: myapp
    ports:
      - '3306:3306'
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  mongodb:
    image: mongo:6.0
    container_name: app-mongodb
    restart: unless-stopped
    ports:
      - '27017:27017'
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mysql_data:
  mongo_data:
```

## 初始化步骤

```bash
# 1. 启动数据库
docker-compose up -d

# 2. 等待数据库就绪
sleep 10

# 3. 生成 Prisma Client
npm run prisma:generate

# 4. 同步数据库结构
npm run prisma:push

# 5. 运行应用
npx ts-node src/index.ts
```

## 下一步

[👉 06. CRUD 操作完全指南](./06-crud.md)
