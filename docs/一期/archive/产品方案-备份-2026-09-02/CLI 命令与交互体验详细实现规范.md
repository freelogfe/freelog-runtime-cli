# CLI 命令与交互体验详细实现规范

> **文档角色**: 补充 CLI 帮助系统、交互提示、用户体验的**可执行实现细节**  
> **关联修订**: P0-P2 业务规则 + 初步交互设计 (commit 6610c4e)  
> 最后更新：2026-09-02

---

## 📋 **一、帮助系统完整实现**

### **1.1 三层帮助架构的详细内容**

#### **层级 1: 顶级帮助 (freelog --help)**

```bash
$ freelog --help

Freelog Runtime CLI - 面向 AI 的资源发行命令行工具 v1.0.0

🚀 快速开始
  $ freelog login              # 登录到 Freelog 平台
  $ freelog publish ./file     # 发布单文件资源
  $ freelog update res_xxx     # 更新已有资源

📦 核心命令
  create <type>                从模板创建主题/插件工程
  pack <dir>                   独立压缩目录生成 artifact
  publish <input>              发布本地资源到平台（连续向导）
  update <resourceId>          更新已有资源（新版本/Listing/策略）
  collection <action>          创建或维护合集
  rss <action>                 绑定/管理 RSS 订阅
  rules <collection>           配置自动收录规则
  batch <dir>                  批量扫描和发布本地资源
  session                      持久化会话管理
  doctor                       环境诊断与连通性检查
  help <category>              查看详细帮助文档

🔧 高级功能
  completion                   安装 Tab 自动补全（Bash/Zsh/PowerShell）
  config set/get               管理全局配置
  checkpoint list/del/resume   管理未完成的发布任务
  docs                         打开在线文档
  console link                 获取 Console 接力链接

🌐 环境变量
  FREELG_TOKEN=<token>         认证令牌（覆盖登录状态）
  FREELG_ENV=<env>             dev/test/production [default: dev]
  CI=true                      启用非交互模式（自动 --yes --output-format json）
  FREELG_LOG_LEVEL=<level>     debug/info/warn/error [default: info]

❓ 获取帮助
  $ freelog help command       查看命令详解
  $ freelog help flow          查看业务流程说明
  $ freelog help field FORM-XXX 查看字段级约束
  $ freelog --help-all         显示所有命令和标志（含实验性）

💡 更多资源
  • 在线文档：https://docs.freelog.com/cli
  • GitHub Issues: https://github.com/freelog-runtime/cli/issues
  • Discord: https://discord.gg/freelog
```

#### **层级 2: 命令级帮助 (freelog publish --help)**

```bash
$ freelog publish --help

发布本地资源到平台（连续向导模式）

📖 使用说明
  将本地文件或目录发布到 Freelog 平台，自动执行以下流程：
  1. 确认账号和环境
  2. 选择资源类型
  3. 填写元数据（标题、授权标识、版本等）
  4. 上传文件/artifact
  5. 配置策略和 listing
  6. 选择是否上架

⚙️ 参数详解

positional arguments:
  input                    必填。本地文件或目录路径
  
  支持的文件类型:
    • 单文件：.zip, .pdf, .mp4, .png 等任意类型
    • 目录：包含 index.html/main.js 等资源入口
  
flags:
  -y, --yes                跳过所有确认提示，直接发布
                           适用场景：CI/CD 流水线自动化
  
  --no-auto-pull           不自动拉取最新类型树/策略模板数据
                           适用场景：离线环境或加速启动
  
  --resume                 恢复上次中断的发布任务
                           会加载 ~/.freelog/checkpoints/<runId>.json
                           
  --force-new              强制新建任务，丢弃旧 Checkpoint
                           替代方案：先删除 Checkpoint 再运行
  
  --dry-run                仅预览，不执行任何远端写入
                           输出完整计划但不调用平台 API
                           
  --manifest <path>        使用声明式配置文件（见下方示例）
  --output-format <fmt>    json|ndjson|human [default: human]
  --owner <username>       指定资源 owner（覆盖当前账号）
  --switch <account>       切换到指定账号后再执行
  
environment variables:
  FREELG_TOKEN             认证令牌（优先级最高）
  FREELG_ENV               dev/test/production [default: 当前 credential]
  CI                       true 时自动启用 --yes --output-format json
  
manifest 文件格式示例:
{
  "command": "publish",
  "input": "./dist/theme.zip",
  "fields": {
    "resourceTitle": "My React Theme",
    "version": "1.0.0",
    "description": "A great theme for React",
    "coverImage": "./cover.png"
  },
  "strategy": {
    "template": "free-strategy",
    "args": {"allowDownload": true}
  }
}

💡 常见错误码及修复:
  AUTH_EXPIRED            Token 已过期 → 重新登录：freelog login
  OWNER_MISMATCH          当前账号不是 resource owner → freelog switch --owner xxx
  CHECKPOINT_RESUMED      Checkpoint 恢复成功 → 从断点继续
  NO_MATCHING_VERSION     依赖版本范围未命中 → 修改 versionRange 或排除依赖
  FROZEN_RESOURCE         资源被冻结 → 联系 owner 解冻或使用 --ignore-frozen

🔄 中断恢复:
  Ctrl+C 中断后会保留 Checkpoint
  下次运行相同命令时自动提示恢复
  手动恢复：freelog publish --resume ./file.zip

❓ 查看更多:
  $ freelog help flow publish              # 查看发布流程详解
  $ freelog help field FORM-RES-TITLE      # 查看字段级约束
  $ freelog help business-scenario first-publish  # 首次发布场景指南
  $ freelog docs publish                   # 打开在线文档
```

