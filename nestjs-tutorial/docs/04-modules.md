# 04. 模块 Module 系统

模块是 NestJS 组织应用程序的基本单位。每个应用至少有一个根模块 (AppModule)。

## 模块基础

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],      // 导入其他模块
  controllers: [], // 该模块的控制器
  providers: [],   // 该模块的服务提供者
  exports: [],     // 导出给其他模块使用的提供者
})
export class UsersModule {}
```

## 模块结构图

```
AppModule (根模块)
├── UsersModule
│   ├── UsersController
│   ├── UsersService
│   └── UsersRepository
├── ProductsModule
│   ├── ProductsController
│   └── ProductsService
├── OrdersModule
│   ├── OrdersController
│   ├── OrdersService
│   └── imports: [UsersModule, ProductsModule]
└── SharedModule (共享模块)
    ├── LoggerService
    ├── ConfigService
    └── exports: [LoggerService, ConfigService]
```

## 功能模块

```typescript
// users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // 导出服务供其他模块使用
})
export class UsersModule {}

// orders/orders.module.ts
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule], // 导入 UsersModule 以使用 UsersService
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

// orders/orders.service.ts
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class OrdersService {
  constructor(private usersService: UsersService) {} // 可以注入 UsersService

  async createOrder(userId: number, items: any[]) {
    const user = await this.usersService.findOne(userId);
    // 创建订单逻辑...
  }
}
```

## 共享模块

```typescript
// shared/shared.module.ts
import { Module } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';
import { UtilsService } from './utils.service';

@Module({
  providers: [LoggerService, ConfigService, UtilsService],
  exports: [LoggerService, ConfigService, UtilsService], // 导出所有共享服务
})
export class SharedModule {}

// 任何导入 SharedModule 的模块都可以使用这些服务
@Module({
  imports: [SharedModule],
  // ...
})
export class SomeModule {}
```

## 全局模块

```typescript
import { Module, Global } from '@nestjs/common';

@Global() // 标记为全局模块
@Module({
  providers: [DatabaseService, CacheService],
  exports: [DatabaseService, CacheService],
})
export class CoreModule {}

// 只需在 AppModule 中导入一次
@Module({
  imports: [CoreModule],
})
export class AppModule {}

// 其他模块无需导入即可使用
@Module({
  // 不需要 imports: [CoreModule]
})
export class UsersModule {
  constructor(private databaseService: DatabaseService) {} // 可以直接注入
}
```

## 动态模块

```typescript
// database/database.module.ts
import { Module, DynamicModule } from '@nestjs/common';

interface DatabaseOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true, // 可选：设为全局
      providers: [
        {
          provide: 'DATABASE_OPTIONS',
          useValue: options,
        },
        {
          provide: 'DATABASE_CONNECTION',
          useFactory: async (opts: DatabaseOptions) => {
            return await createConnection(opts);
          },
          inject: ['DATABASE_OPTIONS'],
        },
      ],
      exports: ['DATABASE_CONNECTION'],
    };
  }

  // 异步配置
  static forRootAsync(options: {
    useFactory: (...args: any[]) => Promise<DatabaseOptions> | DatabaseOptions;
    inject?: any[];
    imports?: any[];
  }): DynamicModule {
    return {
      module: DatabaseModule,
      imports: options.imports || [],
      providers: [
        {
          provide: 'DATABASE_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        {
          provide: 'DATABASE_CONNECTION',
          useFactory: async (opts: DatabaseOptions) => {
            return await createConnection(opts);
          },
          inject: ['DATABASE_OPTIONS'],
        },
      ],
      exports: ['DATABASE_CONNECTION'],
    };
  }
}

// 使用
@Module({
  imports: [
    DatabaseModule.forRoot({
      host: 'localhost',
      port: 5432,
      username: 'admin',
      password: 'secret',
      database: 'myapp',
    }),
  ],
})
export class AppModule {}

// 异步使用 (配合 ConfigModule)
@Module({
  imports: [
    ConfigModule,
    DatabaseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USER'),
        password: configService.get('DB_PASS'),
        database: configService.get('DB_NAME'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

## 模块重导出

```typescript
@Module({
  imports: [CommonModule],
  exports: [CommonModule], // 重新导出，使导入此模块的模块也能访问 CommonModule
})
export class CoreModule {}
```

## 模块生命周期钩子

```typescript
import { Module, OnModuleInit, OnModuleDestroy, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

@Module({})
export class AppModule implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap, OnApplicationShutdown {
  
  // 模块初始化时调用
  onModuleInit() {
    console.log('Module initialized');
  }

  // 应用完全启动后调用
  onApplicationBootstrap() {
    console.log('Application bootstrapped');
  }

  // 模块销毁前调用
  onModuleDestroy() {
    console.log('Module destroying');
  }

  // 应用关闭时调用 (需要启用 shutdown hooks)
  onApplicationShutdown(signal?: string) {
    console.log(`Application shutting down: ${signal}`);
  }
}

// main.ts 中启用 shutdown hooks
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // 启用关闭钩子
  await app.listen(3000);
}
```

## 懒加载模块

```typescript
// 用于大型应用，按需加载模块
import { Injectable } from '@nestjs/common';
import { LazyModuleLoader } from '@nestjs/core';

@Injectable()
export class AppService {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  async loadReportModule() {
    const { ReportModule } = await import('./report/report.module');
    const moduleRef = await this.lazyModuleLoader.load(() => ReportModule);
    const reportService = moduleRef.get(ReportService);
    return reportService.generateReport();
  }
}
```

## 完整项目模块结构示例

```
src/
├── app.module.ts           # 根模块
├── main.ts
├── common/                 # 共享模块
│   ├── common.module.ts
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── pipes/
├── config/                 # 配置模块
│   ├── config.module.ts
│   └── config.service.ts
├── database/               # 数据库模块
│   ├── database.module.ts
│   └── database.providers.ts
├── auth/                   # 认证模块
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   └── guards/
├── users/                  # 用户模块
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── dto/
│   └── entities/
└── products/               # 产品模块
    ├── products.module.ts
    ├── products.controller.ts
    ├── products.service.ts
    ├── dto/
    └── entities/
```

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    ConfigModule.forRoot(), // 全局配置
    DatabaseModule,         // 数据库连接
    CommonModule,           // 共享工具
    AuthModule,             // 认证
    UsersModule,            // 用户功能
    ProductsModule,         // 产品功能
  ],
})
export class AppModule {}
```

## 下一步

[👉 05. 中间件 Middleware](./05-middleware.md)

