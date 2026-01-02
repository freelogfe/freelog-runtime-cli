# Todo 管理系统 - NestJS + Prisma + MongoDB

使用 **NestJS CLI 脚手架**创建的最新版本项目。

## 🚀 技术栈

- **NestJS 11.x** - 最新版本的 Node.js 企业级框架
- **Prisma 7.x** - 现代化的 ORM/ODM
- **MongoDB** - NoSQL 数据库
- **TypeScript 5.7** - 类型安全的 JavaScript

## 📦 快速开始

### 1. 安装依赖（已完成）

```bash
npm install
```

### 2. 配置环境变量

编辑 `.env` 文件：

```env
# MongoDB 连接配置
# URL: mongodb://localhost:27017/
# 用户名: root
# 数据库名: todo

# 无认证连接
DATABASE_URL="mongodb://localhost:27017/todo"

# 如果有认证（root 用户），使用：
# DATABASE_URL="mongodb://root:your_password@localhost:27017/todo?authSource=admin"
```

**注意**：如果 MongoDB 启用了认证，请将 `your_password` 替换为实际的 root 用户密码。

### 3. 生成 Prisma Client

```bash
npm run prisma:generate
```

### 4. 推送数据库架构

```bash
npm run prisma:push
```

### 5. 填充种子数据（可选）

```bash
npm run prisma:seed
```

### 6. 启动应用

```bash
npm run start:dev
```

应用将在 `http://localhost:3000` 启动，API 前缀为 `/api`。

## 📚 API 端点

### Todo API

- `POST /api/todos` - 创建 Todo
- `GET /api/todos` - 获取所有 Todos（支持筛选和分页）
- `GET /api/todos/:id` - 获取单个 Todo
- `PATCH /api/todos/:id` - 更新 Todo
- `PATCH /api/todos/:id/toggle` - 切换完成状态
- `POST /api/todos/:id/tags` - 添加标签
- `DELETE /api/todos/:id/tags/:tag` - 删除标签
- `DELETE /api/todos/:id` - 软删除 Todo
- `DELETE /api/todos/:id/permanent` - 永久删除 Todo
- `GET /api/todos/statistics/:userId` - 获取统计信息
- `GET /api/todos/upcoming/:userId?days=7` - 查找即将到期的 Todos
- `GET /api/todos/search/:userId?keyword=xxx` - 搜索 Todos

### TodoList API

- `POST /api/todo-lists` - 创建列表
- `GET /api/todo-lists?userId=xxx` - 获取所有列表
- `GET /api/todo-lists/:id` - 获取单个列表
- `PATCH /api/todo-lists/:id` - 更新列表
- `DELETE /api/todo-lists/:id` - 删除列表

## 🧪 测试 API

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
curl http://localhost:3000/api/todos?userId=user001&page=1&limit=10
```

### 获取统计信息

```bash
curl http://localhost:3000/api/todos/statistics/user001
```

## 📁 项目结构

```
todo-nestjs-prisma/
├── prisma/
│   ├── schema.prisma      # Prisma 数据模型
│   └── seed.ts            # 种子数据
├── src/
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── todo/
│   │   ├── dto/
│   │   │   ├── create-todo.dto.ts
│   │   │   ├── update-todo.dto.ts
│   │   │   └── todo-query.dto.ts
│   │   ├── todo.controller.ts
│   │   ├── todo.service.ts
│   │   └── todo.module.ts
│   ├── todo-list/
│   │   ├── dto/
│   │   │   ├── create-todo-list.dto.ts
│   │   │   └── update-todo-list.dto.ts
│   │   ├── todo-list.controller.ts
│   │   ├── todo-list.service.ts
│   │   └── todo-list.module.ts
│   ├── app.module.ts
│   └── main.ts
├── .env                   # 环境变量
└── package.json
```

## 🗄️ 数据模型

### Todo

- `id` - ObjectId（主键）
- `title` - 标题
- `description` - 描述
- `completed` - 是否完成
- `priority` - 优先级（LOW/MEDIUM/HIGH）
- `tags` - 标签数组
- `userId` - 用户 ID
- `dueDate` - 到期日期
- `createdAt` - 创建时间
- `updatedAt` - 更新时间
- `isDeleted` - 软删除标记
- `deletedAt` - 删除时间

### TodoList

- `id` - ObjectId（主键）
- `name` - 列表名称
- `description` - 描述
- `userId` - 用户 ID
- `category` - 分类（PERSONAL/WORK/SHOPPING/OTHER）
- `color` - 颜色代码
- `createdAt` - 创建时间
- `updatedAt` - 更新时间

## 🔧 常用命令

```bash
# 开发模式
npm run start:dev

# 生产构建
npm run build
npm run start:prod

# Prisma
npm run prisma:generate    # 生成 Prisma Client
npm run prisma:push        # 推送数据库架构
npm run prisma:studio      # 打开 Prisma Studio
npm run prisma:seed        # 填充种子数据

# 测试
npm run test
npm run test:e2e
```

## 📖 更多信息

- [NestJS 文档](https://docs.nestjs.com/)
- [Prisma 文档](https://www.prisma.io/docs)
- [MongoDB 文档](https://docs.mongodb.com/)

## ✅ 项目特性

- ✅ 使用 NestJS CLI 脚手架创建
- ✅ 最新版本的依赖
- ✅ 完整的 CRUD 操作
- ✅ 数据验证（class-validator）
- ✅ 软删除功能
- ✅ 分页和筛选
- ✅ 统计功能
- ✅ 搜索功能
- ✅ Prisma Studio 支持