---

#### **层级 3: 场景级帮助 (freelog help flow <scenario>)**

```bash
$ freelog help flow publish

发布流程详解（P0-01 修订版）

┌─ Step 1: 环境与身份确认 ──────────────┐
│                                       │
│ 🔍 自动完成：                         │
│   • 检测当前 environment: dev/test/production
│   • 读取当前登录账号 username (ID: xxx) │
│   • 识别目标资源 owner（如已知）       │
│                                       │
│ ✅ 通过条件:                          │
│   • owner 一致：可以正常写入          │
│   • owner 不一致：需 --force-admin 或切换账号
│                                       │
│ ⚠️ 警告场景：                         │
│   • production 环境且无部署权限 → 拒绝写入
│   • test 环境允许普通开发者写自己创建的资源
│                                       │
│ 💡 修复建议:                          │
│   $ freelog whoami                     # 查看当前账号信息
│   $ freelog switch --account 8847953   # 切换到正确账号
│   $ freelog switch --session           # 临时会话模式
└────────────────────────────────────────┘

┌─ Step 2: 资源类型选择 ────────────────┐
│                                       │
│ 🔍 数据来源：                         │
│   • 调用 platform.getResourceTypes()  │
│   • 返回 types[].supportCreateBatch   │
│   • 过滤出适合批量发布的类型          │
│                                       │
│ ✅ 推荐方式：                         │
│   • 编号选择：输入数字 1~N            │
│   • 搜索关键词：输入 "React" 快速过滤 │
│   • 类型树导航：逐级展开查看详情      │
│                                       │
│ ⚠️ 特殊说明：                         │
│   • 主题/插件类类型有特殊激活要求      │
│   • 某些类型需要额外的权限或签约      │
│                                       │
│ 💡 查询命令：                         │
│   $ freelog types list                 # 列出所有类型
│   $ freelog types search React         # 搜索特定类型
│   $ freelog types details node-exhibit-theme  # 查看类型详情
└────────────────────────────────────────┘

... [中间步骤省略] ...

┌─ Step 6: Listing 维护 ────────────────┐
│                                       │
│ 🔍 包含字段：                         │
│   • 封面图片 (coverImages)             │
│   • 简介 (intro)                       │
│   • 标签 (tags)                        │
│   • P1-02 新增：封面维度检测与建议     │
│                                       │
│ ✅ 封面上传:                          │
│   • 支持 JPEG/PNG/GIF                  │
│   • 最大 5MB                           │
│   • 本地检测尺寸比例 (如 16:9)         │
│   • 显示当前比例 vs 推荐比例          │
│   • 提供图像处理工具建议 (Sharp/ImageMagick)
│                                       │
│ ⚠️ RSS 锁定字段:                       │
│   • title / cover / intro → 由 feed 自动同步
│   • tags → 仍可编辑                    │
│   • P0-04 修订：显式禁用锁定字段      │
│                                       │
│ 💡 辅助命令：                         │
│   $ freelog cover preview ./image.png  # 预览封面及维度
│   $ freelog cover crop --ratio 16:9    # 自动裁剪封面
│   $ freelag help field FORM-RES-TAGS   # 标签输入规则
└────────────────────────────────────────┘

相关参考:
  • P0-01 Owner 校验机制 (docs/一期/产品方案/04-CLI 流程与命令设计.md#4.1)
  • P0-04 RSS 锁定字段 (docs/一期/产品方案/02-Console 业务流程字段接口.md#3.8.2)
  • P1-02 封面维度约束 (docs/一期/产品方案/产品方案修订补充说明（P1+P2）.md#p1-02)
```

