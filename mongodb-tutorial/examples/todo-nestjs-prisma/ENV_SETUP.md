# .env 文件配置说明

## ✅ .env 文件已创建

`.env` 文件已创建在项目根目录，包含以下配置：

```env
DATABASE_URL="mongodb://localhost:27017/todo"
PORT=3000
NODE_ENV=development
```

## 📝 配置说明

### MongoDB 连接配置

- **URL**: `mongodb://localhost:27017/`
- **用户名**: `root`
- **数据库名**: `todo`
- **连接字符串**: `mongodb://localhost:27017/todo`

### 如果 MongoDB 启用了认证

如果您的 MongoDB 启用了认证，需要修改 `.env` 文件：

```env
DATABASE_URL="mongodb://root:your_password@localhost:27017/todo?authSource=admin"
```

**注意**：
- 将 `your_password` 替换为实际的 root 用户密码
- `authSource=admin` 指定认证数据库

## 🔍 验证配置

运行以下命令验证配置：

```bash
# 1. 生成 Prisma Client（会测试连接）
npm run prisma:generate

# 2. 推送数据库架构（会测试连接并创建集合）
npm run prisma:push
```

如果连接成功，会看到：
```
✔ Generated Prisma Client
✔ Database schema pushed successfully
```

## 📍 文件位置

`.env` 文件位于：
```
docs/mongodb-tutorial/examples/todo-nestjs-prisma/.env
```

## ⚠️ 注意事项

1. `.env` 文件不应提交到 Git（已在 `.gitignore` 中）
2. 确保 MongoDB 服务已启动
3. 如果连接失败，检查 MongoDB 是否启用认证

## 🚀 下一步

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

