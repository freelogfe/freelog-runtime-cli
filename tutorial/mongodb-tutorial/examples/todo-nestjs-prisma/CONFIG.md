# MongoDB 配置说明

## 📋 连接信息

- **URL**: `mongodb://localhost:27017/`
- **用户名**: `root`
- **数据库名**: `todo`

## ⚙️ 配置步骤

### 1. 创建 .env 文件

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

或手动创建 `.env` 文件，内容如下：

```env
# MongoDB 连接字符串
DATABASE_URL="mongodb://localhost:27017/todo"
```

### 2. 如果 MongoDB 启用了认证

如果您的 MongoDB 启用了认证，需要提供密码：

```env
DATABASE_URL="mongodb://root:your_password@localhost:27017/todo?authSource=admin"
```

**重要**：
- 将 `your_password` 替换为实际的 root 用户密码
- `authSource=admin` 指定认证数据库（通常是 `admin`）

### 3. 验证配置

运行以下命令验证连接：

```bash
# 生成 Prisma Client（会测试连接）
npm run prisma:generate

# 推送数据库架构（会测试连接并创建集合）
npm run prisma:push
```

如果连接成功，会看到：
```
✔ Generated Prisma Client
✔ Database schema pushed successfully
```

## 🔍 测试连接

### 使用 MongoDB Shell

```bash
# 无认证
mongosh mongodb://localhost:27017/todo

# 有认证
mongosh "mongodb://root:password@localhost:27017/todo?authSource=admin"
```

### 使用 Prisma Studio

```bash
npm run prisma:studio
```

这会打开一个 Web 界面，可以在浏览器中查看和编辑数据库数据。

## ⚠️ 常见问题

### 认证失败

如果看到认证错误，请检查：
1. 密码是否正确
2. `authSource=admin` 参数是否正确
3. root 用户是否有访问 todo 数据库的权限

### 连接被拒绝

如果看到连接被拒绝错误：
1. 确认 MongoDB 服务已启动
2. 检查端口是否正确（27017）
3. 检查防火墙设置

## ✅ 配置完成

配置完成后，可以：

1. **推送数据库架构**：
   ```bash
   npm run prisma:push
   ```

2. **填充种子数据**（可选）：
   ```bash
   npm run prisma:seed
   ```

3. **启动应用**：
   ```bash
   npm run start:dev
   ```

应用将在 `http://localhost:3000` 启动，API 前缀为 `/api`。

