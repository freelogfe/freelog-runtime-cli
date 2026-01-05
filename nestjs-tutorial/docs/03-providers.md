# 03. 提供者 Provider 与依赖注入

Provider 是 NestJS 中最重要的概念之一。几乎所有的类都可以被视为 Provider：服务、仓库、工厂、助手等。

## 基本服务

```typescript
// users.service.ts
import { Injectable } from '@nestjs/common';

@Injectable() // 标记为可注入
export class UsersService {
  private users = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ];

  findAll() {
    return this.users;
  }

  findOne(id: number) {
    return this.users.find(user => user.id === id);
  }

  create(user: { name: string }) {
    const newUser = { id: this.users.length + 1, ...user };
    this.users.push(newUser);
    return newUser;
  }
}
```

## 依赖注入

```typescript
// users.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  // 构造函数注入
  constructor(private readonly usersService: UsersService) {}

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

## 注册 Provider

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

## Provider 作用域

```typescript
import { Injectable, Scope } from '@nestjs/common';

// 默认：单例 (Singleton) - 整个应用共享一个实例
@Injectable()
export class SingletonService {}

// 请求作用域 - 每个请求创建新实例
@Injectable({ scope: Scope.REQUEST })
export class RequestScopedService {}

// 瞬态作用域 - 每次注入都创建新实例
@Injectable({ scope: Scope.TRANSIENT })
export class TransientService {}
```

## 自定义 Provider

### 1. useValue - 使用值

```typescript
// 常量值
const configProvider = {
  provide: 'CONFIG',
  useValue: {
    apiKey: 'xxx-xxx-xxx',
    apiUrl: 'https://api.example.com',
  },
};

// Mock 对象 (用于测试)
const mockUsersService = {
  provide: UsersService,
  useValue: {
    findAll: () => [{ id: 1, name: 'Mock User' }],
    findOne: (id: number) => ({ id, name: 'Mock User' }),
  },
};

@Module({
  providers: [configProvider, mockUsersService],
})
export class AppModule {}

// 使用
@Injectable()
export class SomeService {
  constructor(@Inject('CONFIG') private config: any) {
    console.log(this.config.apiKey);
  }
}
```

### 2. useClass - 使用类

```typescript
// 根据环境使用不同实现
const databaseProvider = {
  provide: 'DATABASE',
  useClass: process.env.NODE_ENV === 'production' 
    ? ProductionDatabase 
    : DevelopmentDatabase,
};

// 接口实现
interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(message);
  }
}

class FileLogger implements Logger {
  log(message: string) {
    // 写入文件
  }
}

const loggerProvider = {
  provide: 'LOGGER',
  useClass: ConsoleLogger,
};
```

### 3. useFactory - 使用工厂函数

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
  inject: [ConfigService], // 注入依赖
};

// 异步工厂
const asyncProvider = {
  provide: 'ASYNC_CONNECTION',
  useFactory: async (configService: ConfigService) => {
    const connection = await createConnection(configService.get('db'));
    return connection;
  },
  inject: [ConfigService],
};
```

### 4. useExisting - 别名

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

@Module({
  providers: [LoggerService, aliasProvider],
})
export class AppModule {}
```

## 可选依赖

```typescript
import { Injectable, Optional, Inject } from '@nestjs/common';

@Injectable()
export class HttpService {
  constructor(
    @Optional() @Inject('HTTP_OPTIONS') private httpOptions?: any,
  ) {
    // httpOptions 可能为 undefined
    this.httpOptions = httpOptions || { timeout: 5000 };
  }
}
```

## 属性注入

```typescript
import { Injectable, Inject } from '@nestjs/common';

@Injectable()
export class HttpService {
  @Inject('CONFIG')
  private readonly config: any;

  // 不需要在构造函数中声明
}
```

## 循环依赖处理

```typescript
// forward reference 解决循环依赖
import { Injectable, Inject, forwardRef } from '@nestjs/common';

@Injectable()
export class CatsService {
  constructor(
    @Inject(forwardRef(() => DogsService))
    private dogsService: DogsService,
  ) {}
}

@Injectable()
export class DogsService {
  constructor(
    @Inject(forwardRef(() => CatsService))
    private catsService: CatsService,
  ) {}
}
```

## 完整示例：多层服务架构

```typescript
// interfaces/user.interface.ts
export interface User {
  id: number;
  name: string;
  email: string;
}

// repositories/users.repository.ts
import { Injectable } from '@nestjs/common';
import { User } from '../interfaces/user.interface';

@Injectable()
export class UsersRepository {
  private users: User[] = [];

  async findAll(): Promise<User[]> {
    return this.users;
  }

  async findById(id: number): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find(u => u.email === email);
  }

  async create(user: Omit<User, 'id'>): Promise<User> {
    const newUser = { id: Date.now(), ...user };
    this.users.push(newUser);
    return newUser;
  }

  async update(id: number, data: Partial<User>): Promise<User | undefined> {
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
import { User } from '../interfaces/user.interface';

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

  async create(data: Omit<User, 'id'>): Promise<User> {
    const existing = await this.usersRepository.findByEmail(data.email);
    if (existing) {
      throw new ConflictException('Email already exists');
    }
    return this.usersRepository.create(data);
  }

  async update(id: number, data: Partial<User>): Promise<User> {
    const user = await this.usersRepository.update(id, data);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
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
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
```

## 下一步

[👉 04. 模块 Module 系统](./04-modules.md)

