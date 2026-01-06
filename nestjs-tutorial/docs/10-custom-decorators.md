# 10. 自定义装饰器

装饰器是 TypeScript 的一个特性，NestJS 大量使用装饰器来实现各种功能。自定义装饰器可以简化代码，提高可读性和复用性。

## 装饰器类型概览

```typescript
// 类装饰器
@Controller('users')
class UsersController {}

// 方法装饰器
@Get(':id')
findOne() {}

// 属性装饰器
@Inject('CONFIG')
private config: any;

// 参数装饰器
findOne(@Param('id') id: string) {}
```

## 参数装饰器

参数装饰器是最常用的自定义装饰器类型，用于从请求中提取数据。

### 基本用法 - createParamDecorator

```typescript
// decorators/user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 获取当前登录用户
 * @param data - 可选的属性名，如果提供则返回该属性
 * @param ctx - 执行上下文
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    // 获取请求对象
    const request = ctx.switchToHttp().getRequest();
    
    // 假设用户信息已通过守卫附加到 request.user
    const user = request.user;

    // 如果指定了属性名，返回该属性；否则返回整个用户对象
    return data ? user?.[data] : user;
  },
);
```

### 使用示例

```typescript
@Controller('users')
export class UsersController {
  // 获取整个用户对象
  @Get('profile')
  getProfile(@CurrentUser() user: User) {
    return user;
  }

  // 只获取用户 ID
  @Get('my-id')
  getMyId(@CurrentUser('id') userId: number) {
    return { userId };
  }

  // 只获取邮箱
  @Get('my-email')
  getMyEmail(@CurrentUser('email') email: string) {
    return { email };
  }
}
```

### 更多参数装饰器示例

#### 1. 获取客户端真实 IP

```typescript
// decorators/real-ip.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const RealIP = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    
    // 尝试从各种头部获取真实 IP
    const forwarded = request.headers['x-forwarded-for'];
    const realIp = request.headers['x-real-ip'];
    
    if (forwarded) {
      // x-forwarded-for 可能包含多个 IP，取第一个
      return forwarded.split(',')[0].trim();
    }
    
    if (realIp) {
      return realIp;
    }
    
    return request.ip || request.connection.remoteAddress;
  },
);

// 使用
@Get('log')
logVisit(@RealIP() ip: string) {
  console.log(`Visitor IP: ${ip}`);
  return { ip };
}
```

#### 2. 获取 User-Agent 信息

```typescript
// decorators/user-agent.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface UserAgentInfo {
  raw: string;
  browser?: string;
  os?: string;
  device?: string;
}

export const UserAgent = createParamDecorator(
  (data: keyof UserAgentInfo | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const ua = request.headers['user-agent'] || '';
    
    const info: UserAgentInfo = {
      raw: ua,
      browser: detectBrowser(ua),
      os: detectOS(ua),
      device: detectDevice(ua),
    };
    
    return data ? info[data] : info;
  },
);

function detectBrowser(ua: string): string {
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown';
}

function detectOS(ua: string): string {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iOS')) return 'iOS';
  return 'Unknown';
}

function detectDevice(ua: string): string {
  if (ua.includes('Mobile')) return 'Mobile';
  if (ua.includes('Tablet')) return 'Tablet';
  return 'Desktop';
}

// 使用
@Get('device-info')
getDeviceInfo(@UserAgent() ua: UserAgentInfo) {
  return ua;
}

@Get('browser')
getBrowser(@UserAgent('browser') browser: string) {
  return { browser };
}
```

#### 3. 获取分页参数

```typescript
// decorators/pagination.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export const Pagination = createParamDecorator(
  (data: { maxLimit?: number } = {}, ctx: ExecutionContext): PaginationParams => {
    const request = ctx.switchToHttp().getRequest();
    const { maxLimit = 100 } = data;
    
    let page = parseInt(request.query.page, 10) || 1;
    let limit = parseInt(request.query.limit, 10) || 10;
    
    // 确保值合理
    page = Math.max(1, page);
    limit = Math.min(Math.max(1, limit), maxLimit);
    
    const skip = (page - 1) * limit;
    
    return { page, limit, skip };
  },
);

// 使用
@Get()
findAll(@Pagination({ maxLimit: 50 }) pagination: PaginationParams) {
  const { page, limit, skip } = pagination;
  return this.usersService.findAll({ skip, take: limit });
}
```

