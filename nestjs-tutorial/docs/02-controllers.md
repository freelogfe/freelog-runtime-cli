# 02. 控制器 Controller 详解

控制器负责处理传入的 HTTP 请求，并返回响应给客户端。控制器的目的是接收应用的特定请求，路由机制控制哪个控制器接收哪些请求。

## 控制器的作用

```
客户端请求 → 路由匹配 → 控制器 → 服务层 → 数据库
                ↓
            返回响应
```

控制器应该只负责：
- 接收请求
- 验证输入（通过管道）
- 调用服务层
- 返回响应

**不应该**在控制器中编写业务逻辑，业务逻辑应该放在服务层。

## 基本控制器

```typescript
import { Controller, Get, Post, Body, Param, Query, HttpCode, Header, Redirect } from '@nestjs/common';

@Controller('users') // 路由前缀，所有路由都以 /users 开头
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

### @Controller() 装饰器详解

```typescript
// 基本用法 - 字符串前缀
@Controller('users')
export class UsersController {}
// 匹配: /users, /users/:id 等

// 空前缀 - 根路由
@Controller()
export class RootController {}
// 匹配: /, /hello 等

// 对象配置
@Controller({
  path: 'users',      // 路由前缀
  host: 'admin.example.com', // 主机匹配（可选）
  version: '1',       // API 版本（可选）
})
export class UsersController {}
```

## 路由通配符

NestJS 支持基于模式的路由匹配：

```typescript
@Controller('cats')
export class CatsController {
  // 匹配 /cats/ab*cd
  // 如: /cats/abcd, /cats/ab_cd, /cats/ab123cd
  @Get('ab*cd')
  findAll() {
    return 'This route uses a wildcard';
  }

  // 匹配 /cats/任意字符
  @Get('*')
  catchAll() {
    return 'Catch all route';
  }
}
```

**注意**：通配符路由应该放在最后，否则会覆盖其他路由。

## 请求对象

### @Req() 装饰器

```typescript
import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';

@Controller('demo')
export class DemoController {
  
  // 访问原始 Request 对象
  @Get('request')
  getRequest(@Req() request: Request) {
    return {
      url: request.url,
      method: request.method,
      headers: request.headers,
      query: request.query,
      params: request.params,
      body: request.body,
      ip: request.ip,
      hostname: request.hostname,
      protocol: request.protocol,
    };
  }
}
```

### @Res() 装饰器与 passthrough 模式

#### 直接使用 @Res()（不推荐）

```typescript
import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller('demo')
export class DemoController {
  // ⚠️ 不推荐：直接使用 @Res()
  @Get('response')
  getResponse(@Res() response: Response) {
    // 必须手动发送响应
    response.status(200).json({ message: 'Hello' });
    // return 语句会被忽略！
    // 拦截器、异常过滤器等 NestJS 功能都不会工作
  }
}
```

**问题**：使用 `@Res()` 后，NestJS 认为你要完全接管响应，会禁用：
- 拦截器 (Interceptors)
- 异常过滤器 (Exception Filters)
- 响应序列化
- return 语句

#### passthrough 模式（推荐）

```typescript
import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller('demo')
export class DemoController {
  // ✅ 推荐：使用 passthrough 模式
  @Get('passthrough')
  getPassthrough(@Res({ passthrough: true }) response: Response) {
    // 可以操作 response 对象
    response.header('X-Custom-Header', 'Custom Value');
    response.cookie('token', 'abc123', { httpOnly: true });
    
    // return 语句正常工作
    // 拦截器等 NestJS 功能也正常工作
    return { message: 'Hello with custom header' };
  }
}
```

#### passthrough 对比表

| 特性 | `@Res()` | `@Res({ passthrough: true })` |
|------|----------|-------------------------------|
| 访问原生 Response | ✅ | ✅ |
| return 值生效 | ❌ | ✅ |
| 拦截器工作 | ❌ | ✅ |
| 异常过滤器工作 | ❌ | ✅ |
| 需要手动 `res.send()` | ✅ | ❌ |
| 响应序列化 | ❌ | ✅ |

#### passthrough 常见使用场景

```typescript
@Controller('files')
export class FilesController {
  // 1. 设置下载文件头
  @Get('download/:filename')
  download(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.header('Content-Type', 'application/octet-stream');
    return this.filesService.getFileStream(filename);
  }