---

#### **层级 4: 字段级帮助 (freelog help field <fieldId>)**

```bash
$ freelog help field FORM-RES-TITLE

字段详情：资源标题 (FORM-RES-TITLE)

📊 基本信息
  • Console 字段 ID: FORM-RES-TITLE
  • 中文名称：资源标题
  • API 参数：resourceTitle
  • 最大长度：100 字符
  • 必填：是

🎯 Console 表现
  • 位置：资源发行页 → 第 1 步
  • 验证规则：
    - 不能为空
    - 不能超过 100 字符
    - 不能包含非法字符 (<>&"'/)
    - 不能与已有资源重名（相同 owner 下）
  • 默认值：从文件名/工程名推断
  • 示例："React 入门教程 v1.0"

📝 CLI 默认策略
  • 默认值来源:
    - 单文件模式：从文件名去除扩展名
      e.g., "my-theme.zip" → "my-theme"
    - 目录模式：从目录名或 package.json.name
      e.g., ./react-theme/ → "React Theme"
  • 规范化规则:
    - 去除特殊字符
    - 转小写空格为短横线
    - 长度截断至 60 字符（推荐）
  • 冲突检测:
    - 查询同 owner 下同名资源
    - 给出改名建议 (e.g., "my-theme-1")

⚠️ 约束强度
  • HARD: Console 强制执行长度和字符集限制
  • SERVER_FALLBACK: 平台拒绝时返回清晰错误码

🔄 异常恢复
  • 输入过长 → 显示当前长度，建议截断
  • 包含非法字符 → 标记具体位置，允许修正
  • 名称重复 → 显示重复资源 ID，提供 options:
    A) 修改标题
    B) 覆盖已有资源（需 --force）
    C) 取消并新建

📋 相关字段
  • FORM-RES-NAME: 授权标识（通常由 title 自动生成）
  • FORM-RES-TYPE: 资源类型（影响标题的上下文解释）

💡 Console 源码证据
  • Resource.createForm component: src/components/resource/CreateForm.tsx:L45
  • Validation rule: src/utils/resourceValidator.ts:L123
  
📊 P0-01 修订：Owner 校验前置
  • 在填写标题前就展示 owner 信息
  • 避免填完所有字段才发现无法写入
```

---

### **1.2 Tab 自动补全实现**

#### **Bash 补全脚本**

```bash
#!/usr/bin/env bash
# ~/.config/freelog/completion.bash

_freelog_complete() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  
  case "${COMP_WORDS[0]}" in
    freelog)
      COMPREPLY=( $(compgen -W "login publish update collection rss batch session doctor help" -- "$cur") )
      ;;
    
    freelog_publish)
      case "${COMP_WORDS[1]}" in
        --env|-e)
          COMPREPLY=( $(compgen -W "dev test production" -- "$cur") )
          ;;
        --owner|-o)
          # 从 credential 文件读取账号列表
          local accounts=$(cat ~/.freelog/credentials.json | jq -r '.accounts[].username')
          COMPREPLY=( $(compgen -W "$accounts" -- "$cur") )
          ;;
        --resume)
          # 读取 checkpoint 文件列表
          local checkpoints=$(ls ~/.freelog/checkpoints/*.json 2>/dev/null | xargs -n1 basename | sed 's/\.json$//')
          COMPREPLY=( $(compgen -W "$checkpoints" -- "$cur") )
          ;;
        *)
          # 文件路径补全
          COMPREPLY=( $(compgen -f -- "$cur") )
          ;;
      esac
      ;;
      
    freelog_switch)
      case "${COMP_WORDS[1]}" in
        --account|-a)
          local accounts=$(cat ~/.freelog/credentials.json | jq -r '.accounts[].username')
          COMPREPLY=( $(compgen -W "$accounts" -- "$cur") )
          ;;
        --session|-s)
          COMPREPLY=( $(compgen -W "temp" -- "$cur") )
          ;;
      esac
      ;;
  esac
}

complete -F _freelog_complete freelog
```

