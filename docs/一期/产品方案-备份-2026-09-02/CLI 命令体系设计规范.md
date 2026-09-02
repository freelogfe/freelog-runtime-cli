# CLI 命令体系设计规范

> **文档角色**: 定义 CLI 命令的命名规则、参数组织、交互逻辑等**产品设计决策**  
> **关联场景**: A01-A08, C01-C32, D01-D07 等 31 个深度场景演练发现的设计漏洞  
> 最后更新：2026-09-02

---

## 📐 **一、命令命名规范**

### **1.1 动词选择原则**

| 决策维度 | 设计原则 | 示例 | 理由 |
|---------|---------|------|-----|
| **简洁性 vs 清晰度** | 优先使用完整单词，短命令仅用于高频操作 | `publish` > `pub`；`update` > `u` | CLI 不追求打字速度，追求可读性和可预测性 |
| **语义明确性** | 避免歧义词，确保命令意图一目了然 | `upload` <br> `push` | `upload`明确表示上传文件，`push`可能指 git push |
| **Console 对齐** | 与 Console UI 按钮名称保持一致 | `freelog publish` ↔ Console「发布资源」 | 降低用户跨端认知成本 |
| **领域术语统一** | 使用 Freelog 平台标准术语 | `resource` > `item`；`collection` > `group` | 保持与 API/Console 一致的专业性 |

**最终决策**：
```
核心命令：
  freelog create      # 创建工程（脚手架）
  freelog pack        # 独立压缩打包
  freelog publish     # 发布资源（主流程）
  freelog update      # 更新已有资源
  freelog collection  # 合集管理
  freelog rss         # RSS 绑定
  freelog rules       # 自动收录规则
  freelog batch       # 批量发布
  freelog session     # 会话管理
  freelog doctor      # 环境诊断
  
辅助命令:
  freelog login       # 登录
  freelog logout      # 登出
  freelog whoami      # 查看当前账号
  freelog switch      # 切换账号/环境
  freelog config      # 配置管理
  freelog help        # 帮助系统
  freelog completion  # 安装 Tab 补全
```

---

### **1.2 命令层级设计**

```
freelog <command> [<flags>] [<args>]

命令结构：
├── 顶层命令 (1 级) - 必须简洁明确
│   ├── 资源相关
│   │   ├── publish 发布单资源
│   │   ├── update 更新已有资源
│   │   └── info 查看资源详情
│   │
│   ├── 批量相关
│   │   ├── batch 批量发布
│   │   └── scan 扫描本地目录
│   │
│   ├── 合集相关
│   │   ├── collection 合集管理
│   │   └── rss RSS 订阅
│   │
│   └── 工具相关
│       ├── create 脚手架
│       ├── pack 压缩工具
│       ├── session 会话管理
│       └── doctor 环境检查

├── 子命令 (2 级) - 仅在必要时出现
│   └── collection <action>
│       ├── create 新建合集
│       ├── add 添加条目
│       ├── remove 移除条目
│       └── sort 排序条目
│
└──  Flags 和 Args (可选)
    ├── Flags: --yes --resume --dry-run ...
    └── Args: <input-path> <resource-id> ...
```

**决策依据**：
- ✅ **扁平化优先**：大多数情况下不使用子命令，减少学习成本
- ⚠️ **集合类特殊处理**：只有 collection 有明确的子命令（create/add/remove/sort）
- ❌ **避免过度分层**：如 `freelog resource publish` → 直接 `freelog publish`

---

## 🔤 **二、参数组织规则**

### **2.1 位置参数（positional args）**

```bash
freelog <command> [positional-args] [flags]

规则：
1. positional args 必须在 flags 之前
2. 最多支持 2 个 positional args（超过则强制使用 flags）
3. 第一个 positional arg 为必填（input path / resource id）

示例：
  ✅ freelog publish ./file.zip --yes
  ✅ freelog update res_xxx --new-version
  ❌ freelog publish --yes ./file.zip  # 错误顺序
```

**为什么这样设计？**
- 符合 Unix/Linux CLI 惯例
- 命令行阅读顺序 = 执行顺序，更直观
- 支持参数补全时不会受 flags 干扰

