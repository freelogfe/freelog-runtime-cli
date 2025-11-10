# 用户 API 实现说明

## 📋 实施概述

为 Freelog CLI 添加了用户登录/登出 API，并更新了 auth 命令以使用这些 API。

**实施日期**: 2025-11-10  
**状态**: ✅ 完成

---

## ✅ 新增文件

### 1. `src/api/user.ts` - 用户 API

实现了基于 Freelog 官方文档的用户相关 API：

#### 接口列表

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| `login` | POST | `/v2/passport/login` | 用户登录 |
| `logout` | GET | `/v2/passport/logout` | 用户登出 |
| `getCurrentUser` | GET | `/v2/passport/current` | 获取当前用户信息 |

#### 类型定义

**LoginBody** - 登录请求参数
```typescript
{
  loginName: string;      // 用户名/手机号/邮箱
  password: string;       // 密码 (6-24位)
  isRemember?: 0 | 1;    // 是否记住密码
  returnUrl?: string;     // 登录成功后跳转地址
  jwtType?: 'cookie' | 'header';  // Token 存放方式
}
```

**LoginResponse** - 登录响应数据
```typescript
{
  userId: number;         // 用户ID
  userName: string;       // 用户姓名
  nickname: string;       // 用户昵称
  email: string;          // 邮箱
  mobile: string;         // 手机号
  tokenSn: string;        // Token序列号
  userRole: number;       // 用户角色
  status: number;         // 用户状态
  createDate: string;     // 创建日期
  updateDate: string;     // 更新日期
  headImage: string;      // 头像URL
  userType?: number;      // 用户类型
}
```

---

## 🔧 更新文件

### 1. `src/core/http.ts` - HTTP 客户端增强

新增 `FreelogRequestClient` 类，提供以下特性：

- ✅ 统一的请求接口 (get/post/put/delete)
- ✅ 自动处理认证 token
- ✅ 保存最后的响应（支持获取响应头）
- ✅ 统一的错误处理
- ✅ 自动设置 API base URL

**新增导出**:
```typescript
export const freelogRequest = new FreelogRequestClient();
```

**使用方式**:
```typescript
// 发送请求
const data = await freelogRequest.post('/v2/passport/login', body);

// 获取响应头
const lastResponse = freelogRequest.getLastResponse();
const token = lastResponse?.headers?.authorization;
```

### 2. `src/commands/auth.ts` - 认证命令更新

#### 更新 `executeLogin` 函数
- ✅ 使用 `login()` API 替代直接的 axios 调用
- ✅ 从响应头中提取 authorization token
- ✅ 保存完整的用户信息（包括 email）

**关键改动**:
```typescript
// 之前：直接调用 apiClient
const response = await apiClient.post('/v2/passport/login', {...});

// 现在：使用封装的 API
const userInfo = await login({
  loginName: username,
  password: password,
  jwtType: 'header'
});

// 从响应头获取 token
const lastResponse = freelogRequest.getLastResponse();
const token = lastResponse?.headers?.authorization;
```

#### 更新 `executeLogout` 函数
- ✅ 调用 `logout()` API 清理服务端会话
- ✅ 容错处理：即使服务端登出失败也会清除本地认证
- ✅ 保持原有的本地认证清理逻辑

**工作流程**:
1. 尝试调用服务端登出 API
2. 如果失败，显示警告但继续
3. 清除本地认证信息
4. 显示成功消息

---

## 📚 API 文档参考

