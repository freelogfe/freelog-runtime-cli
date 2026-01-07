# NestJS + Prisma 6 双数据库示例项目

这是一个完整的 NestJS 项目示例，演示如何在同一个项目中使用 MySQL 和 MongoDB 两个数据库。

## 技术栈

- **NestJS** v10 - 后端框架
- **Prisma** v6 - ORM (支持多数据源)
- **MySQL** - 存储核心业务数据 (用户、订单)
- **MongoDB** - 存储日志和动态配置
- **JWT** - 身份认证
- **Swagger** - API 文档

## 项目结构

```
src/
├── main.ts                 # 入口文件
├── app.module.ts           # 根模块
├── prisma/                 # Prisma 服务
│   ├── prisma.module.ts
│   ├── prisma-mysql.service.ts
│   └── prisma-mongo.service.ts
├── auth/                   # 认证模块
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── dto/
│   ├── guards/
│   ├── strategies/
│   └── decorators/
├── users/                  # 用户模块 (MySQL)
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── dto/
├── orders/                 # 订单模块 (MySQL)
│   ├── orders.module.ts
│   ├── orders.controller.ts
│   ├── orders.service.ts
│   └── dto/
└── logs/                   # 日志模块 (MongoDB)
    ├── logs.module.ts
    ├── logs.controller.ts
    ├── logs.service.ts
    └── dto/
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制 `env.example` 为 `.env` 并修改配置：

```bash
cp env.example .env
```

编辑 `.env` 文件：

```env
DATABASE_URL_MYSQL="mysql://root:password@localhost:3306/nestjs_example"
DATABASE_URL_MONGO="mongodb://localhost:27017/nestjs_example_logs"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"
PORT=3000
```

### 3. 生成 Prisma Client

```bash
pnpm run prisma:generate
```

### 4. 同步数据库结构

```bash
pnpm run prisma:push
```

### 5. 启动开发服务器

```bash
pnpm run start:dev
```

### 6. 访问 API 文档

打开浏览器访问: http://localhost:3000/api/docs

## API 端点

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |

### 用户 (需要认证)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/users/me | 获取当前用户 |
| GET | /api/users | 获取用户列表 |
| GET | /api/users/:id | 获取用户详情 |
| PATCH | /api/users/:id | 更新用户 |
| DELETE | /api/users/:id | 删除用户 |

### 订单 (需要认证)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/orders | 创建订单 |
| GET | /api/orders | 获取订单列表 |
| GET | /api/orders/:id | 获取订单详情 |
| PATCH | /api/orders/:id/status | 更新订单状态 |

### 日志 (需要认证)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/logs | 获取操作日志 |
| GET | /api/logs/stats | 获取日志统计 |

## 数据库设计

### MySQL (核心业务数据)

- **users** - 用户表
- **orders** - 订单表
- **order_items** - 订单项表
- **products** - 产品表

### MongoDB (日志和动态数据)

- **activity_logs** - 操作日志
- **system_configs** - 系统配置
- **user_sessions** - 用户会话
- **notifications** - 通知消息

## 常用命令

```bash
# 开发
pnpm run start:dev

# 构建
pnpm run build

# 生产运行
pnpm run start:prod

# Prisma 相关
pnpm run prisma:generate      # 生成客户端
pnpm run prisma:push          # 同步数据库
pnpm run prisma:studio:mysql  # MySQL 数据浏览器
pnpm run prisma:studio:mongo  # MongoDB 数据浏览器
```

## 测试 API

### 1. 注册用户

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123!","name":"测试用户"}'
```

### 2. 登录

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123!"}'
```

### 3. 创建订单 (需要 Token)

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "items": [
      {"productId": 1, "productName": "iPhone 15", "quantity": 1, "price": 7999}
    ],
    "remark": "请尽快发货"
  }'
```

