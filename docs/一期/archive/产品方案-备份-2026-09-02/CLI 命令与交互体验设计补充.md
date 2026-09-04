# 产品方案补充：CLI 命令与交互体验设计

> **文档角色**: 补充 CLI 命令体系、帮助系统、交互提示、用户体验的细化设计  
> **关联修订**: P0-P2 业务规则修订 + 31 个深度场景演练  
> 最后更新：2026-09-02

---

## 🎯 **一、CLI 帮助系统设计**

### **1.1 三层帮助架构**

```
freelog help                    # 顶级帮助入口
  ├── --help (所有命令列表)
  ├── help <command>            # 命令级帮助
  │   └── freelog publish --help
  │       ├── 使用示例（带 emoji）
  │       ├── 必填/可选参数详解
  │       ├── 环境变量映射
  │       └── 常见错误码说明
  └── help field <fieldId>      # 字段级帮助
      └── freelog help field FORM-RES-TITLE
          ├── Console 字段约束
          ├── CLI 默认值策略
          └── 异常处理逻辑
```

#### **具体实现示例**

```bash
$ freelog publish --help

发布本地资源到平台（连续向导模式）

📖 快速入门
  $ freelog publish ./theme.zip                    # 单文件资源
  $ freelog publish ./dist/                        # 目录资源（自动构建压缩）
  $ freelog publish --manifest release.json        # 声明式发布

⚙️ 核心参数
  positional
    input                     必填，本地文件或目录路径
  
  flags
    --yes, -y                 跳过确认提示直接发布（AI-CI 环境推荐）
    --no-auto-pull            不自动拉取最新类型树/模板数据
    --resume                  恢复上次中断的发布任务（Checkpoint）
    --force-new               强制新建任务，丢弃旧 Checkpoint
    --dry-run                 仅预览，不执行任何远端写入
    --output-format           json|ndjson|human  [default: human]

🌐 环境变量
  FREELG_TOKEN              认证令牌（覆盖登录状态）
  FREELG_ENV                dev|test|production [default: dev]
  CI=true                   启用非交互模式（自动 --yes --output-format json）

❌ 错误码参考
  AUTH_EXPIRED             Token 已过期，请重新登录
  OWNER_MISMATCH           当前账号不是资源 owner
  CHECKPOINT_ACCOUNT_ID_MISMATCH  Checkpoint 属于其他账号
  NO_MATCHING_VERSION      依赖版本范围未命中任何已有版本

💡 查看字段详情
  $ freelog help field FORM-RES-TITLE
  $ freelog help field FORM-RSS-FEED

📊 查看更多
  $ freelog docs publish           # 打开在线文档
  $ freelog console link           # 获取 Console 接力链接
```

---

### **1.2 Tab 自动补全系统**

```bash
$ freelog <Tab>
publish  update   collection  rss      batch   

$ freelog publish ./res<Tab>
./release.zip  ./snapshot.zip  ./dist/theme.zip

$ freelog publish --env<Tab>
--env=dev  --env=test  --env=production

$ freelog publish --owner<Tab>  # 自动补全账号列表
liu-kai-github  company-admin  ci-deploy-bot
```

#### **实现逻辑**

```typescript
class CompletionService {
  async provideCompletions(command: string, partialArg: string): Promise<string[]> {
    if (command === 'publish' && partialArg.startsWith('./')) {
      return this.getLocalFiles(partialArg);
    }
    
    if (command === 'publish' && partialArg === '--owner') {
      return await this.getAccountList(); // 从 credential 读取
    }
    
    if (partialArg.startsWith('--')) {
      return this.getMatchingFlags(command, partialArg);
    }
  }
}
```

---

## 💬 **二、交互提示体验设计**

### **2.1 统一视觉规范**

#### **颜色编码系统**

```typescript
const COLORS = {
  success:   '\x1b[32m✅\x1b[0m',     // 绿色勾选
  error:     '\x1b[31m❌\x1b[0m',     // 红色叉号
  warning:   '\x1b[33m⚠️\x1b[0m',     // 黄色警告
  info:      '\x1b[36mℹ️\x1b[0m',     // 蓝色信息
  pending:   '\x1b[37m⏳\x1b[0m',     // 灰色等待
  checkpoint:'\x1b[35m💾\x1b[0m',     // 紫色存档
  owner:     '\x1b[34m👤\x1b[0m',     // 蓝色用户
  resource:  '\x1b[32m📦\x1b[0m',     // 绿色资源
  rss:       '\x1b[36m📡\x1b[0m',     // 青色 RSS
};
```