- [用户登录](https://doc.freelog.com/userV2/%E7%94%A8%E6%88%B7%E7%99%BB%E5%BD%95.html)
- [用户登出](https://doc.freelog.com/userV2/%E7%94%A8%E6%88%B7%E7%99%BB%E5%87%BA.html)

---

## 🎯 功能特性

### 1. 类型安全
- ✅ 完整的 TypeScript 类型定义
- ✅ 请求参数类型检查
- ✅ 响应数据类型推导

### 2. 错误处理
- ✅ 统一的错误处理机制
- ✅ 友好的错误提示
- ✅ 优雅的降级处理

### 3. 响应头支持
- ✅ 保存完整的响应对象
- ✅ 支持从响应头提取 token
- ✅ 支持其他响应头信息访问

### 4. 向后兼容
- ✅ 保留旧的 `apiClient` 导出
- ✅ 新增 `freelogRequest` 不影响现有代码
- ✅ 逐步迁移策略

---

## 🔄 使用示例

### 登录流程

```typescript
import { login } from '../api/user';
import { freelogRequest } from '../core/http';

// 1. 调用登录 API
const userInfo = await login({
  loginName: 'user@example.com',
  password: '123456',
  jwtType: 'header'
});

// 2. 获取响应头中的 token
const lastResponse = freelogRequest.getLastResponse();
const token = lastResponse?.headers?.authorization;

// 3. 保存认证信息
const authData = {
  username: userInfo.userName,
  userId: userInfo.userId,
  email: userInfo.email,
  token: token,
  authorization: token,
};
```

### 登出流程

```typescript
import { logout } from '../api/user';

// 1. 调用登出 API
try {
  await logout();
} catch (err) {
  console.log('服务端登出失败，但继续清理本地');
}

// 2. 清理本地认证
clearAuth(isGlobal);
```

### 获取当前用户

```typescript
import { getCurrentUser } from '../api/user';

const userInfo = await getCurrentUser();
console.log(`当前用户: ${userInfo.userName}`);
```

---

## 🧪 测试建议

### 单元测试

可以为新的 API 添加单元测试：

```typescript
// tests/unit/api/user.test.ts
import nock from 'nock';
import { login, logout } from '../../../src/api/user';

describe('User API', () => {
  describe('login', () => {
    it('should login successfully', async () => {
      nock('https://api.freelog.com')
        .post('/v2/passport/login')
        .reply(200, {
          ret: 0,
          data: {
            userId: 10022,
            userName: 'testuser',
            email: 'test@example.com',
          }
        }, {
          authorization: 'Bearer test-token-123'
        });

      const result = await login({
        loginName: 'testuser',
        password: '123456',
        jwtType: 'header'
      });

      expect(result.userId).toBe(10022);
      expect(result.userName).toBe('testuser');
    });
  });
});
```

### 集成测试

在 `tests/integration/auth-flow.test.ts` 中已经覆盖了认证流程测试。

---

## 📝 注意事项

### 1. Token 获取方式

登录时 token 在响应头中返回：
```
authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

需要从 `freelogRequest.getLastResponse()` 获取完整响应对象。

### 2. 登出处理

登出 API 可能失败（如网络问题），但应该始终清除本地认证信息，确保用户能够重新登录。

### 3. 用户信息字段

注意 API 返回的是 `userName` 而不是 `username`，需要在保存认证信息时进行映射。

---

## 🚀 后续优化

### 可能的改进

1. **Token 刷新机制**
   - 实现 token 过期自动刷新
   - 添加 token 有效期检查

2. **更多用户 API**
   - 获取用户详情
   - 修改用户信息
   - 上传头像
   - 修改密码

3. **第三方登录**
   - 支持第三方平台登录
   - OAuth 认证流程

4. **会话管理**
   - 实现会话保持
   - 多账户管理
   - 账户切换功能

---

## ✅ 总结

### 完成的工作

1. ✅ 创建 `src/api/user.ts` - 用户 API 封装
2. ✅ 增强 `src/core/http.ts` - 支持响应头访问
3. ✅ 更新 `src/commands/auth.ts` - 使用新的 API
4. ✅ 完整的 TypeScript 类型定义
5. ✅ 符合官方 API 文档规范

### 技术亮点

- 🎯 **类型安全**: 完整的 TypeScript 类型系统
- 🔒 **安全性**: Token 从响应头安全传输
- 🛡️ **容错性**: 优雅的错误处理和降级
- 📦 **可维护性**: 清晰的代码结构和注释
- 🔌 **扩展性**: 易于添加更多用户相关 API

### 立即可用

✅ 所有功能已实现并可直接使用  
✅ 无 linter 错误  
✅ 符合项目代码规范  

---

**实施完成！** ✅

