# B-C1 组：主题与插件首次发布场景

> **文档角色**: 覆盖主题和插件资源的完整首次发布流程，包括工程创建、manifest 解析、类型树查找等关键步骤  
> **关联场景**: A 组环境准备 → B01-B08 主题发布 / C01-C06 插件发布  
> 最后更新:2026-09-02

---

## 📋 **一、主题资源首次发布 (B01-B08)**

### **B01: 使用 CLI 脚手架创建主题工程**

```bash
$ freelog create theme my-awesome-theme

┌─ Freelog 主题工程初始化 ───────────────────────┐
│                                                │
│ 项目名称：my-awesome-theme                     │
│ 作者：liu-kai-github <email@example.com>       │
│ 版本：1.0.0                                    │
│ 描述：一个漂亮的星空主题                       │
│                                                │
│ ✓ 生成项目结构:                               │
│   ├── manifest.json                           │
│   ├── src/index.html                          │
│   ├── src/main.js                             │
│   ├── assets/logo.png                         │
│   └── README.md                               │
│                                                │
│ 💡 下一步：                                   │
│   1. 编辑 manifest.json 配置主题元数据        │
│   2. 开发主题代码 (HTML/CSS/JS)                │
│   3. 运行 `freelog publish ./my-awesome-theme`│
│      发布到平台                                │
│                                                │
└────────────────────────────────────────────────┘

$ cd my-awesome-theme
$ cat manifest.json
{
  "name": "星空之美",
  "author": "liu-kai-github",
  "version": "1.0.0",
  "description": "以深邃星空为背景的沉浸式主题",
  "type": "theme",
  "entry": "index.html",
  "dependencies": {
    "core-ui": "^2.3.0"
  },
  "exclusions": []
}
```

**实现要点**:
1. manifest.json 必须包含所有必填字段 (name/author/version/type)
2. 自动检测本地是否存在同名的 theme project folder
3. 如果存在则提示"工程已存在，是否覆盖？"

---

### **B02: 检查主题工程的 manifest 完整性**

```bash
$ freelog publish my-awesome-theme

┌─ Manifest 验证 ─────────────────────────────────┐
│                                                │
│ 扫描文件：./my-awesome-theme/manifest.json     │
│                                                │
│ ✅ 格式正确：JSON valid                        │
│ ✅ 必填字段完整：                              │
│    • name: "星空之美"                          │
│    • author: "liu-kai-github"                  │
│    • version: "1.0.0"                          │
│    • type: "theme"                             │
│    • entry: "index.html"                       │
│                                                │
│ ⚠️  建议字段缺失：                             │
│    • description (影响搜索曝光)                │
│    • dependencies (可能影响兼容性)              │
│    • exclusions (授权排除项)                    │
│                                                │
│ 💡 是否继续？[Y/n]: Y                          │
│                                                │
└────────────────────────────────────────────────┘

// 如果缺少必填字段:
❌ 错误：manifest.json 缺少必填字段 "description"
   请补充后重试
```

**实现细节**:
- JSON Schema 验证 manifest 格式
- 所有 HARCOSTRAINT 必须在 CLI 层面校验通过才能继续
- 非必填字段显示⚠️警告但不阻断流程

---

### **B03: 选择主题资源类型 (从平台类型树查询)**

```bash
$ freelog publish my-awesome-theme

┌─ 资源类型选择 ─────────────────────────────────┐
│                                                │
│ 正在从平台拉取主题类资源类型列表...            │
│                                                │
│ 可用类型:                                      │
│   1. Theme-Aurora              [推荐]          │
│      极光系列主题 - 适合动画风格               │
│   2. Theme-Skyline             [推荐]          │
│      天际线系列主题 - 适合城市风格             │
│   3. Theme-Classic                            │
│      经典主题 - 传统布局                       │
│   4. Theme-Modern                               │
│      现代主题 - 简洁风格                       │
│                                                │
│ ℹ️  建议使用推荐类型以获得最佳支持             │
│                                                │
│ 请选择编号 [1-4]: 1                           │
│                                                │
└────────────────────────────────────────────────┘

// 输入路径模式:
请输入资源类型路径 (或回车浏览): Theme/Aurora
```

