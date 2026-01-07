# MongoDB 副本集快速修复指南

## 🎯 最简单的方法：使用 MongoDB Compass

如果您安装了 MongoDB Compass（MongoDB 官方图形界面工具），这是最简单的方法：

### 步骤 1: 打开 MongoDB Compass

1. 启动 MongoDB Compass
2. 连接到 `mongodb://localhost:27017`（或您的连接字符串）

### 步骤 2: 打开 MongoSH

1. 在 Compass 左下角找到 "MongoSH" 标签
2. 点击打开 Shell

### 步骤 3: 初始化副本集

在 Shell 中输入并执行：

```javascript
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" }
  ]
})
```

### 步骤 4: 检查状态

等待几秒钟，然后运行：

```javascript
rs.status()
```

如果看到 `"ok" : 1`，说明成功！

## 🔧 方法 2: 安装 MongoDB Shell

### 下载 MongoDB Shell

访问：https://www.mongodb.com/try/download/shell

下载 Windows 版本的 `mongosh`，解压后：

1. 将 `mongosh.exe` 所在目录添加到系统 PATH
2. 或直接使用完整路径运行

### 使用完整路径运行

```powershell
# 假设解压到 D:\mongosh
& "D:\mongosh\bin\mongosh.exe"
```

然后执行初始化命令。

## 🔧 方法 3: 通过配置文件（如果 MongoDB 作为服务运行）

### 步骤 1: 找到配置文件

配置文件通常位于：
- `C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg`
- 或 MongoDB 数据目录

### 步骤 2: 编辑配置文件

以管理员身份编辑配置文件，添加：

```yaml
replication:
  replSetName: rs0
```

### 步骤 3: 重启 MongoDB 服务

```powershell
# 以管理员身份运行
net stop MongoDB
net start MongoDB
```

### 步骤 4: 初始化副本集

使用 MongoDB Compass 或安装的 mongosh 连接并执行：

```javascript
rs.initiate()
```

## 📝 方法 4: 使用 Node.js 脚本（无需安装 mongosh）

创建一个临时脚本文件 `init-replica-set.js`：

```javascript
const { MongoClient } = require('mongodb');

async function initReplicaSet() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    const admin = client.db().admin();
    
    try {
      const result = await admin.command({
        replSetInitiate: {
          _id: "rs0",
          members: [
            { _id: 0, host: "localhost:27017" }
          ]
        }
      });
      console.log('✅ 副本集初始化成功:', result);
    } catch (error) {
      if (error.codeName === 'AlreadyInitialized') {
        console.log('✅ 副本集已经初始化');
        const status = await admin.command({ replSetGetStatus: 1 });
        console.log('当前状态:', status.set);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await client.close();
  }
}

initReplicaSet();
```

然后运行：

```bash
cd docs/mongodb-tutorial/examples/todo-nestjs-prisma
node init-replica-set.js
```

## ✅ 验证配置

无论使用哪种方法，最后都要验证：

```javascript
rs.status()
```

应该看到 `"ok" : 1` 和 `"set" : "rs0"`。

## 🎉 完成后

重启您的 NestJS 应用：

```bash
pnpm run start:dev
```

然后在浏览器访问 `http://localhost:3000`，尝试创建 Todo。

## 💡 推荐方案

**最简单**: 使用 MongoDB Compass 的 MongoSH 功能（如果已安装）

**最快速**: 使用方法 4 的 Node.js 脚本（无需额外安装）

