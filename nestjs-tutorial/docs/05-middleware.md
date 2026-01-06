# 05. 中间件 Middleware

中间件是在路由处理程序**之前**调用的函数，可以访问请求和响应对象，以及 `next()` 函数。

## 中间件的作用

中间件函数可以执行以下任务：
- 执行任何代码
- 对请求和响应对象进行更改
- 结束请求-响应周期
- 调用下一个中间件函数
- 如果当前中间件不结束请求-响应周期，必须调用 `next()` 将控制权传递给下一个中间件

## 请求生命周期中的位置

```
Client Request
      │
      ▼
┌─────────────────┐
│   Middleware    │  ← 中间件 (最先执行)
│  (可以有多个)    │
└─────────────────┘
      │
      ▼
┌─────────────────┐
│     Guards      │  ← 守卫
└─────────────────┘
      │
      ▼
┌─────────────────┐
│  Interceptors   │  ← 拦截器 (前置)
└─────────────────┘
      │
      ▼
┌─────────────────┐
│     Pipes       │  ← 管道
└─────────────────┘
      │
      ▼
┌─────────────────┐
│   Controller    │  ← 控制器
└─────────────────┘
      │
      ▼
┌─────────────────┐
│  Interceptors   │  ← 拦截器 (后置)
└─────────────────┘
      │
      ▼
┌─────────────────┐
│Exception Filters│  ← 异常过滤器 (如有异常)
└─────────────────┘
      │
      ▼
   Response
```

## 创建中间件

### 函数式中间件（简单场景）

```typescript
// middleware/logger.middleware.ts
import { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next(); // 必须调用 next()，否则请求会挂起
}
```

### 类中间件（推荐，支持依赖注入）

```typescript
// middleware/logger.middleware.ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const start = Date.now();

    // 监听响应完成事件
    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length') || 0;
      const duration = Date.now() - start;

      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${contentLength}b - ${duration}ms - ${ip} - ${userAgent}`
      );
    });

    next();
  }
}
```

### 带依赖注入的中间件

```typescript
// middleware/auth.middleware.ts
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new UnauthorizedException('No token provided');
    }

    const [type, token] = authHeader.split(' ');
    
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      const user = await this.usersService.findOne(payload.sub);
      
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      
      // 将用户信息附加到请求对象
      req['user'] = user;
      next();
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

## 应用中间件

中间件在模块的 `configure()` 方法中配置：

```typescript
// app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './middleware/logger.middleware';

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

## 路由配置方式

### 1. 字符串路径

```typescript
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(LoggerMiddleware)
    .forRoutes('users'); // 匹配 /users 及其子路由
}
```

### 2. 路径和方法

```typescript
import { RequestMethod } from '@nestjs/common';

configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(LoggerMiddleware)
    .forRoutes(
      { path: 'users', method: RequestMethod.GET },
      { path: 'users', method: RequestMethod.POST },
    );
}
```

### 3. 控制器

```typescript
import { UsersController } from './users/users.controller';

configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(LoggerMiddleware)
    .forRoutes(UsersController); // 应用到 UsersController 的所有路由
}
```

### 4. 多个控制器

```typescript
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(LoggerMiddleware)
    .forRoutes(UsersController, ProductsController, OrdersController);
}
```

### 5. 通配符路径

```typescript
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(LoggerMiddleware)
    .forRoutes({ path: 'ab*cd', method: RequestMethod.ALL }); // 匹配 abcd, ab_cd, ab123cd 等
    
  consumer
    .apply(AuthMiddleware)
    .forRoutes({ path: 'api/*', method: RequestMethod.ALL }); // 匹配 /api/ 下所有路由
}
```

## 排除路由

使用 `exclude()` 方法排除特定路由：

```typescript
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(AuthMiddleware)
    .exclude(
      { path: 'auth/login', method: RequestMethod.POST },
      { path: 'auth/register', method: RequestMethod.POST },
      { path: 'health', method: RequestMethod.GET },
      'public/(.*)', // 正则表达式
    )
    .forRoutes('*');
}
```

## 多个中间件

中间件按照 `apply()` 中的顺序执行：

```typescript
configure(consumer: MiddlewareConsumer) {
  // 方式1：同时应用多个中间件
  consumer
    .apply(CorsMiddleware, HelmetMiddleware, LoggerMiddleware)
    .forRoutes('*');

  // 方式2：分别配置不同中间件
  consumer
    .apply(LoggerMiddleware)
    .forRoutes('*');
    
  consumer
    .apply(AuthMiddleware)
    .exclude({ path: 'auth/(.*)', method: RequestMethod.ALL })
    .forRoutes('*');
}
```

## 全局中间件

在 `main.ts` 中应用全局中间件：

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './middleware/logger.middleware';
import * as helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 全局函数式中间件
  app.use(logger);
  
  // 第三方中间件
  app.use(helmet());           // 安全头
  app.use(compression());      // 响应压缩
  app.use(cookieParser());     // Cookie 解析
  
  // 内置 CORS 支持
  app.enableCors({
    origin: ['http://localhost:3000', 'https://example.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });
  
  await app.listen(3000);
}
bootstrap();
```

