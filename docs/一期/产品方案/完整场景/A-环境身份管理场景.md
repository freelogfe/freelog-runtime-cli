# A 组：环境身份管理场景（8 个深度场景）

> **目标**: 验证 CLI 在各种登录、认证、账号管理场景下的表现
> 
> **对齐原则**: Console 的浏览器登录态 vs CLI 的多模式身份管理

---

## A01 - 正常首次登录并发布

**用户画像**: 新用户，刚安装 CLI，需要完成第一次资源发布  
**目标**: 验证完整的登录 + 发布流程是否顺畅

### 前置条件

- 已安装 CLI（版本 0.5.0）
- Node.js >= 20
- 未执行过 `freelog login`
- 有本地待发布的文件：`./dist/my-app.zip`

### 完整交互流程

#### Step 1: 启动命令检测未登录状态

```bash
$ freelog publish ./dist/my-app.zip

🔍 环境检测...
❌ 检测到未登录状态

请执行以下操作之一:
  A) freelog login        # 进入交互式登录向导
  B) freelog login --token <your_token>  # 使用已有 Token
  
💡 提示：Token 可在 Console 个人中心生成

请选择 [A/B]: A
```

#### Step 2: 浏览器授权流程

```bash
✅ 打开浏览器进行授权...
   访问：https://console.freelog.com/oauth/authorize?code=abc123xyz
  
等待回调中...
[██████████] 正在监听回调...

✓ 授权成功！

📝 账号信息
  用户名：liu-kai-github
  用户 ID: 8847953
  邮箱：liu***@gmail.com
  
💾 凭据已保存至：~/.freelog/credentials.json

✅ 登录成功，继续执行原命令...
```

#### Step 3: 权限确认

```bash
┌─ 权限确认 ────────────────────┐
│                                 │
│ 即将在 dev 平台执行写操作      │
│ 当前账号：liu-kai-github       │
│                                │
│ ⚠️ 这将在平台创建新资源         │
│                                │
│ 是否继续？[Y/n]: Y             │
└─────────────────────────────────┘

✅ 权限确认通过，进入发布流程...
```

### 异常分支 A01-1: 登录超时

```bash
等待回调中...
⏱️ 超时：超过 5 分钟未完成任务

原因分析:
  • 用户关闭了浏览器标签
  • 未手动完成授权
  • 网络问题导致回调未触发
  
选项:
  A) 重新发起授权
  B) 使用 Token 方式登录
  
您选择：[A]

重新打开浏览器...
```

### 异常分支 A01-2: Token 格式错误

```bash
$ freelog login --token invalid-token-format

❌ AUTH_INVALID_TOKEN: Token 格式无效

要求：Token 应为 64 位十六进制字符串
您的输入：invalid-token-format (长度不符)

💡 提示：请从 Console 个人中心获取有效的 Token
或者重试并使用正确的 Token 格式
```

---

## A02 - 多账号环境下选择 owner

**用户画像**: 同时为多个客户开发，有多个 Freelog 账号  
**前置条件**: 
- 已登录 3 个账号：client-a, client-b, my-company

```bash
$ freelog publish ./dist/client-a-theme.zip

🔍 检测到多个已登录账号

可用账号列表:
  [1] client-a (ID: 1111111) - dev 环境
  [2] client-b (ID: 2222222) - test 环境
  [3] my-company (ID: 3333333) - production 环境
  
💡 请选择要使用的账号:

请输入序号 [1-3]: 1

┌─ 确认使用账号 ───────────────┐
│                               │
│ 当前选择：client-a            │
│ 用户 ID: 1111111              │
│ 环境：dev                     │
│                               │
│ 确定使用该账号继续？[Y/n]: Y │
└────────────────────────────────┘

✅ 切换到 client-a 上下文
后续操作将在此账号下执行
```

### 临时会话模式（不影响默认）

