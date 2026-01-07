# MongoDB 副本集自动配置脚本
# 需要以管理员身份运行

Write-Host "`n🔍 正在查找 MongoDB 配置文件..." -ForegroundColor Cyan

# 查找配置文件
$configPaths = @(
    "C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg",
    "C:\Program Files\MongoDB\Server\7.0\bin\mongod.cfg",
    "C:\Program Files\MongoDB\Server\6.0\bin\mongod.cfg",
    "C:\ProgramData\MongoDB\mongod.cfg"
)

$configFile = $null
foreach ($path in $configPaths) {
    if (Test-Path $path) {
        $configFile = $path
        Write-Host "✅ 找到配置文件: $path" -ForegroundColor Green
        break
    }
}

if (-not $configFile) {
    Write-Host "❌ 未找到配置文件，尝试查找 MongoDB 服务..." -ForegroundColor Yellow
    
    # 尝试从服务中获取配置
    $service = Get-Service -Name "*mongo*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($service) {
        Write-Host "找到 MongoDB 服务: $($service.Name)" -ForegroundColor Green
        
        # 尝试创建默认配置文件
        $possiblePaths = @(
            "C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg",
            "C:\Program Files\MongoDB\Server\7.0\bin\mongod.cfg"
        )
        
        foreach ($path in $possiblePaths) {
            $dir = Split-Path $path -Parent
            if (Test-Path $dir) {
                $configFile = $path
                Write-Host "将在以下位置创建配置文件: $path" -ForegroundColor Yellow
                break
            }
        }
    }
}

if (-not $configFile) {
    Write-Host "`n❌ 无法找到或创建配置文件" -ForegroundColor Red
    Write-Host "`n请手动执行以下步骤：" -ForegroundColor Yellow
    Write-Host "1. 找到 MongoDB 安装目录（通常在 C:\Program Files\MongoDB\Server\8.0\bin\）"
    Write-Host "2. 创建或编辑 mongod.cfg 文件"
    Write-Host "3. 添加以下内容："
    Write-Host "   replication:"
    Write-Host "     replSetName: rs0"
    Write-Host "4. 重启 MongoDB 服务"
    exit 1
}

# 读取现有配置
$configContent = ""
if (Test-Path $configFile) {
    $configContent = Get-Content $configFile -Raw -Encoding UTF8
    Write-Host "`n📄 当前配置文件内容：" -ForegroundColor Cyan
    Write-Host $configContent
}

# 检查是否已配置副本集
if ($configContent -match "replSetName") {
    Write-Host "`n✅ 配置文件已包含副本集设置" -ForegroundColor Green
    Write-Host "`n请重启 MongoDB 服务，然后运行: node init-replica-set.js" -ForegroundColor Yellow
    exit 0
}

# 添加副本集配置
Write-Host "`n🔧 正在添加副本集配置..." -ForegroundColor Cyan

# 创建备份
if (Test-Path $configFile) {
    $backupFile = "$configFile.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $configFile $backupFile
    Write-Host "✅ 已创建备份: $backupFile" -ForegroundColor Green
}

# 准备新配置
$replicationConfig = @"

# 副本集配置
replication:
  replSetName: rs0
"@

# 如果文件存在，追加配置；否则创建新文件
if (Test-Path $configFile) {
    # 检查文件末尾是否有换行
    if (-not $configContent.EndsWith("`n") -and -not $configContent.EndsWith("`r`n")) {
        $replicationConfig = "`n" + $replicationConfig
    }
    Add-Content -Path $configFile -Value $replicationConfig -Encoding UTF8
} else {
    # 创建新配置文件
    $defaultConfig = @"
# MongoDB 配置文件
# 存储配置
storage:
  dbPath: C:\Program Files\MongoDB\Server\8.0\data

# 网络配置
net:
  port: 27017
  bindIp: 127.0.0.1

$replicationConfig
"@
    Set-Content -Path $configFile -Value $defaultConfig -Encoding UTF8
}

Write-Host "✅ 配置已添加" -ForegroundColor Green

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "`n⚠️  需要管理员权限来重启 MongoDB 服务" -ForegroundColor Yellow
    Write-Host "`n请以管理员身份运行以下命令：" -ForegroundColor Yellow
    Write-Host "  net stop MongoDB" -ForegroundColor Cyan
    Write-Host "  net start MongoDB" -ForegroundColor Cyan
    Write-Host "`n然后运行: node init-replica-set.js" -ForegroundColor Yellow
} else {
    Write-Host "`n🔄 正在重启 MongoDB 服务..." -ForegroundColor Cyan
    
    try {
        $service = Get-Service -Name "*mongo*" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($service) {
            Stop-Service -Name $service.Name -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Start-Service -Name $service.Name
            Write-Host "✅ MongoDB 服务已重启" -ForegroundColor Green
            Write-Host "`n⏳ 等待服务启动..." -ForegroundColor Yellow
            Start-Sleep -Seconds 3
        } else {
            Write-Host "⚠️  未找到 MongoDB 服务，请手动重启" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  无法自动重启服务: $_" -ForegroundColor Yellow
        Write-Host "请手动重启 MongoDB 服务" -ForegroundColor Yellow
    }
}

Write-Host "`n✅ 配置完成！" -ForegroundColor Green
Write-Host "`n下一步：运行以下命令初始化副本集" -ForegroundColor Yellow
Write-Host "  node init-replica-set.js" -ForegroundColor Cyan