#### **TTY 美化 UI 组件**

```typescript
// 进度条
console.log(`正在上传 ${progress}%...`);
// 输出：正在上传 ████████░░ 80% ...

// 多选列表
┌─ 选择资源类型 ───────────────┐
│                                │
│ ✓  1. 节点主题 → React         │
│   2. 插件                       │
│   3. 普通文档                   │
│                                │
│ [继续] [返回上一页]             │
└────────────────────────────────┘

// 状态列表
📝 字段填写进度：
  ✓ 资源标题
  ✓ 授权标识
  ✓ 版本信息
  ⏳ 策略配置      ← 当前步骤
  □ 封面图片      ← 待填写
  □ 上架确认

// 警告框
┌─ ⚠️ 检测到未完成的发布任务 ─────┐
│                                   │
│ Checkpoint 信息：                 │
│   • 已保存：15 分钟前             │
│   • 已完成步骤：4                 │
│   • 已收集字段：6 个              │
│   • 卡住步骤：策略配置            │
│                                   │
│ 是否恢复之前的任务？              │
│   [Y] 继续发布  [N] 放弃重建      │
└───────────────────────────────────┘
```

---

### **2.2 关键交互场景优化**

#### **场景 A: Owner 校验可视化**

```bash
$ freelog publish ./theme.zip

🔍 环境检测
  当前环境：🟢 dev
  登录账号：liu-kai-github 👤 (ID: 8847953)

┌─ 👤 Owner 确认 ───────────────────┐
│                                    │
│ 即将在 [dev] 执行写操作            │
│ 当前账号：liu-kai-github 👤        │
│ 资源 owner: liu-kai-github 👤      │
│                                    │
│ owner 一致：✅ 可以正常写入        │
│                                    │
│ ℹ️ 如果想修改 owner，先运行：     │
│    freelog switch --owner xxx     │
└────────────────────────────────────┘

→ 继续下一步：资源类型选择
```

如果 owner 不一致：

```bash
┌─ ❌ Owner 不一致警告 ────────────┐
│                                   │
│ 即将在 [dev] 执行写操作            │
│ 当前账号：developer (ID: 1111111)  │
│ 资源 owner: company-owner (ID: 888)│
│                                   │
│ ❌ 拒绝写入：当前账号不是资源 owner │
│                                   │
│ 选项：                            │
│   1) 切换到 owner 账号             │
│      $ freelog switch --owner 888 │
│   2) 强制绕过（需管理员权限）      │
│      $ freelog publish --force-admin│
│   3) 取消并发布到新 owner          │
│      $ freelog publish --new-owner│
└───────────────────────────────────┘
```

---

#### **场景 B: Checkpoint 恢复提示增强**

```bash
⚠️ 检测到未完成的发布任务

💾 Checkpoint 信息:
  Run ID: publish-20260902-abc123
  已保存时间：2026-09-02T14:30:00Z (15 分钟前)
  
  ✅ 已完成步骤 (4 个):
    ✓ env_check (环境检测)
    ✓ type_select (资源类型选择)
    ✓ resource_shell (资源壳创建 → res_node_theme_001)
    ✓ version_info (版本信息填写)
  
  ⏸️ 待完成步骤 (3 个):
    □ policy_selection (策略配置)
    □ cover_upload (封面上传)
    □ online_decision (上架确认)
  
  📋 已收集的字段数据:
    • 资源标题："My React Theme"
    • 授权标识："liu-kai-github-mytheme"
    • 版本号："1.0.0"
    • 描述："A great theme for React"
    • 文件大小："2.3 MB"
    • SHA1: abc123def456...

┌─ 是否恢复此任务？ ───────────────┐
│                                     │
│   [Y] 恢复 → 从 "策略配置" 继续    │
│   [N] 放弃 → 清空 Checkpoint 重建   │
│   [C] 查看 Checkpoint 原始 JSON     │
│   [D] 删除 Checkpoint               │
│                                     │
└─────────────────────────────────────┘

用户选择：Y
→ 加载 Checkpoint 数据
→ 跳过已完成的 4 个步骤
→ 直接进入第 5 步：策略配置
```

