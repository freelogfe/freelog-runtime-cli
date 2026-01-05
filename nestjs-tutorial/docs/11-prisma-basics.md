# 11. Prisma 6 入门与配置

Prisma 是下一代 Node.js 和 TypeScript ORM，提供类型安全的数据库访问。

## 安装 Prisma

```bash
pnpm add -D prisma
pnpm add @prisma/client
npx prisma init
```

## Schema 基础

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?  @db.Text
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  Int
  createdAt DateTime @default(now())

  @@index([authorId])
  @@map("posts")
}
```

## 常用命令

```bash
# 生成 Prisma Client
npx prisma generate

# 推送 Schema 到数据库 (开发)
npx prisma db push

# 创建迁移 (生产)
npx prisma migrate dev --name init

# 应用迁移
npx prisma migrate deploy

# 打开数据库浏览器
npx prisma studio
```

## NestJS 集成

```typescript
// prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

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

## CRUD 操作

```typescript
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // 创建
  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  // 查询所有
  findAll() {
    return this.prisma.user.findMany({
      include: { posts: true },
    });
  }

  // 查询单个
  findOne(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { posts: true },
    });
  }

  // 更新
  update(id: number, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  // 删除
  remove(id: number) {
    return this.prisma.user.delete({ where: { id } });
  }
}
```

## 下一步

[👉 12. Prisma 双数据库配置](./12-prisma-multidb.md)

