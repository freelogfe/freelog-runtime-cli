# 02. 控制器 Controller 详解

控制器负责处理传入的 HTTP 请求，并返回响应给客户端。

## 基本控制器

```typescript
import { Controller, Get, Post, Body, Param, Query, HttpCode, Header, Redirect } from '@nestjs/common';

@Controller('users') // 路由前缀
export class UsersController {
  
  // GET /users
  @Get()
  findAll(): string {
    return '返回所有用户';
  }

  // GET /users/:id
  @Get(':id')
  findOne(@Param('id') id: string): string {
    return `返回用户 #${id}`;
  }

  // POST /users
  @Post()
  @HttpCode(201) // 自定义状态码
  create(@Body() createUserDto: any): string {
    return '创建用户';
  }
}
```

## 路由通配符

```typescript
@Controller('cats')
export class CatsController {
  // 匹配 /cats/ab*cd (如 /cats/abcd, /cats/ab_cd 等)
  @Get('ab*cd')
  findAll() {
    return 'This route uses a wildcard';
  }
}
```

## 请求对象

```typescript
import { Controller, Get, Req, Res, Next } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Controller('demo')
export class DemoController {
  
  // 访问原始 Request 对象
  @Get('request')
  getRequest(@Req() request: Request) {
    return {
      url: request.url,
      method: request.method,
      headers: request.headers,
    };
  }

  // 使用 Response 对象 (不推荐，会失去拦截器等功能)
  @Get('response')
  getResponse(@Res() response: Response) {
    response.status(200).json({ message: 'Hello' });
  }

  // 使用 passthrough 模式保留 NestJS 功能
  @Get('passthrough')
  getPassthrough(@Res({ passthrough: true }) response: Response) {
    response.header('X-Custom-Header', 'Custom Value');
    return { message: 'Hello with custom header' };
  }
}
```

## 参数装饰器详解

```typescript
import {
  Controller, Get, Post, Put, Delete,
  Param, Query, Body, Headers, Ip, HostParam
} from '@nestjs/common';

@Controller('api')
export class ApiController {

  // 路由参数 - GET /api/users/123
  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return { userId: id };
  }

  // 多个路由参数 - GET /api/users/123/posts/456
  @Get('users/:userId/posts/:postId')
  getUserPost(
    @Param('userId') userId: string,
    @Param('postId') postId: string,
  ) {
    return { userId, postId };
  }

  // 获取所有参数
  @Get('items/:category/:id')
  getItem(@Param() params: { category: string; id: string }) {
    return params;
  }

  // 查询参数 - GET /api/search?keyword=nest&page=1&limit=10
  @Get('search')
  search(
    @Query('keyword') keyword: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return { keyword, page, limit };
  }

  // 请求体 - POST /api/users
  @Post('users')
  createUser(@Body() body: CreateUserDto) {
    return body;
  }

  // 部分请求体
  @Post('partial')
  partialBody(@Body('name') name: string) {
    return { name };
  }

  // 请求头
  @Get('headers')
  getHeaders(
    @Headers('user-agent') userAgent: string,
    @Headers() allHeaders: Record<string, string>,
  ) {
    return { userAgent, headerCount: Object.keys(allHeaders).length };
  }

  // 客户端 IP
  @Get('ip')
  getIp(@Ip() ip: string) {
    return { ip };
  }
}

// DTO 定义
class CreateUserDto {
  name: string;
  email: string;
  age?: number;
}
```

## HTTP 方法装饰器

```typescript
import {
  Controller, Get, Post, Put, Patch, Delete, Options, Head, All
} from '@nestjs/common';

@Controller('resources')
export class ResourcesController {

  @Get()
  findAll() { return []; }

  @Get(':id')
  findOne(@Param('id') id: string) { return { id }; }

  @Post()
  create(@Body() data: any) { return data; }

  @Put(':id')
  replace(@Param('id') id: string, @Body() data: any) {
    return { id, ...data };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return { id, ...data };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return { deleted: id };
  }