---

#### **场景 C: 封面上传实时预览**

```bash
┌─ 🖼️ 封面上传 ────────────────────┐
│                                    │
│ 请选择封面图片 (JPEG/PNG/GIF)     │
│ [文件浏览器]  or  [输入 URL]      │
│                                    │
│ 🔍 检测到文件：cover.png          │
│   • 尺寸：800x600 像素            │
│   • 比例：4:3                      │
│   • 大小：450 KB                   │
│   • 推荐比例：16:9 (适用于节点主题) │
│                                    │
│ ┌─ 预览效果 ─────────────────┐   │
│ │                              │   │
│ │    [图片缩略图]             │   │
│ │                              │   │
│ └──────────────────────────────┘   │
│                                    │
│ ⚠️ 提示：当前比例 4:3 可能不是最佳  │
│   → 建议使用 1000x563px (16:9)    │
│   → 或使用图像处理工具自动裁剪     │
│                                    │
│ [使用当前图片]  [更换文件]  [退出] │
└────────────────────────────────────┘

用户上传后自动调用图像处理库（如 Sharp）生成预览：
- 生成缩略图（150x150 正方形）
- 提取 EXIF 信息（尺寸、格式、颜色空间）
- 计算宽高比并与推荐比例对比
```

---

#### **场景 D: 批量发布进度可视化**

```bash
$ freelog batch publish ./my-resources/

📁 扫描目录...
  共发现 15 个项目需要发布

🔄 逐项检查远端状态...

项目 1/15: project-alpha.zip
  ✅ 正常 (res_alpha_001) → plan=create
  █▒▒▒▒▒▒▒▒▒▒ 10%

项目 2/15: project-beta.zip
  ✅ 正常 (res_beta_001) → plan=update
  ██▒▒▒▒▒▒▒▒ 20%

项目 3/15: project-gamma.zip
  ❌ FROZEN (res_gamma_001) → SKIP (冻结)
  
项目 4/15: project-delta.zip
  ✅ 正常 (res_delta_001) → plan=skip (无变更)
  ████▒▒▒▒▒▒ 40%

项目 5-15: ... (后台静默处理)

━━━━━━━━━━━━━━━━━━━━━
📊 批次汇总报告：

总项数：15
已成功：6
跳过（冻结）: 2
跳过（无变更）: 3
失败：2
进行中：2

━━━━━━━━━━━━━━━━━━━━━
✅ 批次完成！报告已导出到 report.json
```

进度条实现：

```typescript
class ProgressBar {
  private total: number;
  private current: number;
  
  update(current: number): void {
    this.current = current;
    const percentage = (current / this.total) * 100;
    const filled = Math.floor(percentage / 5);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '▒'.repeat(empty);
    
    process.stdout.write(`\r${bar} ${percentage.toFixed(0)}%`);
  }
}
```

---

### **2.3 交互式命令辅助**

#### **智能参数建议**

```bash
$ freelog publish ./theme.zip --e<Tab>
--env=dev      --env=test      --env=production

$ freelog publish ./theme.zip --output-jso<Tab>
--output-format=json
```

#### **上下文感知的帮助**

当命令失败时，提供具体的修复建议：

```bash
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
```

---

## 🎨 **三、用户体验提升清单**

### **3.1 TTY 模式优化**

| 场景 | 当前体验 | 改进方案 |
|-----|---------|---------|
| Owner 校验 | 文字提示 | ✅ 彩色✓/✗图标 + 高亮提示框 |
| Checkpoint 恢复 | 简单文本 | ✅ 详细进度列表 + 已收集字段摘要 |
| 封面上传 | 基础文件选择 | ✅ 实时预览 + 维度检测建议 |
| 批量发布 | 逐行输出 | ✅ 进度条 + 汇总报告 + 彩色状态 |
| 策略配置 | 纯文本模板 | ✅ 交互式参数表单 + 编译预览 |
| 标签输入 | 手动输入 | ✅ 历史标签推荐 + Tab 自动补全 |