---

### **2.2 长标志（long flags）**

| 标志类型 | 设计原则 | 示例 | 长度限制 |
|---------|---------|------|---------|
| **全局通用 flag** | 所有命令可用 | `--help` `--version` `--verbose` | 固定 |
| **命令专用 flag** | 仅在对应命令下有效 | `publish --resume` `update --new-version` | 语义明确 |
| **布尔型 flag** | 否定形式表示相反逻辑 | `--yes` (跳过确认) vs `--no-prompt` | ≤25 chars |
| **带参 flag** | 等号连接或空格分隔 | `--env=dev` 或 `--env dev` | 参数≤10 words |

**最终决策**：

```bash
# 通用全局 flags（所有命令可用）
--help                # 显示帮助
--version             # 显示版本
--verbose/-v          # 详细输出
--quiet/-q            # 静默模式（仅输出关键信息）
--output-format       # json|ndjson|human [default: human]
--timeout             # API 调用超时时间 (秒) [default: 30]

# 发布命令专用 flags
--yes/-y              # 跳过所有确认提示
--resume              # 恢复上次中断的发布任务
--force-new           # 强制新建任务，丢弃 Checkpoint
--dry-run             # 仅预览，不执行远端写入
--manifest            # 使用声明式配置文件
--owner               # 指定资源 owner（覆盖当前账号）
--switch              # 切换到指定账号后再执行

# 更新命令专用 flags
--new-version         # 发新版本
--listing-only        # 只更新 listing
--policy-only         # 只更新策略
--online-offline      # 上下架操作

# 批量命令专用 flags
--batch-size          # 每批提交数量 [default: 10]
--report              # 导出报告格式 json|csv|pdf
--ignore-frozen       # 忽略冻结资源（危险！）

# 环境变量优先级（从高到低）
1. CLI flags (--env=production)
2. 环境变量 (FREELG_ENV=production)
3. credential 文件中的账号配置
4. global config (~/.freelog/config.json)
```

---

### **2.3 短标志设计原则**

| 场景 | 是否使用短标志 | 理由 |
|-----|--------------|-----|
| **最高频命令的通用选项** | ✅ 使用 `-h`, `-v`, `-q` | 提升效率 |
| **特定命令的常用 flag** | ⚠️ 谨慎使用（如 `-y` for --yes） | 避免歧义 |
| **带参数的 flag** | ❌ 不使用短标志 | `-e dev`容易混淆，用`--env=dev` |
| **实验性功能** | ❌ 仅长标志 | `--experimental-feature` |

**最终决策**：
```bash
唯一认可的短标志：
  -h  (Help)
  -v  (Verbose)
  -q  (Quiet)
  -y  (Yes)

其他全部使用长标志，理由是：
- CLI 主要用于编排自动化脚本，可读性 > 打字速度
- 现代终端的 Tab 补全已大幅降低记忆负担
- 避免 `-f`（file? force? follow?）、`-r`（resume? recursive? restore?）等歧义
```

---

## 🔄 **三、交互式流程设计**

### **3.1 TTY 模式的状态转换**

```
启动命令
  ↓
[步骤 1] 环境身份确认
  ├─ 检测 environment (dev/test/production)
  ├─ 读取当前账号 username (ID: xxx)
  └─ 识别目标资源 owner（如已知）
  ↓
[步骤 2] 资源类型选择
  ├─ 拉取平台类型树
  ├─ 展示一级分类编号
  ├─ 用户选择/搜索关键词
  └─ 进入子级直到叶子节点
  ↓
[步骤 3] 内容来源选择
  ├─ 使用已有单文件
  ├─ 使用现有本地工程
  ├─ 从模板创建新工程
  ├─ 使用已有构建目录
  └─ 使用已有压缩包/artifact
  ↓
... (中间步骤省略) ...
  ↓
[步骤 N] Listing 维护
  ├─ 封面上传 (带预览和维度检测)
  ├─ 简介编辑
  ├─ 标签输入 (带历史推荐)
  └─ RSS 锁定字段检测
  ↓
[步骤 N+1] 上架确认
  ├─ 展示最终摘要
  ├─ 等待用户确认 [Y/n]
  └─ 执行远端写入
  ↓
完成 → 输出报告 + Console 接力链接
```

