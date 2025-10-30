# Freelog CLI 认证使用指南

## 快速开始

### 1. 全局登录

全局登录后，Token 会保存在用户主目录下，所有项目都可以使用。

```bash
# 交互式登录
freelog-cli login -g

# 或者直接提供用户名和密码
freelog-cli login -g -u your-email@example.com -p your-password
```

**存储位置**：
- Windows: `C:\Users\YourName\.freelog-cli\auth.json`
- macOS/Linux: `~/.freelog-cli/auth.json`

### 2. 工作空间登录

工作空间登录后，Token 会保存在当前项目目录下，仅此项目使用。

```bash
# 在项目目录下登录
cd /path/to/your-project
freelog-cli login

# 或者
freelog-cli login -u your-email@example.com -p your-password
```

**存储位置**：`<project-dir>/.freelog/auth.json`

## 登录优先级

当执行需要认证的命令时，CLI 会按以下优先级查找 Token：

1. **工作空间 Token**：优先使用当前项目的 `.freelog/auth.json`
2. **全局 Token**：如果工作空间没有 Token，使用全局的 `~/.freelog-cli/auth.json`

**示例**：
```bash
# 场景1: 只有全局登录
freelog-cli login -g
freelog-cli publish  # ✓ 使用全局 Token

# 场景2: 工作空间登录会覆盖全局
cd project-a
freelog-cli login  # 工作空间登录
freelog-cli publish  # ✓ 使用工作空间 Token（优先）

# 场景3: 不同项目使用不同账号
cd project-a
freelog-cli login -u user-a@example.com
freelog-cli publish  # ✓ 使用 user-a 的 Token

cd ../project-b
freelog-cli login -u user-b@example.com
freelog-cli publish  # ✓ 使用 user-b 的 Token
```

## 登出（Logout）

### 全局登出
```bash
freelog-cli logout -g
# 或
freelog-cli logout --global
```

### 工作空间登出
```bash
freelog-cli logout
```

### 全部登出
```bash
# 登出工作空间
freelog-cli logout

# 登出全局
freelog-cli logout -g
```

## 查看登录状态

查看当前的登录状态：

```bash
freelog-cli status
```

**输出示例**：
```
全局登录状态:
✓ 已登录
用户: user@example.com
登录时间: 2025-10-30 10:00:00
有效期: 30天

工作空间登录状态:
✓ 已登录
用户: workspace@example.com
项目: /path/to/project
登录时间: 2025-10-30 11:00:00
有效期: 30天

当前使用: 工作空间 Token
```

## Token 安全说明

### Token 加密存储

所有 Token 都使用 **AES-256-CBC** 算法加密后存储：

```json
// ~/.freelog-cli/auth.json
{
  "username": "user@example.com",
  "token": "a1b2c3d4e5f6...:encrypted-data",  // ← 加密后的 Token
  "encrypted": true,
  "loginTime": "2025-10-30T10:00:00.000Z",
  "expireDays": 30
}
```

### 自动解密

执行命令时，CLI 会自动解密 Token 并添加到 API 请求头：

```javascript
// 自动处理，无需手动操作
Authorization: Bearer <decrypted-token>
```

### Token 有效期

- **默认有效期**：30 天
- **过期检查**：每次使用时自动检查
- **过期处理**：Token 过期后需重新登录

```bash
# Token 过期时的错误提示
Error: 未登录或登录已过期，请先执行 login 命令
```

### 安全建议

1. **不要分享 Token 文件**
   ```bash
   # 确保 auth.json 不被提交到 Git
   echo ".freelog/" >> .gitignore
   ```

2. **设置文件权限**（macOS/Linux）
   ```bash
   chmod 600 ~/.freelog-cli/auth.json
   chmod 600 .freelog/auth.json
   ```

3. **定期更换密码**
   ```bash
   # 更换密码后重新登录
   freelog-cli login -g
   ```

4. **离开时登出**
   ```bash
   freelog-cli logout -g
   ```

## 使用场景

### 场景 1：个人开发者（推荐全局登录）

```bash
# 一次性全局登录
freelog-cli login -g

# 在任何项目中直接使用
cd project-1
freelog-cli publish

cd ../project-2
freelog-cli publish
```

**优点**：
- 方便快捷，一次登录到处使用
- 适合个人开发，不需要切换账号

