# 依赖管理

## 命令列表

| 命令 | 说明 | 版本选择 |
|------|------|----------|
| `add` | 添加依赖 | ✅ 支持 `-sv` |
| `change` | 修改依赖 | ✅ 支持 `-sv` |
| `update` | 更新版本 | ✅ 支持 `-sv` |
| `remove` | 删除依赖 | - |
| `dep list` | 查看列表 | - |

---

## add - 添加依赖

### 基本用法
```bash
# 添加最新版本
freelog-cli add my-resource

# 添加指定版本
freelog-cli add my-resource@1.0.0

# 交互式选择版本
freelog-cli add my-resource -sv
```

### 流程
1. 获取资源信息
2. 选择版本（使用 `-sv` 可交互选择）
3. 选择授权策略
4. 签约并支付（如需要）
5. 保存到配置文件

---

## change - 修改依赖

### 基本用法
```bash
# 修改依赖
freelog-cli change my-resource

# 指定新版本
freelog-cli change my-resource@2.0.0

# 交互式选择版本
freelog-cli change my-resource -sv
```

### 修改方式
- **合约应用修改**: 修改版本、上抛设置
- **重新签约**: 选择新策略并重新签约

---

## update - 更新版本

### 基本用法
```bash
# 更新到最新版本
freelog-cli update my-resource

# 更新到指定版本
freelog-cli update my-resource@2.0.0

# 批量更新
freelog-cli update res1 res2 res3

# 交互式选择版本
freelog-cli update my-resource -sv
```

### 特点
- ✅ 支持批量更新
- ✅ 显示版本对比
- ✅ 用户确认后更新

---

## remove - 删除依赖

### 基本用法
```bash
# 删除单个
freelog-cli remove my-resource

# 批量删除
freelog-cli remove res1 res2 res3
```

---

## dep list - 查看列表

### 基本用法
```bash
# 查看本地依赖
freelog-cli dep list

# 查看线上版本
freelog-cli dep list --remote

# 显示授权状态
freelog-cli dep list --auth
```

---

## 参数说明

### `-sv, --select-version`
交互式选择版本，显示所有可用版本列表。

**支持命令**: `add`, `change`, `update`

**效果**:
```
? 请选择版本:
❯ 2.0.0 (最新版本) - 2025-10-30
  1.5.0 - 2025-10-15
  1.0.0 - 2025-10-01
  取消选择
```

---

## 相关文档
- [版本选择功能](./VERSION_SELECTOR.md)
- [认证管理](../guide/AUTHENTICATION_GUIDE.md)

