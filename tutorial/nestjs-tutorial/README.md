# NestJS 完整教程 + Prisma 6 双数据库实战

这是一个全面的 NestJS 教程，从基础概念到高级实践，并包含一个完整的项目案例。

## 📚 教程目录

### 入门篇
- [00. NestJS CLI 完全指南](./docs/00-cli.md) ⭐ 新增

### 基础篇
- [01. NestJS 简介与核心概念](./docs/01-introduction.md)
- [02. 控制器 Controller 详解](./docs/02-controllers.md)
- [03. 提供者 Provider 与依赖注入](./docs/03-providers.md)
- [04. 模块 Module 系统](./docs/04-modules.md)
- [05. 中间件 Middleware](./docs/05-middleware.md)

### 进阶篇
- [06. 异常过滤器 Exception Filters](./docs/06-exception-filters.md)
- [07. 管道 Pipes 与数据验证](./docs/07-pipes.md)
- [08. 守卫 Guards 与权限控制](./docs/08-guards.md)
- [09. 拦截器 Interceptors](./docs/09-interceptors.md)
- [10. 自定义装饰器](./docs/10-custom-decorators.md)

### 数据库篇
- [11. Prisma 6 入门](./docs/11-prisma-intro.md)
- [12. Prisma 双数据库配置 (MySQL + MongoDB)](./docs/12-prisma-multidb.md)
- [13. 数据库事务与高级查询](./docs/13-prisma-advanced.md)

### 实战篇
- [14. 完整项目案例说明](./docs/14-project-overview.md)

## 🚀 项目案例

`example-project/` 目录包含一个完整可运行的 NestJS 项目，特点：

- ✅ NestJS v10+ 最新版本
- ✅ Prisma 6 ORM
- ✅ MySQL 存储用户和订单数据
- ✅ MongoDB 存储日志和动态配置
- ✅ JWT 认证
- ✅ 完整的 CRUD 示例
- ✅ Swagger API 文档

### 快速开始

```bash
cd example-project
pnpm install
# 配置 .env 文件
pnpm run prisma:generate
pnpm run prisma:push
pnpm run start:dev
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| NestJS | 10.x | 后端框架 |
| Prisma | 6.x | ORM |
| MySQL | 8.x | 关系型数据库 |
| MongoDB | 6.x | 文档数据库 |
| TypeScript | 5.x | 开发语言 |

## 适合人群

- 想系统学习 NestJS 的开发者
- 需要在项目中使用多数据库的团队
- 希望了解 Prisma 6 新特性的用户