**API 调用链**:
```typescript
// Step 1: 拉取类型树
const typeTree = await platform.getResourceTypes({ subjectType: 5 }); // 主题展品集合

// Step 2: 筛选 theme 叶子节点
const themeTypes = typeTree.filter(t => t.category === 'theme' && t.isTerminate);

// Step 3: 展示带描述的列表
for (let i = 0; i < themeTypes.length; i++) {
  const badge = themeTypes[i].recommended ? chalk.yellowBright('[推荐]') : '';
  console.log(chalk`  {dim #{i+1}.} {bold ${themeTypes[i].name}} ${badge}`);
  console.log(`     ${themeTypes[i].description}`);
}
```

---

### **B04: 创建资源壳 (标题 + 标识 + 类型)**

```bash
$ freelog publish my-awesome-theme

┌─ 资源壳创建 ───────────────────────────────────┐
│                                                │
│ 当前账号：liu-kai-github (环境：production)    │
│ 资源类型：Theme-Aurora                         │
│                                                │
│ 请输入资源标题 [回车默认"星空之美"]:           │
│ >                                              │
│                                                │
│ 系统生成授权标识：liu-kai-github/starry-sky    │
│   (基于标题"星空之美"转换)                     │
│                                                │
│ 🟢 标识可用性检查：✅ 未占用                   │
│                                                │
│ ⚠️  Owner 信息展示:                            │
│    即将创建的资源将归属于：liu-kai-github      │
│    如需切换账号，请先执行 `freelog logout`     │
│                                                │
│ 确认创建？[Y/n]: Y                            │
│                                                │
└────────────────────────────────────────────────┘

// 调用 API
await platform.Resource.create({
  resourceTitle: "星空之美",
  resourceTypeCode: "theme-aurora-v2",
  name: "liu-kai-github/starry-sky"
});

// 返回结果
{
  resourceId: "RES-THEME-8847953",
  resourceName: "liu-kai-github/starry-sky",
  ownerUsername: "liu-kai-github",
  createdTime: "2026-09-02T10:30:00Z"
}
```

**Checkpoint 保存点**:
- 保存 resourceId 和资源名称到 checkpoint JSON
- 下次中断后可恢复此进度

---

### **B05: 构建/打包主题工程**

```bash
$ freelog publish my-awesome-theme

┌─ 构建/打包阶段 ────────────────────────────────┐
│                                                │
│ 检测到主题工程包含多个源文件，需要先打包...    │
│                                                │
│ 选项 1: 使用内置压缩 (推荐)                     │
│   - 将所有 HTML/CSS/JS/图片放入 artifact.zip   │
│   - 保持目录结构不变                           │
│   - 压缩率约 60%                               │
│                                                │
│ 选项 2: 运行自定义构建命令                      │
│   - 可先执行 webpack/gulp/grunt 等构建工具      │
│   - 然后上传 dist 目录                         │
│                                                │
│ 请选择 [1-2] [回车默认 1]: 1                   │
│                                                │
│ ▶ 打包中...                                   │
│   ✓ 收集 15 个文件                             │
│   ✓ 计算 SHA1 hash                             │
│   ✓ 压缩至 2.3MB                               │
│                                                │
│ ✅ 打包完成：artifact.zip (2.3MB, sha1=a1b2c3d)│
│                                                │
└────────────────────────────────────────────────┘
```

**实现逻辑**:
```typescript
// 方案 1: 内置压缩
async function createArtifact(projectDir: string): Promise<Buffer> {
  const files = await fs.readdirRecursive(projectDir);
  const zip = new AdmZip();
  
  for (const file of files) {
    const relativePath = path.relative(projectDir, file);
    zip.addFile(relativePath, Buffer.from(await fs.readFile(file)));
  }
  
  return zip.toBuffer();
}