  // 2. 设置 Cookie
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.authService.login(dto);
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
    });
    return { success: true };
  }

  // 3. 设置缓存头
  @Get('static/:id')
  getStatic(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.header('Cache-Control', 'public, max-age=31536000'); // 1 年
    res.header('ETag', `"${id}"`);
    return this.staticService.get(id);
  }
}
```

## 参数装饰器详解

NestJS 提供了丰富的参数装饰器来提取请求数据：

### 装饰器对照表

| 装饰器 | Express 等价 | 说明 |
|--------|-------------|------|
| `@Req()` | `req` | 请求对象 |
| `@Res()` | `res` | 响应对象 |
| `@Next()` | `next` | 下一个中间件 |
| `@Param(key?)` | `req.params` / `req.params[key]` | 路由参数 |
| `@Query(key?)` | `req.query` / `req.query[key]` | 查询参数 |
| `@Body(key?)` | `req.body` / `req.body[key]` | 请求体 |
| `@Headers(name?)` | `req.headers` / `req.headers[name]` | 请求头 |
| `@Ip()` | `req.ip` | 客户端 IP |
| `@HostParam(key?)` | `req.hosts` | 主机参数 |
| `@Session()` | `req.session` | 会话对象 |

### 详细示例

```typescript
import {
  Controller, Get, Post, Put, Delete,
  Param, Query, Body, Headers, Ip, HostParam, Session
} from '@nestjs/common';

@Controller('api')
export class ApiController {

  // ==================== @Param 路由参数 ====================
  
  // 单个参数 - GET /api/users/123
  @Get('users/:id')
  getUser(@Param('id') id: string) {
    // id = '123'
    return { userId: id };
  }

  // 多个参数 - GET /api/users/123/posts/456
  @Get('users/:userId/posts/:postId')
  getUserPost(
    @Param('userId') userId: string,
    @Param('postId') postId: string,
  ) {
    return { userId, postId };
  }

  // 获取所有参数对象
  @Get('items/:category/:id')
  getItem(@Param() params: { category: string; id: string }) {
    // params = { category: 'electronics', id: '123' }
    return params;
  }

  // ==================== @Query 查询参数 ====================
  
  // 单个参数 - GET /api/search?keyword=nest
  @Get('search')
  search(@Query('keyword') keyword: string) {
    return { keyword };
  }

  // 多个参数带默认值 - GET /api/list?page=2&limit=20
  @Get('list')
  list(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('sort') sort: string = 'createdAt',
    @Query('order') order: 'asc' | 'desc' = 'desc',
  ) {
    return { page, limit, sort, order };
  }

  // 获取所有查询参数
  @Get('filter')
  filter(@Query() query: Record<string, any>) {
    return query;
  }

  // ==================== @Body 请求体 ====================
  
  // 整个请求体 - POST /api/users
  @Post('users')
  createUser(@Body() body: CreateUserDto) {
    return body;
  }

  // 部分请求体 - 只取特定字段
  @Post('partial')
  partialBody(
    @Body('name') name: string,
    @Body('email') email: string,
  ) {
    return { name, email };
  }

  // ==================== @Headers 请求头 ====================
  
  // 单个请求头
  @Get('headers')
  getHeaders(
    @Headers('user-agent') userAgent: string,
    @Headers('authorization') auth: string,
    @Headers('content-type') contentType: string,
  ) {
    return { userAgent, auth, contentType };
  }

  // 所有请求头
  @Get('all-headers')
  getAllHeaders(@Headers() headers: Record<string, string>) {
    return { headerCount: Object.keys(headers).length };
  }

  // ==================== @Ip 客户端 IP ====================
  
  @Get('ip')
  getIp(@Ip() ip: string) {
    return { ip };
  }

  // ==================== @Session 会话 ====================
  
  @Get('session')
  getSession(@Session() session: Record<string, any>) {
    // 需要配置 session 中间件
    session.views = (session.views || 0) + 1;
    return { views: session.views };
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

  // GET - 获取资源
  @Get()
  findAll() { 
    return []; 
  }

  @Get(':id')
  findOne(@Param('id') id: string) { 
    return { id }; 
  }

  // POST - 创建资源
  @Post()
  create(@Body() data: any) { 
    return data; 
  }

  // PUT - 完整替换资源
  @Put(':id')
  replace(@Param('id') id: string, @Body() data: any) {
    return { id, ...data };
  }

  // PATCH - 部分更新资源
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return { id, ...data };
  }

