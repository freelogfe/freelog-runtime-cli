# 07. 管道 Pipes

管道（Pipe）用于数据转换和验证，在路由处理程序执行之前对输入数据进行处理。

## 管道的作用

管道有两个典型用例：
1. **转换**：将输入数据转换为所需的形式（如字符串转数字）
2. **验证**：验证输入数据，如果无效则抛出异常

## 请求生命周期中的位置

```
Client Request
      │
      ▼
  Middleware
      │
      ▼
    Guards
      │
      ▼
  Interceptors (前置)
      │
      ▼
┌─────────────────┐
│     Pipes       │  ← 管道在此执行
│  (转换 & 验证)   │
└─────────────────┘
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

## 内置管道

NestJS 提供了多个开箱即用的管道：

```typescript
import {
  ValidationPipe,      // 验证管道（配合 class-validator）
  ParseIntPipe,        // 字符串转整数
  ParseFloatPipe,      // 字符串转浮点数
  ParseBoolPipe,       // 字符串转布尔值
  ParseArrayPipe,      // 字符串转数组
  ParseUUIDPipe,       // 验证并解析 UUID
  ParseEnumPipe,       // 验证并解析枚举
  DefaultValuePipe,    // 设置默认值
  ParseFilePipe,       // 文件验证
} from '@nestjs/common';
```

### 使用内置管道

```typescript
import { Controller, Get, Post, Param, Query, Body, ParseIntPipe, ParseBoolPipe, ParseUUIDPipe, DefaultValuePipe, ParseEnumPipe, HttpStatus } from '@nestjs/common';

enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}