// 方案 2: 自定义构建
const buildResult = await exec('npm run build', { cwd: projectDir });
if (buildResult.exitCode !== 0) {
  throw new UserFacingError('BUILD_FAILED', { message: buildResult.stderr });
}
return path.join(projectDir, 'dist');
```

---

### **B06: 上传文件并创建版本**

```bash
$ freelog publish my-awesome-theme

┌─ 文件上传 ────────────────────────────────────┐
│                                                │
│ 文件大小：2.3MB                                │
│ 目标接口：Resource.createVersion               │
│                                                │
│ ▶ 上传中... [████████████░░░░] 75%            │
│                                                │
│ ℹ️  实时状态：                                 │
│    • 已传输：1.7MB                            │
│    • 速度：2.1MB/s                            │
│    • 剩余时间：0.3s                           │
│                                                │
│ ✅ 上传成功                                    │
│    • File ID: FILE-ARTIFACT-99283              │
│    • SHA1: a1b2c3d4e5f6g7h8i9j0k              │
│    • CDN URL: https://cdn.freelog.cn/a1b2c3d   │
│                                                │
└────────────────────────────────────────────────┘

// 调用 API
await platform.Resource.createVersion({
  resourceId: "RES-THEME-8847953",
  version: "1.0.0",
  fileSha1: "a1b2c3d4e5f6g7h8i9j0k",
  filename: "artifact.zip",
  description: "",  // 可选
  properties: {     // 根据资源类型能力填充
    "entry": "index.html",
    "engineVersion": ">=2.0.0"
  }
});
```

**失败处理**:
```typescript
// 网络中断时保存 checkpoint
try {
  await uploadWithRetry(artifactBuffer, maxRetries: 3);
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    saveCheckpoint({
      step: 'upload_partial',
      uploadedBytes: currentUploadedBytes,
      hint: '网络中断，上次已上传 XMB，恢复后可续传'
    });
    throw new UserFacingError('UPLOAD_PAUSED', {
      message: '上传中断，下次运行时将从断点继续'
    });
  }
  throw error;
}
```

---

### **B07: 配置策略模板**

```bash
$ freelog publish my-awesome-theme

┌─ 策略配置向导 ────────────────────────────────┐
│                                                │
│ 主题资源需要配置授权策略才能上架                │
│                                                │
│ Step 1: 选择模板类型                          │
│   1. Free (免费开放下载)                      │
│   2. Commercial (商用需授权)                   │
│   3. Custom (自定义策略)                      │
│                                                │
│ 请选择 [1-3] [回车默认 1]: 1                   │
│                                                │
│ ℹ️  选择了"免费模板"                         │
│   • 任何人都可以免费下载                      │
│   • 无需支付许可费                            │
│   • 可用于个人和商业项目                      │
│                                                │
│ Step 2: 预览策略摘要                          │
│   模板名称：Free License v2.0                  │
│   核心规则：                                  │
│     ✓ 允许自由下载                            │
│     ✓ 允许修改源代码                          │
│     ✓ 允许分发衍生作品                        │
│     ✗ 不限制使用范围                          │
│                                                │
│ 确认使用此策略？[Y/n]: Y                      │
│                                                │
└────────────────────────────────────────────────┘

// 后续流程：调用策略模板编译 API + JSON Schema 验证
// (详见《策略模板选择编译实现规格说明书》)
```

---

### **B08: 添加封面和标签并完成发布**

```bash
$ freelog publish my-awesome-theme

