# 06. 异常过滤器 Exception Filters

异常过滤器用于处理应用程序中抛出的异常，提供统一的错误响应格式。

## 内置异常处理

NestJS 内置了全局异常过滤器，处理所有 `HttpException` 类型的异常：

```typescript
// 默认响应格式
{
  "statusCode": 500,
  "message": "Internal server error"
}

// HttpException 响应格式
{
  "statusCode": 404,
  "message": "User not found"
}
```

## 内置 HTTP 异常

NestJS 提供了一系列内置的 HTTP 异常类：

```typescript
import {
  BadRequestException,           // 400
  UnauthorizedException,         // 401
  PaymentRequiredException,      // 402
  ForbiddenException,            // 403
  NotFoundException,             // 404
  MethodNotAllowedException,     // 405
  NotAcceptableException,        // 406
  RequestTimeoutException,       // 408
  ConflictException,             // 409
  GoneException,                 // 410
  PayloadTooLargeException,      // 413
  UnsupportedMediaTypeException, // 415
  UnprocessableEntityException,  // 422
  InternalServerErrorException,  // 500
  NotImplementedException,       // 501
  BadGatewayException,           // 502
  ServiceUnavailableException,   // 503
  GatewayTimeoutException,       // 504
} from '@nestjs/common';
```

### 使用内置异常

```typescript
// 简单使用
throw new NotFoundException('User not found');

// 带详细信息
throw new BadRequestException({
  message: 'Validation failed',
  errors: ['email must be a valid email', 'password is too short'],
});

// 自定义错误码
throw new HttpException(
  {
    statusCode: 400,
    errorCode: 'USER_001',
    message: 'Invalid user data',
    timestamp: new Date().toISOString(),
  },
  HttpStatus.BAD_REQUEST,
);
```

## 创建自定义异常

### 基础自定义异常

```typescript
// exceptions/business.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  constructor(
    message: string,
    errorCode: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        statusCode,
        errorCode,
        message,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );
  }
}

// 使用
throw new BusinessException('用户余额不足', 'BALANCE_INSUFFICIENT');
```

### 领域特定异常

```typescript
// exceptions/user.exceptions.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class UserNotFoundException extends HttpException {
  constructor(userId: number | string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        errorCode: 'USER_NOT_FOUND',
        message: `User with ID ${userId} not found`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class UserAlreadyExistsException extends HttpException {
  constructor(email: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        errorCode: 'USER_ALREADY_EXISTS',
        message: `User with email ${email} already exists`,
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidCredentialsException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

// 使用
throw new UserNotFoundException(123);
throw new UserAlreadyExistsException('test@example.com');
throw new InvalidCredentialsException();
```

## 创建异常过滤器

### 基础异常过滤器

```typescript
// filters/http-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // 构建错误响应
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: typeof exceptionResponse === 'string' 
        ? exceptionResponse 
        : (exceptionResponse as any).message || 'Unknown error',
      ...(typeof exceptionResponse === 'object' ? exceptionResponse : {}),
    };

    // 记录日志
    this.logger.error(
      `${request.method} ${request.url} ${status} - ${JSON.stringify(errorResponse)}`,
    );

    response.status(status).json(errorResponse);
  }
}
```

### 全局异常过滤器（捕获所有异常）

```typescript
// filters/all-exceptions.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch() // 捕获所有异常
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 确定状态码
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 确定错误消息
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      message = typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || message;
      errorCode = (exceptionResponse as any).errorCode || errorCode;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // 构建错误响应
    const errorResponse = {
      statusCode: status,
      errorCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    };

    // 记录日志（生产环境记录完整堆栈）
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} ${status} - ${message}`,
      );
    }

    response.status(status).json(errorResponse);
  }
}
```

## 应用异常过滤器

### 1. 方法级别

```typescript
import { Controller, Get, UseFilters } from '@nestjs/common';
import { HttpExceptionFilter } from './filters/http-exception.filter';

@Controller('users')
export class UsersController {
  @Get(':id')
  @UseFilters(HttpExceptionFilter) // 只应用于此方法
  findOne(@Param('id') id: string) {
    throw new NotFoundException('User not found');
  }
}
```

### 2. 控制器级别

```typescript
@Controller('users')
@UseFilters(HttpExceptionFilter) // 应用于整个控制器
export class UsersController {
  // 所有方法都使用此过滤器
}
```

### 3. 全局级别（推荐）

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());
  
  await app.listen(3000);
}
bootstrap();
```