#### 4. 获取语言/区域设置

```typescript
// decorators/lang.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Lang = createParamDecorator(
  (defaultLang: string = 'en', ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    
    // 优先级：查询参数 > 请求头 > 默认值
    const queryLang = request.query.lang;
    const headerLang = request.headers['accept-language']?.split(',')[0]?.split('-')[0];
    
    return queryLang || headerLang || defaultLang;
  },
);

// 使用
@Get('greeting')
getGreeting(@Lang('zh') lang: string) {
  const greetings = {
    en: 'Hello',
    zh: '你好',
    ja: 'こんにちは',
  };
  return { message: greetings[lang] || greetings.en };
}
```

## 组合装饰器

使用 `applyDecorators` 将多个装饰器组合成一个：

### 基本用法

```typescript
// decorators/auth.decorator.ts
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * 组合认证装饰器
 * 包含：JWT 守卫、角色守卫、Swagger 文档
 */
export function Auth(...roles: string[]) {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: '未授权访问' }),
  );
}

// 使用前
@Controller('admin')
export class AdminController {
  @Get('dashboard')
  @SetMetadata('roles', ['admin'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: '未授权访问' })
  getDashboard() {
    return { message: 'Admin Dashboard' };
  }
}

// 使用后 - 简洁多了！
@Controller('admin')
export class AdminController {
  @Get('dashboard')
  @Auth('admin')
  getDashboard() {
    return { message: 'Admin Dashboard' };
  }
}
```

### 更多组合装饰器示例

#### 1. API 版本控制

```typescript
// decorators/api-version.decorator.ts
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { VersionGuard } from '../guards/version.guard';

export function ApiVersion(version: string) {
  return applyDecorators(
    SetMetadata('apiVersion', version),
    UseGuards(VersionGuard),
    ApiHeader({
      name: 'X-API-Version',
      description: `API 版本，当前为 ${version}`,
      required: false,
    }),
  );
}

// 使用
@Controller('users')
@ApiVersion('v2')
export class UsersV2Controller {}
```

#### 2. 公开接口标记

```typescript
// decorators/public.decorator.ts
import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

export const IS_PUBLIC_KEY = 'isPublic';

export function Public(description?: string) {
  return applyDecorators(
    SetMetadata(IS_PUBLIC_KEY, true),
    ApiOperation({ 
      summary: description,
      description: '此接口无需认证即可访问',
    }),
  );
}

// 使用
@Controller('auth')
export class AuthController {
  @Post('login')
  @Public('用户登录')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

#### 3. 缓存控制

```typescript
// decorators/cache.decorator.ts
import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor } from '../interceptors/cache.interceptor';

export function Cacheable(ttlSeconds: number = 60) {
  return applyDecorators(
    SetMetadata('cacheTTL', ttlSeconds),
    UseInterceptors(CacheInterceptor),
  );
}

// 使用
@Get('popular')
@Cacheable(300) // 缓存 5 分钟
getPopularPosts() {
  return this.postsService.getPopular();
}
```

## 方法装饰器

方法装饰器可以修改方法的行为：

### 1. 日志装饰器

```typescript
// decorators/log.decorator.ts
export function Log(message?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const methodName = message || propertyKey;

    descriptor.value = async function (...args: any[]) {
      console.log(`[${methodName}] 开始执行，参数:`, JSON.stringify(args));
      const start = Date.now();

      try {
        const result = await originalMethod.apply(this, args);
        console.log(
          `[${methodName}] 执行成功，耗时: ${Date.now() - start}ms`,
        );
        return result;
      } catch (error) {
        console.error(
          `[${methodName}] 执行失败，耗时: ${Date.now() - start}ms`,
          error,
        );
        throw error;
      }
    };

    return descriptor;
  };
}

