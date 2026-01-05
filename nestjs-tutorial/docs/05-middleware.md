# 05. 中间件 Middleware

中间件是在路由处理程序之前调用的函数，可以访问请求和响应对象。

## 中间件执行流程

```
Client Request
      │
      ▼
┌─────────────┐
│  Middleware │  ← 中间件 (可以有多个)
└─────────────┘
      │
      ▼
┌─────────────┐
│   Guards    │  ← 守卫
└─────────────┘
      │
      ▼
┌─────────────┐
│Interceptors │  ← 拦截器 (前)
└─────────────┘
      │
      ▼
┌─────────────┐
│    Pipes    │  ← 管道
└─────────────┘
      │
      ▼
┌─────────────┐
│ Controller  │  ← 控制器
└─────────────┘
      │
      ▼
┌─────────────┐
│Interceptors │  ← 拦截器 (后)
└─────────────┘
      │
      ▼
   Response
```

## 创建中间件

### 函数式中间件

```typescript
import { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
}
```

### 类中间件

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`
      );
    });
    
    next();
  }
}
```

## 应用中间件

```typescript
import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { UsersController } from './users/users.controller';

@Module({
  // ...
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('*'); // 应用到所有路由
  }
}
```

## 路由配置

```typescript
@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      // 方式1: 字符串路径
      .forRoutes('users')
      
      // 方式2: 路径和方法
      .forRoutes({ path: 'users', method: RequestMethod.GET })
      
      // 方式3: 多个路由
      .forRoutes(
        { path: 'users', method: RequestMethod.GET },
        { path: 'users', method: RequestMethod.POST },
      )
      
      // 方式4: 控制器
      .forRoutes(UsersController)
      
      // 方式5: 通配符
      .forRoutes({ path: 'ab*cd', method: RequestMethod.ALL });
  }
}
```

## 排除路由

```typescript
consumer
  .apply(LoggerMiddleware)
  .exclude(
    { path: 'health', method: RequestMethod.GET },
    { path: 'docs/(.*)', method: RequestMethod.ALL },
    'metrics',
  )
  .forRoutes('*');
```

## 多个中间件

```typescript
consumer
  .apply(CorsMiddleware, HelmetMiddleware, LoggerMiddleware)
  .forRoutes('*');
```

## 全局中间件

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './common/middleware/logger.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 全局函数式中间件
  app.use(logger);
  
  await app.listen(3000);
}
bootstrap();
```

## 实用中间件示例

### 1. 请求日志中间件

```typescript
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      const duration = Date.now() - start;

      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${contentLength || 0}b - ${duration}ms - ${ip} - ${userAgent}`
      );
    });

    next();
  }
}
```

### 2. 认证中间件

```typescript
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private jwtService: JwtService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new UnauthorizedException('No token provided');
    }

    const [type, token] = authHeader.split(' ');
    
    if (type !== 'Bearer') {
      throw new UnauthorizedException('Invalid token type');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      req['user'] = payload;
      next();
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

### 3. CORS 中间件

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CorsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    
    next();
  }
}
```

### 4. 请求限流中间件

```typescript
import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private requests = new Map<string, { count: number; resetTime: number }>();
  private readonly limit = 100; // 每分钟最大请求数
  private readonly windowMs = 60 * 1000; // 1分钟

  use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip;
    const now = Date.now();
    
    const record = this.requests.get(ip);
    
    if (!record || now > record.resetTime) {
      this.requests.set(ip, { count: 1, resetTime: now + this.windowMs });
      next();
      return;
    }
    
    if (record.count >= this.limit) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    
    record.count++;
    next();
  }
}
```

### 5. 请求体大小限制中间件

```typescript
import { Injectable, NestMiddleware, PayloadTooLargeException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class BodySizeMiddleware implements NestMiddleware {
  private readonly maxSize = 10 * 1024 * 1024; // 10MB

  use(req: Request, res: Response, next: NextFunction) {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    
    if (contentLength > this.maxSize) {
      throw new PayloadTooLargeException(`Body size exceeds ${this.maxSize} bytes`);
    }
    
    next();
  }
}
```

## 使用第三方中间件

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 安全头
  app.use(helmet());
  
  // 压缩
  app.use(compression());
  
  // Cookie 解析
  app.use(cookieParser());
  
  // CORS (NestJS 内置)
  app.enableCors({
    origin: ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  });
  
  await app.listen(3000);
}
bootstrap();
```

## 下一步

[👉 06. 异常过滤器 Exception Filters](./06-exception-filters.md)