  // 匹配所有 HTTP 方法
  @All('wildcard')
  handleAll() {
    return 'This handles all HTTP methods';
  }
}
```

## 响应处理

```typescript
import { Controller, Get, HttpCode, Header, Redirect, Res } from '@nestjs/common';

@Controller('response')
export class ResponseController {

  // 自定义状态码
  @Post()
  @HttpCode(204)
  noContent() {
    // 返回 204 No Content
  }

  // 自定义响应头
  @Get('custom-header')
  @Header('Cache-Control', 'no-cache')
  @Header('X-Custom-Header', 'Hello')
  customHeader() {
    return { message: 'Check the headers!' };
  }

  // 重定向
  @Get('redirect')
  @Redirect('https://nestjs.com', 301)
  redirect() {
    // 默认重定向到 nestjs.com
  }

  // 动态重定向
  @Get('dynamic-redirect')
  @Redirect()
  dynamicRedirect(@Query('version') version: string) {
    if (version === 'v2') {
      return { url: 'https://docs.nestjs.com/v2', statusCode: 302 };
    }
    return { url: 'https://docs.nestjs.com', statusCode: 301 };
  }
}
```

## 子域路由

```typescript
@Controller({ host: 'admin.example.com' })
export class AdminController {
  @Get()
  index(): string {
    return 'Admin page';
  }
}

@Controller({ host: ':account.example.com' })
export class AccountController {
  @Get()
  getInfo(@HostParam('account') account: string) {
    return { account };
  }
}
```

## 异步控制器

```typescript
import { Controller, Get } from '@nestjs/common';
import { Observable, of } from 'rxjs';

@Controller('async')
export class AsyncController {

  // Promise
  @Get('promise')
  async findAllPromise(): Promise<string[]> {
    return ['item1', 'item2'];
  }

  // Observable (RxJS)
  @Get('observable')
  findAllObservable(): Observable<string[]> {
    return of(['item1', 'item2']);
  }

  // async/await with database
  @Get('users')
  async findUsers() {
    const users = await this.userService.findAll();
    return users;
  }
}
```

## 完整示例：用户控制器

```typescript
import {
  Controller, Get, Post, Put, Delete, Patch,
  Param, Query, Body, ParseIntPipe, HttpStatus, HttpCode,
} from '@nestjs/common';

interface User {
  id: number;
  name: string;
  email: string;
}

interface CreateUserDto {
  name: string;
  email: string;
}

interface UpdateUserDto {
  name?: string;
  email?: string;
}

interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
}

@Controller('users')
export class UsersController {
  private users: User[] = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ];

  // GET /users?page=1&limit=10&sort=name
  @Get()
  findAll(@Query() query: PaginationQuery) {
    const { page = 1, limit = 10, sort } = query;
    let result = [...this.users];
    
    if (sort) {
      result.sort((a, b) => a[sort]?.localeCompare(b[sort]));
    }
    
    const start = (page - 1) * limit;
    return {
      data: result.slice(start, start + limit),
      total: this.users.length,
      page,
      limit,
    };
  }

  // GET /users/:id
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const user = this.users.find(u => u.id === id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  // POST /users
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto) {
    const newUser: User = {
      id: this.users.length + 1,
      ...createUserDto,
    };
    this.users.push(newUser);
    return newUser;
  }

  // PUT /users/:id (完整替换)
  @Put(':id')
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() createUserDto: CreateUserDto,
  ) {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) {
      throw new NotFoundException(`User #${id} not found`);
    }
    this.users[index] = { id, ...createUserDto };
    return this.users[index];
  }

  // PATCH /users/:id (部分更新)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const user = this.users.find(u => u.id === id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    Object.assign(user, updateUserDto);
    return user;
  }

  // DELETE /users/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) {
      throw new NotFoundException(`User #${id} not found`);
    }
    this.users.splice(index, 1);
  }
}
```

## 下一步

[👉 03. 提供者 Provider 与依赖注入](./03-providers.md)

