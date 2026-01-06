# 03. 提供者 Provider 与依赖注入

Provider 是 NestJS 中最重要的概念之一。几乎所有的类都可以被视为 Provider：服务、仓库、工厂、助手等。Provider 的主要思想是它可以作为依赖**注入**到其他类中。

## 什么是依赖注入 (DI)？

依赖注入是一种设计模式，用于实现控制反转 (IoC)。不是由类自己创建依赖，而是由外部（NestJS 的 IoC 容器）提供依赖。

### 没有依赖注入

```typescript
// ❌ 紧耦合，难以测试
class UsersController {
  private usersService: UsersService;
  
  constructor() {
    // 控制器自己创建服务实例
    this.usersService = new UsersService();
  }
}
```

### 使用依赖注入

```typescript
// ✅ 松耦合，易于测试
@Controller('users')
class UsersController {
  // NestJS 自动注入 UsersService 实例
  constructor(private readonly usersService: UsersService) {}
}
```

### 依赖注入的优势

1. **松耦合** - 类不需要知道依赖如何创建
2. **易于测试** - 可以轻松注入 Mock 对象
3. **可维护性** - 修改依赖实现不影响使用方
4. **单一职责** - 每个类只关注自己的职责

## 基本服务

### 创建服务

```typescript
// users.service.ts
import { Injectable } from '@nestjs/common';

@Injectable() // 标记为可注入的 Provider
export class UsersService {
  private users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ];

  findAll() {
    return this.users;
  }

  findOne(id: number) {
    return this.users.find(user => user.id === id);
  }

  create(user: { name: string; email: string }) {
    const newUser = { 
      id: this.users.length + 1, 
      ...user 
    };
    this.users.push(newUser);
    return newUser;
  }

  update(id: number, data: Partial<{ name: string; email: string }>) {
    const user = this.findOne(id);
    if (user) {
      Object.assign(user, data);
    }
    return user;
  }

  remove(id: number) {
    const index = this.users.findIndex(u => u.id === id);
    if (index !== -1) {
      this.users.splice(index, 1);
      return true;
    }
    return false;
  }
}
```

### @Injectable() 装饰器详解

`@Injectable()` 装饰器将类标记为可以由 NestJS IoC 容器管理的 Provider：

```typescript
import { Injectable, Scope } from '@nestjs/common';

// 默认：单例作用域
@Injectable()
export class DefaultService {}

// 等价于
@Injectable({ scope: Scope.DEFAULT })
export class DefaultService {}
```

## 依赖注入方式

### 1. 构造函数注入（推荐）

```typescript
// users.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  // 方式1：使用 private readonly 简写
  constructor(private readonly usersService: UsersService) {}

  // 方式2：显式声明
  // private usersService: UsersService;
  // constructor(usersService: UsersService) {
  //   this.usersService = usersService;
  // }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }
}
```

### 2. 属性注入

```typescript
import { Injectable, Inject } from '@nestjs/common';

@Injectable()
export class HttpService {
  @Inject('CONFIG')
  private readonly config: any;

  @Inject(LoggerService)
  private readonly logger: LoggerService;

  // 不需要在构造函数中声明
}
```

### 3. 基于 Token 的注入

```typescript
import { Injectable, Inject } from '@nestjs/common';

@Injectable()
export class SomeService {
  constructor(
    @Inject('CONFIG') private config: any,
    @Inject('DATABASE_CONNECTION') private db: any,
  ) {}
}
```

## 注册 Provider

Provider 必须在模块中注册才能使用：

```typescript
// users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService], // 注册 Provider
  exports: [UsersService],   // 导出给其他模块使用
})
export class UsersModule {}
```

### 简写形式 vs 完整形式

```typescript
// 简写形式
providers: [UsersService]

// 等价于完整形式
providers: [
  {
    provide: UsersService,  // Token
    useClass: UsersService, // 实现类
  }
]
```

## Provider 作用域

NestJS 支持三种作用域：

### 1. 单例作用域 (DEFAULT) - 默认

```typescript
import { Injectable, Scope } from '@nestjs/common';

@Injectable() // 默认就是单例
export class SingletonService {
  private count = 0;

  increment() {
    return ++this.count; // 所有请求共享同一个计数器
  }
}
```

**特点**：
- 整个应用生命周期内只有一个实例
- 所有请求共享同一个实例
- 最高性能

### 2. 请求作用域 (REQUEST)

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class RequestScopedService {
  constructor(@Inject(REQUEST) private request: Request) {}

  getUserId() {
    // 可以访问当前请求
    return this.request.user?.id;
  }
}
```

**特点**：
- 每个请求创建新实例
- 请求结束后销毁
- 可以访问请求上下文
- 性能较低（每次请求都创建实例）

### 3. 瞬态作用域 (TRANSIENT)

```typescript
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class TransientService {
  private id = Math.random();

  getId() {
    return this.id; // 每次注入都是不同的 ID
  }
}
```

**特点**：
- 每次注入都创建新实例
- 不同的消费者获得不同的实例
- 适用于需要隔离状态的场景

### 作用域对比

| 作用域 | 实例数量 | 生命周期 | 性能 | 使用场景 |
|--------|----------|----------|------|----------|
| DEFAULT | 1 | 应用生命周期 | 最高 | 无状态服务 |
| REQUEST | N (每请求1个) | 请求生命周期 | 中等 | 需要请求上下文 |
| TRANSIENT | N (每注入1个) | 即时 | 最低 | 需要隔离状态 |

### 作用域冒泡

如果一个单例服务依赖请求作用域服务，单例服务会被"提升"为请求作用域：

```typescript
// RequestService 是请求作用域
@Injectable({ scope: Scope.REQUEST })
export class RequestService {}