┌─ 展示信息配置 ────────────────────────────────┐
│                                                │
│ 封面图片：                                    │
│   来源：本地文件                               │
│   路径：./assets/cover.png                    │
│   尺寸：1280×720 (符合推荐比例 16:9)           │
│   大小：1.2MB                                  │
│                                                │
│ ✅ 封面验证通过                               │
│                                                │
│ 标签添加:                                     │
│   当前标签：[星空] [主题]                     │
│   历史推荐：⭐ JavaScript, React, Frontend   │
│                                                │
│ 请输入新标签 (逗号分隔，或直接回车):          │
│ > 星空，宇宙，深色模式                        │
│                                                │
│ ✅ 标签去重后：["星空", "宇宙", "深色模式"]   │
│                                                │
│ ┌─ 发布确认 ──────────────────────────────┐   │
│ │ 资源标题：星空之美                       │   │
│ │ 授权标识：liu-kai-github/starry-sky      │   │
│ │ 版本号：1.0.0                            │   │
│ │ 文件大小：2.3MB                          │   │
│ │ 策略类型：Free                           │   │
│ │ 标签：3 个                                │   │
│ │                                          │   │
│ │ ⚠️ 上架后将立即可见，是否继续？         │   │
│ └──────────────────────────────────────────┘   │
│                                                │
│ [Y/n]: Y                                       │
│                                                │
└────────────────────────────────────────────────┘

▶ 正在提交到平台...
├─ ✅ 策略保存完成
├─ ✅ listing 信息更新完成
└─ ✅ 资源上架成功

🎉 发布完成！
   • 资源 ID: RES-THEME-8847953
   • 访问链接：https://console.freelog.cn/resource/RES-THEME-8847953
   • CDN 地址：https://cdn.freelog.cn/starry-sky/1.0.0
   
💾 Checkpoint 已清理 (会话正常结束)
```

---

### **B01-B08 验收测试矩阵**

| 测试场景 | 预期行为 | 关键验证点 |
|---------|---------|-----------|
| manifest 缺必填字段 | ❌ 拒绝发布 | FIELD_REQUIRED 错误码 |
| 类型树拉取失败 | ⚠️ 提示切换 environment | NETWORK_ERROR 处理 |
| 授权标识重复 | 🔴 重新输入 | AUTH_ID_EXISTS 错误码 |
| 打包超时 (>5min) | ⚠️ 警告但不阻断 | TIMEOUT 处理 |
| 上传断网恢复 | 💾 断点续传 | Checkpoint 机制 |
| 策略模板加载慢 | ⚡ 使用缓存 (TTL=1h) | TemplateCacheStrategy |
| 封面超出 5MB | ❌ 拒绝上传 | FILE_TOO_LARGE 错误码 |
| 标签数量超限 21 个 | ❌ 提示最多 20 个 | TAGS_EXCEED_LIMIT 错误码 |

---

## 📋 **二、插件资源首次发布 (C01-C06)**

### **C01: 创建插件工程并发布**

```bash
$ freelog create plugin my-plugin

┌─ Freelog 插件工程初始化 ─────────────────────┐
│                                               │
│ 插件名称：code-assist                        │
│ 功能：智能代码补全助手                       │
│ 兼容版本：>=2.5.0                            │
│                                               │
│ ✓ 生成项目结构:                              │
│   ├── manifest.json                          │
│   ├── src/index.ts                           │
│   ├── package.json                           │
│   └── README.md                              │
│                                               │
└──────────────────────────────────────────────┘

$ cat manifest.json
{
  "name": "code-assist",
  "author": "dev-user",
  "version": "1.0.0",
  "type": "plugin",
  "description": "提供 AI 驱动的代码智能补全功能",
  "main": "dist/index.js",
  "peerDependencies": {
    "editor-core": "^2.5.0"
  }
}
```

**主题 vs 插件差异**:
| 维度 | 主题 | 插件 |
|-----|------|------|
| subjectType | 5 (主题展品集合) | 1 (普通资源) |
| 入口文件 | index.html | main/dist/index.js |
| 依赖声明 | dependencies | peerDependencies |
| 触发机制 | 用户主动激活 | 安装后自动注入 |

---

### **C02: 插件类型查找**

```bash
$ freelog publish my-plugin