```bash
# 本次会话仅使用 client-b，不改变默认
$ freelog --session client-b publish ./dist/client-b-plugin.zip

🔍 使用临时会话：client-b
  用户 ID: 2222222
  环境：test
  
💡 提示：本次会话结束后，默认账号仍为 client-a

... [执行发布流程] ...

✅ 发布完成
临时会话已自动结束，默认账号保持不变
```

### 异常分支 A02-1: owner 不一致告警

```bash
🔍 加载远端资源状态
  资源 ID: res_existing_123
  资源所有者：another-client (ID: 9999999)
  
❌ Owner 校验失败

当前账号：client-a (ID: 1111111)
资源所有者：another-client (ID: 9999999)

⚠️ 警告：当前账号不是该资源的 owner
  
这将导致:
  ✗ 无法创建新版本
  ✗ 无法修改 Listing
  ✗ 无法调整策略
  
可选操作:
  A) 切换到 owner 账号
  B) 联系 owner 获取授权
  C) 放弃操作
  
您选择：[A]

💡 执行：freelog login --switch another-client
```

---

## A03 - CI 模式无凭据错误

**场景**: Jenkins/GitHub Actions 等自动化环境  
**前置条件**: 环境变量未配置 FREELG_TOKEN

```yaml
# .github/workflows/release.yml
name: Release
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy
        run: |
          # 忘记配置 TOKEN
          freelog publish --yes ./dist/build.zip
```

### 错误输出 (结构化 JSON)

```bash
$ CI=true freelog publish --yes ./dist/build.zip

{
  "event": "error",
  "code": "AUTH_REQUIRED",
  "message": "缺少有效凭据",
  "details": {
    "requiredFields": [
      "FREELG_TOKEN environment variable",
      "~/.freelog/credentials.json file"
    ],
    "currentStatus": {
      "envVarSet": false,
      "credFileExists": false
    }
  },
  "recommendation": "Configure FREELG_TOKEN in CI environment or use GitHub Secrets",
  "timestamp": "2026-09-02T10:00:00Z"
}
```

### 修复后的正确用法

```bash
# 使用 GitHub Secrets
export FREELG_TOKEN="${{ secrets.FREELG_TOKEN }}"
export FREELG_ENV="production"
freelog publish --no-auto-pull ./dist/build.zip

✅ 凭据验证通过
  账号：ci-deploy-bot (ID: 5555555)
  环境：production
  
📊 发布进度
  [██████████] 100% 完成

{
  "event": "result_success",
  "data": {
    "resourceId": "res_ci_prod_001",
    "version": "1.0.0",
    "sha1": "a1b2c3d4e5f6...",
    "url": "https://console.freelog.com/resource/res_ci_prod_001"
  }
}
```

---

## A04 - 临时会话模式启动

**用户画像**: DevOps 工程师，需要为自动化任务创建临时凭据  
**前置条件**: 主账号为 main-admin

```bash
# 生成临时 Token (有效期 1 小时)
$ cat > temp-token.txt
temp-session-token-xyz789abc...
EOF

$ freelog login --token-file temp-token.txt

✅ 登录成功：ci-runner-bot (ID: 7777777)

但这是临时会话模式...

┌─ 临时会话信息 ──────────────┐
│                              │
│ 会话类型：临时 (temporary)   │
│ 创建时间：2026-09-02T16:00Z  │
│ 过期时间：2026-09-02T17:00Z  │
│ 自动保存至 credentials: NO   │
│                              │
│ 会话结束方式：               │
│   • 超时自动失效             │
│   • 执行 freelog logout      │
│   • 进程退出                 │
└────────────────────────────────┘

💾 凭据仅保存在内存中
  不会写入 ~/.freelog/credentials.json
```

### 会话生命周期验证