// 使用
@Injectable()
export class UsersService {
  @Log('创建用户')
  async create(dto: CreateUserDto) {
    // ...
  }

  @Log() // 使用方法名作为日志标识
  async findAll() {
    // ...
  }
}
```

### 2. 重试装饰器

```typescript
// decorators/retry.decorator.ts
export function Retry(maxAttempts: number = 3, delayMs: number = 1000) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error;
          console.warn(
            `[${propertyKey}] 第 ${attempt} 次尝试失败: ${error.message}`,
          );

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }

      throw lastError;
    };

    return descriptor;
  };
}

// 使用
@Injectable()
export class ExternalApiService {
  @Retry(3, 2000) // 最多重试 3 次，每次间隔 2 秒
  async fetchData() {
    // 调用外部 API
  }
}
```

### 3. 性能监控装饰器

```typescript
// decorators/measure.decorator.ts
export function Measure() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;

    descriptor.value = async function (...args: any[]) {
      const start = process.hrtime.bigint();
      
      try {
        return await originalMethod.apply(this, args);
      } finally {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;
        
        // 可以发送到监控系统
        console.log(`[Performance] ${className}.${propertyKey}: ${durationMs.toFixed(2)}ms`);
      }
    };

    return descriptor;
  };
}
```

## 类装饰器

### 1. 给类添加元数据

```typescript
// decorators/entity.decorator.ts
export function Entity(tableName: string) {
  return function (target: Function) {
    Reflect.defineMetadata('tableName', tableName, target);
  };
}

// 使用
@Entity('users')
class User {
  id: number;
  name: string;
}

// 读取元数据
const tableName = Reflect.getMetadata('tableName', User); // 'users'
```

### 2. 自动注册控制器

```typescript
// decorators/api-controller.decorator.ts
import { Controller, applyDecorators } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

export function ApiController(prefix: string, tag?: string) {
  return applyDecorators(
    Controller(prefix),
    ApiTags(tag || prefix),
  );
}

// 使用
@ApiController('users', '用户管理')
export class UsersController {}
```

## 属性装饰器

```typescript
// decorators/default.decorator.ts
export function Default(value: any) {
  return function (target: any, propertyKey: string) {
    let val = value;

    const getter = () => val;
    const setter = (newVal: any) => {
      val = newVal ?? value;
    };

    Object.defineProperty(target, propertyKey, {
      get: getter,
      set: setter,
      enumerable: true,
      configurable: true,
    });
  };
}

// 使用
class Config {
  @Default(3000)
  port: number;

  @Default('development')
  env: string;
}

const config = new Config();
console.log(config.port); // 3000
config.port = null;
console.log(config.port); // 3000 (使用默认值)
```

## 装饰器与管道组合

参数装饰器可以与管道组合使用：

```typescript
// decorators/parse-user.decorator.ts
import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

export const ParseUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new BadRequestException('用户未登录');
    }

    return user;
  },
);

// 使用时结合管道
@Get('profile')
getProfile(
  @ParseUser() user: User,
  @Query('fields', new ParseArrayPipe({ items: String, optional: true })) fields?: string[],
) {
  return this.usersService.getProfile(user.id, fields);
}
```

## 最佳实践

1. **命名清晰**：装饰器名称应该清楚表达其用途
2. **单一职责**：每个装饰器只做一件事
3. **文档注释**：为装饰器添加 JSDoc 注释
4. **类型安全**：尽可能使用 TypeScript 类型
5. **错误处理**：在装饰器中适当处理错误情况

```typescript
/**
 * 获取当前登录用户
 * @param data - 要获取的用户属性名（可选）
 * @returns 用户对象或指定属性
 * @throws UnauthorizedException 如果用户未登录
 * @example
 * // 获取整个用户对象
 * @CurrentUser() user: User
 * 
 * // 只获取用户 ID
 * @CurrentUser('id') userId: number
 */
export const CurrentUser = createParamDecorator(/* ... */);
```

## 下一步

[👉 11. Prisma 6 入门与配置](./11-prisma-basics.md)
