# 01. NestJS 简介与核心概念

## 什么是 NestJS？

NestJS 是一个用于构建高效、可扩展的 Node.js 服务端应用程序的框架。它使用 TypeScript 构建（也支持纯 JavaScript），结合了 OOP（面向对象编程）、FP（函数式编程）和 FRP（函数式响应编程）的元素。

### 核心特点

1. **TypeScript 原生支持** - 开箱即用的类型安全，更好的 IDE 支持
2. **模块化架构** - 清晰的代码组织结构，易于维护和扩展
3. **依赖注入** - 松耦合、易测试，借鉴了 Angular 的设计
4. **丰富的生态** - 大量官方和社区模块（数据库、认证、缓存等）
5. **企业级** - 适合大型项目，内置最佳实践
6. **平台无关** - 底层可使用 Express 或 Fastify

### 与 Express 的对比

| 特性 | Express | NestJS |
|------|---------|--------|
| 架构 | 无固定架构 | 模块化架构 |
| TypeScript | 需要配置 | 原生支持 |
| 依赖注入 | 无 | 内置 |
| 学习曲线 | 低 | 中等 |
| 适合项目 | 小型/中型 | 中型/大型 |
| 测试支持 | 基础 | 完善 |

## 核心概念速览

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        NestJS 应用                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Module (模块)                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ Controller  │  │  Provider   │  │   Import    │  │   │
│  │  │  (控制器)    │  │  (提供者)    │  │  (导入模块)  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  请求流程: Request → Middleware → Guard → Interceptor →    │
│           Pipe → Controller → Service → Response            │
└─────────────────────────────────────────────────────────────┘
```

### 核心构建块

| 构建块 | 作用 | 装饰器 |
|--------|------|--------|
| **Module** | 组织代码，封装相关功能 | `@Module()` |
| **Controller** | 处理 HTTP 请求，定义路由 | `@Controller()` |
| **Provider/Service** | 业务逻辑，可被注入 | `@Injectable()` |
| **Middleware** | 请求预处理 | `implements NestMiddleware` |
| **Guard** | 权限验证 | `@Injectable()` + `CanActivate` |
| **Interceptor** | 请求/响应转换 | `@Injectable()` + `NestInterceptor` |
| **Pipe** | 数据转换和验证 | `@Injectable()` + `PipeTransform` |
| **Filter** | 异常处理 | `@Catch()` |

### 请求生命周期

```
客户端请求
    │
    ▼
┌─────────────────┐
│   Middleware    │  → 请求预处理（日志、CORS等）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│     Guards      │  → 权限验证（认证、授权）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  Interceptors   │  → 请求拦截（前置逻辑）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│     Pipes       │  → 数据转换和验证
└─────────────────┘
    │
    ▼
┌─────────────────┐
│   Controller    │  → 路由处理
└─────────────────┘
    │
    ▼
┌─────────────────┐
│    Service      │  → 业务逻辑
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  Interceptors   │  → 响应拦截（后置逻辑）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│Exception Filters│  → 异常处理（如果有异常）
└─────────────────┘
    │
    ▼
客户端响应
```

## 安装与创建项目

### 1. 安装 NestJS CLI

```bash
# 使用 npm
npm install -g @nestjs/cli

# 使用 pnpm（推荐）
pnpm add -g @nestjs/cli

# 使用 yarn
yarn global add @nestjs/cli

# 验证安装
nest --version
```

### 2. 创建新项目

```bash
# 基本创建
nest new my-project

# 使用 pnpm 并启用严格模式
nest new my-project -p pnpm --strict
```

### 3. 项目结构

```
my-project/
├── src/
│   ├── app.controller.ts      # 根控制器
│   ├── app.controller.spec.ts # 控制器测试
│   ├── app.module.ts          # 根模块
│   ├── app.service.ts         # 根服务
│   └── main.ts                # 入口文件
├── test/
│   ├── app.e2e-spec.ts        # E2E 测试
│   └── jest-e2e.json          # E2E 测试配置
├── nest-cli.json              # NestJS CLI 配置
├── package.json               # 依赖配置
├── tsconfig.json              # TypeScript 配置
└── tsconfig.build.json        # 构建用 TypeScript 配置
```

## 入口文件详解 (main.ts)

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  // 1. 创建 NestJS 应用实例
  const app = await NestFactory.create(AppModule, {
    // 可选配置
    logger: ['error', 'warn', 'log'], // 日志级别
    cors: true,                        // 启用 CORS
  });

  // 2. 全局配置
  
  // 全局前缀（所有路由以 /api 开头）
  app.setGlobalPrefix('api');

  // 全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // 自动剥离非 DTO 属性
    forbidNonWhitelisted: true, // 有额外属性时报错
    transform: true,           // 自动类型转换
  }));

  // 启用 CORS
  app.enableCors({
    origin: ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  });

  // 3. 启动服务器
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
```

### NestFactory.create 选项

```typescript
const app = await NestFactory.create(AppModule, {
  // 日志配置
  logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  // 或完全禁用
  logger: false,
  
  // CORS 配置
  cors: true,
  // 或详细配置
  cors: {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  },
  
  // 请求体大小限制
  bodyParser: true,
  
  // HTTPS 配置
  httpsOptions: {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
  },
});
```