**关键设计决策**：

| 维度 | 设计决策 | 理由 |
|-----|---------|-----|
| **步骤导航** | 线性流程，不支持跳跃 | 简化状态管理，避免字段遗漏 |
| **返回上一页** | 允许返回上一步修改 | 防止重复填写 |
| **中途退出** | Ctrl+C 保存 Checkpoint | 防止数据丢失 |
| **跨步骤切换 account** | 不允许，需先取消重启动 | 避免 owner 不一致的复杂情况 |
| **environment 切换** | 不允许中途切换 | 保证一次会话的环境一致性 |

---

### **3.2 Checkpoint 保存策略设计**

```typescript
/**
 * Checkpoint 触发时机决策树
 */
const CHECKPOINT_TRIGGERS = {
  // L3 远端写入前必须保存（P0-02 修订）
  BEFORE_REMOTE_WRITE: [
    "Resource.create",      // 创建资源壳
    "Resource.createVersion", // 创建版本
    "Policy.save",          // 保存策略
    "Resource.update",      // 更新 listing/上下架
  ],
  
  // 中断信号处理
  SIGNAL_HANDLER: ["SIGINT", "SIGTERM"], // Ctrl+C / kill
  
  // 显式用户请求
  EXPLICIT_SAVE: ["freelog draft save"],
  
  // 异常情况
  ERROR_RECOVERY: [
    "NETWORK_ERROR",
    "API_TIMEOUT",
    "AUTH_EXPIRED"
  ]
};

/**
 * Checkpoint 恢复校验规则（P0-01 修订）
 */
const RESUME_VALIDATION = {
  accountId: {
    required: true,
    checkMode: "STRICT", // 严格匹配，不匹配则拒绝恢复
    errorMessage: "CHECKPOINT_ACCOUNT_ID_MISMATCH",
    options: [
      "freelog switch --account <correct_id>",
      "delete checkpoint and start over",
      "force resume with warning (not recommended)"
    ]
  },
  
  environment: {
    allowedMismatch: false, // 环境不一致禁止恢复
    reason: "不同环境的权限和资源状态可能完全不同"
  },
  
  resourceOwner: {
    checkMode: "WARNING", // 仅警告，允许继续但显示告警
    errorMessage: null,
    options: []
  }
};
```

**Checkpoint 数据结构决策**：

```typescript
interface Checkpoint {
  // 元数据
  version: "1.0";                    // P0-02 修订
  runId: string;                     // UUID，唯一标识本次运行
  accountId: string;                 // 账号 ID（用于校验）
  environment: "dev" | "test" | "production";
  
  // 流程进度
  completedSteps: string[];          // 已完成步骤列表
  currentStep: string;               // 当前卡住步骤
  status: "active" | "abandoned" | "completed";
  
  // 已收集的字段数据（关键！防止数据丢失）
  collectedData: {
    resourceTitle?: string;
    resourceName?: string;
    resourceType?: string;
    version?: string;
    description?: string;
    customProperties?: Record<string, any>;
    coverImage?: string;
    tags?: string[];
    policyTemplate?: string;
    fileSha1?: string;
    fileName?: string;
  };
  
  // 远端已创建的资源 ID（关键！避免重复创建）
  remoteResources: {
    resourceId?: string;
    versionId?: string;
    policyId?: string;
  };
  
  // 元数据
  metadata: {
    createdAt: string;               // ISO 8601
    updatedAt: string;
    cliVersion: string;
    cwd: string;
    command?: string;                // 原始命令（脱敏）
  };
}
```

---

## 💬 **四、错误提示分级策略**

### **4.1 错误码分类体系**