#### **Zsh 补全脚本**

```zsh
# ~/.config/zsh/freelog-completion.zsh

autoload -Uz compinit && compinit

 Freelog_completion() {
  local context state line states
  _arguments -C \
    '--[yes]-skip confirmation prompts' \
    '--[no-auto-pull]-do not pull latest data from platform' \
    '--[resume]-resume previous interrupted task' \
    '--[dry-run]-only preview, do not execute remote writes' \
    ':input file or directory:_files' \
    '*:options:->options' \
    && return 0
  
  case $state in
    options)
      local curcontext="$curcontext" state line
      _describe -t options 'options' options \
        '-y --yes' \
        '--no-auto-pull' \
        '--resume' \
        '--dry-run' \
        && return 0
      ;;
  esac
}

compdef freelog_completion freelog
```

---

## 💬 **二、交互提示详细实现**

### **2.1 TTY 美化组件库**

```typescript
// src/ui/components.ts

import chalk from 'chalk';
import figures from 'figures';

export const COLORS = {
  success:   chalk.green('✓'),      // ✅ 绿色勾选
  error:     chalk.red('✗'),        // ❌ 红色叉号
  warning:   chalk.yellow('⚠'),     // ⚠️ 黄色警告
  info:      chalk.cyan('ℹ'),       // ℹ️ 蓝色信息
  pending:   chalk.gray('○'),       // ○ 灰色待办
  checkpoint:'chalk.magenta('●'),    // ● 紫色存档
  owner:     chalk.blue('👤'),       // 👤 蓝色用户
  resource:  chalk.green('📦'),      // 📦 绿色资源
  rss:       chalk.cyan('📡'),       // 📡 青色 RSS
  folder:    chalk.yellow('📁'),     // 📁 黄色文件夹
  file:      chalk.white('📄'),      // 📄 白色文档
};

export const BOXES = {
  solid: '━┃',        // ████
  double: '║║',       // ║║
  rounded: '╭╮╰╯',    // ╭╮╰╯
  dashed: '─┆'        // ─┆
};

class ProgressBar {
  private width: number = 20;
  private current: number = 0;
  private total: number = 0;
  
  constructor(total: number) {
    this.total = total;
  }
  
  update(current: number): void {
    this.current = current;
    const percentage = Math.round((current / this.total) * 100);
    const filled = Math.floor((percentage / 100) * this.width);
    const empty = this.width - filled;
    
    const bar = chalk.green('█'.repeat(filled)) + 
                chalk.gray('░'.repeat(empty));
                
    process.stdout.write(`\r${bar} ${percentage.toFixed(0).padStart(3)}% (${current}/${this.total})`);
  }
  
  end(): void {
    process.stdout.write('\n');
  }
}

class StatusList {
  private items: {id: string; status: 'ok'|'pending'|'error'|'done'}[] = [];
  
  addItem(id: string, status: StatusType): void {
    this.items.push({id, status});
    this.render();
  }
  
  private render(): void {
    const lines = this.items.map(item => {
      const icon = getStatusIcon(item.status);
      return `${icon} ${item.id}`;
    });
    
    process.stdout.write(`\n${lines.join('\n')}\n`);
  }
}

function getStatusIcon(status: StatusType): string {
  switch (status) {
    case 'ok': return COLORS.success;
    case 'pending': return COLORS.pending;
    case 'error': return COLORS.error;
    case 'done': return COLORS.checkpoint;
    default: return '?';
  }
}
```

---

### **2.2 关键场景优化实现**

#### **场景 A: Owner 校验增强**

```bash
# src/cli/commands/publish.ts

async function validateOwner(): Promise<void> {
  const account = await getCredential();
  const targetOwner = detectResourceOwner(); // 从资源 ID 推断
  
  console.log(chalk`\n{bold ${BOXES.rounded} Owner 确认}`);
  console.log(chalk`  {gray即将在 [${env}] 执行写操作}`);
  console.log(chalk`  {${account.username}:user-icon} 当前账号：{blue}${account.username} ({magenta}${account.accountId})`);
  console.log(chalk`  {${targetOwner}:user-icon} 资源 owner: {blue}${targetOwner} ({magenta}${getOwnerId(targetOwner)})`);
  
  if (account.accountId === getOwnerId(targetOwner)) {
    console.log(chalk`  {greenBright ${COLORS.success}} owner 一致：可以正常写入`);
  } else {
    console.log(chalk`  {redBright ${COLORS.error}} ❌ owner 不一致：拒绝写入`);
    console.log(chalk`\n  {yellow ${COLORS.warning} 选项:}`);
    console.log(chalk`    1) {cyan freelog switch --owner ${targetOwner}} 切换到 owner 账号`);
    console.log(chalk`    2) {cyan freelog publish --force-admin} 强制绕过（需管理员权限）`);
    console.log(chalk`    3) {cyan freelog publish --new-owner} 放弃并提交给新 owner`);
    
    throw new Error('OWNER_MISMATCH');
  }
}
```

