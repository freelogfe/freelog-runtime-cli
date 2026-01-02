# MongoDB 副本集快速配置（Windows）

## 🚀 快速解决方案

Prisma 需要 MongoDB 以副本集模式运行。以下是 Windows 下的快速配置步骤：

## 方法 1: 使用 MongoDB Shell 配置（最简单）

### 步骤 1: 连接到 MongoDB

打开 PowerShell 或 CMD，运行：

```bash
mongosh
```

### 步骤 2: 初始化副本集

在 MongoDB Shell 中执行：

```javascript
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" }
  ]
})
```

### 步骤 3: 检查状态

等待几秒钟，然后运行：

```javascript
rs.status()
```

如果看到 `"ok" : 1` 和 `"set" : "rs0"`，说明配置成功！

### 步骤 4: 更新连接字符串（可选）

如果配置成功，连接字符串可以保持不变，或者添加副本集参数：

```
DATABASE_URL="mongodb://localhost:27017/todo?replicaSet=rs0"
```

## 方法 2: 使用配置文件（永久配置）

### 步骤 1: 找到 MongoDB 配置文件

通常位于：
- `C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg`
- 或您的 MongoDB 安装目录

### 步骤 2: 编辑配置文件

添加以下配置：

```yaml
storage:
  dbPath: D:\mongodb\data  # 修改为您的实际数据目录

replication:
  replSetName: rs0

net:
  port: 27017
  bindIp: 127.0.0.1
```

### 步骤 3: 重启 MongoDB 服务

```powershell
# 停止服务
net stop MongoDB

# 启动服务
net start MongoDB
```

### 步骤 4: 初始化副本集

```bash
mongosh
rs.initiate()
```

## ✅ 验证配置

运行以下命令验证：

```bash
mongosh
rs.status()
```

应该看到类似输出：

```json
{
  "set" : "rs0",
  "myState" : 1,
  "members" : [
    {
      "_id" : 0,
      "name" : "localhost:27017",
      "stateStr" : "PRIMARY"
    }
  ],
  "ok" : 1
}
```

## 🔄 重启应用

配置完成后，重启您的 NestJS 应用：

```bash
pnpm run start:dev
```

## 🐛 常见问题

### 问题 1: `rs.initiate()` 返回错误

**错误**: `already initialized` 或 `replSetInitiate`

**解决**: 如果已经初始化过，先检查状态：

```javascript
rs.status()
```

如果需要重置：

```javascript
// 仅在开发环境使用！
rs.remove("localhost:27017")
rs.initiate()
```

### 问题 2: MongoDB 服务无法启动

**检查**:
1. 数据目录是否存在且有写权限
2. 端口 27017 是否被占用
3. 查看 MongoDB 日志文件

### 问题 3: 连接失败

**检查**:
- MongoDB 服务是否正在运行
- 连接字符串是否正确
- 防火墙设置

## 📝 注意事项

- ✅ **单节点副本集**适合开发环境
- ✅ 对性能影响很小
- ✅ 配置一次即可，后续自动生效
- ⚠️ 生产环境建议使用多节点副本集

## 🎉 完成！

配置完成后，您的 Prisma 应用就可以正常使用 MongoDB 8 了！

