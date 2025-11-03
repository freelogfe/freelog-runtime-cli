# 开发脚本说明

## 📁 文件说明

### 环境切换脚本

| 脚本 | 环境 | API 地址 | 用途 |
|------|------|---------|------|
| `dev-local.ps1` | local | http://localhost:3000 | 本地开发调试 |
| `dev-test.ps1` | development | http://api.testfreelog.com | 测试环境 |
| `dev-prod.ps1` | production | https://api.freelog.com | 生产环境 |

---

## 🚀 使用方法

### 1. 切换到本地开发环境

```powershell
# 在 cli-project 目录下
. .\scripts\dev-local.ps1

# 现在可以使用本地 API 调试
node src/index.js login
```

### 2. 切换到测试环境

```powershell
. .\scripts\dev-test.ps1

node src/index.js login
```

### 3. 切换到生产环境

```powershell
. .\scripts\dev-prod.ps1

node src/index.js login
```

---

## 🔧 自定义配置

如果你的本地 API 地址不是 `http://localhost:3000`，可以编辑 `dev-local.ps1`：

```powershell
# dev-local.ps1
$env:FREELOG_API_URL = "http://localhost:8080"  # 修改为你的地址
```

或者直接在命令行设置：

```powershell
. .\scripts\dev-local.ps1
$env:FREELOG_API_URL = "http://localhost:8080"
node src/index.js login
```

---

## 📊 脚本功能

每个脚本会：

1. ✅ 设置环境变量（`FREELOG_ENV`, `FREELOG_API_URL`, `LOG_LEVEL`）
2. ✅ 自动检测模板路径（仅 local）
3. ✅ 验证模板目录是否存在
4. ✅ 显示配置信息
5. ✅ 提供快速开始命令提示

---

## 🐛 VSCode 调试

项目已配置 `.vscode/launch.json`，可以直接在 VSCode 中调试：

1. 打开 VSCode 调试面板（`Ctrl+Shift+D`）
2. 选择要调试的配置（如 "🔑 调试 Login"）
3. 按 `F5` 开始调试

可用的调试配置：
- 🔑 调试 Login
- 🆕 调试 Init
- 📦 调试 Add
- 📤 调试 Publish
- 🔄 调试 Sync
- 📊 调试 Status
- 🔍 调试 Analyze
- 🧪 测试环境 - Login

---

## 💡 提示

### 快速重置环境

```powershell
# 清除所有 Freelog 相关环境变量
Remove-Item Env:\FREELOG_* -ErrorAction SilentlyContinue
Remove-Item Env:\TEMPLATE_PATH -ErrorAction SilentlyContinue
Remove-Item Env:\LOG_LEVEL -ErrorAction SilentlyContinue

# 重新加载环境
. .\scripts\dev-local.ps1
```

### 查看当前环境

```powershell
Write-Host "FREELOG_ENV: $env:FREELOG_ENV"
Write-Host "API: $env:FREELOG_API_URL"
Write-Host "Template: $env:TEMPLATE_PATH"
Write-Host "Log Level: $env:LOG_LEVEL"
```

---

## 🔗 相关文档

- [本地调试指南](../docs/DEV_DEBUG.md) - 完整的调试文档
- [快速开始](../docs/QUICK_START.md) - 项目使用说明

---

**快速切换，高效开发！** 🚀

