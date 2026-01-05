# 10. 自定义装饰器

自定义装饰器可以简化代码，提高可读性。

## 参数装饰器

```typescript
// decorators/user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);

// 使用
@Get('profile')
getProfile(@CurrentUser() user: User) {
  return user;
}

@Get('email')
getEmail(@CurrentUser('email') email: string) {
  return { email };
}
```

## 组合装饰器

```typescript
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

export function Auth(...roles: string[]) {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}

// 使用
@Controller('admin')
export class AdminController {
  @Get('dashboard')
  @Auth('admin')
  getDashboard() {
    return { message: 'Admin Dashboard' };
  }
}
```

## 方法装饰器

```typescript
// decorators/log.decorator.ts
export function Log(message?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      console.log(`[${message || propertyKey}] Called with:`, args);
      const start = Date.now();
      const result = await originalMethod.apply(this, args);
      console.log(`[${message || propertyKey}] Completed in ${Date.now() - start}ms`);
      return result;
    };

    return descriptor;
  };
}

// 使用
@Injectable()
export class UsersService {
  @Log('Creating user')
  async create(dto: CreateUserDto) {
    // ...
  }
}
```

## 类装饰器

```typescript
export function Controller(prefix: string) {
  return function (target: Function) {
    Reflect.defineMetadata('prefix', prefix, target);
  };
}
```

## 下一步

[👉 11. Prisma 6 入门与配置](./11-prisma-basics.md)