### 场景 2：团队协作（推荐工作空间登录）

```bash
# 团队成员 A 在项目 X 中登录
cd team-project-x
freelog-cli login -u member-a@company.com

# 团队成员 B 在项目 Y 中登录
cd team-project-y
freelog-cli login -u member-b@company.com
```

**优点**：
- 不同项目使用不同账号
- Token 不会互相干扰
- 便于多人协作

### 场景 3：测试账号切换

```bash
# 测试生产账号
freelog-cli login -g -u prod@example.com
freelog-cli publish

# 在特定项目中测试开发账号
cd test-project
freelog-cli login -u dev@example.com
freelog-cli publish

# 完成后恢复生产账号
freelog-cli logout  # 登出工作空间
# 继续使用全局生产账号
```

### 场景 4：CI/CD 集成

```bash
# 在 CI 环境中使用环境变量登录
freelog-cli login -u $CI_USER -p $CI_PASSWORD

# 执行发布
freelog-cli publish

# 清理 Token
freelog-cli logout
```

## 常见问题

### Q1: 忘记密码怎么办？

A: 请访问 Freelog 官网重置密码：https://www.freelog.com

### Q2: Token 过期了怎么办？

A: 重新登录即可：
```bash
freelog-cli login -g
```

### Q3: 如何查看 Token 是否有效？

A: 使用 status 命令：
```bash
freelog-cli status
```

### Q4: 可以在多台电脑上同时登录吗？

A: 可以，每台电脑的 Token 是独立的。

### Q5: 工作空间登录会覆盖全局登录吗？

A: 不会覆盖，只是优先级更高。全局 Token 仍然有效。

### Q6: 如何强制使用全局 Token？

A: 删除工作空间的 Token：
```bash
rm -rf .freelog/auth.json
```

### Q7: Token 文件可以手动编辑吗？

A: 不建议。Token 是加密的，手动编辑可能导致无法使用。

### Q8: 登录失败怎么办？

A: 检查以下几点：
1. 用户名和密码是否正确
2. 网络连接是否正常
3. 查看错误日志：`~/.freelog-cli/logs/`

```bash
# 查看详细错误信息
tail -f ~/.freelog-cli/logs/error.log
```

## 命令参考

### login - 登录

```bash
freelog-cli login [options]
```

**选项**：
- `-g, --global`：全局登录
- `-u, --username <username>`：用户名或邮箱
- `-p, --password <password>`：密码

**示例**：
```bash
freelog-cli login -g
freelog-cli login -g -u user@example.com -p password
freelog-cli login
freelog-cli login -u user@example.com -p password
```

### logout - 登出

```bash
freelog-cli logout [options]
```

**选项**：
- `-g, --global`：全局登出

**示例**：
```bash
freelog-cli logout
freelog-cli logout -g
```

### status - 查看登录状态

```bash
freelog-cli status
```

## 开发者说明

### 在代码中使用认证

```javascript
const { getCurrentAuth, requireAuth } = require('./src/core/auth');

// 获取当前认证信息（可能为 null）
const auth = getCurrentAuth();
if (auth) {
  console.log('Username:', auth.username);
  console.log('Token:', auth.token);  // 自动解密
  console.log('Scope:', auth.scope);  // 'global' 或 'workspace'
}

// 要求必须登录（未登录会抛出错误）
try {
  const auth = requireAuth();
  // 继续执行需要认证的操作
} catch (err) {
  console.error('未登录:', err.message);
}
```

### 获取解密后的 Token

```javascript
const { getCurrentToken } = require('./src/core/auth');

// 获取当前有效的 Token（自动解密）
const token = getCurrentToken();

if (token) {
  // 在 API 请求中使用
  axios.post('/api/endpoint', data, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
}
```

### API 请求自动附带 Token

```javascript
const { apiClient } = require('./src/core/api');

// API 拦截器会自动添加 Token，无需手动处理
const result = await apiClient.post('/resources/publish', {
  name: 'My Resource',
  version: '1.0.0'
});
```

## 相关文档

- [Token 加密功能详解](./TOKEN_ENCRYPTION_UPDATE.md)
- [快速开始指南](./QUICK_START.md)
- [项目架构说明](./ARCHITECTURE.md)

---

**文档版本**：v1.0.0  
**最后更新**：2025-10-30