## 模块详解 (app.module.ts)

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],       // 导入其他模块
  controllers: [AppController], // 该模块的控制器
  providers: [AppService],      // 该模块的服务提供者
  exports: [],       // 导出给其他模块使用的提供者
})
export class AppModule {}
```

### @Module() 装饰器属性

| 属性 | 说明 | 示例 |
|------|------|------|
| `imports` | 导入其他模块 | `[UsersModule, AuthModule]` |
| `controllers` | 该模块的控制器 | `[AppController]` |
| `providers` | 该模块的服务 | `[AppService]` |
| `exports` | 导出的服务 | `[AppService]` |

## 控制器详解 (app.controller.ts)

```typescript
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller() // 空前缀，匹配根路由
export class AppController {
  // 依赖注入：通过构造函数注入服务
  constructor(private readonly appService: AppService) {}

  // GET /
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // GET /hello/:name
  @Get('hello/:name')
  sayHello(@Param('name') name: string): string {
    return `Hello, ${name}!`;
  }

  // GET /search?q=xxx
  @Get('search')
  search(@Query('q') query: string): string {
    return `Searching for: ${query}`;
  }

  // POST /
  @Post()
  create(@Body() body: any): any {
    return { received: body };
  }
}
```

## 服务详解 (app.service.ts)

```typescript
import { Injectable } from '@nestjs/common';

@Injectable() // 标记为可注入的服务
export class AppService {
  // 业务逻辑方法
  getHello(): string {
    return 'Hello World!';
  }

  // 可以注入其他服务
  // constructor(private readonly otherService: OtherService) {}
}
```

### @Injectable() 装饰器

`@Injectable()` 是 NestJS 依赖注入系统的核心：

```typescript
import { Injectable, Scope } from '@nestjs/common';

// 默认：单例模式（整个应用共享一个实例）
@Injectable()
export class SingletonService {}

// 请求作用域（每个请求创建新实例）
@Injectable({ scope: Scope.REQUEST })
export class RequestScopedService {}

// 瞬态作用域（每次注入创建新实例）
@Injectable({ scope: Scope.TRANSIENT })
export class TransientService {}
```

## 运行项目

```bash
# 开发模式（热重载）
npm run start:dev
# 或
pnpm start:dev

# 生产模式
npm run start:prod

# 调试模式
npm run start:debug
```

## 第一个完整示例

创建一个简单的用户模块：

### 1. 生成模块

```bash
nest g resource users
```

### 2. 生成的文件

```
src/users/
├── dto/
│   ├── create-user.dto.ts
│   └── update-user.dto.ts
├── entities/
│   └── user.entity.ts
├── users.controller.ts
├── users.controller.spec.ts
├── users.module.ts
├── users.service.ts
└── users.service.spec.ts
```

### 3. 代码示例

```typescript
// users/entities/user.entity.ts
export class User {
  id: number;
  name: string;
  email: string;
}

// users/dto/create-user.dto.ts
export class CreateUserDto {
  name: string;
  email: string;
}

// users/dto/update-user.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {}

// users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  private users: User[] = [];
  private idCounter = 1;

  create(createUserDto: CreateUserDto): User {
    const user: User = {
      id: this.idCounter++,
      ...createUserDto,
    };
    this.users.push(user);
    return user;
  }

  findAll(): User[] {
    return this.users;
  }

  findOne(id: number): User {
    const user = this.users.find(u => u.id === id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  update(id: number, updateUserDto: UpdateUserDto): User {
    const user = this.findOne(id);
    Object.assign(user, updateUserDto);
    return user;
  }

  remove(id: number): void {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) {
      throw new NotFoundException(`User #${id} not found`);
    }
    this.users.splice(index, 1);
  }
}

// users/users.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}

// users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // 如果其他模块需要使用
})
export class UsersModule {}
```

## NestJS 装饰器速查表

### 模块装饰器

| 装饰器 | 用途 | 示例 |
|--------|------|------|
| `@Module()` | 定义模块 | `@Module({ imports: [], providers: [] })` |
| `@Global()` | 全局模块 | `@Global() @Module({})` |

### 控制器装饰器

| 装饰器 | 用途 | 示例 |
|--------|------|------|
| `@Controller()` | 定义控制器 | `@Controller('users')` |
| `@Get()` | GET 请求 | `@Get(':id')` |
| `@Post()` | POST 请求 | `@Post()` |
| `@Put()` | PUT 请求 | `@Put(':id')` |
| `@Delete()` | DELETE 请求 | `@Delete(':id')` |
| `@Patch()` | PATCH 请求 | `@Patch(':id')` |
| `@HttpCode()` | 状态码 | `@HttpCode(201)` |
| `@Header()` | 响应头 | `@Header('Cache-Control', 'none')` |
| `@Redirect()` | 重定向 | `@Redirect('https://nestjs.com', 301)` |

### 参数装饰器

| 装饰器 | 用途 | 示例 |
|--------|------|------|
| `@Param()` | 路由参数 | `@Param('id') id: string` |
| `@Query()` | 查询参数 | `@Query('page') page: number` |
| `@Body()` | 请求体 | `@Body() dto: CreateUserDto` |
| `@Headers()` | 请求头 | `@Headers('authorization') auth: string` |
| `@Req()` | 请求对象 | `@Req() request: Request` |
| `@Res()` | 响应对象 | `@Res() response: Response` |
| `@Ip()` | 客户端 IP | `@Ip() ip: string` |

### 提供者装饰器

| 装饰器 | 用途 | 示例 |
|--------|------|------|
| `@Injectable()` | 可注入服务 | `@Injectable()` |
| `@Inject()` | 注入依赖 | `@Inject('CONFIG') config` |
| `@Optional()` | 可选依赖 | `@Optional() @Inject('CACHE')` |

## 下一步

[👉 02. 控制器 Controller 详解](./02-controllers.md)
