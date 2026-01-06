# 08. 守卫 Guards

守卫（Guard）用于实现授权逻辑，决定请求是否应该被路由处理程序处理。

## 守卫的作用

守卫根据运行时的特定条件（如权限、角色、ACL 等）来决定请求是否继续处理。与中间件不同，守卫可以访问 `ExecutionContext`，知道接下来要执行什么。

## 请求生命周期中的位置

```
Client Request
      │
      ▼
  Middleware
      │
      ▼
┌─────────────────┐
│     Guards      │  ← 守卫在此执行
│  (授权检查)      │
└─────────────────┘
      │
      ▼
  Interceptors (前置)
      │
      ▼
    Pipes
      │
      ▼
  Controller
      │
      ▼
  Interceptors (后置)
      │
      ▼
   Response
```

## 创建守卫

### 基础守卫

```typescript
// guards/auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization;
    
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }
    
    // 验证 token 的逻辑
    return this.validateToken(token);
  }

  private validateToken(token: string): boolean {
    // 实际验证逻辑
    return token === 'valid-token';
  }
}
```

### JWT 认证守卫

```typescript
// guards/jwt-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Token not found');
    }
    
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
      
      // 将用户信息附加到请求对象
      request['user'] = payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
    
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

## 使用 ExecutionContext

`ExecutionContext` 继承自 `ArgumentsHost`，提供了更多关于当前执行上下文的信息：

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class AdvancedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // 获取控制器类
    const controller = context.getClass();
    console.log('Controller:', controller.name);
    
    // 获取处理方法
    const handler = context.getHandler();
    console.log('Handler:', handler.name);
    
    // 获取请求类型 (http, ws, rpc)
    const type = context.getType();
    console.log('Type:', type);
    
    // 获取 HTTP 请求/响应
    if (type === 'http') {
      const request = context.switchToHttp().getRequest();
      const response = context.switchToHttp().getResponse();
      const next = context.switchToHttp().getNext();
    }
    
    // WebSocket
    if (type === 'ws') {
      const client = context.switchToWs().getClient();
      const data = context.switchToWs().getData();
    }
    
    // RPC
    if (type === 'rpc') {
      const data = context.switchToRpc().getData();
      const ctx = context.switchToRpc().getContext();
    }
    
    return true;
  }
}
```

## 基于角色的访问控制 (RBAC)

### 定义角色装饰器

```typescript
// decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

### 创建角色守卫

```typescript
// guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 获取路由所需的角色
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(), // 方法级别的元数据
      context.getClass(),   // 控制器级别的元数据
    ]);
    
    // 如果没有设置角色要求，允许访问
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    
    // 获取用户信息（由 AuthGuard 设置）
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }
    
    // 检查用户是否拥有所需角色
    const hasRole = requiredRoles.some((role) => user.roles?.includes(role));
    
    if (!hasRole) {
      throw new ForbiddenException(
        `Required roles: ${requiredRoles.join(', ')}. Your roles: ${user.roles?.join(', ') || 'none'}`,
      );
    }
    
    return true;
  }
}
```

### 在控制器中使用

```typescript
// users.controller.ts
import { Controller, Get, Post, Delete, UseGuards, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard) // 应用守卫
export class UsersController {
  @Get()
  @Roles('admin', 'user') // 需要 admin 或 user 角色
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @Roles('admin') // 只有 admin 可以创建
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Delete(':id')
  @Roles('admin') // 只有 admin 可以删除
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }

  @Get('profile')
  // 没有 @Roles，任何已认证用户都可以访问
  getProfile(@Req() req) {
    return req.user;
  }
}
```

## 基于权限的访问控制

### 定义权限

```typescript
// enums/permission.enum.ts
export enum Permission {
  // 用户权限
  USER_READ = 'user:read',
  USER_CREATE = 'user:create',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  
  // 文章权限
  ARTICLE_READ = 'article:read',
  ARTICLE_CREATE = 'article:create',
  ARTICLE_UPDATE = 'article:update',
  ARTICLE_DELETE = 'article:delete',
}

// decorators/permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Permission } from '../enums/permission.enum';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: Permission[]) => 
  SetMetadata(PERMISSIONS_KEY, permissions);
```

### 权限守卫

```typescript
// guards/permissions.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission } from '../enums/permission.enum';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }
    
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }
    
    // 检查用户是否拥有所有所需权限
    const hasAllPermissions = requiredPermissions.every((permission) =>
      user.permissions?.includes(permission),
    );
    
    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }
    
    return true;
  }
}