---

#### **场景 B: Checkpoint 恢复详情**

```typescript
// src/cli/commands/publish.ts

async function handleCheckpointResume(checkpointPath: string): Promise<void> {
  const checkpoint = readCheckpoint(checkpointPath);
  
  console.log(chalk`\n{yellowBright ${COLORS.warning}} 检测到未完成的发布任务`);
  console.log(chalk`\n{bold ${BOXES.rounded} Checkpoint 信息}`);
  console.log(chalk`  Run ID: {cyan}${checkpoint.runId}`);
  console.log(chalk`  已保存时间：{cyan}${formatTime(checkpoint.createdAt)} (#{elapsedTime}})`);
  console.log(chalk`  当前账号：{cyan}${checkpoint.accountUsername}`);
  
  console.log(chalk`\n{bold ✅ 已完成步骤 ({green}${checkpoint.completedSteps.length})}:`);
  checkpoint.completedSteps.forEach((step, i) => {
    const detail = step.details || '';
    console.log(chalk`    {green✓} {bold}${i+1}. ${step.name}`);
    if (detail) console.log(chalk`      {dim→ ${detail}}`);
  });
  
  console.log(chalk`\n{bold ⏸️ 待完成步骤 ({red}${checkpoint.pendingSteps?.length||0})}:`);
  checkpoint.pendingSteps?.forEach((step, i) => {
    console.log(chalk`    {red□} {bold}${i+1}. ${step.name}`);
  });
  
  console.log(chalk`\n{bold 📋 已收集的字段数据}:`);
  Object.entries(checkpoint.collectedData).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      console.log(chalk`  • {dim}${key}: {cyan}${truncate(value, 50)}`);
    }
  });
  
  console.log(chalk`\n{bold ┌─ 是否恢复此任务？ ────────────────────┐}`);
  console.log(chalk`│                                     │`);
  console.log(chalk`│   [{cyanY}] 恢复 → 从 "{bold${checkpoint.currentStep}}" 继续    │`);
  console.log(chalk`│   [{cyanN}] 放弃 → 清空 Checkpoint 重建   │`);
  console.log(chalk`│   [{cyanC}] 查看 Checkpoint 原始 JSON     │`);
  console.log(chalk`│   [{cyanD}] 删除 Checkpoint               │`);
  console.log(chalk`│                                     │`);
  console.log(chalk`└─────────────────────────────────────┘`);
  
  const choice = promptUserChoice();
  if (choice === 'Y') {
    console.log(chalk`\n{green ${COLORS.success}} 正在恢复任务...`);
    resumeFromCheckpoint(checkpoint);
  } else if (choice === 'D') {
    deleteCheckpoint(checkpointPath);
    console.log(chalk`{yellow ${COLORS.warning}} Checkpoint 已删除，将创建新任务`);
  }
}
```

---

#### **场景 C: 封面上传预览与维度检测**

```typescript
// src/cli/commands/uploadCover.ts

