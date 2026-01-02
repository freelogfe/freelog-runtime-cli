# MongoDB 连接超时问题解决

## ⚠️ 错误信息

```
Server selection timed out after 30000 ms
```

这说明 MongoDB 服务可能没有正常运行，或者配置副本集后服务没有正确启动。

## 🔍 诊断步骤

### 1. 检查 MongoDB 服务状态

```powershell
Get-Service -Name "*mongo*"
```

如果状态不是 "Running"，需要启动服务。

### 2. 检查端口是否监听

```powershell
Test-NetConnection -ComputerName localhost -Port 27017
```

如果连接失败，说明 MongoDB 没有监听端口。

## 🔧 解决方案

### 方案 1: 启动 MongoDB 服务

```powershell
# 以管理员身份运行
Start-Service -Name "MongoDB"
# 或者
net start MongoDB
```

### 方案 2: 检查 MongoDB 日志

MongoDB 日志通常位于：
- `C:\Program Files\MongoDB\Server\8.0\log\mongod.log`

查看日志中的错误信息：

```powershell
Get-Content "C:\Program Files\MongoDB\Server\8.0\log\mongod.log" -Tail 50
```

### 方案 3: 检查配置文件是否正确

如果配置文件有语法错误，MongoDB 可能无法启动。

检查配置文件：
```powershell
Get-Content "C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg"
```

确保 YAML 格式正确：
- 使用空格缩进（不要用 Tab）
- 冒号后面有空格
- 缩进一致

### 方案 4: 手动启动 MongoDB（测试）

如果服务无法启动，可以尝试手动启动来查看错误：

```powershell
cd "C:\Program Files\MongoDB\Server\8.0\bin"
.\mongod.exe --config mongod.cfg
```

这会显示详细的错误信息。

### 方案 5: 恢复备份配置

如果配置文件有问题，可以恢复备份：

```powershell
$configPath = "C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg"
$backupFiles = Get-ChildItem "$configPath.backup*" | Sort-Object LastWriteTime -Descending
if ($backupFiles) {
    Copy-Item $backupFiles[0].FullName $configPath -Force
    Write-Host "已恢复备份配置" -ForegroundColor Green
}
```

然后重新启动服务。

## ✅ 完整修复流程

1. **检查服务状态**：
   ```powershell
   Get-Service -Name "*mongo*"
   ```

2. **如果服务未运行，启动服务**：
   ```powershell
   Start-Service -Name "MongoDB"
   ```

3. **等待几秒让服务完全启动**：
   ```powershell
   Start-Sleep -Seconds 5
   ```

4. **验证连接**：
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 27017
   ```

5. **如果连接成功，初始化副本集**：
   ```bash
   node init-replica-set.js
   ```

## 🐛 常见问题

### 问题 1: 配置文件语法错误

**症状**: MongoDB 服务无法启动

**解决**: 
- 检查 YAML 格式
- 确保缩进使用空格而不是 Tab
- 检查是否有特殊字符

### 问题 2: 端口被占用

**症状**: MongoDB 无法绑定到端口 27017

**解决**:
```powershell
# 查找占用端口的进程
netstat -ano | findstr :27017

# 结束进程（替换 PID）
taskkill /PID <PID> /F
```

### 问题 3: 数据目录权限问题

**症状**: MongoDB 无法写入数据目录

**解决**:
- 检查数据目录权限
- 确保 MongoDB 服务账户有写权限

## 🎯 快速修复脚本

运行以下 PowerShell 脚本（以管理员身份）：

```powershell
# 检查并启动 MongoDB 服务
$service = Get-Service -Name "*mongo*" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($service) {
    if ($service.Status -ne "Running") {
        Write-Host "正在启动 MongoDB 服务..." -ForegroundColor Yellow
        Start-Service -Name $service.Name
        Start-Sleep -Seconds 5
    }
    
    if ((Get-Service -Name $service.Name).Status -eq "Running") {
        Write-Host "✅ MongoDB 服务正在运行" -ForegroundColor Green
        
        # 测试连接
        $connection = Test-NetConnection -ComputerName localhost -Port 27017 -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($connection) {
            Write-Host "✅ MongoDB 端口连接正常" -ForegroundColor Green
            Write-Host "`n现在可以运行: node init-replica-set.js" -ForegroundColor Yellow
        } else {
            Write-Host "❌ MongoDB 端口连接失败" -ForegroundColor Red
            Write-Host "请检查 MongoDB 日志文件" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ MongoDB 服务启动失败" -ForegroundColor Red
        Write-Host "请检查配置文件和服务日志" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ 未找到 MongoDB 服务" -ForegroundColor Red
}
```