// SingletonService 依赖 RequestService
// 它会变成请求作用域！
@Injectable()
export class SingletonService {
  constructor(private requestService: RequestService) {}
}
```

## 自定义 Provider

### 1. useValue - 使用值

用于注入常量值、配置对象或 Mock 对象：

```typescript
// 常量值
const configProvider = {
  provide: 'CONFIG',
  useValue: {
    apiKey: 'xxx-xxx-xxx',
    apiUrl: 'https://api.example.com',
    timeout: 5000,
  },
};

// 使用环境变量
const envProvider = {
  provide: 'DATABASE_URL',
  useValue: process.env.DATABASE_URL,
};

// Mock 对象（用于测试）
const mockUsersService = {
  provide: UsersService,
  useValue: {
    findAll: () => [{ id: 1, name: 'Mock User' }],
    findOne: (id: number) => ({ id, name: 'Mock User' }),
    create: jest.fn(),
  },
};

@Module({
  providers: [configProvider, envProvider],
})
export class AppModule {}

// 使用
@Injectable()
export class SomeService {
  constructor(
    @Inject('CONFIG') private config: any,
    @Inject('DATABASE_URL') private dbUrl: string,
  ) {
    console.log(this.config.apiKey);
    console.log(this.dbUrl);
  }
}
```

### 2. useClass - 使用类

根据条件使用不同的实现类：

```typescript
// 接口定义
interface Logger {
  log(message: string): void;
  error(message: string): void;
}

// 开发环境实现
class DevelopmentLogger implements Logger {
  log(message: string) {
    console.log(`[DEV] ${message}`);
  }
  error(message: string) {
    console.error(`[DEV ERROR] ${message}`);
  }
}

// 生产环境实现
class ProductionLogger implements Logger {
  log(message: string) {
    // 发送到日志服务
    this.sendToLogService('info', message);
  }
  error(message: string) {
    // 发送到日志服务并报警
    this.sendToLogService('error', message);
    this.sendAlert(message);
  }
  private sendToLogService(level: string, message: string) { /* ... */ }
  private sendAlert(message: string) { /* ... */ }
}

// 根据环境选择实现
const loggerProvider = {
  provide: 'LOGGER',
  useClass: process.env.NODE_ENV === 'production' 
    ? ProductionLogger 
    : DevelopmentLogger,
};

@Module({
  providers: [loggerProvider],
})
export class AppModule {}
```

### 3. useFactory - 使用工厂函数

用于动态创建 Provider，可以注入其他依赖：

```typescript
// 简单工厂
const connectionProvider = {
  provide: 'CONNECTION',
  useFactory: () => {
    return new DatabaseConnection({
      host: 'localhost',
      port: 5432,
    });
  },
};

// 带依赖的工厂
const databaseProvider = {
  provide: 'DATABASE',
  useFactory: (configService: ConfigService) => {
    const config = configService.get('database');
    return new Database(config);
  },
  inject: [ConfigService], // 声明工厂函数的依赖
};

// 异步工厂
const asyncConnectionProvider = {
  provide: 'ASYNC_CONNECTION',
  useFactory: async (configService: ConfigService) => {
    const config = configService.get('db');
    const connection = await createConnection(config);
    await connection.runMigrations();
    return connection;
  },
  inject: [ConfigService],
};

// 多个依赖
const complexProvider = {
  provide: 'COMPLEX_SERVICE',
  useFactory: (
    configService: ConfigService,
    loggerService: LoggerService,
    cacheService: CacheService,
  ) => {
    return new ComplexService(configService, loggerService, cacheService);
  },
  inject: [ConfigService, LoggerService, CacheService],
};

@Module({
  providers: [
    ConfigService,
    LoggerService,
    CacheService,
    connectionProvider,
    databaseProvider,
    asyncConnectionProvider,
    complexProvider,
  ],
})
export class AppModule {}
```

### 4. useExisting - 别名

为已存在的 Provider 创建别名：

```typescript
@Injectable()
class LoggerService {
  log(message: string) {
    console.log(message);
  }
}

// 创建别名
const aliasProvider = {
  provide: 'AliasedLoggerService',
  useExisting: LoggerService,
};

// 两个 Token 指向同一个实例
@Module({
  providers: [LoggerService, aliasProvider],
})
export class AppModule {}

// 使用
@Injectable()
export class SomeService {
  constructor(
    private logger: LoggerService,                    // 原始服务
    @Inject('AliasedLoggerService') private aliasedLogger: LoggerService, // 别名
  ) {
    // logger === aliasedLogger (同一个实例)
  }
}
```

## 可选依赖

使用 `@Optional()` 装饰器标记可选依赖：

```typescript
import { Injectable, Optional, Inject } from '@nestjs/common';

