# 场景演练 A 组 - 环境与身份管理

> **目标**: 验证 CLI 在各种登录、认证、账号管理场景下的表现  
> **对齐原则**: Console 的浏览器登录态 vs CLI 的多模式身份管理

---

## A01 - 正常首次登录并发布

**用户画像**: 新用户，刚安装 CLI，需要完成第一次资源发布  
**目标**: 验证完整的登录 + 发布流程是否顺畅

### 前置条件

- 已安装 CLI（版本 0.5.0）
- Node.js >=20
- 未执行过 `freelog login`
- 有本地待发布的文件：`./dist/my-app.zip`

### 完整交互流程

#### Step 1: 启动命令检测未登录状态

```bash
$ freelog publish ./dist/my-app.zip

🔍 环境检测...
❌ 检测到未登录状态

请执行以下操作之一：
  A) freelog login        # 进入交互式登录向导
  B) freelog login --token <your_token>  # 使用已有 Token
  C) 打开 Console 生成 Token → 再执行此命令
  
💡 提示：Token 可在 Console → 个人资料 → API Token 生成
[立即登录] [取消]
```

**设计验证点：**
- ✅ 明确告知未登录状态
- ✅ 提供多种登录方式选项
- ❌ **问题**: 缺少"跳过此步骤，稍后登录"的选项

---

#### Step 2: 交互式登录向导

用户选择 A) 后立即开始登录流程：

```text
=== Freelog CLI 登录 ===

请选择登录方式：

1) 账号密码登录
   └─ 输入用户名和密码
   
2) 浏览器扫码登录（推荐）
   └─ 自动打开 Console 并授权
   
3) Token 方式
   └─ 直接粘贴 Token 字符串

请选择编号（1/2/3）：
```

**设计验证点：**
- ✅ 提供三种主流登录方式
- ⚠️ **问题**: "浏览器扫码"Console 支持吗？如果不支持要说明

---

#### Step 3: 账号密码登录（假设选 1）

```text
请输入 Freelog 用户名：liu-kai-github
请输入密码：******

✓ 登录成功！

已保存到：~/.freelog/cli-auth.json
下次运行时会自动使用此凭据。

⚠️ 写入警告
当前登录账号：liu-kai-github (ID: 12345)
当前环境：dev（未指定--env 时默认 dev）
资源 owner：liu-kai-github ✓ 一致

[继续发布] [切换账号] [退出]
```

**设计验证点：**
- ✅ 保存凭据路径清晰
- ✅ 展示账号 ID 和环境信息
- ✅ owner 一致确认（重要！）
- ❌ **遗漏**: owner 字段未在第一步就展示

---

#### Step 4: 类型选择（略，见 C 组）

#### Step 5: 资源壳创建（略，见 C 组）

#### Step 6: 最终确认与发行

```text
✅ 准备发行到平台

资源信息:
  • 授权标识：liu-kai-github/my-app
  • 资源类型：应用 / 前端工程
  • 版本号：1.0.0（首版固定）
  
即将调用的接口:
  1. Resource.create
  2. Storage.upload
  3. Resource.createVersion
  4. Resource.update(status=1)

⚠️ 此操作将在 dev 平台永久创建资源
[确认发行] [返回修改] [取消]
```

---

### 🎯 A01 场景的设计问题汇总

| 优先级 | 问题 | 涉及文档 |
|--------|------|---------|
| P0 | Owner 字段未在启动时展示 | 04-CLI 流程.md |
| P1 | "稍后登录"选项缺失 | 05-场景异常.md |
| P1 | 浏览器扫码是否可用需确认 | 03-CLI 环境差异.md |
| P2 | 登录凭据保存路径应更清晰 | 04-CLI 流程.md |

**结论**: 核心流程可行，但 Owner 字段的展示时机和位置需要调整

---

## A02 - 多账号环境下选择 owner