**注意**：全局中间件不能使用依赖注入，因为它们在 NestJS 模块系统之外。

## 常用中间件示例

### 1. 请求日志中间件

```typescript
// middleware/request-logger.middleware.ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip, body, query, params } = req;
    const userAgent = req.get('user-agent') || '';
    const start = Date.now();

    // 请求日志
    this.logger.log(`→ ${method} ${originalUrl} - ${ip}`);
    
    if (Object.keys(body).length > 0) {
      this.logger.debug(`Body: ${JSON.stringify(body)}`);
    }
    if (Object.keys(query).length > 0) {
      this.logger.debug(`Query: ${JSON.stringify(query)}`);
    }

    // 响应日志
    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;
      const contentLength = res.get('content-length') || 0;
      
      const logMessage = `← ${method} ${originalUrl} ${statusCode} ${contentLength}b - ${duration}ms`;
      
      if (statusCode >= 500) {
        this.logger.error(logMessage);
      } else if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    next();
  }
}
```

### 2. 请求 ID 中间件

```typescript
// middleware/request-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // 从请求头获取或生成新的请求 ID
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    
    // 附加到请求对象
    req['requestId'] = requestId;
    
    // 添加到响应头
    res.setHeader('X-Request-Id', requestId);
    
    next();
  }
}
```

### 3. 请求限流中间件

```typescript
// middleware/rate-limit.middleware.ts
import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private requests = new Map<string, RateLimitRecord>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor() {
    this.limit = 100;           // 每个时间窗口最大请求数
    this.windowMs = 60 * 1000;  // 时间窗口：1分钟
  }

  use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    const record = this.requests.get(ip);
    
    // 新 IP 或时间窗口已过
    if (!record || now > record.resetTime) {
      this.requests.set(ip, { 
        count: 1, 
        resetTime: now + this.windowMs 
      });
      this.setRateLimitHeaders(res, this.limit - 1, record?.resetTime || now + this.windowMs);
      next();
      return;
    }
    
    // 超过限制
    if (record.count >= this.limit) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests, please try again later',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    
    record.count++;
    this.setRateLimitHeaders(res, this.limit - record.count, record.resetTime);
    next();
  }

  private setRateLimitHeaders(res: Response, remaining: number, resetTime: number) {
    res.setHeader('X-RateLimit-Limit', this.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));
  }
}
```

### 4. 请求体大小检查中间件

```typescript
// middleware/body-size.middleware.ts
import { Injectable, NestMiddleware, PayloadTooLargeException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class BodySizeMiddleware implements NestMiddleware {
  private readonly maxSize: number;

  constructor() {
    this.maxSize = 10 * 1024 * 1024; // 10MB
  }

  use(req: Request, res: Response, next: NextFunction) {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    
    if (contentLength > this.maxSize) {
      throw new PayloadTooLargeException(
        `Request body too large. Maximum size is ${this.maxSize / 1024 / 1024}MB`
      );
    }
    
    next();
  }
}
```

### 5. 响应时间中间件

```typescript
// middleware/response-time.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ResponseTimeMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    
    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
    });
    
    // 在响应发送前设置头部
    const originalSend = res.send.bind(res);
    res.send = (body: any) => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
      return originalSend(body);
    };
    
    next();
  }
}
```

## 中间件 vs 守卫 vs 拦截器

| 特性 | 中间件 | 守卫 | 拦截器 |
|------|--------|------|--------|
| 执行时机 | 最先 | 中间件之后 | 守卫之后 |
| 访问 ExecutionContext | ❌ | ✅ | ✅ |
| 访问路由处理程序元数据 | ❌ | ✅ | ✅ |
| 可以终止请求 | ✅ | ✅ | ✅ |
| 可以修改响应 | ⚠️ 有限 | ❌ | ✅ |
| 依赖注入 | ⚠️ 类中间件支持 | ✅ | ✅ |
| 典型用途 | 日志、CORS、压缩 | 认证、授权 | 响应转换、缓存 |

## 使用第三方中间件

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 安全相关
  app.use(helmet());
  
  // 响应压缩
  app.use(compression());
  
  // Cookie 解析
  app.use(cookieParser('secret'));
  
  // Session
  app.use(session({
    secret: 'my-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 60000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    },
  }));
  
  // Passport 初始化
  app.use(passport.initialize());
  app.use(passport.session());
  
  await app.listen(3000);
}
bootstrap();
```

## 下一步

[👉 06. 异常过滤器 Exception Filters](./06-exception-filters.md)
