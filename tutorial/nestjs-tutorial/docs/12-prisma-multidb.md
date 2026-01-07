# 12. Prisma 6 双数据库配置 (MySQL + MongoDB)

本章介绍如何在一个 NestJS 项目中同时使用 MySQL 和 MongoDB，实现关系型数据和文档型数据的混合存储。

## 为什么需要双数据库？

| 数据类型 | 推荐数据库 | 原因 |
|----------|-----------|------|
| 用户、订单、产品 | MySQL | 强关系、事务支持、数据一致性 |
| 日志、活动记录 | MongoDB | 灵活 Schema、高写入性能、易扩展 |
| 配置、缓存 | MongoDB | 文档结构、快速读取 |
| 评论、消息 | MongoDB | 嵌套结构、快速插入 |

## 项目结构

```
project/
├── prisma/
│   ├── mysql/
│   │   └── schema.prisma    # MySQL Schema
│   └── mongo/
│       └── schema.prisma    # MongoDB Schema
├── generated/
│   ├── client-mysql/        # 生成的 MySQL Client
│   └── client-mongo/        # 生成的 MongoDB Client
├── src/
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   ├── prisma-mysql.service.ts
│   │   └── prisma-mongo.service.ts
│   └── ...
├── .env
└── package.json
```

## MySQL Schema 配置

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

// ============ 用户模块 ============
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique @db.VarChar(255)
  password  String   @db.VarChar(255)
  name      String   @db.VarChar(100)
  avatar    String?  @db.VarChar(500)
  role      UserRole @default(USER)
  isActive  Boolean  @default(true)
  orders    Order[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
  @@index([role])
  @@map("users")
}

enum UserRole {
  USER
  ADMIN
  MODERATOR
}

// ============ 产品模块 ============
model Product {
  id          Int         @id @default(autoincrement())
  name        String      @db.VarChar(200)
  description String?     @db.Text
  price       Decimal     @db.Decimal(10, 2)
  stock       Int         @default(0)
  categoryId  Int
  category    Category    @relation(fields: [categoryId], references: [id])
  orderItems  OrderItem[]
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([categoryId])
  @@index([price])
  @@map("products")
}

model Category {
  id        Int       @id @default(autoincrement())
  name      String    @unique @db.VarChar(100)
  parentId  Int?
  parent    Category? @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children  Category[] @relation("CategoryHierarchy")
  products  Product[]
  createdAt DateTime  @default(now())

  @@map("categories")
}

// ============ 订单模块 ============
model Order {
  id            Int         @id @default(autoincrement())
  orderNo       String      @unique @db.VarChar(50)
  userId        Int
  user          User        @relation(fields: [userId], references: [id])
  status        OrderStatus @default(PENDING)
  totalAmount   Decimal     @db.Decimal(10, 2)
  shippingAddress String?   @db.Text
  items         OrderItem[]
  paidAt        DateTime?
  shippedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([userId])
  @@index([status])
  @@index([orderNo])
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

## MongoDB Schema 配置

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

// ============ 活动日志 ============
model ActivityLog {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    Int      // 关联 MySQL 用户 ID
  action    String   // CREATE, READ, UPDATE, DELETE, LOGIN, LOGOUT
  resource  String   // user, order, product
  resourceId String? // 资源 ID
  oldData   Json?    // 修改前的数据
  newData   Json?    // 修改后的数据
  metadata  Json?    // 额外元数据
  ip        String?
  userAgent String?
  duration  Int?     // 操作耗时（毫秒）
  status    String   @default("success") // success, failure
  errorMessage String?
  timestamp DateTime @default(now())

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
  isPublic    Boolean  @default(false) // 是否可公开访问
  updatedBy   Int?     // 最后修改人
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
  deviceInfo   Json?    // 设备信息
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

// ============ 通知消息 ============
model Notification {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    Int
  type      String   // order, system, promotion
  title     String
  content   String
  data      Json?    // 附加数据
  isRead    Boolean  @default(false)
  readAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([type])
  @@index([isRead])
  @@index([createdAt])
  @@map("notifications")
}

// ============ 搜索历史 ============
model SearchHistory {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    Int?     // 可选，未登录用户为空
  sessionId String?  // 会话 ID
  keyword   String
  category  String?  // 搜索类别
  filters   Json?    // 搜索过滤条件
  resultCount Int?   // 搜索结果数量
  timestamp DateTime @default(now())

  @@index([userId])
  @@index([keyword])
  @@index([timestamp])
  @@map("search_histories")
}
```

## 环境变量配置

```env
# .env

# MySQL 数据库
DATABASE_URL_MYSQL="mysql://root:password@localhost:3306/myapp?connection_limit=10"

# MongoDB 数据库
DATABASE_URL_MONGO="mongodb://localhost:27017/myapp_logs?retryWrites=true&w=majority"

# 如果使用 MongoDB Atlas
# DATABASE_URL_MONGO="mongodb+srv://user:password@cluster.mongodb.net/myapp_logs?retryWrites=true&w=majority"
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
    
    "prisma:studio:mysql": "prisma studio --schema=prisma/mysql/schema.prisma",
    "prisma:studio:mongo": "prisma studio --schema=prisma/mongo/schema.prisma",
    
    "prisma:format": "prisma format --schema=prisma/mysql/schema.prisma && prisma format --schema=prisma/mongo/schema.prisma"
  }
}
```

## Prisma 服务实现

### MySQL 服务

```typescript
// src/prisma/prisma-mysql.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '../../generated/client-mysql';