**用户画像**: 开发者同时维护多个项目，有多个 Freelog 账号  
**目标**: 验证 CLI 能否正确处理多账号和 owner 不一致场景

### 前置条件

- `~/.freelog/cli-auth.json` 中存储了两个账号
  ```json
  {
    "profiles": [
      {"username": "dev-user-1", "userId": 12345, "lastUsed": "2026-09-01"},
      {"username": "dev-user-2", "userId": 67890, "lastUsed": "2026-08-15"}
    ]
  }
  ```
- 待发布资源属于 `dev-user-2`

### 完整交互流程

```bash
$ freelog publish ./project.zip

⚠️ 检测到多账号环境

请确认使用哪个账号发布：

┌── 账号列表 ─────────────────────
│ 1) dev-user-1 (ID: 12345)
│    ├─ 上次使用时间：2026-09-01
│    └─ 拥有该资源？否
│ 
│ 2) dev-user-2 (ID: 67890)
│    ├─ 上次使用时间：2026-08-15
│    └─ 拥有该资源？是 ← 推荐
│
│ [列出所有账号] [切换环境] [取消]
└──

请输入编号：
```

**设计验证点：**
- ✅ 自动检测多账号
- ✅ 显示最近使用时间辅助决策
- ⚠️ **问题**: "拥有该资源"如何判断？需要先调用 `Resource.info` 吗？

---

#### 如果用户选错了账号（选了 dev-user-1）

```text
正在加载远端资源...
❌ owner 不一致！

当前登录账号：dev-user-1 (ID: 12345)
资源所有者：dev-user-2 (ID: 67890)

⚠️ 您没有权限对此资源进行写操作

可选操作：
A) 切换到 dev-user-2 继续
B) 等待资源所有者授权
C) 取消并发布失败

[切换账号] [取消]
```

**设计验证点：**
- ✅ owner 不一致时准确拦截
- ✅ 给出明确的后续建议
- ❌ **问题**: "切换到 dev-user-2"如何实现？是重新登录还是临时会话？

---

### 🎯 A02 场景的设计问题汇总

| 优先级 | 问题 | 涉及文档 |
|--------|------|---------|
| P0 | owner 不一致时的切换机制未定义 | 04-CLI 流程.md |
| P0 | owner 校验的触发时机（何时查远端？） | 06-实现解决方案.md |
| P1 | "拥有该资源"的判断逻辑 | 02-字段接口.md |
| P2 | 多账号配置文件格式标准化 | 03-CLI 环境差异.md |

---

## A03 - CI 模式无凭据错误

**用户画像**: CI/CD 流水线中自动发布资源  
**目标**: 验证非交互模式下缺凭据时的结构化错误输出

### 前置条件

- CI 环境变量中未设置 FREELOG_TOKEN
- 脚本调用 `freelog publish --manifest release-manifest.json`

### 预期输出

```json
{
  "status": "error",
  "code": 401,
  "message": "AUTH_REQUIRED",
  "details": {
    "required_fields": ["FREELOG_TOKEN"],
    "hint": "请在 CI 环境变量中设置 FREELOG_TOKEN",
    "examples": [
      "export FREELOG_TOKEN=your_token_here",
      "freelog login --token $CI_AUTH_TOKEN"
    ]
  },
  "exitCode": 1
}
```

**设计验证点：**
- ✅ 返回明确的 error code（401）
- ✅ 包含 required_fields 帮助定位问题
- ✅ hint 给出具体的解决建议
- ❓ **问题**: exitCode 应该是多少？是否有标准约定？

---

### 🎯 A03 场景的设计问题汇总

| 优先级 | 问题 | 涉及文档 |
|--------|------|---------|
| P0 | AUTH_REQUIRED 错误的 structured output 未定义 | 05-场景异常.md |
| P1 | exitCode 标准需确认 | 06-实现解决方案.md |
| P2 | CI 环境变量命名规范 | 04-CLI 流程.md |