```bash
$ freelog profile list

持久化配置:
  default: main-admin (ID: 9999999)

临时会话:
  ci-runner-bot (ID: 7777777) - 剩余 59 分钟

# 1 小时后
$ freelog publish ./dist/auto-deploy.zip

⏱️ 会话已过期
  过期时间：2026-09-02T17:00Z
  当前时间：2026-09-02T17:05Z
  
❌ AUTH_EXPIRED: 临时会话已失效
  
请重新获取临时 Token 并登录
```

---

## A05 - Owner 不一致时的处理

**场景**: 用户误试图维护非自己拥有的资源

```bash
$ freelog update res_company_theme_123 ./dist/update.zip

🔍 加载远端资源信息
  资源 ID: res_company_theme_123
  所有者：company-owner (ID: 8888888)
  
❌ Owner 权限校验失败

当前登录账号：developer (ID: 1111111)
资源所有者：company-owner (ID: 8888888)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 您将无法执行以下操作:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✗ 创建新版本
  ✗ 修改 Listing(标题/封面/标签等)
  ✗ 调整策略模板
  ✗ 上下架资源
  
💡 建议的解决方案:
  A) 检查并切换到正确的 owner 账号
     → 执行：freelog login --switch company-owner
  B) 联系 owner 申请访问权限
  C) 如果是误操作，请使用正确的资源 ID
  
请选择操作 [A/B/C]: A
```

### 异常分支 A05-1: 显式绕过（需管理员权限）

```bash
# 管理员强制执行（特殊权限）
$ freelog update --force-admin res_company_theme_123 ./dist/update.zip

⚠️ 高危操作确认

您正在尝试以管理员权限写入非自有资源
  
资源 ID: res_company_theme_123
目标 owner: company-owner (ID: 8888888)
当前账号：super-admin (ID: 9999999)
  
这将在平台留下审计日志
  
再次确认请输入资源 ID: res_company_theme_123

输入错误，操作取消
```

---

## A06 - Token 过期恢复

**场景**: 用户发布中途 token 过期，期望能恢复而非重头再来

```bash
# Step 1: 初始发布（进行到一半）
$ freelog publish ./dist/theme.zip

... [步骤 1 完成：资源壳创建成功] ...
  资源 ID: res_abc123456
  
... [步骤 2: 准备上传版本] ...

正在连接 CDN...

❌ NETWORK_ERROR: API 调用失败
  原因：Token 已过期
  错误码：AUTH_EXPIRED
  
⚠️ 检测到未完成的任务

Checkpoint 已自动保存:
  文件：~/.freelog/checkpoints/publish-20260902-abc.json
  
是否保留 Checkpoint 供后续恢复？[Y/n]: Y

[重新登录] [取消]

用户选择：[重新登录]

$ freelog login

✅ 登录成功：liu-kai-github (ID: 8847953)

# Step 2: 自动恢复 checkpoint
$ freelog publish ./dist/theme.zip

⚠️ 检测到可恢复的任务

Checkpoint 信息:
  上次运行时间：10 分钟前
  已完成步骤：环境确认、类型选择、资源壳创建
  
是否恢复之前的任务？[Y/n]: Y

✅ Checkpoint 加载成功
  accountId 校验：8847953 == 8847953 ✓
  
→ 跳过：环境检测、资源类型选择、资源壳创建
→ 继续：版本上传

... [继续完成发布] ...

✅ 发布完成！
```

### 异常分支 A06-1: accountId 不匹配拒绝恢复

```bash
# 用户使用不同账号登录后尝试恢复
$ freelog login
✅ 登录成功：other-user (ID: 9999999)

$ freelog publish ./dist/theme.zip

⚠️ 检测到未完成的发布任务

Checkpoint 账号：liu-kai-github (ID: 8847953)
当前账号：other-user (ID: 9999999)

❌ 拒绝恢复 Checkpoint

原因：
  Checkpoint 是为其他账号创建的
  强行恢复可能导致权限冲突
  
选项:
  A) 继续使用当前账号创建新发布
  B) 切换回原账号恢复
  
您选择：[A]

💡 原 Checkpoint 已标记为"draft_abandoned"
```

