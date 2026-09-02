# P0-Phase-0 认证系统

> **版本**: v1.0 | **最后更新**: 2026-09-02  
> **对齐 Source**: `packages/cli/src/auth/login.ts` + `packages/tools-lib/src/auth.ts`

---

## 📋 **一、Phase 职责**

P0-Phase-0 是 CLI 启动的前置条件，负责:
1. **登录/登出管理** (Session/Studio 模式切换)
2. **凭据存储策略** (Workspace/Global/Ephemeral)
3. **多账号管理** (Multi-Account Workspace)

---

## 🔗 **二、调用的 Step**

| Step | 来源 | 说明 |
|------|------|------|
| Step0-Login | P0-Phase-0 | Console OAuth 授权流程 |
| Step0-Logout | P0-Phase-0 | 删除本地凭据 |
| Step0-TokenRefresh | P0-Phase-0 | Token 自动刷新机制 |

---

## 💻 **三、完整流程设计**

### **1. 登录流程 (Login Flow)**

```bash
$ freelog login [--studio] [--global]

┌─ Freelog CLI 登录 ───────────────────┐
│                                         │
│ 📱 打开浏览器并访问：                  │
│ https://freelog.dev/auth/abc123       │
│   ↖️ 调用 api.auth.getOAuthUrl()        │
│                                         │
│ ⏳ 等待授权...                         │
│   ✓ 用户授权成功                       │
│   ✓ 获取到 authorization_code          │
│                                         │
│ 🔐 交换 Access Token                   │
│   → POST /api/auth/token               │
│     { code: 'xyz', grant_type: ... }   │
│                                         │
│ ✅ 登录完成！                          │
│   用户名：liu-kai-github               │
│   过期时间：2h 后                        │
│   存储位置：~/.freelog/workspace.json  │
│                                         │
└───────────────────────────────────────┘
```

**Phase 编排逻辑:**

```typescript
// packages/cli/src/phases/P0-login.ts
async function phase0Login(mode: 'session' | 'studio'): Promise<AuthResult> {
  // Step0-1: 生成 OAuth URL
  const url = await api.auth.getOAuthUrl();
  
  // Step0-2: 打开浏览器
  if (!await openBrowser(url)) {
    throw new CLIError(CLI_ERROR_CODES.BROWSER_OPEN_FAILED);
  }
  
  // Step0-3: 等待回调
  const authCode = await waitForOAuthCallback();
  
  // Step0-4: 交换 Token
  const credentials = await api.auth.exchangeToken(authCode);
  
  // Step0-5: 保存凭据
  if (mode === 'studio') {
    await saveToWorkspace(credentials, 'default');
  } else {
    await saveToEphemeral(credentials);
  }
  
  return { success: true, mode };
}
```

---

### **2. 登出流程 (Logout Flow)**

```bash
$ freelog logout

┌─ 登出确认 ───────────────────────────┐
│                                         │
│ 🚫 即将删除本地凭据                    │
│   当前账户：liu-kai-github             │
│   存储位置：~/.freelog/workspace.json │
│                                         │
│ [确认删除] ENTER | [取消] ESC          │
│                                         │
└───────────────────────────────────────┘

→ DELETE ~/.freelog/workspace.json
→ 删除成功!
```

**Phase 编排逻辑:**

```typescript
async function phase0Logout(): Promise<void> {
  // Step0-1: 读取当前凭据
  const creds = await readFromWorkspace('default');
  if (!creds) {
    throw new CLIError(CLI_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }
  
  // Step0-2: 用户确认
  const confirmed = await promptUser(
    `注销 ${creds.accountId}? [y/N]: `
  );
  
  if (!confirmed) {
    throw new CLIError(CLI_ERROR_CODES.LOGOUT_CANCELLED);
  }
  
  // Step0-3: 删除凭据
  await deleteWorkspaceCreds('default');
  
  // Step0-4: 清理 Token Refresh
  cleanupRefreshTimer();
  
  console.log(ui.success('✅ 已注销'));
}
```

---

### **3. Token 刷新机制**

```typescript
// automatic token refresh
class AuthManager {
  private refreshTimer?: NodeJS.Timeout;
  
  async init() {
    const creds = await this.getCredentials();
    
    // Check if token is expired or about to expire
    if (this.isExpiredSoon(creds.expiresIn, threshold: 60s)) {
      // Trigger auto refresh
      const newCreds = await api.auth.refreshToken(creds.refreshToken);
      await this.saveCredentials(newCreds);
    }
    
    // Set up periodic check
    this.startPeriodicCheck();
  }
  
  private startPeriodicCheck() {
    this.refreshTimer = setInterval(async () => {
      await this.init();
    }, 5 * 60 * 1000); // Check every 5 minutes
  }
}
```

---

## 🔐 **四、凭据存储策略**

### **三种存储类型:**

| 类型 | 路径 | 用途 | 加密 | 持久性 |
|------|------|------|------|--------|
| **Ephemeral** | `~/.freelog/temp.json` | Session 临时登录 | 否 | 短期 (2h) |
| **Workspace** | `~/.freelog/workspace.json` | Studio 工作区 | AES-256 | 长期 |
| **Global** | `/etc/freelog/global.json` | 多机器共享 | AES-256 | 长期 |

### **选择规则:**

```bash
# 无参数：默认 Session (安全优先)
$ freelog publish ./theme

# --studio: Studio 模式 (多账号场景)
$ freelog --studio publish ./theme

# --global: 全局凭据 (CI/CD 场景)
$ freelog --global publish ./theme
```

---

## ⚠️ **五、异常分支处理**

### **1. Token 过期 (TOKEN_EXPIRED)**

```typescript
if (error.code === 'TOKEN_EXPIRED') {
  // 尝试自动刷新
  try {
    const newCreds = await api.auth.refreshToken(oldCreds.refreshToken);
    await saveCredentials(newCreds);
    retryCommand();
  } catch (refreshError) {
    // 刷新失败，提示重新登录
    console.log(ui.error('Token 已过期，请重新登录'));
    process.exit(1);
  }
}
```

### **2. 网络错误 (NETWORK_ERROR)**

```typescript
if (error.code === 'NETWORK_ERROR') {
  console.log(ui.warning('🌐 网络连接失败，检查网络'));
  
  // 提供离线模式建议
  console.log('💡 建议使用 checkpoint 恢复机制继续');
  process.exit(1);
}
```

---

## 🎯 **六、验收标准**

- [x] Login 流程支持 Console OAuth
- [ ] Logout 流程正确删除凭据
- [ ] Token 自动刷新机制工作
- [ ] Workspace/Global 切换正常
- [ ] Multi-Account 管理可用

---

**📌 下一步**: [P1-Phase-1 工程模式](./P1-Phase-1%20 工程模式.md)
