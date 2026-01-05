# 14. 完整项目案例说明

`example-project/` 目录包含一个完整可运行的 NestJS 项目。

## 项目功能

- 用户注册/登录 (JWT 认证)
- 用户 CRUD (MySQL)
- 订单管理 (MySQL)
- 操作日志 (MongoDB)
- Swagger API 文档

## 技术栈

- NestJS 10
- Prisma 6 (MySQL + MongoDB)
- JWT 认证
- class-validator 验证
- Swagger 文档

## 快速开始

```bash
cd example-project
pnpm install

# 配置环境变量
cp .env.example .env

# 生成 Prisma Client
pnpm run prisma:generate

# 同步数据库
pnpm run prisma:push

# 启动开发服务器
pnpm run start:dev
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/register | 用户注册 |
| POST | /auth/login | 用户登录 |
| GET | /users | 获取用户列表 |
| GET | /users/:id | 获取用户详情 |
| POST | /orders | 创建订单 |
| GET | /orders | 获取订单列表 |
| GET | /logs | 获取操作日志 |

## 访问 Swagger 文档

启动后访问: http://localhost:3000/api/docs