---

## A07 - 跨环境发布的安全门禁

**用户画像**: 开发者在 dev/test/prod 多环境下工作

```bash
# 明确指定目标环境
$ freelog publish --env test ./dist/theme.zip

🔍 环境检测
  当前环境：test
  登录账号：liu-kai-github (ID: 8847953)
  
┌─ 环境安全确认 ───────────────┐
│                               │
│ ⚠️ 即将在 TEST 环境执行写操作 │
│                               │
│ 环境特点：                    │
│   • 数据与生产隔离            │
│   • 可用于 UAT 测试           │
│   • 可能影响测试团队          │
│                               │
│ 本次操作将创建新资源          │
│                               │
│ 是否继续？[Y/n]: Y           │
└─────────────────────────────────┘

✅ 确认无误，进入发布流程...

---

# 发布到生产环境 - 更强确认
$ freelog publish --env production ./dist/release.zip

🔍 环境检测
  当前环境：production
  
┌─ ⚠️ 高危环境确认 ─────────────┐
│                                │
│ 您正在访问 PRODUCTION 环境     │
│                                │
│ 环境特点：                     │
│   • 线上真实用户数据           │
│   • 写操作会产生实际影响       │
│   • 所有操作记录审计日志       │
│                                │
│ ✅ 已启用审计日志记录          │
│    User: liu-kai-github        │
│    Action: create_resource     │
│    Timestamp: 2026-09-02T15:30Z│
│                                │
│ 再次确认请输入 'CONFIRM'       │
│ > CONFIRM                      │
└──────────────────────────────────┘

✅ 双重确认通过，开始生产环境发布...
```

### 异常分支 A07-1: 无 prod 写入权限

```bash
$ freelog publish --env production ./dist/dev-build.zip

🔍 环境权限检查
  当前账号：developer (ID: 1111111)
  请求环境：production
  
❌ ENV_ACCESS_DENIED: 无生产环境写入权限

您的账号仅有以下环境的权限:
  ✓ dev (读写)
  ✓ test (读写)
  ✗ production (只读/无权限)

💡 申请生产环境权限:
  • 联系平台管理员开通
  • 或使用已有 production 权限的账号
  
您选择：[A) 切换到 dev 环境]

→ 自动降级到 dev 环境继续...
```

---

## A08 - 未指定环境门禁

**场景**: 用户忘记指定环境参数

```bash
$ freelog publish ./dist/theme.zip

🔍 环境配置检测
  ❌ 未检测到环境参数
  
可用选项:
  1) 使用默认环境 (dev)
  2) 列出所有可用环境并选择
  
您选择 [1/2]: 1

⚠️ 提示：建议显式指定 --env 参数以避免混淆
继续执行到 dev 环境...

---

# CI 模式下必须指定环境
$ CI=true freelog publish ./dist/build.zip

❌ ENV_REQUIRED: 非交互模式必须指定环境

请在命令中添加 --env 参数:
  freelog publish --env <dev|test|production> ...

或在 .freelog.yaml 中配置默认环境:
  environment: test
```

---

## 📝 A 组场景发现的设计缺口

| 问题编号 | 场景编号 | 发现的问题 | 建议修订文档 |
|---------|---------|-----------|------------|
| A-01 | A01-A02 | owner 字段展示时机不明确 | 04 节补充启动时信息清单 |
| A-02 | A03 | AUTH_REQUIRED 错误码未定义 | 04 节 AI-CI 场景补充结构化错误 |
| A-03 | A04-A06 | Checkpoint 数据结构缺失定义 | 06 节补充 Interface Definition |
| A-04 | A05 | owner 不一致的拒绝逻辑 | 02 节字段约束补充权限列 |
| A-05 | A07 | 环境分级确认机制 | 04 节 CLI 流程补充环境门禁 |

---

继续阅读下一组场景：B-本地准备能力场景...
