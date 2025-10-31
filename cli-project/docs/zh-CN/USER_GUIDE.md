# Freelog CLI 使用手册

## 快速开始

### 安装
```bash
npm install -g @freelog/cli
```

### 登录
```bash
# 全局登录
freelog-cli login -g

# 工作空间登录
freelog-cli login
```

---

## 核心功能

### 1. 项目初始化
```bash
freelog-cli init my-project
```

### 2. 依赖管理

#### 添加依赖
```bash
# 添加最新版本
freelog-cli add my-resource

# 交互式选择版本
freelog-cli add my-resource -sv

# 指定版本
freelog-cli add my-resource@1.0.0
```

#### 修改依赖
```bash
# 修改依赖（交互式选择修改方式）
freelog-cli change my-resource -sv
```

#### 更新依赖
```bash
# 更新到最新版本
freelog-cli update my-resource

# 交互式选择版本
freelog-cli update my-resource -sv

# 批量更新
freelog-cli update res1 res2 res3 -sv
```

#### 删除依赖
```bash
freelog-cli remove my-resource
```

#### 查看依赖
```bash
freelog-cli dep list
```

### 3. 版本选择 🆕

使用 `-sv` 参数可以交互式选择版本：

```
? 请选择版本:
❯ 2.0.0 (最新版本) - 2025-10-30 - 重大更新
  1.5.0 - 2025-10-15 - 修复问题
  1.0.0 - 2025-10-01 - 首个版本
  取消选择
```

**支持命令**: `add`, `change`, `update`

### 4. 发布作品

```bash
# 发布正式版本
freelog-cli publish

# 发布草稿
freelog-cli publish -d

# 指定版本说明
freelog-cli publish --patch -m "修复bug"
```

### 5. 信息同步

```bash
# 从线上同步到本地
freelog-cli sync my-resource

# 同步所有信息
freelog-cli sync -a
```

---

## 支付流程

添加付费依赖时，会自动引导完成支付：

```bash
$ freelog-cli add premium-resource

⚠ 未获得授权，需要支付费用

支付信息:
  费用: 99.99 元
  策略: 标准授权

? 是否立即支付? Yes
? 请输入付款账户ID: acc_123456789
? 请输入支付密码（6位数字）: ******

✓ 支付成功
✓ 已获得授权
```

**安全特性**:
- 密码掩码显示 (`******`)
- Token 加密存储
- 不记录敏感信息到日志

---

## 常用命令速查

| 命令 | 说明 |
|------|------|
| `login [-g]` | 登录（-g 全局）|
| `logout [-g]` | 登出 |
| `status` | 查看登录状态 |
| `init <name>` | 初始化项目 |
| `add <resource> [-sv]` | 添加依赖 |
| `change <resource> [-sv]` | 修改依赖 |
| `update <resources...> [-sv]` | 更新依赖 |
| `remove <resources...>` | 删除依赖 |
| `dep list` | 查看依赖列表 |
| `publish [-d]` | 发布作品 |
| `sync [resource]` | 同步信息 |

---

## 配置文件

### freelog.json

项目根目录的 `freelog.json` 文件包含：

```json
{
  "version": "1.0.0",
  "workId": "资源ID",
  "name": "资源名称",
  "dependencies": [],
  "customPropertyDescriptors": []
}
```

---

## 环境配置

### 切换测试/生产环境

```bash
# 测试环境
export FREELOG_ENV=development

# 生产环境
export FREELOG_ENV=production
```

---

## 常见问题

### Q: 如何查看当前登录状态？
```bash
freelog-cli status
```

### Q: 如何取消版本选择？
选择列表最后一项 "取消选择" 即可。

### Q: 支付失败怎么办？
- 检查账户余额
- 确认支付密码正确
- 可以重新执行命令重试

### Q: 如何更新多个依赖？
```bash
freelog-cli update res1 res2 res3 -sv
```

---

## 获取帮助

```bash
# 查看所有命令
freelog-cli --help

# 查看特定命令帮助
freelog-cli add --help
```

---

**版本**: v1.0.0 | **更新**: 2025-10-30

