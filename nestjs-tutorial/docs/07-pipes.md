# 07. 管道 Pipes 与数据验证

管道有两个典型的应用场景：
- **转换**：将输入数据转换为所需的形式
- **验证**：验证输入数据是否有效

## 内置管道

```typescript
import {
  ParseIntPipe,       // 转换为整数
  ParseFloatPipe,     // 转换为浮点数
  ParseBoolPipe,      // 转换为布尔值
  ParseArrayPipe,     // 转换为数组
  ParseUUIDPipe,      // 验证 UUID
  ParseEnumPipe,      // 验证枚举值
  DefaultValuePipe,   // 设置默认值
  ValidationPipe,     // 数据验证
} from '@nestjs/common';
```

## 使用内置管道

```typescript
import { Controller, Get, Query, Param, ParseIntPipe, ParseBoolPipe, DefaultValuePipe } from '@nestjs/common';

@Controller('items')
export class ItemsController {
  
  // 转换为整数
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    console.log(typeof id); // 'number'
    return { id };
  }

  // 带自定义错误状态码
  @Get('user/:id')
  findUser(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE }))
    id: number,
  ) {
    return { id };
  }

  // 分页参数
  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('active', new DefaultValuePipe(true), ParseBoolPipe) active: boolean,
  ) {
    return { page, limit, active };
  }

  // UUID 验证
  @Get('uuid/:id')
  findByUuid(@Param('id', ParseUUIDPipe) id: string) {
    return { id };
  }

  // 枚举验证
  @Get('status/:status')
  findByStatus(
    @Param('status', new ParseEnumPipe(Status)) status: Status,
  ) {
    return { status };
  }
}

enum Status {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}
```

## ValidationPipe 与 class-validator

### 安装依赖

```bash
pnpm add class-validator class-transformer
```

### 创建 DTO

```typescript
// dto/create-user.dto.ts
import {
  IsString,
  IsEmail,
  IsInt,
  IsOptional,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Matches,
  IsUrl,
  IsPhoneNumber,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
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
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain uppercase, lowercase, and number/special character',
  })
  password: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;

  @IsOptional()
  @IsPhoneNumber('CN')
  phone?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  tags?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsString()
  username: string;
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
    whitelist: true,              // 自动剥离非 DTO 中定义的属性
    forbidNonWhitelisted: true,   // 如果有额外属性则抛出错误
    transform: true,              // 自动转换类型
    transformOptions: {
      enableImplicitConversion: true, // 隐式类型转换
    },
    disableErrorMessages: false,  // 生产环境可设为 true
    validationError: {
      target: false,              // 不在错误中暴露目标对象
      value: false,               // 不在错误中暴露值
    },
  }));
  
  await app.listen(3000);
}
bootstrap();
```

### 使用 DTO

```typescript
@Controller('users')
export class UsersController {
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    // createUserDto 已经过验证和转换
    return this.usersService.create(createUserDto);
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

### 部分更新 DTO (PartialType)

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
  AdditionalAdminDto,
) {}
```

## 自定义管道

### 简单转换管道

```typescript
// pipes/parse-date.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseDatePipe implements PipeTransform<string, Date> {
  transform(value: string): Date {
    const date = new Date(value);
    
    if (isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    
    return date;
  }
}

// 使用
@Get('events')
findByDate(@Query('date', ParseDatePipe) date: Date) {
  return { date };
}
```

### 带选项的管道

```typescript
// pipes/trim.pipe.ts
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

interface TrimPipeOptions {
  type?: 'body' | 'query' | 'param';
}

@Injectable()
export class TrimPipe implements PipeTransform {
  constructor(private options: TrimPipeOptions = {}) {}

  transform(value: any, metadata: ArgumentMetadata) {
    if (this.options.type && metadata.type !== this.options.type) {
      return value;
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'object' && value !== null) {
      return this.trimObject(value);
    }

    return value;
  }

  private trimObject(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (typeof value === 'string') {
        result[key] = value.trim();
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.trimObject(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
}
```

### 文件验证管道

```typescript
// pipes/file-validation.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

interface FileValidationOptions {
  maxSize?: number; // bytes
  allowedTypes?: string[];
}

@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(private options: FileValidationOptions = {}) {
    this.options = {
      maxSize: 5 * 1024 * 1024, // 5MB default
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif'],
      ...options,
    };
  }

  transform(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (file.size > this.options.maxSize!) {
      throw new BadRequestException(
        `File size exceeds ${this.options.maxSize! / 1024 / 1024}MB limit`,
      );
    }

    if (!this.options.allowedTypes!.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed. Allowed types: ${this.options.allowedTypes!.join(', ')}`,
      );
    }

    return file;
  }
}

// 使用
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
uploadFile(
  @UploadedFile(new FileValidationPipe({ maxSize: 10 * 1024 * 1024 }))
  file: Express.Multer.File,
) {
  return { filename: file.originalname };
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

@Injectable()
@ValidatorConstraint({ async: true })
export class IsUniqueConstraint implements ValidatorConstraintInterface {
  constructor(private usersService: UsersService) {}

  async validate(value: any, args: ValidationArguments) {
    const [property] = args.constraints;
    const exists = await this.usersService.findByProperty(property, value);
    return !exists;
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} already exists`;
  }
}

export function IsUnique(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
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
  @IsUnique('email', { message: 'Email already registered' })
  email: string;
}
```

## 下一步

[👉 08. 守卫 Guards 与权限控制](./08-guards.md)

