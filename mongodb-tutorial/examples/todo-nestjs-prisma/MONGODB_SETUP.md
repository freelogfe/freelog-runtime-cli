# MongoDB 连接配置说明

## 🔌 连接信息

- **URL**: `mongodb://localhost:27017/`
- **用户名**: `root`
- **数据库名**: `todo`

## ⚙️ 配置步骤

### 1. 配置 .env 文件

已更新 `.env` 文件，包含以下配置：

```env
# 无密码连接（如果 MongoDB 未启用认证）
DATABASE_URL="mongodb://localhost:27017/todo"

# 如果有密码，使用以下格式（替换 your_password）
# DATABASE_URL="mongodb://root:your_password@localhost:27017/todo?authSource=admin"
```

### 2. 检查 MongoDB 认证状态

#### 如果 MongoDB 未启用认证

直接使用：
```env
DATABASE_URL="mongodb://localhost:27017/todo"
```

#### 如果 MongoDB 已启用认证

需要提供密码：
```env
DATABASE_URL="mongodb://root:your_password@localhost:27017/todo?authSource=admin"
```

**注意**：
- 将 `your_password` 替换为实际的 root 用户密码
- `authSource=admin` 指定认证数据库（通常是 `admin`）

### 3. 测试连接

#### 方法 1: 使用 MongoDB Shell

```bash
# 无认证
mongosh mongodb://localhost:27017/todo

# 有认证
mongosh "mongodb://root:password@localhost:27017/todo?authSource=admin"
```

#### 方法 2: 使用 Prisma

```bash
# 生成 Prisma Client（会测试连接）
npm run prisma:generate

# 推送数据库架构（会测试连接）
npm run prisma:push
```

#### 方法 3: 启动应用

```bash
npm run start:dev
```

如果连接成功，会看到：
```
✅ Database connected successfully
```

## 🔧 常见问题

### 问题 1: 认证失败

**错误信息**：
```
Authentication failed
```

**解决方案**：
1. 检查密码是否正确
2. 确认 `authSource=admin` 参数是否正确
3. 确认 root 用户是否有访问 todo 数据库的权限

### 问题 2: 连接被拒绝

**错误信息**：
```
connect ECONNREFUSED 127.0.0.1:27017
```

**解决方案**：
1. 确认 MongoDB 服务已启动
   ```bash
   # Windows
   net start MongoDB
   
   # Linux/Mac
   sudo systemctl start mongod
   ```
2. 检查端口是否正确（默认 27017）

### 问题 3: 数据库不存在

**说明**：
- Prisma 会自动创建数据库（如果不存在）
- 确保用户有创建数据库的权限

## 📝 配置示例

### 开发环境（无认证）

```env
DATABASE_URL="mongodb://localhost:27017/todo"
```

### 开发环境（有认证）

```env
DATABASE_URL="mongodb://root:dev_password@localhost:27017/todo?authSource=admin"
```

### 生产环境

```env
DATABASE_URL="mongodb://root:strong_password@mongodb.example.com:27017/todo?authSource=admin&ssl=true"
```

## ✅ 验证配置

运行以下命令验证配置：

```bash
# 1. 生成 Prisma Client
npm run prisma:generate

# 2. 推送数据库架构
npm run prisma:push

# 3. 如果成功，会看到集合和索引被创建
```

## 🎯 下一步

配置完成后，可以：

1. 填充种子数据：`npm run prisma:seed`
2. 启动应用：`npm run start:dev`
3. 使用 Prisma Studio 查看数据：`npm run prisma:studio`

