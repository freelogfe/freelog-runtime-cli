# 编辑 MongoDB 配置文件（权限问题解决）

## ⚠️ 问题

无法保存 `mongod.cfg` 文件，因为文件位于受保护的系统目录，需要管理员权限。

## 🔧 解决方案

### 方法 1: 使用管理员权限的记事本（最简单）

1. **以管理员身份打开记事本**：
   - 按 `Win + S`，搜索 "记事本"
   - 右键点击"记事本"
   - 选择"以管理员身份运行"

2. **打开配置文件**：
   - 在记事本中：文件 → 打开
   - 导航到：`C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg`
   - 选择"所有文件 (*.*)"
   - 打开文件

3. **添加配置**：
   在文件末尾添加：
   ```yaml
   replication:
     replSetName: rs0
   ```

4. **保存文件**：
   - 文件 → 保存
   - 现在应该可以保存了

### 方法 2: 使用 PowerShell（推荐）

以管理员身份打开 PowerShell，运行：

```powershell
# 找到配置文件路径
$configPath = "C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg"

# 检查文件是否存在
if (Test-Path $configPath) {
    # 备份原文件
    Copy-Item $configPath "$configPath.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
    
    # 读取现有内容
    $content = Get-Content $configPath -Raw
    
    # 检查是否已包含副本集配置
    if ($content -notmatch "replSetName") {
        # 添加副本集配置
        $replicationConfig = @"

# 副本集配置
replication:
  replSetName: rs0
"@
        
        # 追加到文件
        Add-Content -Path $configPath -Value $replicationConfig -Encoding UTF8
        Write-Host "✅ 配置已添加" -ForegroundColor Green
    } else {
        Write-Host "✅ 配置文件已包含副本集设置" -ForegroundColor Green
    }
    
    # 重启 MongoDB 服务
    Write-Host "`n🔄 正在重启 MongoDB 服务..." -ForegroundColor Cyan
    Restart-Service -Name "*mongo*" -Force
    Write-Host "✅ MongoDB 服务已重启" -ForegroundColor Green
} else {
    Write-Host "❌ 未找到配置文件: $configPath" -ForegroundColor Red
    Write-Host "请检查 MongoDB 安装路径" -ForegroundColor Yellow
}
```

### 方法 3: 使用我们的自动配置脚本

最简单的方法，运行我们提供的脚本：

```powershell
# 以管理员身份运行 PowerShell
cd D:\freelog\freelog-activity-service\docs\mongodb-tutorial\examples\todo-nestjs-prisma
.\setup-replica-set.ps1
```

脚本会自动处理所有配置。

### 方法 4: 使用 VSCode/Cursor 以管理员身份运行

1. **关闭当前的 Cursor**
2. **以管理员身份打开 Cursor**：
   - 找到 Cursor 快捷方式
   - 右键 → 属性
   - 兼容性 → 勾选"以管理员身份运行此程序"
   - 或者右键快捷方式 → "以管理员身份运行"

3. **然后打开配置文件编辑**

## ✅ 配置完成后

无论使用哪种方法，配置完成后：

1. **重启 MongoDB 服务**（如果脚本没有自动重启）：
   ```powershell
   net stop MongoDB
   net start MongoDB
   ```

2. **初始化副本集**：
   ```bash
   node init-replica-set.js
   ```

3. **重启 NestJS 应用**：
   ```bash
   pnpm run start:dev
   ```

## 🎯 推荐方案

**最简单**：使用方法 3（运行 `setup-replica-set.ps1` 脚本）

**最快**：使用方法 2（PowerShell 命令）

