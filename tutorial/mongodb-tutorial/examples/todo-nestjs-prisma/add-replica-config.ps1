# 快速添加 MongoDB 副本集配置脚本
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
    Write-Host "`n❌ 未找到配置文件" -ForegroundColor Red
    Write-Host "`n请手动指定配置文件路径，或检查 MongoDB 安装路径" -ForegroundColor Yellow
    exit 1
}

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "`n⚠️  需要管理员权限来编辑配置文件" -ForegroundColor Yellow
    Write-Host "`n请以管理员身份重新运行此脚本" -ForegroundColor Yellow
    exit 1
}

# 备份原文件
$backupFile = "$configFile.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
try {
    Copy-Item $configFile $backupFile -Force
    Write-Host "✅ 已创建备份: $backupFile" -ForegroundColor Green
} catch {
    Write-Host "⚠️  无法创建备份: $_" -ForegroundColor Yellow
}

# 读取现有内容
try {
    $content = Get-Content $configFile -Raw -Encoding UTF8
} catch {
    Write-Host "❌ 无法读取配置文件: $_" -ForegroundColor Red
    exit 1
}

# 检查是否已包含副本集配置
if ($content -match "replSetName") {
    Write-Host "`n✅ 配置文件已包含副本集设置" -ForegroundColor Green
    Write-Host "`n请重启 MongoDB 服务，然后运行: node init-replica-set.js" -ForegroundColor Yellow
    
    # 询问是否重启服务
    $restart = Read-Host "`n是否现在重启 MongoDB 服务? (Y/N)"
    if ($restart -eq "Y" -or $restart -eq "y") {
        try {
            $service = Get-Service -Name "*mongo*" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($service) {
                Restart-Service -Name $service.Name -Force
                Write-Host "✅ MongoDB 服务已重启" -ForegroundColor Green
            }
        } catch {
            Write-Host "⚠️  无法重启服务: $_" -ForegroundColor Yellow
        }
    }
    exit 0
}

# 添加副本集配置
Write-Host "`n🔧 正在添加副本集配置..." -ForegroundColor Cyan

$replicationConfig = @"

# 副本集配置
replication:
  replSetName: rs0
"@

# 确保文件末尾有换行
if (-not $content.EndsWith("`n") -and -not $content.EndsWith("`r`n")) {
    $replicationConfig = "`n" + $replicationConfig
}

try {
    Add-Content -Path $configFile -Value $replicationConfig -Encoding UTF8
    Write-Host "✅ 配置已添加" -ForegroundColor Green
} catch {
    Write-Host "❌ 无法写入配置文件: $_" -ForegroundColor Red
    Write-Host "`n请手动编辑配置文件，添加以下内容：" -ForegroundColor Yellow
    Write-Host $replicationConfig -ForegroundColor Cyan
    exit 1
}

# 重启 MongoDB 服务
Write-Host "`n🔄 正在重启 MongoDB 服务..." -ForegroundColor Cyan
try {
    $service = Get-Service -Name "*mongo*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($service) {
        Restart-Service -Name $service.Name -Force
        Write-Host "✅ MongoDB 服务已重启" -ForegroundColor Green
        Write-Host "⏳ 等待服务启动..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    } else {
        Write-Host "⚠️  未找到 MongoDB 服务，请手动重启" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  无法重启服务: $_" -ForegroundColor Yellow
    Write-Host "请手动重启 MongoDB 服务" -ForegroundColor Yellow
}

Write-Host "`n✅ 配置完成！" -ForegroundColor Green
Write-Host "`n下一步：运行以下命令初始化副本集" -ForegroundColor Yellow
Write-Host "  node init-replica-set.js" -ForegroundColor Cyan

