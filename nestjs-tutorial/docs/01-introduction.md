# 01. NestJS 简介与核心概念

## 什么是 NestJS？

NestJS 是一个用于构建高效、可扩展的 Node.js 服务端应用程序的框架。它使用 TypeScript 构建（也支持纯 JavaScript），结合了 OOP（面向对象编程）、FP（函数式编程）和 FRP（函数式响应编程）的元素。

### 为什么选择 NestJS？

1. **TypeScript 原生支持** - 开箱即用的类型安全
2. **模块化架构** - 清晰的代码组织结构
3. **依赖注入** - 松耦合、易测试
4. **丰富的生态** - 大量官方和社区模块
5. **企业级** - 适合大型项目

## 核心概念速览

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

## 安装与创建项目

### 1. 安装 NestJS CLI

```bash
npm install -g @nestjs/cli
```

### 2. 创建新项目

```bash
nest new my-project
```

### 3. 项目结构

```
my-project/
├── src/
│   ├── app.controller.ts    # 根控制器
│   ├── app.controller.spec.ts
│   ├── app.module.ts        # 根模块
│   ├── app.service.ts       # 根服务
│   └── main.ts              # 入口文件
├── test/
├── nest-cli.json
├── package.json
└── tsconfig.json
```

## 入口文件 main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // 创建 NestJS 应用实例
  const app = await NestFactory.create(AppModule);
  
  // 全局前缀 (可选)
  app.setGlobalPrefix('api');
  
  // 启动服务器
  await app.listen(3000);
  console.log('Application is running on: http://localhost:3000');
}
bootstrap();
```

## 第一个 Hello World

### app.module.ts
```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### app.controller.ts
```typescript
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
```

### app.service.ts
```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
```

## 运行项目

```bash
# 开发模式 (热重载)
npm run start:dev

# 生产模式
npm run start:prod

# 调试模式
npm run start:debug
```

## NestJS 装饰器速查表

| 装饰器 | 用途 | 示例 |
|--------|------|------|
| `@Module()` | 定义模块 | `@Module({ imports: [], providers: [] })` |
| `@Controller()` | 定义控制器 | `@Controller('users')` |
| `@Injectable()` | 定义可注入的提供者 | `@Injectable()` |
| `@Get()` | GET 请求 | `@Get(':id')` |
| `@Post()` | POST 请求 | `@Post()` |
| `@Put()` | PUT 请求 | `@Put(':id')` |
| `@Delete()` | DELETE 请求 | `@Delete(':id')` |
| `@Patch()` | PATCH 请求 | `@Patch(':id')` |
| `@Param()` | 路由参数 | `@Param('id') id: string` |
| `@Query()` | 查询参数 | `@Query('page') page: number` |
| `@Body()` | 请求体 | `@Body() dto: CreateUserDto` |
| `@Headers()` | 请求头 | `@Headers('authorization') auth: string` |

## 下一步

[👉 02. 控制器 Controller 详解](./02-controllers.md)

