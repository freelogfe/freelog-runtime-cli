# MongoDB 副本集配置（Windows - 详细版）

## 🔍 问题诊断

如果 `mongosh` 命令无法识别，请先找到 MongoDB 的安装路径。

## 📍 方法 1: 找到 MongoDB Shell 路径

### 步骤 1: 查找 MongoDB 安装目录

MongoDB 通常安装在以下位置之一：

- `C:\Program Files\MongoDB\Server\8.0\bin\`
- `C:\Program Files\MongoDB\Server\7.0\bin\`
- `C:\Program Files\MongoDB\Server\6.0\bin\`
- `C:\mongodb\bin\`

### 步骤 2: 使用完整路径运行

打开 PowerShell，使用完整路径运行：

```powershell
# 替换为您的实际路径
& "C:\Program Files\MongoDB\Server\8.0\bin\mongosh.exe"
```

或者先切换到 MongoDB bin 目录：

```powershell
cd "C:\Program Files\MongoDB\Server\8.0\bin"
.\mongosh.exe
```

### 步骤 3: 初始化副本集

在 MongoDB Shell 中执行：

```javascript
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" }
  ]
})
```

等待几秒后检查状态：

```javascript
rs.status()
```

## 📍 方法 2: 使用 MongoDB Compass（图形界面）

如果您安装了 MongoDB Compass：

1. 打开 MongoDB Compass
2. 连接到 `mongodb://localhost:27017`
3. 点击左下角的 "MongoSH" 标签
4. 在 Shell 中执行：

```javascript
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" }
  ]
})
```

## 📍 方法 3: 通过配置文件配置（永久方案）

### 步骤 1: 找到 MongoDB 配置文件

配置文件通常位于：
- `C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg`
- 或 MongoDB 数据目录

### 步骤 2: 编辑配置文件

使用管理员权限打开配置文件，添加：

```yaml
storage:
  dbPath: C:\Program Files\MongoDB\Server\8.0\data  # 修改为您的数据目录

replication:
  replSetName: rs0

net:
  port: 27017
  bindIp: 127.0.0.1
```

### 步骤 3: 重启 MongoDB 服务

```powershell
# 以管理员身份运行 PowerShell
net stop MongoDB
net start MongoDB
```

### 步骤 4: 初始化副本集

使用完整路径连接：

```powershell
& "C:\Program Files\MongoDB\Server\8.0\bin\mongosh.exe"
```

然后执行：

```javascript
rs.initiate()
```

## 📍 方法 4: 添加 MongoDB 到 PATH（推荐）

### 步骤 1: 找到 MongoDB bin 目录

通常位于：`C:\Program Files\MongoDB\Server\8.0\bin`

### 步骤 2: 添加到系统 PATH

1. 右键"此电脑" → "属性"
2. 点击"高级系统设置"
3. 点击"环境变量"
4. 在"系统变量"中找到 `Path`，点击"编辑"
5. 点击"新建"，添加 MongoDB bin 目录路径
6. 点击"确定"保存

### 步骤 3: 重启 PowerShell

关闭并重新打开 PowerShell，然后运行：

```powershell
mongosh
```

## 🔧 快速检查脚本

在 PowerShell 中运行以下脚本查找 MongoDB：

```powershell
$paths = @(
    "C:\Program Files\MongoDB\Server\8.0\bin\mongosh.exe",
    "C:\Program Files\MongoDB\Server\7.0\bin\mongosh.exe",
    "C:\Program Files\MongoDB\Server\6.0\bin\mongosh.exe",
    "C:\mongodb\bin\mongosh.exe"
)

foreach($path in $paths) {
    if(Test-Path $path) {
        Write-Host "找到 MongoDB Shell: $path" -ForegroundColor Green
        Write-Host "运行命令: & `"$path`""
        break
    }
}

if(-not (Test-Path $path)) {
    Write-Host "未找到 MongoDB Shell，请检查安装路径" -ForegroundColor Red
}
```

## ✅ 验证配置

配置完成后，运行：

```javascript
rs.status()
```

应该看到：

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

## 🎯 完成后

重启您的 NestJS 应用：

```bash
cd docs/mongodb-tutorial/examples/todo-nestjs-prisma
pnpm run start:dev
```

然后在浏览器中访问 `http://localhost:3000`，尝试创建 Todo。

## 🐛 常见问题

### 问题 1: 找不到 MongoDB

**解决**: 
- 检查 MongoDB 是否已安装
- 使用 MongoDB Compass 连接测试
- 查看 Windows 服务中是否有 MongoDB 服务

### 问题 2: 权限不足

**解决**: 以管理员身份运行 PowerShell

### 问题 3: 服务无法启动

**解决**: 
- 检查数据目录权限
- 查看 MongoDB 日志文件
- 确认端口 27017 未被占用

