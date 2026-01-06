# 04. 模块 Module 系统

模块是 NestJS 组织应用程序的基本单位。每个应用至少有一个根模块 (AppModule)，模块是组织相关功能的有效方式。

## 什么是模块？

模块是用 `@Module()` 装饰器注解的类。`@Module()` 装饰器提供了元数据，NestJS 用它来组织应用程序结构。

```
┌─────────────────────────────────────────────────────────────┐
│                      AppModule (根模块)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ UsersModule │  │OrdersModule │  │    SharedModule     │ │
│  │             │  │             │  │  (LoggerService)    │ │
│  │ Controller  │  │ Controller  │  │  (ConfigService)    │ │
│  │ Service     │  │ Service     │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 模块基础

### @Module() 装饰器

```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [],           // 导入其他模块
  controllers: [UsersController], // 该模块的控制器
  providers: [UsersService],      // 该模块的服务提供者
  exports: [UsersService],        // 导出给其他模块使用的提供者
})
export class UsersModule {}
```

### @Module() 属性详解

| 属性 | 说明 | 类型 |
|------|------|------|
| `imports` | 导入的模块列表，这些模块导出的 Provider 可在本模块使用 | `Type[]` |
| `controllers` | 本模块定义的控制器，会被实例化 | `Type[]` |
| `providers` | 本模块的 Provider，可在本模块内共享 | `Provider[]` |
| `exports` | 本模块导出的 Provider 子集，供其他模块使用 | `(Type \| string \| symbol)[]` |

## 模块的封装性

默认情况下，模块是**封装**的：

```typescript
// users.module.ts
@Module({
  providers: [UsersService, UsersRepository],
  exports: [UsersService], // 只导出 UsersService
})
export class UsersModule {}

// orders.module.ts
@Module({
  imports: [UsersModule],
  providers: [OrdersService],
})
export class OrdersModule {}

// orders.service.ts
@Injectable()
export class OrdersService {
  constructor(
    private usersService: UsersService,    // ✅ 可以注入，已导出
    // private usersRepository: UsersRepository, // ❌ 不能注入，未导出
  ) {}
}
```

## 功能模块

功能模块是组织特定功能相关代码的模块：

```typescript
// users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService], // 导出供其他模块使用
})
export class UsersModule {}
```

### 模块间的依赖

```typescript
// orders/orders.module.ts
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { UsersModule } from '../users/users.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [UsersModule, ProductsModule], // 导入依赖的模块
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

// orders/orders.service.ts
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class OrdersService {
  constructor(
    private usersService: UsersService,     // 来自 UsersModule
    private productsService: ProductsService, // 来自 ProductsModule
  ) {}

  async createOrder(userId: number, productIds: number[]) {
    // 验证用户
    const user = await this.usersService.findOne(userId);
    
    // 获取产品信息
    const products = await Promise.all(
      productIds.map(id => this.productsService.findOne(id))
    );
    
    // 创建订单逻辑...
    return { user, products };
  }
}
```

## 共享模块

共享模块包含多个模块都需要的通用功能：

```typescript
// shared/shared.module.ts
import { Module } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';
import { UtilsService } from './utils.service';
import { HttpModule } from './http/http.module';

@Module({
  imports: [HttpModule],
  providers: [LoggerService, ConfigService, UtilsService],
  exports: [
    LoggerService, 
    ConfigService, 
    UtilsService,
    HttpModule, // 重新导出 HttpModule
  ],
})
export class SharedModule {}

// 使用共享模块
@Module({
  imports: [SharedModule],
  // 现在可以使用 LoggerService, ConfigService, UtilsService
})
export class UsersModule {}

@Module({
  imports: [SharedModule],
  // 同样可以使用这些服务
})
export class OrdersModule {}
```

## 全局模块

使用 `@Global()` 装饰器创建全局模块，只需导入一次：

```typescript
// core/core.module.ts
import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { CacheService } from './cache.service';
import { LoggerService } from './logger.service';

@Global() // 标记为全局模块
@Module({
  providers: [DatabaseService, CacheService, LoggerService],
  exports: [DatabaseService, CacheService, LoggerService],
})
export class CoreModule {}

// app.module.ts - 只需在根模块导入一次
@Module({
  imports: [CoreModule, UsersModule, OrdersModule],
})
export class AppModule {}

// users.module.ts - 不需要导入 CoreModule
@Module({
  // imports: [CoreModule], // 不需要！
  providers: [UsersService],
})
export class UsersModule {}