@Injectable()
export class HttpService {
  constructor(
    @Optional() @Inject('HTTP_OPTIONS') private httpOptions?: HttpOptions,
  ) {
    // httpOptions 可能为 undefined
    this.httpOptions = httpOptions || {
      timeout: 5000,
      retries: 3,
    };
  }
}

// 即使没有提供 HTTP_OPTIONS，HttpService 也能正常工作
@Module({
  providers: [HttpService], // 没有提供 HTTP_OPTIONS
})
export class AppModule {}
```

## 循环依赖处理

当两个服务相互依赖时，会产生循环依赖：

```typescript
// ❌ 循环依赖问题
@Injectable()
export class CatsService {
  constructor(private dogsService: DogsService) {}
}

@Injectable()
export class DogsService {
  constructor(private catsService: CatsService) {}
}
```

### 解决方案：forwardRef

```typescript
import { Injectable, Inject, forwardRef } from '@nestjs/common';

@Injectable()
export class CatsService {
  constructor(
    @Inject(forwardRef(() => DogsService))
    private dogsService: DogsService,
  ) {}

  getCats() {
    return ['cat1', 'cat2'];
  }

  getCatsWithDogs() {
    const dogs = this.dogsService.getDogs();
    return { cats: this.getCats(), dogs };
  }
}

@Injectable()
export class DogsService {
  constructor(
    @Inject(forwardRef(() => CatsService))
    private catsService: CatsService,
  ) {}

  getDogs() {
    return ['dog1', 'dog2'];
  }

  getDogsWithCats() {
    const cats = this.catsService.getCats();
    return { dogs: this.getDogs(), cats };
  }
}
```

### 模块级别的循环依赖

```typescript
// cats.module.ts
@Module({
  imports: [forwardRef(() => DogsModule)],
  providers: [CatsService],
  exports: [CatsService],
})
export class CatsModule {}

// dogs.module.ts
@Module({
  imports: [forwardRef(() => CatsModule)],
  providers: [DogsService],
  exports: [DogsService],
})
export class DogsModule {}
```

**最佳实践**：尽量避免循环依赖，考虑重构代码结构。

## 完整示例：多层服务架构

```typescript
// interfaces/user.interface.ts
export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

export interface CreateUserData {
  name: string;
  email: string;
}

// repositories/users.repository.ts
import { Injectable } from '@nestjs/common';
import { User, CreateUserData } from '../interfaces/user.interface';

@Injectable()
export class UsersRepository {
  private users: User[] = [];
  private idCounter = 1;

  async findAll(): Promise<User[]> {
    return [...this.users];
  }

  async findById(id: number): Promise<User | null> {
    return this.users.find(u => u.id === id) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find(u => u.email === email) || null;
  }

  async create(data: CreateUserData): Promise<User> {
    const user: User = {
      id: this.idCounter++,
      ...data,
      createdAt: new Date(),
    };
    this.users.push(user);
    return user;
  }

  async update(id: number, data: Partial<CreateUserData>): Promise<User | null> {
    const user = await this.findById(id);
    if (user) {
      Object.assign(user, data);
    }
    return user;
  }

  async delete(id: number): Promise<boolean> {
    const index = this.users.findIndex(u => u.id === id);
    if (index !== -1) {
      this.users.splice(index, 1);
      return true;
    }
    return false;
  }
}

// services/users.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { User, CreateUserData } from '../interfaces/user.interface';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.findAll();
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async create(data: CreateUserData): Promise<User> {
    // 业务逻辑：检查邮箱唯一性
    const existing = await this.usersRepository.findByEmail(data.email);
    if (existing) {
      throw new ConflictException('Email already exists');
    }
    return this.usersRepository.create(data);
  }

  async update(id: number, data: Partial<CreateUserData>): Promise<User> {
    // 先检查用户是否存在
    await this.findOne(id);
    
    // 如果更新邮箱，检查唯一性
    if (data.email) {
      const existing = await this.usersRepository.findByEmail(data.email);
      if (existing && existing.id !== id) {
        throw new ConflictException('Email already exists');
      }
    }
    
    const user = await this.usersRepository.update(id, data);
    return user!;
  }

  async remove(id: number): Promise<void> {
    const deleted = await this.usersRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException(`User #${id} not found`);
    }
  }
}

// users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import { UsersRepository } from './repositories/users.repository';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,    // 业务逻辑层
    UsersRepository, // 数据访问层
  ],
  exports: [UsersService], // 只导出 Service，不暴露 Repository
})
export class UsersModule {}
```

## Provider 最佳实践

1. **单一职责** - 每个 Provider 只做一件事
2. **依赖抽象** - 依赖接口而非具体实现
3. **避免循环依赖** - 重构代码结构
4. **使用构造函数注入** - 而非属性注入
5. **导出接口** - 只导出需要的服务
6. **使用有意义的 Token** - 避免魔术字符串

## 下一步

[👉 04. 模块 Module 系统](./04-modules.md)
