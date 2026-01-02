# MongoDB 服务无法启动问题解决

## ⚠️ 当前问题

从日志看，MongoDB 在最近关闭了，服务虽然显示运行中，但实际上没有正常启动。

## 🔍 诊断

### 1. 检查服务状态

```powershell
Get-Service -Name "*mongo*"
```

### 2. 查看最新日志

```powershell
Get-Content "C:\Program Files\MongoDB\Server\8.0\log\mongod.log" -Tail 50
```

查找错误信息（ERROR 或 FATAL）。

### 3. 检查配置文件

配置文件可能不存在或路径不对。MongoDB 可能使用默认配置。

## 🔧 解决方案

### 方案 1: 手动启动 MongoDB（查看错误）

以管理员身份运行 PowerShell：

```powershell
cd "C:\Program Files\MongoDB\Server\8.0\bin"

# 尝试手动启动，查看错误信息
.\mongod.exe --dbpath "C:\Program Files\MongoDB\Server\8.0\data" --port 27017 --replSet rs0
```

这会显示详细的错误信息。

### 方案 2: 创建配置文件

如果配置文件不存在，创建一个：

```powershell
# 以管理员身份运行
$configPath = "C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg"
$dataPath = "C:\Program Files\MongoDB\Server\8.0\data"
$logPath = "C:\Program Files\MongoDB\Server\8.0\log"

# 确保目录存在
New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
New-Item -ItemType Directory -Force -Path $logPath | Out-Null

# 创建配置文件
$config = @"
storage:
  dbPath: $dataPath
  journal:
    enabled: true

replication:
  replSetName: rs0

net:
  port: 27017
  bindIp: 127.0.0.1

systemLog:
  destination: file
  path: $logPath\mongod.log
  logAppend: true
"@

Set-Content -Path $configPath -Value $config -Encoding UTF8
Write-Host "✅ 配置文件已创建: $configPath" -ForegroundColor Green
```

### 方案 3: 重新安装 MongoDB 服务

如果服务配置有问题，可以重新安装：

```powershell
# 停止并删除服务
Stop-Service -Name "MongoDB" -Force -ErrorAction SilentlyContinue
sc.exe delete MongoDB

# 重新安装服务（使用配置文件）
cd "C:\Program Files\MongoDB\Server\8.0\bin"
.\mongod.exe --config mongod.cfg --install --serviceName "MongoDB"

# 启动服务
Start-Service -Name "MongoDB"
```

### 方案 4: 使用 MongoDB Compass 测试连接

如果 MongoDB Compass 可以连接，说明 MongoDB 实际在运行，可能是连接字符串的问题。

## ✅ 快速修复脚本

运行以下脚本（以管理员身份）：

```powershell
# 检查并修复 MongoDB
$binPath = "C:\Program Files\MongoDB\Server\8.0\bin"
$dataPath = "C:\Program Files\MongoDB\Server\8.0\data"
$logPath = "C:\Program Files\MongoDB\Server\8.0\log"
$configPath = "$binPath\mongod.cfg"

# 确保目录存在
New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
New-Item -ItemType Directory -Force -Path $logPath | Out-Null

# 创建配置文件（如果不存在）
if (-not (Test-Path $configPath)) {
    $config = @"
storage:
  dbPath: $dataPath
  journal:
    enabled: true

replication:
  replSetName: rs0

net:
  port: 27017
  bindIp: 127.0.0.1

systemLog:
  destination: file
  path: $logPath\mongod.log
  logAppend: true
"@
    Set-Content -Path $configPath -Value $config -Encoding UTF8
    Write-Host "✅ 配置文件已创建" -ForegroundColor Green
}

# 重启服务
$service = Get-Service -Name "*mongo*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($service) {
    Restart-Service -Name $service.Name -Force
    Start-Sleep -Seconds 5
    
    if ((Get-Service -Name $service.Name).Status -eq "Running") {
        Write-Host "✅ MongoDB 服务已启动" -ForegroundColor Green
    } else {
        Write-Host "❌ MongoDB 服务启动失败，请查看日志" -ForegroundColor Red
    }
}
```

## 🎯 下一步

配置完成后：

1. **验证连接**：
   ```bash
   node check-mongodb-status.js
   ```

2. **初始化副本集**（如果还未初始化）：
   ```bash
   node init-replica-set.js
   ```

3. **重启 NestJS 应用**：
   ```bash
   pnpm run start:dev
   ```