// users.service.ts - 可以直接注入全局模块的服务
@Injectable()
export class UsersService {
  constructor(
    private databaseService: DatabaseService, // ✅ 可以直接注入
    private loggerService: LoggerService,     // ✅ 可以直接注入
  ) {}
}
```

### 全局模块注意事项

⚠️ **谨慎使用全局模块**：
- 全局模块会增加代码的隐式依赖
- 使代码更难测试和理解
- 只用于真正需要全局共享的服务（如日志、配置、数据库）

## 动态模块

动态模块允许在导入时传入配置，创建可定制的模块：

### 基本动态模块

```typescript
// database/database.module.ts
import { Module, DynamicModule } from '@nestjs/common';
import { DatabaseService } from './database.service';

interface DatabaseOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

@Module({})
export class DatabaseModule {
  /**
   * 同步配置
   */
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true, // 可选：设为全局模块
      providers: [
        {
          provide: 'DATABASE_OPTIONS',
          useValue: options,
        },
        {
          provide: DatabaseService,
          useFactory: (opts: DatabaseOptions) => {
            return new DatabaseService(opts);
          },
          inject: ['DATABASE_OPTIONS'],
        },
      ],
      exports: [DatabaseService],
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
```

### 异步动态模块

```typescript
// database/database.module.ts
import { Module, DynamicModule } from '@nestjs/common';

interface DatabaseAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<DatabaseOptions> | DatabaseOptions;
  inject?: any[];
}

@Module({})
export class DatabaseModule {
  /**
   * 同步配置
   */
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        { provide: 'DATABASE_OPTIONS', useValue: options },
        DatabaseService,
      ],
      exports: [DatabaseService],
    };
  }

  /**
   * 异步配置 - 可以依赖其他模块
   */
  static forRootAsync(options: DatabaseAsyncOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      imports: options.imports || [],
      providers: [
        {
          provide: 'DATABASE_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        DatabaseService,
      ],
      exports: [DatabaseService],
    };
  }
}

