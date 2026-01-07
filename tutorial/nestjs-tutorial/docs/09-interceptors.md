# 09. 拦截器 Interceptors

拦截器是使用 `@Injectable()` 装饰器注解的类，实现 `NestInterceptor` 接口。它可以在方法执行前后添加额外逻辑，实现 AOP（面向切面编程）。

## 什么是拦截器？

拦截器具有一系列强大的功能：

- **在方法执行前/后绑定额外逻辑**
- **转换函数返回的结果**
- **转换函数抛出的异常**
- **扩展基本函数行为**
- **根据特定条件完全覆盖函数**（例如缓存）

## 拦截器执行时机

```
请求 → 中间件 → 守卫 → 拦截器(前) → 管道 → 控制器 → 拦截器(后) → 响应
                         ↑                              ↑
                    next.handle() 之前           next.handle() 之后
```

## 拦截器基础

### 基本结构

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  /**
   * @param context - 执行上下文，包含请求信息
   * @param next - CallHandler，调用 handle() 执行路由处理程序
   * @returns Observable - 必须返回 Observable
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('Before...'); // 路由处理程序执行前

    const now = Date.now();

    return next
      .handle() // 调用路由处理程序
      .pipe(
        tap(() => console.log(`After... ${Date.now() - now}ms`)), // 路由处理程序执行后
      );
  }
}
```

### ExecutionContext 详解

`ExecutionContext` 继承自 `ArgumentsHost`，提供了当前执行进程的详细信息：

```typescript
@Injectable()
export class MyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 获取 HTTP 请求/响应
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // 获取当前处理的类
    const controllerClass = context.getClass();
    console.log(controllerClass.name); // 如 'UsersController'

    // 获取当前处理的方法
    const handler = context.getHandler();
    console.log(handler.name); // 如 'findAll'

    // 获取请求类型
    const type = context.getType(); // 'http' | 'ws' | 'rpc'

    return next.handle();
  }
}
```

### CallHandler 详解

`CallHandler` 接口实现了 `handle()` 方法，用于在拦截器中调用路由处理程序：

```typescript
@Injectable()
export class ExampleInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 如果不调用 next.handle()，路由处理程序将不会执行
    // 这可以用于实现缓存等功能

    return next.handle(); // 返回 Observable
  }
}
```

## 常用拦截器示例

### 1. 响应转换拦截器（统一响应格式）

将所有响应包装成统一格式：

```typescript
// interceptors/transform.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// 统一响应接口
export interface Response<T> {
  code: number;
  data: T;
  message: string;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        data,
        message: 'success',
        timestamp: new Date().toISOString(),
      })),
    );
  }
}

// 使用后，原本返回 { name: 'John' } 的接口会变成：
// {
//   "code": 0,
//   "data": { "name": "John" },
//   "message": "success",
//   "timestamp": "2024-01-01T00:00:00.000Z"
// }
```

### 2. 日志拦截器

记录请求和响应信息：

```typescript
// interceptors/logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, query, params } = request;
    const userAgent = request.get('user-agent') || '';
    const ip = request.ip;

    // 请求日志
    this.logger.log(
      `[Request] ${method} ${url} - ${ip} - ${userAgent}`,
    );
    this.logger.debug(`Body: ${JSON.stringify(body)}`);
    this.logger.debug(`Query: ${JSON.stringify(query)}`);
    this.logger.debug(`Params: ${JSON.stringify(params)}`);

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: (data) => {
          // 成功响应日志
          this.logger.log(
            `[Response] ${method} ${url} - ${Date.now() - now}ms`,
          );
          this.logger.debug(`Response: ${JSON.stringify(data)}`);
        },
        error: (error) => {
          // 错误响应日志
          this.logger.error(
            `[Error] ${method} ${url} - ${Date.now() - now}ms - ${error.message}`,
          );
        },
      }),
    );
  }
}
```

### 3. 超时拦截器

为请求设置超时时间：

```typescript
// interceptors/timeout.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs: number = 5000) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () => new RequestTimeoutException('请求超时，请稍后重试'),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}

// 使用时可以指定超时时间
// @UseInterceptors(new TimeoutInterceptor(10000)) // 10秒超时
```

### 4. 缓存拦截器

实现简单的内存缓存：

```typescript
// interceptors/cache.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

interface CacheEntry {
  data: any;
  expiry: number;
}

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private cache = new Map<string, CacheEntry>();
  private readonly ttl: number; // 缓存时间（毫秒）

  constructor(ttlSeconds: number = 60) {
    this.ttl = ttlSeconds * 1000;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 只缓存 GET 请求
    const request = context.switchToHttp().getRequest();
    if (request.method !== 'GET') {
      return next.handle();
    }

    const key = this.generateCacheKey(request);
    const cached = this.cache.get(key);

    // 检查缓存是否存在且未过期
    if (cached && cached.expiry > Date.now()) {
      console.log(`Cache hit: ${key}`);
      return of(cached.data); // 直接返回缓存数据，不执行路由处理程序
    }

    console.log(`Cache miss: ${key}`);

    return next.handle().pipe(
      tap((data) => {
        // 缓存响应数据
        this.cache.set(key, {
          data,
          expiry: Date.now() + this.ttl,
        });
      }),
    );
  }

  private generateCacheKey(request: any): string {
    return `${request.method}:${request.url}`;
  }
}
```

### 5. 异常映射拦截器

转换特定异常：

```typescript
// interceptors/errors.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadGatewayException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((err) => {
        // 将特定错误转换为其他错误
        if (err.code === 'ECONNREFUSED') {
          return throwError(() => new BadGatewayException('服务暂时不可用'));
        }
        return throwError(() => err);
      }),
    );
  }
}
```

### 6. 排除空值拦截器

从响应中移除 null 和 undefined：

```typescript
// interceptors/exclude-null.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ExcludeNullInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => this.removeNullValues(data)),
    );
  }

  private removeNullValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return undefined;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeNullValues(item));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const key of Object.keys(obj)) {
        const value = this.removeNullValues(obj[key]);
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }

    return obj;
  }
}
```

### 7. 序列化拦截器（配合 class-transformer）

```typescript
// interceptors/serialize.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { plainToInstance, ClassConstructor } from 'class-transformer';

export function Serialize<T>(dto: ClassConstructor<T>) {
  return new SerializeInterceptor(dto);
}

@Injectable()
export class SerializeInterceptor<T> implements NestInterceptor {
  constructor(private dto: ClassConstructor<T>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) =>
        plainToInstance(this.dto, data, {
          excludeExtraneousValues: true, // 只包含 @Expose() 标记的字段
        }),
      ),
    );
  }
}

// 使用示例
// DTO 定义
import { Expose, Exclude } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  email: string;

  @Exclude()
  password: string; // 不会出现在响应中
}

// 控制器中使用
@Get(':id')
@UseInterceptors(Serialize(UserResponseDto))
findOne(@Param('id') id: string) {
  return this.usersService.findOne(+id);
}
```

## 应用拦截器

### 方法级别

```typescript
import { UseInterceptors } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get()
  @UseInterceptors(LoggingInterceptor)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @UseInterceptors(LoggingInterceptor, CacheInterceptor)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }
}
```

### 控制器级别

```typescript
@Controller('users')
@UseInterceptors(LoggingInterceptor)
export class UsersController {
  // 所有方法都会使用 LoggingInterceptor
}
```

### 全局级别

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.listen(3000);
}
```

### 全局级别（支持依赖注入）

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
```

## 拦截器执行顺序

多个拦截器的执行顺序：

```typescript
// 假设有三个拦截器：A, B, C
// @UseInterceptors(A, B, C)

// 请求进入时（洋葱模型外层到内层）：
// A.intercept() before next.handle()
// B.intercept() before next.handle()
// C.intercept() before next.handle()
// 执行路由处理程序
// C.intercept() after next.handle()
// B.intercept() after next.handle()
// A.intercept() after next.handle()
```

## 拦截器 vs 中间件

| 特性 | 拦截器 | 中间件 |
|------|--------|--------|
| 执行时机 | 守卫之后，管道之前 | 最先执行 |
| 访问响应 | ✅ 可以修改响应 | ❌ 不方便 |
| 依赖注入 | ✅ 支持 | ⚠️ 类中间件支持 |
| 执行上下文 | ✅ 有 ExecutionContext | ❌ 无 |
| RxJS 支持 | ✅ 原生支持 | ❌ 不支持 |
| 适用场景 | 响应转换、日志、缓存 | 认证、CORS、压缩 |

## 下一步

[👉 10. 自定义装饰器](./10-custom-decorators.md)
