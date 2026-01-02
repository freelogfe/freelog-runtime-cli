# MongoDB 副本集快速配置指南

## ⚠️ 当前错误

错误信息：`This node was not started with replication enabled.`

这说明 MongoDB 服务器**还没有启用副本集功能**，需要先配置 MongoDB 服务器。

## 🚀 快速解决方案

### 步骤 1: 以管理员身份打开 PowerShell

右键点击 PowerShell，选择"以管理员身份运行"

### 步骤 2: 允许运行脚本（如果需要）

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 步骤 3: 运行配置脚本

```powershell
cd D:\freelog\freelog-activity-service\docs\mongodb-tutorial\examples\todo-nestjs-prisma
.\setup-replica-set.ps1
```

脚本会自动：
1. 查找 MongoDB 配置文件
2. 添加副本集配置
3. 重启 MongoDB 服务

### 步骤 4: 初始化副本集

配置完成后，运行：

```bash
node init-replica-set.js
```

## 🔧 手动配置方法（如果脚本无法运行）

### 1. 找到 MongoDB 配置文件

通常位于：
- `C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg`
- `C:\Program Files\MongoDB\Server\7.0\bin\mongod.cfg`

### 2. 编辑配置文件

以管理员身份打开配置文件，添加：

```yaml
replication:
  replSetName: rs0
```

### 3. 重启 MongoDB 服务

```powershell
# 以管理员身份运行
net stop MongoDB
net start MongoDB
```

### 4. 初始化副本集

```bash
node init-replica-set.js
```

## ✅ 验证配置

运行以下命令验证：

```bash
node init-replica-set.js
```

应该看到成功消息，然后重启您的 NestJS 应用：

```bash
pnpm run start:dev
```

## 🐛 常见问题

### 问题 1: 找不到配置文件

**解决**: 使用 MongoDB Compass 或查找 MongoDB 服务配置

### 问题 2: 权限不足

**解决**: 确保以管理员身份运行 PowerShell

### 问题 3: 服务无法重启

**解决**: 
- 检查 MongoDB 服务是否正在运行
- 查看 Windows 事件查看器中的错误信息

## 📝 完整流程

1. ✅ 配置 MongoDB 启用副本集（`setup-replica-set.ps1` 或手动）
2. ✅ 重启 MongoDB 服务
3. ✅ 初始化副本集（`node init-replica-set.js`）
4. ✅ 重启 NestJS 应用（`pnpm run start:dev`）

现在可以正常使用 Prisma + MongoDB 了！

