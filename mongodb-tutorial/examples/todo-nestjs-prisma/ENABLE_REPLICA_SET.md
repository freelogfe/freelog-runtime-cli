# 启用 MongoDB 副本集配置

## 🔍 问题

错误信息：`This node was not started with replication enabled.`

这说明 MongoDB 服务器没有启用副本集功能，需要在配置文件中启用。

## 🔧 解决方案

### 步骤 1: 找到 MongoDB 配置文件

配置文件通常位于以下位置之一：

- `C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg`
- `C:\Program Files\MongoDB\Server\7.0\bin\mongod.cfg`
- `C:\ProgramData\MongoDB\mongod.cfg`
- MongoDB 数据目录

### 步骤 2: 编辑配置文件

**以管理员身份**打开配置文件，添加或修改以下内容：

```yaml
storage:
  dbPath: C:\Program Files\MongoDB\Server\8.0\data  # 您的数据目录

replication:
  replSetName: rs0

net:
  port: 27017
  bindIp: 127.0.0.1
```

**重要**：只需要添加 `replication` 部分即可，其他配置保持不变。

### 步骤 3: 重启 MongoDB 服务

以管理员身份运行 PowerShell：

```powershell
net stop MongoDB
net start MongoDB
```

或者使用服务管理器：
1. 按 `Win + R`，输入 `services.msc`
2. 找到 "MongoDB" 服务
3. 右键 → 重启

### 步骤 4: 验证服务已启动

```powershell
Get-Service -Name "*mongo*"
```

应该显示状态为 "Running"。

### 步骤 5: 初始化副本集

现在再次运行初始化脚本：

```bash
node init-replica-set.js
```

## 🚀 快速脚本（自动查找并配置）

如果找不到配置文件，可以尝试以下方法：

### 方法 1: 通过服务查找配置

```powershell
# 查找 MongoDB 服务配置
$service = Get-WmiObject Win32_Service -Filter "Name='MongoDB'"
$service.PathName
```

这会显示 MongoDB 的启动命令，其中可能包含配置文件路径。

### 方法 2: 创建新配置文件

如果找不到配置文件，可以创建一个：

1. 找到 MongoDB 数据目录（通常在 `C:\Program Files\MongoDB\Server\8.0\data`）
2. 在 `C:\Program Files\MongoDB\Server\8.0\bin\` 创建 `mongod.cfg`
3. 添加以下内容：

```yaml
storage:
  dbPath: C:\Program Files\MongoDB\Server\8.0\data

replication:
  replSetName: rs0

net:
  port: 27017
  bindIp: 127.0.0.1
```

4. 修改 MongoDB 服务，使用配置文件启动：

```powershell
# 停止服务
net stop MongoDB

# 修改服务启动参数（需要管理员权限）
sc config MongoDB binPath= "\"C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe\" --config \"C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg\" --service"

# 启动服务
net start MongoDB
```

## ✅ 验证

配置完成后：

1. 检查服务状态：`Get-Service MongoDB`
2. 运行初始化脚本：`node init-replica-set.js`
3. 应该看到成功消息

## 🐛 常见问题

### 问题 1: 找不到配置文件

**解决**: MongoDB 可能使用默认配置，需要创建配置文件。

### 问题 2: 权限不足

**解决**: 以管理员身份运行 PowerShell。

### 问题 3: 服务无法启动

**解决**: 
- 检查数据目录权限
- 查看 MongoDB 日志文件
- 确认端口 27017 未被占用

### 问题 4: 配置文件格式错误

**解决**: 确保使用 YAML 格式，注意缩进（使用空格，不要用 Tab）。

## 📝 配置文件示例

完整的 `mongod.cfg` 示例：

```yaml
# 存储配置
storage:
  dbPath: C:\Program Files\MongoDB\Server\8.0\data
  journal:
    enabled: true

# 副本集配置
replication:
  replSetName: rs0

# 网络配置
net:
  port: 27017
  bindIp: 127.0.0.1

# 日志配置
systemLog:
  destination: file
  path: C:\Program Files\MongoDB\Server\8.0\log\mongod.log
  logAppend: true
```

