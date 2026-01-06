# 11. NestJS 集成

本章介绍如何在 NestJS 中集成 Prisma。

## 安装依赖

```bash
npm install @nestjs/common @nestjs/core @prisma/client
npm install prisma -D
```

## Prisma 服务

### MySQL 服务

```typescript
// src/prisma/prisma-mysql.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/client-mysql';

@Injectable()
export class PrismaMysqlService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaMySQL');

  async onModuleInit() {
    await this.$connect();
    this.logger.log('MySQL connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
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

  async onModuleInit() {
    await this.$connect();
    this.logger.log('MongoDB connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
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

```typescript
// src/users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { PrismaMongoService } from '../prisma/prisma-mongo.service';

@Injectable()
export class UsersService {
  constructor(
    private mysql: PrismaMysqlService,
    private mongo: PrismaMongoService,
  ) {}

  async create(data: { email: string; name: string }, ip: string) {
    // MySQL: 创建用户
    const user = await this.mysql.user.create({
      data,
      select: { id: true, email: true, name: true },
    });

    // MongoDB: 记录日志
    await this.mongo.activityLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        resource: 'user',
        ip,
      },
    });

    return user;
  }

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.mysql.user.findMany({ skip, take: limit }),
      this.mysql.user.count(),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const user = await this.mysql.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
```

## 控制器

```typescript
// src/users/users.controller.ts
import { Controller, Get, Post, Body, Param, Query, Ip } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  create(@Body() data: { email: string; name: string }, @Ip() ip: string) {
    return this.usersService.create(data, ip);
  }

  @Get()
  findAll(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.usersService.findAll(+page, +limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }
}
```

## App 模块

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, UsersModule],
})
export class AppModule {}
```

## 启动应用

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 优雅关闭
  app.enableShutdownHooks();
  
  await app.listen(3000);
}
bootstrap();
```

## 目录结构

```
src/
├── prisma/
│   ├── prisma.module.ts
│   ├── prisma-mysql.service.ts
│   └── prisma-mongo.service.ts
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   └── users.service.ts
├── app.module.ts
└── main.ts
prisma/
├── mysql/
│   └── schema.prisma
└── mongo/
    └── schema.prisma
generated/
├── client-mysql/
└── client-mongo/
```

## 完成！

恭喜你完成了 Prisma 6 教程！你已经学会了：

- ✅ Prisma 安装和配置
- ✅ Schema 语法
- ✅ MySQL 和 MongoDB 配置
- ✅ 双数据库架构
- ✅ CRUD 操作
- ✅ 关系查询
- ✅ 事务处理
- ✅ 高级查询
- ✅ 性能优化
- ✅ NestJS 集成