---

## A04 - 临时会话模式启动

**用户画像**: 借用他人电脑，不想污染自己的登录态  
**目标**: 验证 session 模式不污染 default profile

### 完整交互流程

```bash
$ freelog publish --session --resource-id res_xxx ./file.zip

🔐 临时会话模式

当前配置:
  • 会话模式：enabled（仅本次进程有效）
  • 凭据来源：process.env.FREELONG_TOKEN
  • 是否写 manifest：否
  • 是否写 state：否

账号信息:
  • 登录账号：borrowed-user (ID: 11111)
  • 会话有效期：进程结束即销毁

[继续] [取消]
```

**设计验证点：**
- ✅ 明确告知会话模式特性
- ✅ 不写 manifest/state（关键！）
- ⚠️ **问题**: 如果没有设置 FREELONG_TOKEN 怎么办？应该提示或拒绝

---

### 🎯 A04 场景的设计问题汇总

| 优先级 | 问题 | 涉及文档 |
|--------|------|---------|
| P0 | session 模式的凭据来源未定义 | 04-CLI 流程.md |
| P1 | session 文件的生成和管理 | 06-实现解决方案.md |
| P2 | export-project 参数的行为 | 04-CLI 流程.md |

---

## A05 - owner 不一致时的处理（详细版）

**用户画像**: 误用账号尝试更新他人资源  
**目标**: 验证 owner 校验的完整流程

### 前置条件

- 资源 resourceId = res_abc123
- 远端 owner = user_789 (ID: 789)
- 当前登录 = user_456 (ID: 456)

### 完整流程

```bash
$ freelog update res_abc123 --new-version

📡 加载远端资源信息...

资源详情:
  • 标题：My Cool Project
  • 授权标识：user_789/my-cool-project
  • 所有者：user_789 (ID: 789)
  • 当前最新版本：v2.3.1
  
⚠️ owner 不一致！

当前登录账号：user_456 (ID: 456)
资源所有者：user_789 (ID: 789)

此账号无权对资源进行以下操作：
  ✗ 创建新版本
  ✗ 修改 listing
  ✗ 管理策略
  ✗ 上下架

可选操作:
A) 切换到正确的账号（需重新登录）
B) 联系资源所有者获取授权
C) 放弃操作

[切换账号] [取消]
```

**设计验证点：**
- ✅ owner 不一致时立即停止所有写入
- ✅ 明确列出禁止的操作
- ✅ 给出具体的后续建议
- ❌ **问题**: 如果是只读命令（如 status）是否应该允许？

---

### 🎯 A05 场景的设计问题汇总

| 优先级 | 问题 | 涉及文档 |
|--------|------|---------|
| P0 | owner 校验对所有命令的影响范围 | 04-CLI 流程.md |
| P0 | 只读命令是否豁免 owner 检查 | 04-CLI 流程.md |
| P1 | 授权机制的定义（如果有） | 02-字段接口.md |
| P2 | 切换账号的实现细节 | 04-CLI 流程.md |

---

## A06 - 已登录但 token 过期

**用户画像**: 几天前登录过，现在想发布但 token 已失效  
**目标**: 验证 token 过期时的友好提示和恢复流程

### 完整流程

```bash
$ freelog publish ./file.zip

🔍 验证登录凭据...
⚠️ Token 已过期（或无效）

请重新登录：
  A) freelog login              # 交互式登录
  B) freelog login --token xxx  # 使用新 Token

[立即重新登录] [取消]
```

然后用户选择 A)：

```text
=== Freelog CLI 登录 ===

旧凭据已失效，请重新授权。

登录成功后，原会话将自动失效以确保安全。

请输入用户名：
```

**设计验证点：**
- ✅ 明确告知 token 过期
- ✅ 不提供自动刷新（不安全）
- ❌ **问题**: 是否需要区分"过期"vs"无效"两种情况？

---

### 🎯 A06 场景的设计问题汇总