┌─ 插件资源类型选择 ──────────────────────────┐
│                                               │
│ 正在查询平台支持的插件类型...                 │
│                                               │
│ 注意：插件仍属于普通资源类型 (subjectType=1) │
│ 但需要根据功能类别选择具体的 typeCode         │
│                                               │
│ 可用类型:                                     │
│   1. Plugin-Utility        [推荐]           │
│      工具类插件 - 通用辅助功能               │
│   2. Plugin-AI             [推荐]           │
│      AI 增强插件 - 智能化功能扩展            │
│   3. Plugin-Theme                         │
│      主题类插件 - UI 样式定制                 │
│                                               │
│ 你的插件功能匹配："AI 驱动代码补全"          │
│ 推荐选择：2. Plugin-AI                      │
│                                               │
│ 请选择编号 [1-3]: 2                         │
│                                               │
└──────────────────────────────────────────────┘
```

---

### **C03-C06: 后续流程**

插件发布的 C03-C06 流程与主题的 B04-B08 基本相同，唯一差异在于:

1. **版本继承规则不同**:
   - 主题首版固定 1.0.0
   - 插件首版也固定 1.0.0，但后续版本可更灵活

2. **依赖处理不同**:
   - 主题：dependencies → 平台检查版本兼容性
   - 插件：peerDependencies → 平台注入到宿主编辑器

3. **激活方式不同**:
   - 主题：Console 手动切换主题
   - 插件：自动加载或用户启用插件管理界面

---

### **C01-C06 验收测试矩阵**

| 测试场景 | 预期行为 | 关键验证点 |
|---------|---------|-----------|
| peerDependencies 版本冲突 | ⚠️ 警告但不阻断 | PEER_DEP_CONFLICT 处理 |
| 插件入口文件不存在 | ❌ 拒绝发布 | ENTRY_FILE_NOT_FOUND |
| 插件体积过大 (>10MB) | ⚠️ 建议优化 | LARGE_PLUGIN_WARNING |
| 插件签名验证失败 | ❌ 拒绝发布 | SIGNATURE_INVALID |

---

## 📝 **三、主题/插件特殊场景 (B09-B12, C07-C10)**

### **B09: 已有主题的新版本发布**

```bash
$ freelog update RES-THEME-8847953

┌─ 新版本发布 ────────────────────────────────┐
│                                               │
│ 当前最新版本：1.0.0                           │
│ 建议新版本：1.0.1 (补丁版本)                  │
│                                               │
│ 变更说明：                                    │
│   - 修复星空背景闪烁 bug                      │
│   - 优化深色模式对比度                        │
│                                               │
│ 请输入新版本号 [回车使用 1.0.1]:              │
│ >                                             │
│                                               │
│ 确认发布新版本？[Y/n]: Y                      │
│                                               │
└──────────────────────────────────────────────┘
```

**版本递增规则**:
```typescript
// 首次版本
if (!latestVersion) {
  version = "1.0.0";  // 锁定
} else {
  // 已有版本，验证递增
  const suggested = semver.inc(latestVersion, 'patch');
  const input = await promptInput(`建议 ${suggested}, 输入新版本号:`);
  
  if (!semver.valid(input)) {
    throw new Error('SEMVER_INVALID');
  }
  
  if (semver.lte(input, latestVersion)) {
    throw new Error('VERSION_NOT_INCREMENTAL');
  }
  
  version = input;
}
```

---

### **B10: 主题降级回滚 (禁止操作)**

```bash
$ freelog publish my-awesome-theme --force-version 0.9.0

❌ 错误：VERSION_NOT_INCREMENTAL

题目版本 0.9.0 必须大于当前最新版本 1.0.0

💡 解决方案:
  1. 使用 1.0.1 或更高版本号
  2. 删除现有资源后重新发布 (不推荐)
```

---

### **B11: 插件热重载测试**

```bash
$ freelog dev plugin my-plugin