### **3.2 非交互/AI 模式增强**

| 事件类型 | 输出格式 | 关键字段 |
|---------|---------|---------|
| `checkpoint_detected` | JSON | runId, accountIdMatch, missingFields |
| `error` | JSON | code, message, details, recommendation, options |
| `batch_report` | JSON/NDJSON | summary.items[], errors[], warnings[] |
| `field_validation` | JSON | fieldId, isValid, errorMessage, suggestion |
| `resource_status` | JSON | resourceId, frozen, status, canWrite |

### **3.3 无障碍优化**

- ✅ **字体大小自适应**：支持 `-t 2` 调整终端字号（如果终端支持）
- ✅ **高对比度模式**：`--high-contrast` 启用黑白配色
- ✅ **朗读友好**：CLI 输出不包含不可读字符（特殊符号用文字替代）

```bash
# 传统输出
✅ Success

# 朗读友好版本（--screen-reader）
[成功] 发布完成

# 盲人用户可听到的清晰描述
"操作成功：资源发布完成，资源 ID 为 res_xxx"
```

---

## 📋 **四、完整验收标准**

### **TTY 模式验收**

- ✅ Owner 校验有视觉提示（✅/❌）
- ✅ Checkpoint 恢复显示已收集字段摘要
- ✅ 封面上传提供实时预览和维度建议
- ✅ 批量发布有进度条和汇总报告
- ✅ 错误提示有具体的修复建议和操作命令
- ✅ 支持 Tab 键参数自动补全

### **非交互模式验收**

- ✅ 所有 checkpoint 事件有结构化 JSON 输出
- ✅ 错误码包含 errorCode、details、recommendation
- ✅ 批量报告提供 JSON/CSV 两种格式
- ✅ 可识别 CI 环境变量并自动切换模式

### **兼容性验收**

- ✅ Windows Terminal / PowerShell 正常渲染
- ✅ macOS Terminal / iTerm2 正常渲染
- ✅ Linux GNOME Terminal / VSCode Integrated Terminal 正常渲染
- ✅ GitHub Actions / GitLab CI 等云 CI 正确输出 JSON

---

## 🔧 **五、待实施的具体任务**

### **P3 优先级：帮助系统（必须）**

1. **实现多层帮助架构**
   - `freelog --help` → 命令列表
   - `freelog publish --help` → 命令详解
   - `freelog help field FORM-RES-TITLE` → 字段手册

2. **Tab 自动补全脚本**
   - Bash: `~/.config/freelog/completion.bash`
   - Zsh: `~/.config/freelog/completion.zsh`
   - PowerShell: `Freelog Completions.ps1`

### **P2 优先级：TTY 美化（强烈建议）**

3. **色彩和图标系统**
   - 定义统一的 ANSI 颜色代码
   - Emoji 图标集（✅❌⚠️ℹ️💾）
   - ASCII 降级兼容（Windows CMD 不支持 Emoji 时使用 ASCII）

4. **UI 组件库**
   - ProgressBar 进度条
   - MultiSelect 多 select 菜单
   - StatusList 状态列表（✅⏳□）
   - BoxedWarning 警告框

5. **关键场景优化**
   - Owner 校验可视化
   - Checkpoint 恢复详情
   - 封面上传预览
   - 批量发布进度

### **P3 优先级：无障碍（可选）**

6. **屏幕阅读器友好模式**
   - `--screen-reader` 标志
   - Unicode 转纯文字描述
   - 避免特殊符号干扰

---

## 📊 **总结**

本次补充设计的核心价值：

1. **帮助系统** → 降低学习成本，减少用户困惑
2. **TTY 美化** → 提升用户体验，增强专业感
3. **智能提示** → 主动引导用户，减少错误率
4. **无障碍支持** → 扩大用户群体，体现包容性

**新增行数预估**：约 200-300 行（UI 组件 + 帮助系统实现）+ 大量注释说明

**实施时间**：约 2-3 小时

---

**相关文档**：
- P0-P2 业务规则修订（commit e2f9e71）
- 产品方案修订补充说明（P1+P2）.md（672 行）
- 31 个深度场景文档