```
错误码前缀命名规则：

AUTH_*      - 认证相关
  • AUTH_EXPIRED       Token 已过期
  • AUTH_INVALID       无效凭据
  • ACCOUNT_AMBIGUOUS  多账号未指定

OWNER_*     - Owner 相关
  • OWNER_MISMATCH     当前账号不是 resource owner
  • OWNER_NOT_FOUND    指定 owner 不存在

RESOURCE_*  - 资源相关
  • RESOURCE_NOT_FOUND 资源不存在
  • RESOURCE_FROZEN    资源被冻结
  • TYPE_NOT_SUPPORTED 资源类型不支持

VERSION_*   - 版本相关
  • VERSION_CONFLICT   版本号小于等于最新版本
  • NO_MATCHING_VERSION 依赖版本范围未命中任何版本
  • SEMVER_INVALID     非语义化版本号

CHECKPOINT_*- Checkpoint 相关
  • CHECKPOINT_NOT_FOUND   Checkpoint 文件不存在
  • CHECKPOINT_ACCOUNT_ID_MISMATCH Account ID 不匹配
  • CHECKPOINT_EXPIRED     Checkpoint 超过 7 天

BATCH_*     - 批量相关
  • BATCH_PARTIAL_FAILURE   部分项目失败
  • BATCH_UNKNOWN_OUTCOME   某项结果未知（网络错误）
  • BATCH_SKIP_FROZEN       跳过冻结资源

RSS_*       - RSS 相关
  • RSS_FEED_NOT_ACCESSIBLE    Feed 无法访问
  • RSS_NO_EMAIL       Feed 未提供邮箱
  • RSS_ALREADY_BOUND  RSS 已绑定
  • RSS_VERIFICATION_FAILED 验证码错误
  • RSS_GUID_MISMATCH    GUID 大面积不匹配

LISTING_*   - Listing 相关
  • LISTING_LOCKED_BY_RSS   Listing 字段被 RSS 锁定
  • COVER_DIMENSION_SUBOPTIMAL 封面比例非最优
  • TAGS_EXCEED_LIMIT      标签数量超限

POLICY_*    - 策略相关
  • POLICY_COMPILE_FAILED  策略编译失败
  • POLICY_TRANSLATION_ERROR 策略翻译错误
  • POLICY_DUPLICATE       策略重复

BUILD_*     - 构建相关
  • BUILD_EXECUTION_FAILED 构建失败
  • BUILD_ARTIFACT_MISSING 构建产物缺失
  • BUILD_OUTPUT_SIZE_EXCEED 产物超大小限制

PACK_*      - 压缩相关
  • PACK_EMPTY_DIRECTORY   目录为空
  • PACK_IGNORE_ALL_FILES  所有文件被忽略
  • PACK_FILE_NOT_READABLE 文件不可读

CROSS_CUTTING-*  跨模块问题
  • NETWORK_ERROR          网络连接失败
  • API_TIMEOUT            API 调用超时
  • INVALID_MANIFEST       manifest 格式错误
```

---

### **4.2 用户提示分级策略**

| 错误等级 | TTY 模式 | AI-CI 模式 | 示例 |
|---------|--------|-----------|-----|
| **FATAL** | ❌ 红色错误框 + 具体修复命令 | JSON `error`事件 + `errorCode` | `AUTH_EXPIRED` |
| **WARNING** | ⚠️ 黄色警告框 + 建议选项 | JSON `warning`事件 | `COVER_DIMENSION_SUBOPTIMAL` |
| **INFO** | ℹ️ 蓝色提示框 | JSON `info`事件 | `checkpoint_detected` |
| **HINT** | 💡 绿色提示（最后一行） | 不输出 | 常见错误修复建议 |

**示例对比**：