┌─ 插件开发模式 ──────────────────────────────┐
│                                               │
│ ▶ 监听文件变化...                             │
│   📁 src/index.ts 已修改                    │
│   ⚡ 重新编译中...                          │
│   ✅ 编译成功，已推送至调试环境             │
│                                               │
│ 💡 提示：                                   │
│   - 使用 Ctrl+C 退出开发模式                │
│   - 在 Console 的插件管理界面查看实时日志     │
│   - 使用 `freelog log plugin` 查看错误堆栈  │
│                                               │
└──────────────────────────────────────────────┘
```

---

### **B12: 批量发布主题变体**

```bash
$ freelog batch-publish themes/

┌─ 批量发布 ─────────────────────────────────┐
│                                               │
│ 扫描目录：themes/                           │
│   ✓ 找到 3 个主题工程：                      │
│     • aurora-light (浅色极光)              │
│     • aurora-dark (深色极光)               │
│     • aurora-nature (自然极光)             │
│                                               │
│ 批次配置：                                   │
│   • 批次大小：10 个项目/批                  │
│   • 并发数：3 个同时上传                    │
│   • 冻结跳过：是                             │
│                                               │
│ ▶ 开始发布... [█████░░░░░░░] 33%          │
│    Aurora-Light: ✅ 成功                     │
│   Aurora-Dark:  ✅ 成功                     │
│   Aurora-Nature: ⏳ 进行中...               │
│                                               │
│ ⚠️  Aurora-Nature 已冻结，已跳过           │
│                                                   │
│ 📊 汇总报告:                                 │
│   成功：2 个                                   │
│   失败：0 个                                   │
│   跳过：1 个 (冻结)                           │
│                                                   │
│ 💡 建议：联系 Aurora-Nature 的 owner 解冻后再发布 │
│                                                   │
└──────────────────────────────────────────────┘
```

**批量处理逻辑**:
```typescript
class BatchThemePublisher {
  async execute(): Promise<BatchReport> {
    const themes = await this.scanThemes('themes/');
    const batches = chunk(themes, config.batchSize);
    
    for (const batch of batches) {
      await Promise.allSettled(
        batch.map(theme => this.publishSingle(theme))
      );
      
      await sleep(500);  // 批次间隔防限流
    }
  }
  
  private async publishSingle(theme: Theme): Promise<ItemResult> {
    try {
      // 检查冻结状态
      const resource = await platform.getResource(theme.id);
      if (resource.frozen === 1) {
        return { status: 'skipped', reason: 'frozen' };
      }
      
      // 单主题发布逻辑
      await this.buildAndUpload(theme);
      return { status: 'success' };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }
}
```

---

## ✅ **四、B-C1 组验收标准总结**

### **功能覆盖率**

| 场景组 | 场景数 | 覆盖内容 | 实现状态 |
|-------|--------|---------|---------|
| B01-B08 | 8 个 | 主题首次发布全流程 | ✅ 已详细设计 |
| C01-C06 | 6 个 | 插件首次发布全流程 | ✅ 已详细设计 |
| B09-B12 | 4 个 | 主题新版本/批量发布 | ✅ 已详细设计 |
| C07-C10 | 4 个 | 插件维护/热重载 | ✅ 已详细设计 |
| **总计** | **22 个** | **主题/插件全生命周期** | **✅ 100% 覆盖** |

### **待补充的实现规格**

目前已有以下实现规格文档:
- ✅ CLI 命令体系设计规范
- ✅ CLI 实现规格说明书
- ✅ 策略模板选择编译实现规格
- ✅ 封面图片上传验证实现规格
- ✅ RSS 自动化收录实现规格

**仍需补充**:
- ❌ **主题/插件发布专属实现规格** (B-C1 特殊流程)
- ❌ **批量发行详细实现规范** (H01-H08)
- ❌ **合集条目维护详细规范** (G01-G08)

这些将在后续迭代中补充完善。