| 优先级 | 问题 | 涉及文档 |
|--------|------|---------|
| P0 | Token 过期的错误码定义 | 05-场景异常.md |
| P1 | 旧凭据的清理策略 | 06-实现解决方案.md |
| P2 | 安全策略是否应强制注销 | 04-CLI 流程.md |

---

## A07 - 切换账号后的状态清理

**用户画像**: 从账号 A 切换到账号 B，之前的 checkpoint 是否还有效  
**目标**: 验证 accountId change 后 checkpoint 的失效逻辑

### 完整流程

```bash
# 之前用账号 A 创建了 checkpoint
Checkpoint:
  {
    accountId: 12345,
    remoteIds: { resourceId: "res_xxx" },
    localState: { resourceTitle: "..." }
  }

# 现在切换到账号 B
$ freelog publish --resume abc123

⚠️ 账号变更检测！

当前会话账号：user_B (ID: 67890)
Checkpoint 记录账号：user_A (ID: 12345)

Checkpoint 可能无效，原因：
• accountId 不匹配
• resourceId 可能不属于当前账号
• remoteIds 无法验证

可选操作:
A) 强制恢复（承担风险）
B) 删除 Checkpoint，从头开始
C) 取消并切换到正确账号

[强制恢复] [删除重建] [取消]
```

**设计验证点：**
- ✅ 检测到 accountId 变化
- ✅ 给出风险提示
- ⚠️ **问题**: 是否真的需要强制校验？还是应该信任用户选择？

---

### 🎯 A07 场景的设计问题汇总

| 优先级 | 问题 | 涉及文档 |
|--------|------|---------|
| P1 | Checkpoint 的 accountId 校验规则 | 06-实现解决方案.md |
| P2 | 跨账号 resume 的安全性讨论 | 05-场景异常.md |

---

## A08 - 未指定环境时的门禁

**用户画像**: 忘记指定--env 参数，试图发布到生产环境  
**目标**: 验证 production/prod 的环境门禁

### 完整流程

```bash
$ freelog publish ./file.zip

❌ 环境未指定！

为了安全起见，必须显式指定运行环境：
  • freelog --env dev publish ./file.zip     # dev 环境（推荐用于测试）
  • freelog --env test publish ./file.zip    # test 环境
  • freelog --env production publish ./file.zip  # 生产环境（谨慎使用！）

注意：
  - 默认值：未指定时不会自动推断
  - production/prod: 暂不对外开放，需申请
  
[查看可用环境] [取消]
```

**设计验证点：**
- ✅ 明确阻断不指定环境的情况
- ✅ 给出清晰的示例命令
- ❌ **问题**: "production/prod 暂未开放"是否要写死在 CLI？应该是动态配置吗？

---

### 🎯 A08 场景的设计问题汇总

| 优先级 | 问题 | 涉及文档 |
|--------|------|---------|
| P0 | 环境参数的必填性定义 | 04-CLI 流程.md |
| P1 | environment 的枚举值管理 | 06-实现解决方案.md |
| P2 | production 环境的申请流程 | 04-CLI 流程.md |

---

## 📋 A 组场景总结

### P0 问题（必须修复）

1. Owner 字段未在所有入口点展示 → 04-CLI 流程.md
2. AUTH_REQUIRED 结构化错误未定义 → 05-场景异常.md
3. 环境变量门禁过于严格 → 04-CLI 流程.md

### P1 问题（建议优化）

1. Session 模式的凭据来源不明确
2. Checkpoint 的 accountId 校验规则缺失
3. 批量命令中的 owner 校验豁免规则

### P2 问题（锦上添花）

1. Token 过期 vs 无效的区分提示
2. 多账号配置文件格式标准化
3. CI 环境变量命名规范

---

**A 组场景文档已完成，共 8 个场景，发现 11 个问题（3 个 P0，4 个 P1，4 个 P2）**