```bash
# TTY 模式 - FATAL 错误
❌ ERROR: OWNER_MISMATCH

原因：当前账号 developer (1111111) 不是资源 res_company_theme_123 的 owner
   
资源 owner: company-owner (8888888)

修复建议：
  1) 切换到正确的账号
     $ freelog switch --account 8888888
     
  2) 验证切换后的账号
     $ freelog whoami
     
  3) 重试发布命令
     $ freelog publish ./file.zip

💡 更多帮助：$ freelog help flow publish


# AI-CI 模式 - 同一错误
{
  "event": "error",
  "code": "OWNER_MISMATCH",
  "message": "当前账号不是资源 owner，拒绝写入",
  "details": {
    "currentAccount": {
      "username": "developer",
      "accountId": "1111111"
    },
    "resourceOwner": {
      "username": "company-owner", 
      "accountId": "8888888"
    },
    "resourceId": "res_company_theme_123"
  },
  "recommendation": "Switch to the correct account using 'freelog switch --account 8888888'",
  "options": [
    {
      "action": "switch_account",
      "command": "freelog switch --account 8888888 && freelog publish ./file.zip"
    },
    {
      "action": "use_force_flag",
      "command": "freelog publish --force-admin ./file.zip"
    }
  ]
}
```

---

## 🎨 **五、无障碍与兼容性设计**

### **5.1 屏幕阅读器友好模式**

```bash
# 启用方式
freelog --screen-reader publish ./file.zip

# 输出替换规则
原始输出：
  ✅ Success  ← Unicode emoji
  
屏幕阅读器输出:
  [成功] 操作完成
  
原始输出:
  ❌ Error  ← Unicode emoji

屏幕阅读器输出:
  [错误] 操作失败

原始输出:
  ████░░ 80% ← ASCII art 进度条

屏幕阅读器输出:
  进度：百分之八十
```

**Unicode 到文字映射表（partial）：**

| Unicode | 文字替代 | 适用场景 |
|--------|---------|---------|
| ✅ | [成功] | 操作成功 |
| ❌ | [失败] | 操作失败 |
| ⚠️ | [警告] | 需要注意 |
| ℹ️ | [提示] | 补充信息 |
| 💾 | [存档] | Checkpoint |
| 👤 | [用户] | 账号相关 |
| 📦 | [资源] | 资源相关 |
| 📡 | [订阅] | RSS 相关 |
| █ | (空格) | 进度条填充 |
| ░ | (空格) | 进度条空白 |
| ─ | (连字符) | 分隔线 |

---

### **5.2 终端兼容性降级**

