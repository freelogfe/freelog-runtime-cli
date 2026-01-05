# 06. 异常过滤器 Exception Filters

异常过滤器用于处理应用程序中抛出的异常，提供统一的错误响应格式。

## 内置异常

NestJS 提供了一系列内置的 HTTP 异常：

```typescript
import {
  BadRequestException,         // 400
  UnauthorizedException,       // 401
  ForbiddenException,          // 403
  NotFoundException,           // 404
  MethodNotAllowedException,   // 405
  NotAcceptableException,      // 406
  RequestTimeoutException,     // 408
  ConflictException,           // 409
  GoneException,               // 410
  PayloadTooLargeException,    // 413
  UnsupportedMediaTypeException, // 415
  UnprocessableEntityException,  // 422
  InternalServerErrorException,  // 500
  NotImplementedException,       // 501
  BadGatewayException,           // 502
  ServiceUnavailableException,   // 503
  GatewayTimeoutException,       // 504
  HttpException,                 // 自定义状态码
} from '@nestjs/common';
```

## 使用内置异常

```typescript
import { Controller, Get, Param, NotFoundException, BadRequestException } from '@nestjs/common';

@Controller('users')
export class UsersController {
  
  @Get(':id')
  findOne(@Param('id') id: string) {
    const user = this.findUser(id);
    
    if (!user) {
      // 简单消息
      throw new NotFoundException('User not found');
      
      // 或带详细信息
      throw new NotFoundException({
        statusCode: 404,
        message: 'User not found',
        error: 'Not Found',
        userId: id,
      });
    }
    
    return user;
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    if (!dto.email) {
      throw new BadRequestException('Email is required');
    }
    // ...
  }
}
```

## 自定义 HttpException

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';

// 基本用法
throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

// 自定义响应体
throw new HttpException(
  {
    status: HttpStatus.FORBIDDEN,
    error: 'This is a custom message',
    timestamp: new Date().toISOString(),
  },
  HttpStatus.FORBIDDEN,
);

// 带 cause (错误链)
try {
  await someOperation();
} catch (error) {
  throw new HttpException('Operation failed', HttpStatus.BAD_REQUEST, {
    cause: error,
  });
}
```

## 自定义异常类

```typescript
// exceptions/business.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        code,
        message,
        timestamp: new Date().toISOString(),
      },
      status,
    );
  }
}

// 使用
throw new BusinessException('USER_001', 'User already exists');
throw new BusinessException('ORDER_002', 'Insufficient inventory', HttpStatus.CONFLICT);
```

```typescript
// exceptions/validation.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(errors: Record<string, string[]>) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Validation failed',
        errors,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

// 使用
throw new ValidationException({
  email: ['Email is invalid', 'Email already exists'],
  password: ['Password is too short'],
});
```

## 创建异常过滤器

### 捕获所有异常

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

@Catch() // 不传参数表示捕获所有异常
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        error = (exceptionResponse as any).error || error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // 记录错误日志
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
    });
  }
}
```

### 捕获特定异常

```typescript
// filters/http-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException) // 只捕获 HttpException
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(typeof exceptionResponse === 'object' ? exceptionResponse : { message: exceptionResponse }),
    });
  }
}
```

### 捕获多种异常

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch(TypeError, ReferenceError)
export class JavaScriptExceptionFilter extends BaseExceptionFilter {
  catch(exception: TypeError | ReferenceError, host: ArgumentsHost) {
    // 处理 JavaScript 原生错误
    console.error('JavaScript Error:', exception.message);
    super.catch(exception, host);
  }
}
```

## 应用异常过滤器

### 方法级别

```typescript
@Controller('users')
export class UsersController {
  @Get(':id')
  @UseFilters(HttpExceptionFilter)
  findOne(@Param('id') id: string) {
    throw new NotFoundException('User not found');
  }
}
```

### 控制器级别

```typescript
@Controller('users')
@UseFilters(HttpExceptionFilter)
export class UsersController {
  // 所有方法都会使用这个过滤器
}
```

### 全局级别

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(3000);
}
bootstrap();
```

### 全局级别 (支持依赖注入)

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

## 完整示例：生产级异常过滤器

```typescript
// filters/global-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
  stack?: string;
  requestId?: string;
}

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isDev: boolean;

  constructor(private configService: ConfigService) {
    this.isDev = this.configService.get('NODE_ENV') !== 'production';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.getErrorDetails(exception);
    const requestId = request.headers['x-request-id'] as string;

    // 构建错误响应
    const errorResponse: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
      requestId,
    };

    // 开发环境显示堆栈
    if (this.isDev && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    // 记录日志
    this.logError(exception, request, status);

    response.status(status).json(errorResponse);
  }

  private getErrorDetails(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return { status, message: response, error: 'Error' };
      }

      return {
        status,
        message: (response as any).message || 'Error',
        error: (response as any).error || 'Error',
      };
    }

    // 处理 Prisma 错误
    if ((exception as any)?.code?.startsWith('P')) {
      return this.handlePrismaError(exception as any);
    }

    // 处理其他错误
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: exception instanceof Error ? exception.message : 'Internal server error',
      error: 'Internal Server Error',
    };
  }

  private handlePrismaError(exception: { code: string; meta?: any }): {
    status: number;
    message: string;
    error: string;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: `Duplicate entry for ${exception.meta?.target?.join(', ')}`,
          error: 'Conflict',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Database error',
          error: 'Bad Request',
        };
    }
  }

  private logError(exception: unknown, request: Request, status: number) {
    const message = exception instanceof Error ? exception.message : 'Unknown error';
    const stack = exception instanceof Error ? exception.stack : undefined;

    const logMessage = `${request.method} ${request.url} - ${status} - ${message}`;

    if (status >= 500) {
      this.logger.error(logMessage, stack);
    } else if (status >= 400) {
      this.logger.warn(logMessage);
    }
  }
}
```

## 下一步

[👉 07. 管道 Pipes 与数据验证](./07-pipes.md)

