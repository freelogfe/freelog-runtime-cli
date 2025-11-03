# 环境切换指南

## 🌍 环境说明

Freelog CLI 支持两个环境：

| 环境 | API 地址 | 说明 |
|------|---------|------|
| **生产环境**（默认） | `https://api.freelog.com` | 正式环境，实际数据 |
| **测试环境** | `http://api.testfreelog.com` | 测试环境，用于开发调试 |

---

## 🚀 使用方法

### 方式 1: 使用 `-t` 参数（推荐）

在任何命令后加 `-t` 或 `--test` 切换到测试环境：

```bash
# 登录到测试环境
freelog-cli login -t

# 在测试环境添加依赖
freelog-cli add my-resource -t

# 在测试环境发布
freelog-cli publish -d -t

# 在测试环境初始化项目
freelog-cli init my-project -t
```

**优点**: 
- ✅ 简单直观
- ✅ 不影响其他命令
- ✅ 临时切换，不持久化

---

### 方式 2: 环境变量

设置 `FREELOG_ENV` 环境变量：

```bash
# Windows PowerShell
$env:FREELOG_ENV="development"
freelog-cli login

# Linux/Mac
export FREELOG_ENV=development
freelog-cli login
```

**优点**:
- ✅ 持久化，所有命令生效
- ✅ 适合长时间在测试环境工作

---

### 方式 3: 自定义 API 地址

直接指定 API 地址：

```bash
# Windows PowerShell
$env:FREELOG_API_URL="http://localhost:3000"
freelog-cli login

# Linux/Mac
export FREELOG_API_URL="http://localhost:3000"
freelog-cli login
```

**用途**: 本地开发调试

---

## 📝 使用示例

### 场景 1: 在测试环境测试新功能

```bash
# 1. 登录测试环境
freelog-cli login -t

# 2. 初始化项目
freelog-cli init test-project -t

# 3. 添加测试依赖
freelog-cli add test-resource -t

# 4. 发布到测试环境
freelog-cli publish -d -t
```

### 场景 2: 混合使用（不推荐）

```bash
# 在生产环境登录
freelog-cli login

# 在测试环境发布（使用不同账号）
freelog-cli login -t
freelog-cli publish -d -t
```

### 场景 3: 长时间在测试环境工作

```bash
# 设置环境变量（一次设置，所有命令生效）
$env:FREELOG_ENV="development"

# 后续所有命令都使用测试环境
freelog-cli login
freelog-cli init my-project
freelog-cli add my-resource
freelog-cli publish -d
```

---

## 🔍 查看当前环境

### 方式 1: 命令行提示

使用 `-t` 参数时会显示提示：

```bash
$ freelog-cli login -t

 ___              _               ____ _     ___
|  ___  _ __ ___| | ___   __ _  / ___| |   |_ _|
| |_ | '__/ _ \ |/ _ \ / _` | | |   | |    | |
|  _|| | |  __/ | (_) | (_| | | |___| |___ | |
|_|  |_|  \___|_|\___/ \__, |  \____|_____|___|
                        |___/

ℹ 使用测试环境: http://api.testfreelog.com

? 请输入用户名或邮箱:
```

### 方式 2: 查看环境变量

```bash
# Windows PowerShell
Write-Host "FREELOG_ENV: $env:FREELOG_ENV"
Write-Host "FREELOG_API_URL: $env:FREELOG_API_URL"

# Linux/Mac
echo "FREELOG_ENV: $FREELOG_ENV"
echo "FREELOG_API_URL: $FREELOG_API_URL"
```

---

## 💡 最佳实践

### 1. 开发测试阶段

```bash
# 始终使用 -t 参数
freelog-cli login -t
freelog-cli add test-dep -t
freelog-cli publish -d -t
```

### 2. 正式发布

```bash
# 不加 -t，使用生产环境（默认）
freelog-cli login
freelog-cli publish
```

### 3. 本地调试

```bash
# 使用本地 API
$env:FREELOG_API_URL="http://localhost:3000"
freelog-cli login
```

### 4. 使用脚本快速切换

```bash
# 测试环境
. .\scripts\dev-test.ps1

# 生产环境
. .\scripts\dev-prod.ps1
```

---

## ⚠️ 注意事项

### 1. 认证信息分离

测试环境和生产环境的登录信息是**分开存储**的：

- 生产环境登录: `~/.freelog/auth.json`（或当前目录 `.freelog/auth.json`）
- 测试环境登录: 使用相同位置，但根据环境区分

### 2. 命令互不影响

```bash
# 在生产环境登录
freelog-cli login

# 在测试环境登录（不影响生产环境）
freelog-cli login -t

# 可以同时保持两个环境的登录状态
```

### 3. -t 参数位置

`-t` 参数可以放在命令前或后：

```bash
# 都可以
freelog-cli -t login
freelog-cli login -t
freelog-cli add my-resource -t
freelog-cli -t add my-resource
```

### 4. Help 不显示 -t 参数

`-t` 是全局参数，不会在每个命令的 help 中显示，只在主 help 中显示：

```bash
# 查看全局选项
freelog-cli --help

# 输出：
# Options:
#   -v, --version  显示版本号
#   -t, --test     使用测试环境 (api.testfreelog.com)
#   -h, --help     显示帮助信息
```

---

## 🔄 环境切换流程

```
┌─────────────────────────────────────┐
│   执行命令（如：freelog-cli login）  │
└─────────────┬───────────────────────┘
              │
              ▼
        ┌───────────┐
        │ 检查 -t  │
        │   参数    │
        └─────┬─────┘
              │
     ┌────────┴────────┐
     │                 │
   有 -t            无 -t
     │                 │
     ▼                 ▼
设置测试环境      检查 FREELOG_ENV
     │                 │
     │         ┌───────┴────────┐
     │         │                │
     │      已设置            未设置
     │         │                │
     │         ▼                ▼
     │      使用设置值      使用生产环境
     │         │                │
     └─────────┴────────────────┘
               │
               ▼
         执行 API 请求
```

---

## 📚 相关文档

- [快速开始](./QUICK_START.md)
- [本地调试](./DEV_DEBUG.md)
- [项目架构](./ARCHITECTURE.md)

---

**灵活切换，安全高效！** 🚀

最后更新：2025-11-03