@Injectable()
export class PrismaMysqlService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaMySQL');

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
      errorFormat: 'pretty',
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('MySQL database connected');

    // 开发环境记录查询日志
    if (process.env.NODE_ENV === 'development') {
      this.$on('query' as never, (e: Prisma.QueryEvent) => {
        if (e.duration > 100) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('MySQL database disconnected');
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('MySQL health check failed', error);
      return false;
    }
  }

  // 清理测试数据（仅测试环境）
  async cleanDatabase() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabase only allowed in test environment');
    }
    
    const tablenames = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;

    for (const { tablename } of tablenames) {
      if (tablename !== '_prisma_migrations') {
        await this.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`);
      }
    }
  }
}
```

### MongoDB 服务

```typescript
// src/prisma/prisma-mongo.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/client-mongo';

@Injectable()
export class PrismaMongoService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaMongo');

  constructor() {
    super({
      log: ['warn', 'error'],
      errorFormat: 'pretty',
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('MongoDB database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('MongoDB database disconnected');
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      await this.$runCommandRaw({ ping: 1 });
      return true;
    } catch (error) {
      this.logger.error('MongoDB health check failed', error);
      return false;
    }
  }
}
```

### Prisma 模块

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaMysqlService } from './prisma-mysql.service';
import { PrismaMongoService } from './prisma-mongo.service';

@Global()
@Module({
  providers: [PrismaMysqlService, PrismaMongoService],
  exports: [PrismaMysqlService, PrismaMongoService],
})
export class PrismaModule {}
```

## 业务服务示例

### 用户服务（MySQL + MongoDB 日志）

```typescript
// src/users/users.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { PrismaMongoService } from '../prisma/prisma-mongo.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    private mysql: PrismaMysqlService,
    private mongo: PrismaMongoService,
  ) {}

  async create(dto: CreateUserDto, requestInfo: { ip: string; userAgent: string }) {
    // 检查邮箱是否已存在
    const existing = await this.mysql.user.findUnique({
      where: { email: dto.email },
    });
    
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // 创建用户
    const user = await this.mysql.user.create({
      data: {
        ...dto,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    // 记录活动日志到 MongoDB
    await this.mongo.activityLog.create({
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

    return user;
  }

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.mysql.user.findMany({
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
      this.mysql.user.count(),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const user = await this.mysql.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        isActive: true,
        createdAt: true,
        orders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNo: true,
            status: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(
    id: number, 
    dto: UpdateUserDto, 
    operatorId: number,
    requestInfo: { ip: string; userAgent: string },
  ) {
    const oldUser = await this.findOne(id);

    const updatedUser = await this.mysql.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    // 记录修改日志
    await this.mongo.activityLog.create({
      data: {
        userId: operatorId,
        action: 'UPDATE',
        resource: 'user',
        resourceId: String(id),
        oldData: oldUser,
        newData: updatedUser,
        ip: requestInfo.ip,
        userAgent: requestInfo.userAgent,
      },
    });

    return updatedUser;
  }

  // 获取用户活动日志
  async getUserActivityLogs(userId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.mongo.activityLog.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      this.mongo.activityLog.count({ where: { userId } }),
    ]);

    return {
      data: logs,
      meta: { total, page, limit },
    };
  }
}
```

### 订单服务（事务示例）

```typescript
// src/orders/orders.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { PrismaMongoService } from '../prisma/prisma-mongo.service';
import { Prisma } from '../../generated/client-mysql';
import { CreateOrderDto } from './dto';

@Injectable()
export class OrdersService {
  constructor(
    private mysql: PrismaMysqlService,
    private mongo: PrismaMongoService,
  ) {}

  async create(
    userId: number, 
    dto: CreateOrderDto,
    requestInfo: { ip: string; userAgent: string },
  ) {
    // 使用事务确保数据一致性
    const order = await this.mysql.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. 验证并锁定产品库存
      const products = await Promise.all(
        dto.items.map(async (item) => {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product) {
            throw new BadRequestException(`Product ${item.productId} not found`);
          }

          if (product.stock < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for product ${product.name}`,
            );
          }

          return { ...product, quantity: item.quantity };
        }),
      );

      // 2. 计算总金额
      const totalAmount = products.reduce(
        (sum, p) => sum + Number(p.price) * p.quantity,
        0,
      );

      // 3. 生成订单号
      const orderNo = `ORD${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      // 4. 创建订单
      const order = await tx.order.create({
        data: {
          orderNo,
          userId,
          totalAmount,
          shippingAddress: dto.shippingAddress,
          items: {
            create: products.map((p) => ({
              productId: p.id,
              quantity: p.quantity,
              price: p.price,
            })),
          },
        },
        include: {
          items: {
            include: { product: true },
          },
        },
      });

      // 5. 扣减库存
      await Promise.all(
        products.map((p) =>
          tx.product.update({
            where: { id: p.id },
            data: { stock: { decrement: p.quantity } },
          }),
        ),
      );

      return order;
    });

    // 记录日志到 MongoDB（事务外）
    await this.mongo.activityLog.create({
      data: {
        userId,
        action: 'CREATE',
        resource: 'order',
        resourceId: String(order.id),
        newData: {
          orderNo: order.orderNo,
          totalAmount: order.totalAmount,
          itemCount: order.items.length,
        },
        ip: requestInfo.ip,
        userAgent: requestInfo.userAgent,
      },
    });

    // 创建通知
    await this.mongo.notification.create({
      data: {
        userId,
        type: 'order',
        title: '订单创建成功',
        content: `您的订单 ${order.orderNo} 已创建成功，请尽快完成支付。`,
        data: { orderId: order.id, orderNo: order.orderNo },
      },
    });

    return order;
  }
}
```

## Docker Compose 配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: myapp-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: myapp
    ports:
      - '3306:3306'
    volumes:
      - mysql_data:/var/lib/mysql
    command: --default-authentication-plugin=mysql_native_password

  mongodb:
    image: mongo:6.0
    container_name: myapp-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: password
    ports:
      - '27017:27017'
    volumes:
      - mongo_data:/data/db

  mongo-express:
    image: mongo-express
    container_name: myapp-mongo-express
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
  mysql_data:
  mongo_data:
```

## 初始化数据库

```bash
# 1. 启动数据库
docker-compose up -d

# 2. 生成 Prisma Client
npm run prisma:generate

# 3. 同步数据库结构
npm run prisma:push

# 4. 启动应用
npm run start:dev
```

## 下一步

[👉 13. 数据库事务与高级查询](./13-prisma-advanced.md)