// 使用异步配置
@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        host: configService.get('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
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

### 更完整的动态模块示例

```typescript
// cache/cache.module.ts
import { Module, DynamicModule, Provider } from '@nestjs/common';
import { CacheService } from './cache.service';
import { MemoryCacheService } from './memory-cache.service';
import { RedisCacheService } from './redis-cache.service';

export interface CacheModuleOptions {
  type: 'memory' | 'redis';
  ttl?: number;
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
}

export interface CacheModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<CacheModuleOptions> | CacheModuleOptions;
  inject?: any[];
}

export const CACHE_OPTIONS = 'CACHE_OPTIONS';

@Module({})
export class CacheModule {
  static forRoot(options: CacheModuleOptions): DynamicModule {
    const cacheProvider = this.createCacheProvider(options);
    
    return {
      module: CacheModule,
      global: true,
      providers: [
        { provide: CACHE_OPTIONS, useValue: options },
        cacheProvider,
      ],
      exports: [CacheService],
    };
  }

  static forRootAsync(options: CacheModuleAsyncOptions): DynamicModule {
    return {
      module: CacheModule,
      global: true,
      imports: options.imports || [],
      providers: [
        {
          provide: CACHE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        {
          provide: CacheService,
          useFactory: (opts: CacheModuleOptions) => {
            if (opts.type === 'redis') {
              return new RedisCacheService(opts);
            }
            return new MemoryCacheService(opts);
          },
          inject: [CACHE_OPTIONS],
        },
      ],
      exports: [CacheService],
    };
  }

  private static createCacheProvider(options: CacheModuleOptions): Provider {
    return {
      provide: CacheService,
      useClass: options.type === 'redis' ? RedisCacheService : MemoryCacheService,
    };
  }
}
```

## 模块重导出

模块可以重新导出它导入的模块：

```typescript
// common/common.module.ts
@Module({
  imports: [LoggerModule, ConfigModule, HttpModule],
  exports: [LoggerModule, ConfigModule, HttpModule], // 重新导出
})
export class CommonModule {}

// users.module.ts
@Module({
  imports: [CommonModule],
  // 现在可以使用 LoggerModule, ConfigModule, HttpModule 导出的所有服务
})
export class UsersModule {}
```

## 模块生命周期钩子

模块可以实现生命周期钩子接口：

```typescript
import { 
  Module, 
  OnModuleInit, 
  OnModuleDestroy, 
  OnApplicationBootstrap,
  OnApplicationShutdown,
  BeforeApplicationShutdown,
} from '@nestjs/common';

@Module({})
export class AppModule implements 
  OnModuleInit, 
  OnModuleDestroy, 
  OnApplicationBootstrap,
  BeforeApplicationShutdown,
  OnApplicationShutdown 
{
  /**
   * 模块初始化时调用（依赖解析完成后）
   * 在所有模块的 onModuleInit 完成后，才会处理下一个钩子
   */
  async onModuleInit() {
    console.log('1. Module initialized');
    // 初始化数据库连接、加载配置等
  }

  /**
   * 所有模块初始化完成后，应用启动前调用
   */
  async onApplicationBootstrap() {
    console.log('2. Application bootstrapped');
    // 启动后台任务、预热缓存等
  }

  /**
   * 收到终止信号后，在关闭连接之前调用
   * @param signal - 终止信号 (SIGTERM, SIGINT 等)
   */
  async beforeApplicationShutdown(signal?: string) {
    console.log(`3. Before shutdown: ${signal}`);
    // 完成正在处理的请求、发送通知等
  }

  /**
   * 模块销毁前调用
   */
  async onModuleDestroy() {
    console.log('4. Module destroying');
    // 清理模块资源
  }

  /**
   * 应用关闭时调用（所有连接关闭后）
   * @param signal - 终止信号
   */
  async onApplicationShutdown(signal?: string) {
    console.log(`5. Application shutdown: ${signal}`);
    // 最终清理
  }
}

// main.ts 中启用 shutdown hooks
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 启用关闭钩子（监听 SIGTERM, SIGINT）
  app.enableShutdownHooks();
  
  await app.listen(3000);
}
```

### 生命周期执行顺序

```
应用启动:
1. onModuleInit() - 所有模块
2. onApplicationBootstrap() - 所有模块
3. 开始监听请求

应用关闭 (收到 SIGTERM/SIGINT):
4. beforeApplicationShutdown() - 所有模块
5. 停止监听新请求
6. onModuleDestroy() - 所有模块
7. 关闭所有连接
8. onApplicationShutdown() - 所有模块
9. 进程退出
```

## 懒加载模块

对于大型应用，可以按需加载模块以提高启动速度：

```typescript
import { Injectable } from '@nestjs/common';
import { LazyModuleLoader } from '@nestjs/core';

@Injectable()
export class AppService {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  async generateReport() {
    // 动态导入模块（仅在需要时加载）
    const { ReportModule } = await import('./report/report.module');
    
    // 加载模块
    const moduleRef = await this.lazyModuleLoader.load(() => ReportModule);
    
    // 获取服务
    const { ReportService } = await import('./report/report.service');
    const reportService = moduleRef.get(ReportService);
    
    // 使用服务
    return reportService.generate();
  }
}
```

### 懒加载注意事项

- 懒加载的模块不能是全局模块
- 懒加载的模块中的控制器不会自动注册路由
- 适用于后台任务、报表生成等非常规请求处理

## 完整项目模块结构示例

```
src/
├── app.module.ts              # 根模块
├── main.ts                    # 入口文件
│
├── core/                      # 核心模块（全局）
│   ├── core.module.ts
│   ├── database/
│   │   ├── database.module.ts
│   │   └── database.service.ts
│   ├── logger/
│   │   ├── logger.module.ts
│   │   └── logger.service.ts
│   └── cache/
│       ├── cache.module.ts
│       └── cache.service.ts
│
├── common/                    # 共享模块
│   ├── common.module.ts
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── pipes/
│
├── config/                    # 配置模块
│   ├── config.module.ts
│   ├── config.service.ts
│   └── configuration.ts
│
├── auth/                      # 认证模块
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   ├── jwt.strategy.ts
│   │   └── local.strategy.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   └── dto/
│       ├── login.dto.ts
│       └── register.dto.ts
│
├── users/                     # 用户模块
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── users.repository.ts
│   ├── dto/
│   │   ├── create-user.dto.ts
│   │   └── update-user.dto.ts
│   └── entities/
│       └── user.entity.ts
│
├── products/                  # 产品模块
│   ├── products.module.ts
│   ├── products.controller.ts
│   ├── products.service.ts
│   ├── dto/
│   └── entities/
│
└── orders/                    # 订单模块
    ├── orders.module.ts
    ├── orders.controller.ts
    ├── orders.service.ts
    ├── dto/
    └── entities/
```

### 根模块配置

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core/core.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import configuration from './config/configuration';

@Module({
  imports: [
    // 配置模块（全局）
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    
    // 核心模块（全局）
    CoreModule,
    
    // 共享模块
    CommonModule,
    
    // 功能模块
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
  ],
})
export class AppModule {}
```

## 模块最佳实践

1. **单一职责** - 每个模块只负责一个功能领域
2. **合理封装** - 只导出需要被其他模块使用的服务
3. **避免循环依赖** - 使用 forwardRef 或重构模块结构
4. **谨慎使用全局模块** - 只用于真正需要全局共享的服务
5. **使用动态模块** - 提供灵活的配置选项
6. **模块命名清晰** - 使用 `XxxModule` 命名约定

## 下一步

[👉 05. 中间件 Middleware](./05-middleware.md)