@Controller('users')
export class UsersController {
  // ParseIntPipe - 将字符串转为整数
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    console.log(typeof id); // 'number'
    return `User #${id}`;
  }

  // 自定义错误状态码
  @Get('v2/:id')
  findOneV2(
    @Param('id', new ParseIntPipe({ 
      errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE 
    })) id: number,
  ) {
    return `User #${id}`;
  }

  // ParseBoolPipe - 将字符串转为布尔值
  @Get()
  findAll(
    @Query('active', new ParseBoolPipe({ optional: true })) active?: boolean,
  ) {
    // ?active=true  -> active = true
    // ?active=false -> active = false
    // 无参数       -> active = undefined
    return `Active: ${active}`;
  }

  // DefaultValuePipe - 设置默认值
  @Get('list')
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return `Page: ${page}, Limit: ${limit}`;
  }

  // ParseUUIDPipe - 验证 UUID
  @Get('uuid/:id')
  findByUuid(@Param('id', ParseUUIDPipe) id: string) {
    // 只接受有效的 UUID
    return `User UUID: ${id}`;
  }

  // ParseEnumPipe - 验证枚举值
  @Get('role/:role')
  findByRole(@Param('role', new ParseEnumPipe(UserRole)) role: UserRole) {
    return `Role: ${role}`;
  }

  // ParseArrayPipe - 解析数组
  @Get('batch')
  findBatch(
    @Query('ids', new ParseArrayPipe({ 
      items: Number, 
      separator: ',' 
    })) ids: number[],
  ) {
    // ?ids=1,2,3 -> ids = [1, 2, 3]
    return `IDs: ${ids.join(', ')}`;
  }
}
```

## 自定义管道

### 基础转换管道

```typescript
// pipes/parse-date.pipe.ts
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseDatePipe implements PipeTransform<string, Date> {
  transform(value: string, metadata: ArgumentMetadata): Date {
    const date = new Date(value);
    
    if (isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date format: ${value}`);
    }
    
    return date;
  }
}

// 使用
@Get('events')
findEvents(@Query('date', ParseDatePipe) date: Date) {
  console.log(date instanceof Date); // true
  return `Events on ${date.toISOString()}`;
}
```

### 带选项的管道

```typescript
// pipes/trim-string.pipe.ts
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

export interface TrimOptions {
  toLowerCase?: boolean;
  toUpperCase?: boolean;
}

@Injectable()
export class TrimStringPipe implements PipeTransform<string, string> {
  constructor(private options: TrimOptions = {}) {}

  transform(value: string, metadata: ArgumentMetadata): string {
    if (typeof value !== 'string') {
      return value;
    }
    
    let result = value.trim();
    
    if (this.options.toLowerCase) {
      result = result.toLowerCase();
    } else if (this.options.toUpperCase) {
      result = result.toUpperCase();
    }
    
    return result;
  }
}

// 使用
@Post()
create(
  @Body('name', new TrimStringPipe({ toLowerCase: true })) name: string,
) {
  return `Name: ${name}`;
}
```

### 验证管道

```typescript
// pipes/joi-validation.pipe.ts
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ObjectSchema } from 'joi';

@Injectable()
export class JoiValidationPipe implements PipeTransform {
  constructor(private schema: ObjectSchema) {}

  transform(value: any, metadata: ArgumentMetadata) {
    const { error, value: validatedValue } = this.schema.validate(value, {
      abortEarly: false, // 返回所有错误
    });
    
    if (error) {
      const messages = error.details.map(d => d.message);
      throw new BadRequestException({
        message: 'Validation failed',
        errors: messages,
      });
    }
    
    return validatedValue;
  }
}

// 使用
import * as Joi from 'joi';

const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  age: Joi.number().min(0).max(150).optional(),
});

@Post()
create(@Body(new JoiValidationPipe(createUserSchema)) createUserDto: CreateUserDto) {
  return this.usersService.create(createUserDto);
}
```

## ValidationPipe（推荐）

`ValidationPipe` 配合 `class-validator` 和 `class-transformer` 提供强大的验证功能。

### 安装依赖

```bash
npm install class-validator class-transformer
```

### 创建 DTO

```typescript
// dto/create-user.dto.ts
import {
  IsString,
  IsEmail,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Matches,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}

export class AddressDto {
  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @MinLength(5)
  @MaxLength(10)
  zipCode: string;
}

export class CreateUserDto {
  @IsString()
  @MinLength(2, { message: '名字至少需要 2 个字符' })
  @MaxLength(50, { message: '名字最多 50 个字符' })
  name: string;

  @IsEmail({}, { message: '请提供有效的邮箱地址' })
  email: string;

  @IsString()
  @MinLength(8, { message: '密码至少需要 8 个字符' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: '密码必须包含大小写字母和数字',
  })
  password: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;

  @IsOptional()
  @IsEnum(UserRole, { message: '角色必须是 admin, user 或 guest' })
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @ValidateNested() // 验证嵌套对象
  @Type(() => AddressDto) // 转换为 AddressDto 实例
  address?: AddressDto;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true) // 字符串转布尔
  isActive?: boolean;
}
```

### 全局启用 ValidationPipe

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({
    // 自动转换类型
    transform: true,
    
    // 转换为 DTO 类实例
    transformOptions: {
      enableImplicitConversion: true, // 启用隐式类型转换
    },
    
    // 过滤掉 DTO 中未定义的属性
    whitelist: true,
    
    // 如果有未定义的属性则抛出错误
    forbidNonWhitelisted: true,
    
    // 禁用详细错误消息（生产环境）
    // disableErrorMessages: true,
    
    // 自定义错误格式
    exceptionFactory: (errors) => {
      const result = errors.map((error) => ({
        field: error.property,
        message: Object.values(error.constraints || {}).join(', '),
      }));
      return new BadRequestException({
        message: 'Validation failed',
        errors: result,
      });
    },
  }));
  
  await app.listen(3000);
}
bootstrap();
```

### 使用依赖注入方式注册

```typescript
// app.module.ts
import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_PIPE,
      useFactory: () => new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    },
  ],
})
export class AppModule {}
```

### 控制器中使用

```typescript
// users.controller.ts
import { Controller, Post, Body, Get, Query, Param, Patch } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from './dto/pagination.dto';

@Controller('users')
export class UsersController {
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    // createUserDto 已经过验证和转换
    console.log(createUserDto instanceof CreateUserDto); // true
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll(@Query() pagination: PaginationDto) {
    // Query 参数也会被验证和转换
    return this.usersService.findAll(pagination);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }
}
```

### 更新 DTO（PartialType）

```typescript
// dto/update-user.dto.ts
import { PartialType, OmitType, PickType, IntersectionType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

// 所有字段变为可选
export class UpdateUserDto extends PartialType(CreateUserDto) {}

// 排除某些字段
export class UpdateProfileDto extends OmitType(CreateUserDto, ['password', 'role'] as const) {}

// 只选择某些字段
export class UpdatePasswordDto extends PickType(CreateUserDto, ['password'] as const) {}

// 组合多个 DTO
export class CreateAdminDto extends IntersectionType(
  CreateUserDto,
  AdditionalAdminFields,
) {}
```

## 分组验证

```typescript
// dto/create-user.dto.ts
import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString({ groups: ['create', 'update'] })
  @MinLength(2, { groups: ['create'] }) // 只在 create 组验证
  name: string;

  @IsEmail({}, { groups: ['create'] }) // 只在 create 组验证
  email: string;

  @IsString({ groups: ['create'] })
  @MinLength(8, { groups: ['create'] })
  password: string;
}

