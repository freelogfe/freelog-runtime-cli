# Token 加密功能更新文档

## 更新时间
2025-10-30

## 更新概述
实现了完整的Token加密存储和解密功能，支持全局登录和工作空间登录，提升安全性。

## 主要变更

### 1. 新增加密工具模块 (`src/utils/crypto.js`)

**功能**：
- 使用 AES-256-CBC 算法加密/解密 Token
- 支持字符串和对象的加密/解密
- 每次加密使用随机 IV，提高安全性

**主要方法**：
```javascript
encrypt(text)           // 加密文本
decrypt(encryptedText)  // 解密文本
encryptObject(obj)      // 加密对象
decryptObject(str)      // 解密对象
```

**加密格式**：
- 输出格式：`iv:encryptedData`
- IV（初始化向量）：16字节随机生成
- 密钥：通过 SHA-256 处理固定密钥得到

### 2. 更新认证模块 (`src/core/auth.js`)

**新增功能**：

#### 自动加密存储
- `saveAuth()` 现在会自动加密 `token` 和 `authorization` 字段
- 加密数据标记 `encrypted: true`
- 加密后保存到全局或工作空间配置文件

#### 自动解密读取
- `getAuth()` 现在会自动解密 Token
- 检查 `encrypted` 标记，如果为 `true` 则解密
- 解密失败返回 `null`，防止使用损坏的数据

#### 新增辅助方法
```javascript
getDecryptedToken(global)  // 获取解密后的 Token
getCurrentToken()          // 获取当前有效的 Token（优先工作空间）
```

**使用示例**：
```javascript
// 保存认证信息（自动加密）
saveAuth({
  username: 'user@example.com',
  token: 'original-token-string',
  userId: '123456'
}, true); // true = 全局登录

// 读取认证信息（自动解密）
const auth = getAuth(true);
console.log(auth.token); // 已解密的 Token

// 获取当前 Token
const token = getCurrentToken();
```

### 3. 重构登录命令 (`src/commands/auth/login.js`)

**主要改进**：

#### 使用正确的 Freelog API
- API 端点：`http://api.testfreelog.com/v2/passport/login`
- 请求格式：
```javascript
{
  loginName: 'username or email',
  password: 'password',
  jwtType: 'header'
}
```
- 从响应 headers 中获取 `authorization` Token

#### 支持全局和工作空间登录
```bash
# 全局登录
freelog-cli login -g
freelog-cli login --global

# 工作空间登录（默认）
freelog-cli login
```

#### 完整的登录流程
1. 提示登录范围（全局/工作空间）
2. 获取用户名和密码（命令行参数或交互式输入）
3. 调用 Freelog API 登录
4. 提取用户信息和 Token
5. 保存认证信息（自动加密）
6. 显示成功消息和加密提示

#### 错误处理
- API 错误：显示服务器返回的错误信息
- 网络错误：显示网络连接问题
- 记录详细的错误日志

### 4. API 模块自动使用解密 Token (`src/core/api.js`)

**工作原理**：
- API 拦截器调用 `getCurrentAuth()`
- `getCurrentAuth()` 内部调用 `getAuth()`
- `getAuth()` 自动解密 Token
- 拦截器将解密后的 Token 添加到请求头

**代码片段**：
```javascript
apiClient.interceptors.request.use(config => {
  const auth = getCurrentAuth();  // 自动解密
  if (auth && auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});
```

## 文件存储结构

### 全局登录
**位置**：`~/.freelog-cli/auth.json`

**格式**：
```json
{
  "username": "user@example.com",
  "email": "user@example.com",
  "userId": "123456",
  "token": "a1b2c3d4e5f6...:encrypted-token-data",
  "authorization": "a1b2c3d4e5f6...:encrypted-token-data",
  "userInfo": { ... },
  "loginTime": "2025-10-30T10:00:00.000Z",
  "expireDays": 30,
  "encrypted": true
}
```

### 工作空间登录
**位置**：`<project-dir>/.freelog/auth.json`

**格式**：同全局登录

## 安全特性

