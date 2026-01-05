# 12. Prisma 双数据库配置 (MySQL + MongoDB)

本章是核心章节，介绍如何在一个项目中同时使用 MySQL 和 MongoDB。

## 目录结构

```
prisma/
├── mysql/
│   └── schema.prisma    # MySQL Schema
└── mongo/
    └── schema.prisma    # MongoDB Schema
```

## MySQL Schema

```prisma
// prisma/mysql/schema.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../node_modules/@prisma/client-mysql"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL_MYSQL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  orders    Order[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}

model Order {
  id        Int         @id @default(autoincrement())
  userId    Int
  user      User        @relation(fields: [userId], references: [id])
  total     Decimal     @db.Decimal(10, 2)
  status    OrderStatus @default(PENDING)
  items     OrderItem[]
  createdAt DateTime    @default(now())

  @@index([userId])
  @@map("orders")
}

model OrderItem {
  id        Int   @id @default(autoincrement())
  orderId   Int
  order     Order @relation(fields: [orderId], references: [id])
  productId Int
  quantity  Int
  price     Decimal @db.Decimal(10, 2)

  @@map("order_items")
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  COMPLETED
  CANCELLED
}
```

## MongoDB Schema

```prisma
// prisma/mongo/schema.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../node_modules/@prisma/client-mongo"
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
  metadata  Json?
  ip        String?
  userAgent String?
  timestamp DateTime @default(now())

  @@index([userId])
  @@index([timestamp])
  @@map("activity_logs")
}

model SystemConfig {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  key       String   @unique
  value     Json
  updatedAt DateTime @updatedAt

  @@map("system_configs")
}
```

## 环境变量

```env
DATABASE_URL_MYSQL="mysql://root:password@localhost:3306/myapp"
DATABASE_URL_MONGO="mongodb://localhost:27017/myapp_logs"
```

## package.json 脚本

```json
{
  "scripts": {
    "prisma:generate:mysql": "prisma generate --schema=prisma/mysql/schema.prisma",
    "prisma:generate:mongo": "prisma generate --schema=prisma/mongo/schema.prisma",
    "prisma:generate": "npm run prisma:generate:mysql && npm run prisma:generate:mongo",
    "prisma:push:mysql": "prisma db push --schema=prisma/mysql/schema.prisma",
    "prisma:push:mongo": "prisma db push --schema=prisma/mongo/schema.prisma",
    "prisma:push": "npm run prisma:push:mysql && npm run prisma:push:mongo"
  }
}
```

## Prisma Services

```typescript
// prisma/prisma-mysql.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client-mysql';

@Injectable()
export class PrismaMysqlService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

// prisma/prisma-mongo.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client-mongo';

@Injectable()
export class PrismaMongoService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

// prisma/prisma.module.ts
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

## 业务使用示例

```typescript
@Injectable()
export class UsersService {
  constructor(
    private mysql: PrismaMysqlService,
    private mongo: PrismaMongoService,
  ) {}

  async create(dto: CreateUserDto, requestInfo: { ip: string; userAgent: string }) {
    // 1. MySQL: 创建用户
    const user = await this.mysql.user.create({
      data: { email: dto.email, name: dto.name },
    });

    // 2. MongoDB: 记录日志
    await this.mongo.activityLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        resource: 'user',
        metadata: { email: dto.email },
        ip: requestInfo.ip,
        userAgent: requestInfo.userAgent,
      },
    });

    return user;
  }
}
```

## 下一步

[👉 13. 数据库事务与高级查询](./13-prisma-advanced.md)

