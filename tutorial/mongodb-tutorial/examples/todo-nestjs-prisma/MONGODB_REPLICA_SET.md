# MongoDB 副本集配置指南

## 问题说明

Prisma 在执行某些操作时需要事务支持，这要求 MongoDB 服务器以**副本集（Replica Set）**模式运行。

错误信息：
```
Prisma needs to perform transactions, which requires your MongoDB server to be run as a replica set.
```

## 🔧 解决方案

### 方案 1: 配置单节点副本集（推荐，适合开发环境）

对于开发环境，可以将 MongoDB 配置为单节点副本集：

#### Windows 系统

1. **停止 MongoDB 服务**（如果正在运行）

2. **创建 MongoDB 配置文件** `mongod.conf`：

```yaml
storage:
  dbPath: D:\mongodb\data  # 修改为您的数据目录
replication:
  replSetName: rs0
net:
  port: 27017
  bindIp: 127.0.0.1
```

3. **使用配置文件启动 MongoDB**：

```bash
mongod --config mongod.conf
```

或者如果 MongoDB 作为服务运行，修改服务配置。

4. **初始化副本集**：

打开新的命令行窗口，连接到 MongoDB：

```bash
mongosh
```

然后执行：

```javascript
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" }
  ]
})
```

等待几秒钟，然后检查状态：

```javascript
rs.status()
```

如果看到 `"ok" : 1`，说明副本集配置成功。

#### Linux/Mac 系统

1. **停止 MongoDB**：

```bash
sudo systemctl stop mongod
# 或
brew services stop mongodb-community
```

2. **编辑配置文件** `/etc/mongod.conf` 或 `/usr/local/etc/mongod.conf`：

```yaml
storage:
  dbPath: /var/lib/mongodb  # 或您的数据目录
replication:
  replSetName: rs0
net:
  port: 27017
  bindIp: 127.0.0.1
```

3. **启动 MongoDB**：

```bash
sudo systemctl start mongod
# 或
brew services start mongodb-community
```

4. **初始化副本集**：

```bash
mongosh
```

```javascript
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" }
  ]
})
```

### 方案 2: 使用 Docker（最简单）

如果您使用 Docker，可以这样启动：

```bash
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  mongo:8 mongod --replSet rs0 --bind_ip_all
```

然后初始化副本集：

```bash
docker exec -it mongodb mongosh --eval "rs.initiate()"
```

### 方案 3: 修改连接字符串（如果使用远程 MongoDB）

如果您的 MongoDB 已经配置为副本集，确保连接字符串正确：

```
mongodb://localhost:27017/todo?replicaSet=rs0
```

## ✅ 验证配置

1. **检查副本集状态**：

```bash
mongosh
rs.status()
```

应该看到 `"ok" : 1` 和 `"set" : "rs0"`。

2. **重启应用**：

```bash
pnpm run start:dev
```

3. **测试创建 Todo**：

在浏览器中访问 `http://localhost:3000`，尝试创建一个 Todo。

## 🐛 故障排除

### 问题 1: `rs.initiate()` 失败

**错误**: `already initialized`

**解决**: 如果已经初始化过，可以重置：

```javascript
rs.remove("localhost:27017")
rs.initiate()
```

### 问题 2: MongoDB 服务无法启动

**检查**:
- 数据目录权限
- 端口是否被占用
- 日志文件中的错误信息

### 问题 3: 副本集状态异常

**检查**:
```javascript
rs.status()
```

确保至少有一个成员状态为 `PRIMARY`。

## 📚 参考文档

- [MongoDB 副本集文档](https://www.mongodb.com/docs/manual/replication/)
- [Prisma MongoDB 事务文档](https://www.prisma.io/docs/concepts/components/prisma-client/transactions)

## 💡 注意事项

- **开发环境**: 单节点副本集足够使用
- **生产环境**: 建议使用至少 3 个节点的副本集
- **性能**: 单节点副本集对性能影响很小，可以放心使用