// 使用
@Controller('articles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ArticlesController {
  @Get()
  @Permissions(Permission.ARTICLE_READ)
  findAll() {}

  @Post()
  @Permissions(Permission.ARTICLE_CREATE)
  create() {}

  @Delete(':id')
  @Permissions(Permission.ARTICLE_DELETE)
  remove() {}
}
```

## 组合多个守卫

守卫按数组顺序执行，全部返回 true 才继续：

```typescript
// 方法级别组合
@Get('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
@Permissions(Permission.ADMIN_DASHBOARD)
adminDashboard() {}

// 控制器级别 + 方法级别
@Controller('admin')
@UseGuards(JwtAuthGuard) // 所有路由都需要认证
export class AdminController {
  @Get('users')
  @UseGuards(RolesGuard) // 额外的角色检查
  @Roles('admin')
  getUsers() {}
}
```

## 公开路由装饰器

```typescript
// decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// guards/jwt-auth.guard.ts (修改版)
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 检查是否是公开路由
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (isPublic) {
      return true; // 公开路由，跳过认证
    }
    
    // 正常的 JWT 验证逻辑...
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException();
    }
    
    try {
      const payload = await this.jwtService.verifyAsync(token);
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException();
    }
    
    return true;
  }
}

// 使用
@Controller('auth')
export class AuthController {
  @Post('login')
  @Public() // 公开路由，不需要认证
  login(@Body() loginDto: LoginDto) {}

  @Post('register')
  @Public() // 公开路由
  register(@Body() registerDto: RegisterDto) {}
}
```

## 应用守卫的方式

### 1. 方法级别

```typescript
@Controller('users')
export class UsersController {
  @Get()
  @UseGuards(AuthGuard)
  findAll() {}
}
```

### 2. 控制器级别

```typescript
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  // 所有方法都受保护
}
```

### 3. 全局级别（main.ts）

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalGuards(new AuthGuard());
  await app.listen(3000);
}
```

### 4. 全局级别（模块方式，支持依赖注入）

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // 先执行
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard, // 后执行
    },
  ],
})
export class AppModule {}
```

## 守卫执行顺序

```
全局守卫 → 控制器守卫 → 方法守卫
```

多个守卫按注册顺序执行，任何一个返回 false 或抛出异常都会终止请求。

## 资源所有权守卫

```typescript
// guards/ownership.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resourceId = parseInt(request.params.id, 10);
    
    // 管理员可以访问所有资源
    if (user.roles?.includes('admin')) {
      return true;
    }
    
    // 检查资源是否属于当前用户
    const resource = await this.usersService.findOne(resourceId);
    
    if (!resource) {
      throw new ForbiddenException('Resource not found');
    }
    
    if (resource.id !== user.id) {
      throw new ForbiddenException('You can only access your own resources');
    }
    
    return true;
  }
}

// 使用
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get(':id')
  @UseGuards(OwnershipGuard)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(OwnershipGuard)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }
}
```

## API 密钥守卫

```typescript
// guards/api-key.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const validApiKey = this.configService.get<string>('API_KEY');
    
    if (!apiKey || apiKey !== validApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }
    
    return true;
  }
}
```

## 节流守卫

```typescript
// guards/throttle.guard.ts
import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

interface ThrottleOptions {
  limit: number;
  ttl: number; // 秒
}

export const THROTTLE_KEY = 'throttle';
export const Throttle = (limit: number, ttl: number) => 
  SetMetadata(THROTTLE_KEY, { limit, ttl });

@Injectable()
export class ThrottleGuard implements CanActivate {
  private requests = new Map<string, { count: number; resetTime: number }>();

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.get<ThrottleOptions>(
      THROTTLE_KEY,
      context.getHandler(),
    );
    
    if (!options) {
      return true; // 没有限流配置
    }
    
    const request = context.switchToHttp().getRequest();
    const key = `${request.ip}:${request.url}`;
    const now = Date.now();
    
    const record = this.requests.get(key);
    
    if (!record || now > record.resetTime) {
      this.requests.set(key, {
        count: 1,
        resetTime: now + options.ttl * 1000,
      });
      return true;
    }
    
    if (record.count >= options.limit) {
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    
    record.count++;
    return true;
  }
}

// 使用
@Controller('api')
export class ApiController {
  @Post('send-email')
  @Throttle(5, 60) // 每分钟最多 5 次
  @UseGuards(ThrottleGuard)
  sendEmail() {}
}
```

## 守卫 vs 中间件

| 特性 | 守卫 | 中间件 |
|------|------|--------|
| 执行时机 | 中间件之后 | 最先执行 |
| 访问 ExecutionContext | ✅ | ❌ |
| 访问路由元数据 | ✅ | ❌ |
| 依赖注入 | ✅ | ⚠️ 类中间件支持 |
| 典型用途 | 授权、角色检查 | 日志、CORS、压缩 |

## 守卫最佳实践

1. **分离认证和授权** - AuthGuard 处理认证，RolesGuard 处理授权
2. **使用装饰器定义元数据** - @Roles, @Permissions 等
3. **全局守卫 + 公开路由** - 默认保护所有路由
4. **使用 Reflector 读取元数据** - 获取装饰器设置的值
5. **提供清晰的错误消息** - 帮助调试和用户理解

## 下一步

[👉 09. 拦截器 Interceptors](./09-interceptors.md)
