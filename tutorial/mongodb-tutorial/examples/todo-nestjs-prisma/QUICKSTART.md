# 快速开始指南

## ✅ 项目已创建完成！

使用 **NestJS CLI 脚手架**创建的最新版本项目，包含完整的 Todo 管理系统。

## 🚀 下一步操作

### 1. 配置 MongoDB 连接

编辑 `.env` 文件（已创建）：

```env
# MongoDB 连接配置
# URL: mongodb://localhost:27017/
# 用户名: root
# 数据库名: todo

# 无认证连接（默认）
DATABASE_URL="mongodb://localhost:27017/todo"

# 如果有认证（root 用户），使用：
# DATABASE_URL="mongodb://root:your_password@localhost:27017/todo?authSource=admin"
```

**注意**：如果 MongoDB 启用了认证，请将 `your_password` 替换为实际的 root 用户密码。

### 2. 推送数据库架构

```bash
npm run prisma:push
```

这将创建数据库集合和索引。

### 3. 填充种子数据（可选）

```bash
npm run prisma:seed
```

这将创建示例数据（2个用户，多个 Todo 项和列表）。

### 4. 启动应用

```bash
npm run start:dev
```

应用将在 `http://localhost:3000` 启动。

## 📚 API 测试

### 创建 Todo

```bash
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{
    "title": "学习 NestJS",
    "description": "完成 NestJS 教程",
    "priority": "HIGH",
    "tags": ["学习", "NestJS"],
    "userId": "user001"
  }'
```

### 获取所有 Todos

```bash
curl http://localhost:3000/api/todos?userId=user001
```

### 获取统计信息

```bash
curl http://localhost:3000/api/todos/statistics/user001
```

## 🎯 项目特性

- ✅ 使用 NestJS CLI 脚手架创建（最新版本）
- ✅ Prisma 7.x + MongoDB
- ✅ 完整的 CRUD 操作
- ✅ 数据验证
- ✅ 软删除
- ✅ 分页和筛选
- ✅ 统计功能
- ✅ 搜索功能

## 📖 更多信息

查看 [README.md](./README.md) 了解完整的 API 文档。

## 🔧 常用命令

```bash
# 开发模式
npm run start:dev

# Prisma Studio（可视化数据库）
npm run prisma:studio

# 生成 Prisma Client
npm run prisma:generate

# 推送数据库架构
npm run prisma:push

# 填充种子数据
npm run prisma:seed
```

## ⚠️ 注意事项

1. **MongoDB 连接**：确保 MongoDB 服务已启动
2. **环境变量**：`.env` 文件中的 `DATABASE_URL` 必须正确配置
3. **Prisma 7.x**：URL 配置在 `prisma.config.ts` 中，PrismaService 会自动读取

## 🎉 完成！

现在您可以开始使用 Todo 管理系统了！