### 1. 加密算法
- **算法**：AES-256-CBC
- **密钥长度**：256 位 (32 字节)
- **IV 长度**：128 位 (16 字节)
- **随机 IV**：每次加密生成新的随机 IV

### 2. Token 保护
- Token 以加密形式存储在本地文件
- 加密数据包含随机 IV，即使相同的 Token 每次加密结果也不同
- 解密只在内存中进行，不会将明文 Token 写入磁盘

### 3. 过期检查
- Token 默认有效期 30 天
- 每次读取时检查是否过期
- 过期的 Token 自动失效，返回 `null`

## 使用场景

### 场景 1：全局登录（适用于个人开发）
```bash
# 全局登录
freelog-cli login -g -u your-email@example.com -p your-password

# 后续命令自动使用全局 Token
freelog-cli publish
freelog-cli dep add resource-name
```

### 场景 2：工作空间登录（适用于团队协作）
```bash
# 在项目目录下登录
cd /path/to/project
freelog-cli login -u your-email@example.com -p your-password

# 在此项目中使用工作空间 Token
freelog-cli publish

# 在另一个项目中使用不同账号
cd /path/to/another-project
freelog-cli login -u another-email@example.com -p another-password
```

### 场景 3：优先级
- 工作空间 Token 优先于全局 Token
- 如果工作空间有 Token，使用工作空间的
- 如果工作空间没有 Token，使用全局的

## 测试建议

### 1. 加密/解密测试
```javascript
const { encrypt, decrypt } = require('./src/utils/crypto');

const original = 'test-token-12345';
const encrypted = encrypt(original);
const decrypted = decrypt(encrypted);

console.log('Original:', original);
console.log('Encrypted:', encrypted);
console.log('Decrypted:', decrypted);
console.log('Match:', original === decrypted);
```

### 2. 登录测试
```bash
# 测试全局登录
freelog-cli login -g

# 检查全局配置文件
cat ~/.freelog-cli/auth.json

# 测试工作空间登录
cd test-project
freelog-cli login

# 检查工作空间配置文件
cat .freelog/auth.json
```

### 3. Token 使用测试
```bash
# 登录后测试需要认证的命令
freelog-cli publish
freelog-cli dep list
freelog-cli sync
```

## 兼容性说明

### 向后兼容
- 旧的未加密 Token 仍然可以读取
- 如果 `encrypted` 字段不存在或为 `false`，直接使用原始 Token
- 下次保存时会自动升级为加密格式

### 迁移建议
1. 用户重新登录后，Token 会自动加密
2. 或者可以提供迁移命令：
```bash
freelog-cli auth migrate  # 将现有 Token 升级为加密格式
```

## 注意事项

1. **密钥管理**：当前使用硬编码密钥，生产环境建议使用环境变量或密钥管理服务
2. **文件权限**：确保 `auth.json` 文件权限设置为仅当前用户可读（如 `chmod 600`）
3. **备份**：建议用户定期备份全局配置目录
4. **Token 泄露**：即使 Token 加密，也应注意不要将 `auth.json` 提交到版本控制系统

## 后续优化建议

1. **密钥轮换**：实现定期更换加密密钥的机制
2. **硬件加密**：考虑使用系统密钥链（如 macOS Keychain、Windows Credential Manager）
3. **双因素认证**：支持 2FA 登录
4. **Token 刷新**：实现 Token 自动刷新机制
5. **审计日志**：记录所有 Token 使用和登录活动

## 相关文件

- `cli-project/src/utils/crypto.js` - 加密工具模块
- `cli-project/src/core/auth.js` - 认证管理核心模块
- `cli-project/src/commands/auth/login.js` - 登录命令
- `cli-project/src/core/api.js` - API 请求模块
- `cli-project/src/constants/config.js` - 配置常量

## 更新日志

- **2025-10-30**：初始实现 Token 加密功能
- **2025-10-30**：重构登录命令，支持全局/工作空间登录
- **2025-10-30**：集成加密/解密到认证流程

---

**更新人员**：AI Assistant  
**版本**：v1.0.0

