# 依赖管理

## 添加依赖 (add)

### 基本用法

```bash
# 默认添加最新版本
freelog-cli add my-resource

# 添加特定版本
freelog-cli add my-resource@1.0.0
```

### 交互式选择版本 🆕

```bash
freelog-cli add my-resource -sv
```

```
? 请选择版本:
❯ 2.0.0 (最新版本) - 2025-10-30
  1.5.0 - 2025-10-15
  1.0.0 - 2025-10-01
  取消选择
```

**特性**:
- ✅ 列出所有可用版本
- ✅ 高亮显示最新版本
- ✅ 显示发布时间
- ✅ 支持取消操作

---

## 修改依赖 (change)

更改已有依赖的版本或策略：

```bash
# 默认修改到最新版本
freelog-cli change my-resource

# 交互式选择版本
freelog-cli change my-resource -sv
```

**场景**:
- 切换到不同版本
- 重新选择策略
- 重新签约

---

## 更新依赖 (update)

批量更新依赖到指定版本或最新：

```bash
# 更新单个依赖
freelog-cli update my-resource

# 更新多个依赖
freelog-cli update res1 res2 res3

# 交互式选择版本
freelog-cli update my-resource -sv
```

**流程**:
1. 获取当前版本和目标版本
2. 显示版本对比
3. 用户确认
4. 更新 `freelog.json`

---

## 删除依赖 (remove)

```bash
# 删除单个依赖
freelog-cli remove my-resource

# 删除多个依赖
freelog-cli remove res1 res2 res3
```

---

## 列出依赖 (dep list)

```bash
freelog-cli dep list
```

显示 `freelog.json` 中的所有依赖信息。

---

## 策略与支付

### 自动策略选择

添加依赖时，CLI 会：

1. 获取可用策略列表
2. 显示策略详情（免费/付费）
3. 用户选择策略
4. 自动签约

### 自动支付流程

如果策略需要付费：

1. 显示支付信息（金额、币种）
2. 用户输入密码（掩码输入）
3. 调用支付接口
4. 验证授权状态

```bash
$ freelog-cli add paid-resource

✓ 获取资源信息成功
✓ 选择策略: 标准授权
! 需要支付: 10 feather币
? 请输入密码: ••••••
✓ 支付成功
✓ 已获得授权
✓ 依赖添加成功
```

---

## -sv 参数

`-sv` 或 `--select-version` 参数适用于：

| 命令 | 支持 -sv | 说明 |
|------|----------|------|
| `add` | ✅ | 添加依赖时选择版本 |
| `change` | ✅ | 修改依赖时选择版本 |
| `update` | ✅ | 更新依赖时选择版本 |
| `remove` | ❌ | 不需要选择版本 |

---

## 依赖配置格式

`freelog.json` 中的依赖格式：

```json
{
  "dependencies": [
    {
      "resourceId": "63e4b4d3c4a2f5001c8b4567",
      "resourceName": "my-resource",
      "version": "1.0.0",
      "versionRange": "^1.0.0"
    }
  ]
}
```

---

## 最佳实践

1. **使用 -sv 选择稳定版本** - 避免自动使用最新版
2. **及时更新依赖** - 获取最新功能和修复
3. **检查策略变化** - 使用 `change` 重新选择策略
4. **批量操作** - `update` 和 `remove` 支持多个资源

---

## 错误处理

常见错误和解决方案：

| 错误 | 原因 | 解决 |
|------|------|------|
| 未登录 | Token 过期 | `freelog-cli login` |
| 资源不存在 | 资源名错误 | 检查资源名 |
| 支付失败 | 密码错误/余额不足 | 重新输入/充值 |
| 依赖已存在 | 重复添加 | 使用 `change` |

---

**提示**: 所有依赖命令都支持 `--help` 查看详细用法。