  // DELETE - 删除资源
  @Delete(':id')
  remove(@Param('id') id: string) {
    return { deleted: id };
  }

  // OPTIONS - 获取支持的方法
  @Options()
  options() {
    return { methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] };
  }

  // HEAD - 获取资源头信息（无响应体）
  @Head(':id')
  head(@Param('id') id: string) {
    // 只返回头信息，无响应体
  }

  // ALL - 匹配所有 HTTP 方法
  @All('wildcard')
  handleAll() {
    return 'This handles all HTTP methods';
  }
}
```

### PUT vs PATCH 的区别

```typescript
// 假设有用户数据: { id: 1, name: 'John', email: 'john@example.com', age: 25 }

// PUT - 完整替换，需要提供所有字段
@Put(':id')
replace(@Param('id') id: string, @Body() data: UpdateUserDto) {
  // 请求体: { name: 'Jane', email: 'jane@example.com', age: 30 }
  // 结果: { id: 1, name: 'Jane', email: 'jane@example.com', age: 30 }
  // 如果只传 { name: 'Jane' }，其他字段会变成 undefined
}

// PATCH - 部分更新，只更新提供的字段
@Patch(':id')
update(@Param('id') id: string, @Body() data: PartialUpdateUserDto) {
  // 请求体: { name: 'Jane' }
  // 结果: { id: 1, name: 'Jane', email: 'john@example.com', age: 25 }
  // 只更新 name，其他字段保持不变
}
```

## 响应处理

### 状态码

```typescript
import { Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('response')
export class ResponseController {

  // 默认状态码
  // GET 默认 200
  // POST 默认 201

  // 自定义状态码 - 使用数字
  @Post('create')
  @HttpCode(201)
  create() {
    return { created: true };
  }

  // 自定义状态码 - 使用 HttpStatus 枚举（推荐）
  @Post('no-content')
  @HttpCode(HttpStatus.NO_CONTENT) // 204
  noContent() {
    // 不返回内容
  }

  // 常用状态码
  @Get('status-codes')
  statusCodes() {
    return {
      OK: HttpStatus.OK,                           // 200
      CREATED: HttpStatus.CREATED,                 // 201
      NO_CONTENT: HttpStatus.NO_CONTENT,           // 204
      BAD_REQUEST: HttpStatus.BAD_REQUEST,         // 400
      UNAUTHORIZED: HttpStatus.UNAUTHORIZED,       // 401
      FORBIDDEN: HttpStatus.FORBIDDEN,             // 403
      NOT_FOUND: HttpStatus.NOT_FOUND,             // 404
      INTERNAL_SERVER_ERROR: HttpStatus.INTERNAL_SERVER_ERROR, // 500
    };
  }
}
```

### 响应头

```typescript
import { Controller, Get, Header } from '@nestjs/common';

@Controller('headers')
export class HeadersController {

  // 单个响应头
  @Get('cache')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  noCache() {
    return { data: 'fresh data' };
  }

  // 多个响应头
  @Get('custom')
  @Header('X-Custom-Header', 'Hello')
  @Header('X-Another-Header', 'World')
  @Header('Content-Type', 'application/json')
  customHeaders() {
    return { message: 'Check the headers!' };
  }

  // 动态响应头（使用 passthrough）
  @Get('dynamic')
  dynamicHeaders(@Res({ passthrough: true }) res: Response) {
    res.header('X-Request-Id', `req-${Date.now()}`);
    res.header('X-Powered-By', 'NestJS');
    return { success: true };
  }
}
```

### 重定向

```typescript
import { Controller, Get, Redirect, Query } from '@nestjs/common';

@Controller('redirect')
export class RedirectController {

  // 静态重定向
  @Get('google')
  @Redirect('https://google.com', 301) // 301 永久重定向
  redirectToGoogle() {
    // 默认重定向到 google.com
  }

  // 临时重定向
  @Get('temp')
  @Redirect('https://example.com', 302) // 302 临时重定向
  tempRedirect() {}

  // 动态重定向 - 通过返回值覆盖
  @Get('dynamic')
  @Redirect() // 不指定默认 URL
  dynamicRedirect(@Query('version') version: string) {
    if (version === 'v2') {
      return { url: 'https://docs.nestjs.com/v2', statusCode: 302 };
    }
    if (version === 'v1') {
      return { url: 'https://docs.nestjs.com/v1', statusCode: 301 };
    }
    return { url: 'https://docs.nestjs.com', statusCode: 302 };
  }

  // 条件重定向
  @Get('login')
  @Redirect('/dashboard', 302)
  checkLogin(@Session() session: any) {
    if (!session.user) {
      return { url: '/auth/login', statusCode: 302 };
    }
    // 已登录，使用默认重定向到 /dashboard
  }
}
```

## 子域路由

子域路由是 NestJS 中根据**请求的子域名**来路由到不同控制器的功能。

### 什么是子域？

```
https://admin.example.com/users
        ↑
      子域名 (subdomain)

https://api.v1.example.com/data
        ↑   ↑
       子域  子域（多级）
```

### 使用场景

| 场景 | 子域示例 | 用途 |
|------|---------|------|
| 管理后台 | `admin.example.com` | 管理员专用入口 |
| API 版本 | `api.example.com` | API 服务入口 |
| 多租户 SaaS | `{tenant}.example.com` | 每个租户独立子域 |
| 区域分流 | `cn.example.com` | 不同地区不同服务 |

### 固定子域

匹配特定的子域名：

```typescript
// 只匹配 admin.example.com
@Controller({ host: 'admin.example.com' })
export class AdminController {
  @Get()
  index(): string {
    return 'Admin page';
  }
}
```

### 动态子域参数

使用 `:参数名` 语法捕获动态子域，通过 `@HostParam()` 装饰器获取：

```typescript
// 匹配任意 {xxx}.example.com
@Controller({ host: ':account.example.com' })
export class AccountController {
  @Get()
  getInfo(@HostParam('account') account: string) {
    // 访问 john.example.com → account = 'john'
    // 访问 alice.example.com → account = 'alice'
    return { account };
  }

  @Get('settings')
  getSettings(@HostParam('account') account: string) {
    return { account, page: 'settings' };
  }
}
```

### 多级子域

可以捕获多个子域参数：

```typescript
@Controller({ host: ':subdomain.:domain.example.com' })
export class MultiSubdomainController {
  @Get()
  getInfo(
    @HostParam('subdomain') subdomain: string,
    @HostParam('domain') domain: string,
  ) {
    // 访问 api.v1.example.com 时
    // subdomain = 'api', domain = 'v1'
    return { subdomain, domain };
  }
}
```

### 工作原理

```
请求: https://john.example.com/settings
                ↓
      NestJS 检查 HTTP Host 头
                ↓
      匹配 :account.example.com 模式
                ↓
      提取 account = 'john'
                ↓
      路由到 AccountController.getSettings()
                ↓
      @HostParam('account') 获取 'john'
```

### 与普通路由的区别

| 特性 | 普通路由 | 子域路由 |
|------|---------|---------|
| 区分方式 | URL 路径 `/admin/users` | 子域名 `admin.example.com/users` |
| 配置 | `@Controller('admin')` | `@Controller({ host: 'admin.example.com' })` |
| 参数提取 | `@Param()` | `@HostParam()` |
| 适用场景 | 单域名应用 | 多租户、多入口应用 |

### 本地开发测试

由于本地没有真实域名，需要修改 hosts 文件进行测试：

```bash
# Windows: C:\Windows\System32\drivers\etc\hosts
# Mac/Linux: /etc/hosts

127.0.0.1 admin.example.com
127.0.0.1 john.example.com
127.0.0.1 alice.example.com
127.0.0.1 api.v1.example.com
```

然后访问 `http://admin.example.com:3000` 即可测试子域路由。

### 注意事项

1. **Fastify 适配器**：如果使用 Fastify，需要启用 `trustProxy` 选项
2. **反向代理**：在 Nginx 等反向代理后面时，确保正确传递 Host 头
3. **通配符证书**：生产环境需要通配符 SSL 证书（如 `*.example.com`）

## 异步控制器

NestJS 完全支持异步操作：

```typescript
import { Controller, Get } from '@nestjs/common';
import { Observable, of, delay } from 'rxjs';

@Controller('async')
export class AsyncController {

  // 方式1: async/await（最常用）
  @Get('promise')
  async findAllPromise(): Promise<string[]> {
    // 模拟数据库查询
    await new Promise(resolve => setTimeout(resolve, 100));
    return ['item1', 'item2'];
  }

  // 方式2: 返回 Promise
  @Get('promise2')
  findAllPromise2(): Promise<string[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(['item1', 'item2']);
      }, 100);
    });
  }

  // 方式3: Observable (RxJS)
  @Get('observable')
  findAllObservable(): Observable<string[]> {
    return of(['item1', 'item2']).pipe(delay(100));
  }

  // 实际使用示例
  @Get('users')
  async findUsers() {
    const users = await this.userService.findAll();
    return users;
  }

  // 并行请求
  @Get('dashboard')
  async getDashboard() {
    const [users, orders, stats] = await Promise.all([
      this.userService.count(),
      this.orderService.count(),
      this.statsService.getSummary(),
    ]);
    return { users, orders, stats };
  }
}
```

## 完整示例：RESTful 用户控制器

```typescript
import {
  Controller, Get, Post, Put, Delete, Patch,
  Param, Query, Body, ParseIntPipe, HttpStatus, HttpCode,
  NotFoundException, BadRequestException,
} from '@nestjs/common';

// 接口定义
interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

// DTO 定义
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
  order?: 'asc' | 'desc';
}

@Controller('users')
export class UsersController {
  private users: User[] = [
    { id: 1, name: 'Alice', email: 'alice@example.com', createdAt: new Date() },
    { id: 2, name: 'Bob', email: 'bob@example.com', createdAt: new Date() },
  ];

  /**
   * 获取用户列表（支持分页和排序）
   * GET /users?page=1&limit=10&sort=name&order=asc
   */
  @Get()
  findAll(@Query() query: PaginationQuery) {
    const { page = 1, limit = 10, sort = 'id', order = 'asc' } = query;
    
    let result = [...this.users];
    
    // 排序
    if (sort && result[0]?.hasOwnProperty(sort)) {
      result.sort((a, b) => {
        const aVal = a[sort];
        const bVal = b[sort];
        const comparison = typeof aVal === 'string' 
          ? aVal.localeCompare(bVal)
          : aVal - bVal;
        return order === 'asc' ? comparison : -comparison;
      });
    }
    
    // 分页
    const start = (page - 1) * limit;
    const paginatedData = result.slice(start, start + limit);
    
    return {
      data: paginatedData,
      meta: {
        total: this.users.length,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(this.users.length / limit),
      },
    };
  }

  /**
   * 获取单个用户
   * GET /users/:id
   * ParseIntPipe 自动将字符串转为数字，无效时抛出 400 错误
   */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const user = this.users.find(u => u.id === id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  /**
   * 创建用户
   * POST /users
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto) {
    // 验证邮箱唯一性
    const exists = this.users.some(u => u.email === createUserDto.email);
    if (exists) {
      throw new BadRequestException('Email already exists');
    }

    const newUser: User = {
      id: Math.max(...this.users.map(u => u.id)) + 1,
      ...createUserDto,
      createdAt: new Date(),
    };
    this.users.push(newUser);
    return newUser;
  }

  /**
   * 完整替换用户（PUT）
   * PUT /users/:id
   */
  @Put(':id')
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() createUserDto: CreateUserDto,
  ) {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) {
      throw new NotFoundException(`User #${id} not found`);
    }
    
    // 完整替换，保留 id 和 createdAt
    this.users[index] = { 
      id, 
      ...createUserDto,
      createdAt: this.users[index].createdAt,
    };
    return this.users[index];
  }

  /**
   * 部分更新用户（PATCH）
   * PATCH /users/:id
   */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const user = this.users.find(u => u.id === id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    
    // 只更新提供的字段
    Object.assign(user, updateUserDto);
    return user;
  }

  /**
   * 删除用户
   * DELETE /users/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) {
      throw new NotFoundException(`User #${id} not found`);
    }
    this.users.splice(index, 1);
    // 204 No Content，不返回内容
  }

  /**
   * 批量操作示例
   * POST /users/batch
   */
  @Post('batch')
  createBatch(@Body() users: CreateUserDto[]) {
    const created = users.map(dto => {
      const newUser: User = {
        id: Math.max(...this.users.map(u => u.id), 0) + 1,
        ...dto,
        createdAt: new Date(),
      };
      this.users.push(newUser);
      return newUser;
    });
    return created;
  }
}
```

## 下一步

[👉 03. 提供者 Provider 与依赖注入](./03-providers.md)