### 4. 全局级别（支持依赖注入）

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
```

## 带依赖注入的异常过滤器

```typescript
// filters/database-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Response } from 'express';
import { LoggerService } from '../logger/logger.service';
import { ConfigService } from '@nestjs/config';

// 假设这是 Prisma 的错误类型
class PrismaClientKnownRequestError extends Error {
  code: string;
  meta?: Record<string, any>;
}

@Injectable()
@Catch(PrismaClientKnownRequestError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  constructor(
    private logger: LoggerService,
    private configService: ConfigService,
  ) {}

  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const isDevelopment = this.configService.get('NODE_ENV') === 'development';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';
    let errorCode = 'DATABASE_ERROR';

    // 根据 Prisma 错误码处理
    switch (exception.code) {
      case 'P2002': // Unique constraint violation
        status = HttpStatus.CONFLICT;
        message = 'Resource already exists';
        errorCode = 'DUPLICATE_ENTRY';
        break;
      case 'P2025': // Record not found
        status = HttpStatus.NOT_FOUND;
        message = 'Resource not found';
        errorCode = 'NOT_FOUND';
        break;
      case 'P2003': // Foreign key constraint violation
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid reference';
        errorCode = 'INVALID_REFERENCE';
        break;
      default:
        this.logger.error('Unhandled database error', exception.stack);
    }

    const errorResponse: any = {
      statusCode: status,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
    };

    // 开发环境显示更多信息
    if (isDevelopment) {
      errorResponse.debug = {
        code: exception.code,
        meta: exception.meta,
      };
    }

    response.status(status).json(errorResponse);
  }
}
```

## 多个异常过滤器

可以捕获多种类型的异常：

```typescript
// 捕获多种异常类型
@Catch(HttpException, QueryFailedError, EntityNotFoundError)
export class MultiExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException | QueryFailedError | EntityNotFoundError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      // 处理 HTTP 异常
      return response.status(exception.getStatus()).json(exception.getResponse());
    }

    if (exception instanceof EntityNotFoundError) {
      // 处理实体未找到
      return response.status(404).json({
        statusCode: 404,
        message: 'Resource not found',
      });
    }

    // 处理数据库查询错误
    return response.status(500).json({
      statusCode: 500,
      message: 'Database error',
    });
  }
}
```

## 异常过滤器执行顺序

当有多个过滤器时，执行顺序如下：

```
异常抛出
    │
    ▼
┌─────────────────────────────────────────┐
│ 方法级过滤器 (最先匹配的执行)            │
├─────────────────────────────────────────┤
│ 控制器级过滤器 (如果方法级未处理)        │
├─────────────────────────────────────────┤
│ 全局过滤器 (如果以上都未处理)            │
├─────────────────────────────────────────┤
│ 内置异常处理器 (最后的兜底)              │
└─────────────────────────────────────────┘
```

**注意**：更具体的异常类型过滤器会先被匹配。

## 完整的异常处理方案

```typescript
// exceptions/index.ts - 统一导出
export * from './business.exception';
export * from './user.exceptions';
export * from './validation.exception';

// exceptions/validation.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export interface ValidationError {
  field: string;
  message: string;
}

export class ValidationException extends HttpException {
  constructor(errors: ValidationError[]) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

// filters/validation-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { ValidationException } from '../exceptions/validation.exception';

@Catch(ValidationException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: ValidationException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    response.status(status).json({
      statusCode: status,
      errorCode: exceptionResponse.errorCode,
      message: exceptionResponse.message,
      errors: exceptionResponse.errors,
      timestamp: new Date().toISOString(),
    });
  }
}
```

## 统一错误响应格式

建议定义统一的错误响应接口：

```typescript
// interfaces/error-response.interface.ts
export interface ErrorResponse {
  statusCode: number;
  errorCode: string;
  message: string;
  timestamp: string;
  path?: string;
  method?: string;
  errors?: any[];
  stack?: string; // 仅开发环境
}
```

## 异常过滤器最佳实践

1. **使用全局异常过滤器** - 确保所有异常都被处理
2. **定义领域特定异常** - 提高代码可读性
3. **统一错误响应格式** - 方便前端处理
4. **区分环境** - 生产环境隐藏敏感信息
5. **记录日志** - 便于问题排查
6. **使用错误码** - 方便国际化和问题定位

## 下一步

[👉 07. 管道 Pipes](./07-pipes.md)