| 场景 | 正常渲染 | Windows CMD 降级 | macOS Terminal 降级 |
|-----|---------|----------------|-------------------|
| **彩色图标** | ✅❌⚠️ | 使用 ASCII 替代 ([OK][ERR]) | 保持彩色 |
| **进度条** | ██████░░ | ▓▓▓▓░░ | 保持原样 |
| **框线字符** | ┌─┐│ └─┘ | [+---+]| | +-+-+ || | +-+-+ |
| **ANSI 颜色** | \x1b[32m | 关闭颜色 (256 color mode) | 保持颜色 |

**降级策略决策**：
- ✅ **默认行为**：检测到终端不支持 Unicode 时自动降级
- ✅ **用户显式要求**：`--low-color`强制使用 ASCII 替代
- ✅ **CI/CD 环境**：自动检测 CI=true→纯文本输出

---

## 📊 **六、验收标准汇总**

### **命令体系验收**

| 项目 | 验收标准 | 实现方式 |
|-----|---------|---------|
| 命名规范 | 所有命令 ≥ 5 个字符，无歧义 | Review 命令列表 |
| 参数顺序 | positional args 在前，flags 在后 | 单元测试 + e2e 测试 |
| 短标志限制 | 仅 -h/-v/-q/-y 四个 | Code review |
| 全局 flags | 所有命令支持 --help/--version | Integration test |
| 优先级矩阵 | 清晰定义 flags/env/config 优先级 | 文档审查 |

### **交互体验验收**

| 项目 | 验收标准 | 实现方式 |
|-----|---------|---------|
| 线性流程 | 不支持跳步，只能顺序执行 | 状态机测试 |
| Checkpoint 保存 | L3 写入前必存，中断必存 | 单元测试 |
| 恢复校验 | accountId 严格匹配 | e2e 测试 |
| 错误分级 | FATAL/WARNING/INFO/HINT四层 | Review 错误码列表 |
| TTY 提示 | 包含具体修复命令 | Manual test |

### **无障碍验收**

| 项目 | 验收标准 | 实现方式 |
|-----|---------|---------|
| screen-reader 模式 | --screen-reader标志生效 | Accessibility test |
| Unicode 映射 | 所有 emoji 转文字 | RegEx 验证 |
| Windows 兼容 | CMD 下 ASCII 降级 | Cross-platform test |
| CI 环境检测 | CI=true 自动优化输出 | Mock CI env test |

---

## 🔧 **七、待实施的具体任务**

### **P0 优先级（必须完成）**

1. **定义完整的命令列表和参数规范**
   - 创建命令矩阵表（命令名、flags、args、描述）
   - 制定参数命名公约（camelCase/snake-case）
   - 编写命令行示例库

2. **设计 Checkpoint 数据结构**
   - JSON Schema 定义
   - 保存/恢复/删除逻辑
   - accountId 校验规则

3. **建立错误码体系**
   - 错误码分类和编号规则
   - 用户提示文案库（TTY/AI-CI 双版本）
   - 自动重试策略

4. **确定优先级矩阵**
   - flags vs env vs config vs credential
   - 冲突时的最终取值规则

### **P1 优先级（强烈建议）**

5. **Tab 自动补全规则设计**
   - Bash/Zsh/PowerShell多端脚本框架
   - 参数值智能推荐逻辑（文件路径/账号名/checkpoint ID）

6. **TTY 美化组件库**
   - 色彩编码系统（chalk 配色）
   - 进度条/状态列表/警告框组件
   - Unicode 降级方案

7. **无障碍支持**
   - screen-reader 模式实现
   - Unicode 转文字 mapping 表
   - 高对比度主题

### **P2 优先级（可选）**

8. **多语言支持**
   - 错误提示文案国际化
   - 基于 locale 自动选择语言
   - 中文/英文双语切换

9. **性能优化**
   - 大型批量操作的进度预计算
   - 缓存策略（类型树/标签池）
   - API 请求并发控制

---

## 📋 **八、与设计原则的对齐**

### **Console 对齐证据链**

| CLI 设计点 | Console 源码证据 | 对齐方式 |
|----------|----------------|---------|
| 资源标题最大长度 100 | src/utils/resourceValidator.ts:L45 | ✅ 完全一致 |
| 授权标识自动生成 | src/components/resource/AuthIdentityForm.tsx:L120 | ✅ 同源算法 |
| RSS 锁定字段 | src/pages/collection/RssBinding.tsx:L230 | ✅ 相同业务规则 |
| 版本 semver 校验 | src/utils/semverUtils.ts:L89 | ✅ 复用 same library |
| 标签去重逻辑 | src/components/common/TagInput.tsx:L156 | ✅ 前端验证 + 后端兜底 |

### **Console 源码对照方法**

```bash
# 查找 Console 源码中的验证规则
grep -r "MAX_TITLE_LENGTH\|resourceTitle.*length" src/

# 查找 RSS 锁定逻辑
grep -r "rssLockedFields\|lockedWhen" src/

# 查找 semver 校验
grep -r "validRange\|satisfies" src/
```

**对齐原则**：
- ✅ **硬约束（HARD）**：Console 强制执行 → CLI 本地校验 + 平台兜底
- ⚠️ **软约束（SOFT）**：Console 推荐但不强制 → CLI 给出建议但不阻止
- ❌ **自由字段**：无约束 → CLI 不做额外限制

---

## 📊 **总结**

本次 CLI 命令体系设计规范的核心价值：

1. **命名规范** → 确保 CLI 易用性和专业性的平衡
2. **参数规则** → 统一的用户体验预期
3. **交互流程** → 线性、安全、可恢复
4. **错误分级** → 多层级的用户提示策略
5. **无障碍设计** → 包容所有用户群体
6. **Console 对齐** → 证据链完整的设计追溯

**总行数**: 约 300 行纯设计文档（不含代码实现）

---

**相关文档**:
- 31 个深度场景演练（A01-F06/Z）
- P0-P2 业务规则修订（commit e2f9e71）
- Console 源码证据（Freelog 平台 GitHub Repo）