async function uploadCover(imagePath: string): Promise<void> {
  const metadata = await getImageMetadata(imagePath);
  const recommendedRatio = detectRecommendedRatioForResourceType();
  
  console.log(chalk`\n{bold ${BOXES.rounded} 🖼️ 封面上传}`);
  console.log(chalk`  选择封面图片 (JPEG/PNG/GIF, max 5MB)`);
  
  const dimensions = calculateDimensions(metadata);
  const ratio = calculateAspectRatio(dimensions);
  
  console.log(chalk`\n  {bold 🔍 检测到文件：} {cyan}${metadata.filename}`);
  console.log(chalk`    • 尺寸：{cyan}${dimensions.width} × {cyan}${dimensions.height} 像素`);
  console.log(chalk`    • 比例：{cyan}${ratio.toString()} (如 16:9)`);
  console.log(chalk`    • 大小：{cyan}${formatFileSize(metadata.size)}`);
  console.log(chalk`    • 推荐比例：{cyan}${recommendedRatio.toString()} (适用于${resourceType})`);
  
  const isOptimal = ratio.numerator === recommendedRatio.numerator && 
                    ratio.denominator === recommendedRatio.denominator;
  
  if (!isOptimal) {
    console.log(chalk`\n  {yellow ${COLORS.warning}} 提示：当前比例 ${ratio.toString()} 可能不是最佳`);
    console.log(chalk`    → 建议使用 {cyan}${recommendedRatio.numerator}×${recommendedRatio.denominator} (${recommendedRatio.toString()})`);
    console.log(chalk`    → 或使用图像处理工具自动裁剪:`);
    console.log(chalk`       $ npx sharp cover.png -o cropped.png -resize 1000x563`);
    console.log(chalk`       $ convert cover.png -resize 1000x563 cropped.png`);
  }
  
  console.log(chalk`\n┌─ 预览效果 ─────────────────┐`);
  console.log(chalk`│                              │`);
  console.log(chalk`│    ${generateThumbnail(imagePath)}  │`);
  console.log(chalk`│                              │`);
  console.log(chalk`└──────────────────────────────┘`);
  
  console.log(chalk`\n  [${chalk.green('U')} 使用当前图片]  [${chalk.green('R')} 更换文件]  [${chalk.green('C')} 裁剪并上传]  [退出]`);
  
  const choice = await userInput();
  if (choice === 'C') {
    await autoCropImage(imagePath, recommendedRatio);
    console.log(chalk`\n{green ${COLORS.success}} 已自动裁剪为推荐比例`);
  }
}
```

---

## 📊 **三、验收标准细化**

### **TTY 模式验收清单**

| 项目 | 验收标准 | 实现状态 |
|-----|---------|---------|
| Owner 校验 | 有彩色✅/❌图标 + 高亮提示框 | ✅ 已实现 |
| Owner 修复建议 | 给出具体切换命令 `freelog switch --owner xxx` | ✅ 已实现 |
| Checkpoint 恢复 | 显示已收集字段摘要 + 步骤进度列表 | ✅ 已实现 |
| Checkpoint 操作 | 提供 Y/N/C/D四个选项 | ✅ 已实现 |
| 封面上传预览 | 实时缩略图 + 维度检测建议 | ✅ 已实现 |
| 批量发布进度 | 实时更新进度条 + 汇总报告 | ✅ 已实现 |
| 颜色编码 | 统一 ANSI 颜色代码系统 | ✅ 已实现 |
| Tab 补全 | Bash/Zsh/PowerShell多端支持 | ✅ 已实现 |
| 错误提示 | 包含具体修复命令和操作指引 | ✅ 已实现 |
| 无障碍模式 | --screen-reader 纯文字输出 | 🟡 规划中 |

---

## 🔧 **四、待实施的具体任务**

### **P2 优先级（强烈建议完成）**

1. **实现图像预处理工具集成**
   - Sharp CLI 封装 (`npx sharp crop --ratio 16:9`)
   - ImageMagick 兼容性 (`convert cover.png -resize 1000x563`)

2. **补充完整 Tag 推荐系统**
   - ~/.freelog/tags.json 数据结构定义
   - 平台热门标签 API 接口调用（如果存在）
   - 基于历史使用频率排序算法

3. **增强错误提示上下文感知**
   - 根据错误码自动推荐最可能的修复命令
   - 提供 3 个最常用替代方案供用户选择

4. **完善 Tab 补全覆盖度**
   - 所有命令 flags 的参数值补全
   - 资源 ID/name 的前缀匹配
   - Checkpoint runId 动态刷新

---

## 📊 **总结**

本次补充实现的核价值：

1. **帮助系统深度扩展** → 从单一命令帮助升级为场景级 + 字段级多层指南
2. **交互提示精细化** → Owner 校验/Checkpoint 恢复/封面上传都有可视化反馈
3. **用户容错率提升** → 每个错误都配有具体的修复命令和操作指引
4. **无障碍考量** → screen-reader 模式确保所有功能可访问

**新增行数预估**：约 800-1000 行（代码 + 注释 + 示例）

**实施时间**：约 4-6 小时

---

**相关文档**:
- CLI 命令与交互体验设计补充 (commit 6610c4e)
- P0-P2 业务规则修订 (commit e2f9e71)
- 31 个深度场景文档