// 使用特定分组验证
@Post()
create(
  @Body(new ValidationPipe({ groups: ['create'] })) 
  createUserDto: CreateUserDto,
) {
  return this.usersService.create(createUserDto);
}
```

## 自定义验证装饰器

```typescript
// decorators/is-unique.decorator.ts
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@ValidatorConstraint({ async: true })
@Injectable()
export class IsUniqueConstraint implements ValidatorConstraintInterface {
  constructor(private usersService: UsersService) {}

  async validate(value: any, args: ValidationArguments) {
    const [property] = args.constraints;
    const exists = await this.usersService.existsByField(property, value);
    return !exists;
  }

  defaultMessage(args: ValidationArguments) {
    const [property] = args.constraints;
    return `${property} already exists`;
  }
}

export function IsUnique(property: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsUniqueConstraint,
    });
  };
}

// 使用
export class CreateUserDto {
  @IsEmail()
  @IsUnique('email', { message: '该邮箱已被注册' })
  email: string;
}

// app.module.ts - 注册自定义验证器
import { useContainer } from 'class-validator';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 允许 class-validator 使用 NestJS 的依赖注入
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  
  await app.listen(3000);
}
```

## 条件验证

```typescript
import { ValidateIf, IsNotEmpty, IsEmail, IsPhoneNumber } from 'class-validator';

export class ContactDto {
  @IsNotEmpty()
  contactType: 'email' | 'phone';

  @ValidateIf(o => o.contactType === 'email')
  @IsEmail()
  email?: string;

  @ValidateIf(o => o.contactType === 'phone')
  @IsPhoneNumber('CN')
  phone?: string;
}
```

## 应用管道的不同方式

```typescript
// 1. 参数级别
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) {}

// 2. 方法级别
@Post()
@UsePipes(ValidationPipe)
create(@Body() dto: CreateUserDto) {}

// 3. 控制器级别
@Controller('users')
@UsePipes(new ValidationPipe({ transform: true }))
export class UsersController {}

// 4. 全局级别（main.ts）
app.useGlobalPipes(new ValidationPipe());

// 5. 全局级别（模块方式，支持依赖注入）
@Module({
  providers: [{ provide: APP_PIPE, useClass: ValidationPipe }],
})
export class AppModule {}
```

## 管道执行顺序

多个管道按顺序执行：

```typescript
@Get(':id')
findOne(
  @Param('id', DefaultValuePipe('1'), ParseIntPipe, CustomValidationPipe) 
  id: number,
) {
  // 执行顺序: DefaultValuePipe -> ParseIntPipe -> CustomValidationPipe
}
```

## 常见验证装饰器

```typescript
// 字符串
@IsString()
@IsNotEmpty()
@MinLength(2)
@MaxLength(100)
@Matches(/^[a-zA-Z]+$/)
@IsAlpha()
@IsAlphanumeric()
@Contains('text')
@IsIn(['value1', 'value2'])

// 数字
@IsNumber()
@IsInt()
@IsPositive()
@IsNegative()
@Min(0)
@Max(100)
@IsDivisibleBy(5)

// 布尔
@IsBoolean()

// 日期
@IsDate()
@MinDate(new Date())
@MaxDate(new Date())
@IsDateString()

// 数组
@IsArray()
@ArrayMinSize(1)
@ArrayMaxSize(10)
@ArrayUnique()
@ArrayContains(['value'])

// 对象
@IsObject()
@IsNotEmptyObject()
@ValidateNested()

// 其他
@IsEmail()
@IsUrl()
@IsUUID()
@IsJSON()
@IsCreditCard()
@IsPhoneNumber('CN')
@IsIP()
@IsMACAddress()

// 可选
@IsOptional()

// 条件
@ValidateIf(o => o.type === 'email')
```

## 管道最佳实践

1. **全局使用 ValidationPipe** - 统一验证配置
2. **使用 DTO** - 定义清晰的数据结构
3. **启用 whitelist** - 过滤未定义的属性
4. **启用 transform** - 自动类型转换
5. **自定义错误消息** - 提供友好的错误提示
6. **使用 mapped-types** - 复用 DTO 定义

## 下一步

[👉 08. 守卫 Guards](./08-guards.md)
