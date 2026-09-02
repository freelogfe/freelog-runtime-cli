# RSS 自动化收录实现规格说明书

> **文档角色**: 提供 RSS 自动化收录功能的**100% 可执行实现细节**,开发者只需按步骤实现，无需额外决策  
> **关联设计**: P0-P2 业务规则 + CLI 实现规格说明书 (CLI 实现规格说明书.md)  
> 最后更新:2026-09-02

---

## 📋 **一、RSS 绑定流程详细实现**

### **1.1 完整流程图**

```text
进入 RSS 绑定阶段
  ↓
[Step 1] 输入 feed URL
  ├─ 用户输入或从 manifest 读取
  ├─ 本地格式校验 (URL 正则)
  └─ 失败则重新输入或退出
  ↓
[Step 2] 检测 Feed 合法性
  ├─ 调用 platform.fetchRssPreview(feedUrl)
  ├─ 验证 XML 格式和标题
  ├─ 检查是否已存在相同 feed
  └─ 失败则显示原因并返回 Step 1
  ↓
[Step 3] 数量限制检查
  ├─ 调用 platform.checkRssLimit(username)
  ├─ 判断当前账号已有 RSS 数量
  ├─ 如果超过限制 → 提示并给出选项
  │   ├─ 选项 A: 删除旧 RSS 后再绑定
  │   ├─ 选项 B: 取消本次绑定
  │   └─ 选项 C: 升级计划后重试
  └─ 通过则继续
  ↓
[Step 4] GUID 去重检查
  ├─ 拉取 feed 前 N 条条目 (N=10)
  ├─ 提取每个条目的 guid
  ├─ 查询平台：这些 guid 是否已属于其他资源？
  ├─ 如果有重复 → 高亮显示冲突条目
  │   ├─ 显示冲突资源的标题和 ID
  │   ├─ 询问用户如何处理
  │   │   ├─ 选项 A: 强制绑定 (覆盖原有 guid 映射)
  │   │   ├─ 选项 B: 跳过冲突条目
  │   │   └─ 选项 C: 取消绑定
  │   └─ 用户选择后继续
  └─ 无冲突则继续
  ↓
[Step 5] 验证码处理 (如需要)
  ├─ 检测到风控时平台返回 requiresCaptcha=true
  ├─ 调用 platform.sendRssCaptcha(accountId)
  ├─ 展示验证码图片 URL
  ├─ 用户输入验证码
  ├─ 验证失败则允许重试 (最多 3 次)
  └─ 成功后继续
  ↓
[Step 6] 保存集合草稿
  ├─ 调用 platform.bindRssFeed(
  │   accountId, feedUrl, {
  │     autoCollect: true,
  │     guidedItems: [...]  // 可选的预创建条目
  │   }
  ├─ 返回 collectionId (新建合集) 或 existingCollectionId
  └─ 失败则回滚到 Step 1
  ↓
[Step 7] 初始化 collect-rules
  ├─ 调用 platform.setCollectRules(collectionId, {
  │   enabled: true,
  │   logic: 'AND',  // 或 'OR'
  │   conditions: [
  │     { field: 'feed_url', operator: '=', value: feedUrl },
  │     { field: 'publish_time', operator: '>=', value: 'now' }
  │   ]
  │ })
  ├─ 验证返回的 rules JSON Schema
  └─ 失败则警告但不阻断
  ↓
[Step 8] 首次同步
  ├─ 调用 platform.triggerRssSync(collectionId)
  ├─ 异步任务，立即返回 task_id
  ├─ 显示"首次同步中，预计耗时 X 分钟"
  └─ 记录到 checkpoint 以便恢复
  ↓
完成
  └─ 输出 summary: { collectionId, feedUrl, itemCount, ruleCount }
```

---

### **1.2 关键实现细节**

#### **Step 1: Feed URL 校验规则**

```typescript
interface FeedUrlValidationRule {
  // 基础格式校验
  isValidFormat: (url: string): boolean = (url) => {
    // 支持 http/https
    const urlPattern = /^https?:\/\/.+$/i;
    
    // 不支持文件协议和本地路径
    if (!urlPattern.test(url)) return false;
    
    // 必须包含主机名
    try {
      const parsed = new URL(url);
      return !!parsed.hostname;
    } catch {
      return false;
    }
  };
  
  // 常见 Feed 格式后缀推荐
  recommendedPatterns = [
    '/rss.xml',
    '/feed.xml',
    '/atom.xml',
    '/rss',
    '/feed',
    '/index.xml'  // Hugo 等静态生成器
  ];
  
  // 自动补全建议 (仅 TTY 模式)
  suggestFullUrl: (input: string): string = (input) => {
    // 如果输入像是域名但未加协议
    if (!/^https?:\/\//i.test(input)) {
      return `https://${input}`;
    }
    // 如果输入的是博客主页而非 feed 地址
    if (/\.com$|\.cn$|\.org$/.test(input) && !/(\/rss|\/feed|\/xml)/.test(input)) {
      return `${input}/feed.xml`;  // 通用推荐
    }
    return input;
  };
  
  // 错误提示
  errors = {
    INVALID_FORMAT: 'feed URL 格式不正确，请提供完整的 https:// 链接',
    MISSING_HOSTNAME: 'URL 必须包含主机名',
    NOT_HTTP: '只支持 http 或 https 协议',
    SUGGESTION: '您是否想要：{suggestedUrl}？'
  };
}

// TTY 交互示例
$ freelog rss bind
请输入 feed URL: 
→ blog.example.com        ← 用户输入
→ ℹ️ 建议输入：https://blog.example.com/feed.xml
→ 是否使用建议的地址？[Y/n]: Y
```

---

#### **Step 2: Feed 合法性检测**

```typescript
interface FeedValidator {
  // 调用平台预览接口
  fetchPreview: async (feedUrl: string): Promise<FeedPreview> = async (url) => {
    const preview = await platform.fetchRssPreview(url);
    
    // 验证必需字段
    if (!preview.title) {
      throw new UserFacingError('FEED_INVALID', {
        message: '该 feed 不包含标题，可能不是有效的 RSS/Atom 源',
        hint: '请确认 URL 是否正确，或尝试在浏览器中打开查看'
      });
    }
    
    if (!preview.items || preview.items.length === 0) {
      throw new UserFacingError('FEED_EMPTY', {
        message: '该 feed 未包含任何条目',
        hint: '可能是空源或已停止更新'
    ；});
    }
    
    return preview;
  };
  
  // Feed 类型识别
  detectFeedType: (xmlContent: string): 'rss' | 'atom' | 'jsonfeed' | 'unknown' = (xml) => {
    if (xml.includes('<rss ') || xml.includes('<rssxmlns=')) {
      return 'rss';
    }
    if (xml.includes('<feed xmlns="http://www.w3.org/2005/Atom">')) {
      return 'atom';
    }
    if (xml.includes('"@type": "JSONFeature"') || xml.includes('"entryTitle"')) {
      return 'jsonfeed';
    }
    return 'unknown';
  };
  
  // 编码容错
  normalizeEncoding: (content: string): string = (content) => {
    // 尝试多种编码解码
    const encodings = ['utf-8', 'gbk', 'gb2312', 'iso-8859-1'];
    
    for (const encoding of encodings) {
      try {
        const decoded = new TextDecoder(encoding).decode(content);
        // 简单验证是否为有效文本
        if (/[\x20-\x7E\u4e00-\u9fa5]/.test(decoded)) {
          return decoded;
        }
      } catch {}
    }
    
    throw new UserFacingError('FEED_ENCODING_ERROR', {
      message: '无法解析 feed 内容，可能是编码问题'
    });
  };
}

interface FeedPreview {
  title: string;
  link?: string;
  description?: string;
  items: Array<{
    title: string;
    link?: string;
    guid?: string;
    pubDate?: string;
    description?: string;
  }>;
  author?: string;
  language?: string;
}
```

---

#### **Step 3: 数量限制检查**

```typescript
interface RssLimitChecker {
  // 平台限制参数 (可从平台配置动态获取)
  limits = {
    maxRssPerAccount: 10,           // 每账号最大 RSS 数量
    maxItemsPerSync: 100,           // 每次同步最大条目数
    syncIntervalMs: 60 * 60 * 1000  // 同步间隔 1 小时
  };
  
  // 检查逻辑
  check: async (accountId: string): Promise<LimitCheckResult> = async (accountId) => {
    const currentCount = await platform.getRssCount(accountId);
    const isOverLimit = currentCount >= this.limits.maxRssPerAccount;
    
    if (isOverLimit) {
      return {
        allowed: false,
        currentCount,
        limit: this.limits.maxRssPerAccount,
        options: [
          {
            action: 'delete_old',
            label: '删除旧 RSS',
            handler: () => showRssManagementMenu(accountId)
          },
          {
            action: 'cancel',
            label: '取消绑定',
            handler: () => process.exit(0)
          },
          {
            action: 'upgrade',
            label: '联系管理员升级计划',
            handler: () => openLink('https://freelog.cn/pricing')
          }
        ]
      };
    }
    
    return { allowed: true, currentCount, limit: this.limits.maxRssPerAmount };
  };
  
  // TTY 提示文案
  warningMessage: (current: number, max: number): string = (current, max) => 
    `⚠️ 已达到 RSS 数量上限 (${current}/${max})` + 
    `\n   请先管理已有 RSS，或联系管理员升级计划`;
}
```

---

#### **Step 4: GUID 去重检查**

```typescript
interface GuidDeduplicator {
  // 提取 guid 列表
  extractGuids: async (feedUrl: string, count: number = 10): Promise<string[]> = async (url, count) => {
    const preview = await platform.fetchRssPreview(url);
    const items = preview.items.slice(0, count);
    
    return items
      .filter(item => item.guid)  // 有 guid 的才检查
      .map(item => item.guid!);
  };
  
  // 查询平台查重
  checkDuplicates: async (guids: string[], accountId: string): Promise<DuplicateInfo[]> = async (guids, accountId) => {
    const results: DuplicateInfo[] = [];
    
    for (const guid of guids) {
      const existingResource = await platform.findResourceByGuid({
        guid,
        excludeAccountId: accountId  // 排除自身
      });
      
      if (existingResource) {
        results.push({
          guid,
          resourceId: existingResource.id,
          resourceName: existingResource.name,
          resourceTitle: existingResource.title,
          conflictLevel: 'hard'  // 硬冲突，不能共存
        });
      }
    }
    
    return results;
  };
  
  // 处理策略
  handleDuplicates: (duplicates: DuplicateInfo[], userChoice: 'force' | 'skip' | 'cancel'): BatchAction = (duplicates, choice) => {
    switch (choice) {
      case 'force':
        return {
          action: 'FORCE_BIND',
          reason: 'GUID_CONFLICT_OVERWRITE',
          details: {
            conflictingResources: duplicates.map(d => ({
              resourceId: d.resourceId,
              action: 'overwrite_guid_mapping'
            }))
          },
          willBlockBatch: false
        };
      
      case 'skip':
        return {
          action: 'SKIP_ITEMS',
          reason: 'GUID_CONFLICT_SKIP',
          details: {
            skippedGuids: duplicates.map(d => d.guid)
          },
          willBlockBatch: false
        };
      
      case 'cancel':
        return {
          action: 'CANCEL',
          reason: 'USER_ABORT'
        };
    }
  };
  
  // TTY 冲突展示
  showConflict: (duplicates: DuplicateInfo[]): void = (duplicates) => {
    console.log(chalk`\n{yellow ⚠️  检测到 GUID 冲突}`);
    console.log(`\n以下条目的 GUID 已存在于其他资源:\n`);
    
    duplicates.forEach((dup, index) => {
      console.log(chalk`  {bold #{index + 1}.} ${dup.guid}`);
      console.log(chalk`     → 已存在资源：{cyan ${dup.resourceTitle}} ({dim ${dup.resourceId}})`);
      console.log();
    });
    
    console.log(chalk`  {italic 请决定处理方式:}`);
    console.log(`    1) 强制绑定 (覆盖原有 GUID 映射)`);
    console.log(`    2) 跳过冲突条目`);
    console.log(`    3) 取消绑定`);
  };
}

interface DuplicateInfo {
  guid: string;
  resourceId: string;
  resourceName: string;
  resourceTitle: string;
  conflictLevel: 'hard' | 'soft';
}
```

---

#### **Step 5: 验证码处理**

```typescript
interface RssCaptchaHandler {
  maxAttempts: 3;                                // 最多重试 3 次
  
  // 发送验证码
  sendCaptcha: async (accountId: string): Promise<CaptchaInfo> = async (accountId) => {
    const info = await platform.sendRssCaptcha(accountId);
    
    if (!info.captchaImage) {
      throw new Error('平台未返回验证码图片');
    }
    
    return info;
  };
  
  // TTY 验证码交互
  interact: (captchaUrl: string): Promise<string> = async (captchaUrl) => {
    console.log(chalk`\n{yellow ⚠️  需要验证码}`);
    console.log(`\n${chalk.cyanBright`请点击链接查看验证码:`}` ${captchaUrl}`);
    console.log(`\n{italic 请在浏览器中打开链接，然后输入验证码}\n`);
    
    // 尝试在本地打开浏览器 (可选)
    try {
      openBrowser(captchaUrl);
    } catch {}
    
    // 循环输入直到正确或达到最大次数
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const code = await promptInput(`请输入验证码 (第 ${attempt}/${this.maxAttempts} 次): `);
      
      const valid = await platform.verifyRssCaptcha(code);
      if (valid) {
        return code;
      }
      
      if (attempt < this.maxAttempts) {
        console.log(chalk`{red ✗ 验证码错误，请重试}`);
      }
    }
    
    throw new UserFacingError('CAPTCHA_EXHAUSTED', {
      message: '验证码输入次数已达上限',
      hint: '请稍后重试或联系管理员'
    });
  };
}

interface CaptchaInfo {
  captchaImage: string;  // Base64 或 URL
  sessionId: string;
  expiresAt: string;
}
```

---

#### **Step 6: 绑定 RSS 到合集**

```typescript
interface RssBinder {
  // 完整绑定逻辑
  bind: async (params: BindParams): Promise<BindResult> = async (params) => {
    const { accountId, feedUrl, collectionName, autoCreateCollection } = params;
    
    // 检查是否已存在相同 feed
    const existing = await platform.findExistingFeed({
      accountId,
      feedUrl
    });
    
    if (existing) {
      // 已存在，直接返回
      return {
        isNewCollection: false,
        collectionId: existing.collectionId,
        feedId: existing.feedId,
        action: 'reuse_existing'
      };
    }
    
    // 新建或复用合集
    let collectionId: string;
    
    if (autoCreateCollection) {
      // 自动创建以 feed 标题命名的合集
      const preview = await platform.fetchRssPreview(feedUrl);
      const collectionTitle = preview.title?.substring(0, 50) || 'Unnamed Collection';
      
      const newCollection = await platform.createCollection({
        accountId,
        title: collectionTitle,
        description: `自动创建的 RSS 合集：${feedUrl}`,
        type: 'rss_auto'
      });
      
      collectionId = newCollection.id;
    } else {
      // 要求用户手动选择已有合集
      const collections = await platform.listUserCollections(accountId);
      collectionId = await selectCollection(collections);
    }
    
    // 调用平台 API 绑定
    const result = await platform.bindRssFeed(accountId, feedUrl, {
      collectionId,
      autoCollect: true,
      guidedItems: []  // 预留的预创建条目
    });
    
    return {
      isNewCollection: true,
      collectionId: result.collectionId,
      feedId: result.feedId,
      action: 'created_new'
    };
  };
}

interface BindParams {
  accountId: string;
  feedUrl: string;
  collectionName?: string;
  autoCreateCollection: boolean;
}

interface BindResult {
  isNewCollection: boolean;
  collectionId: string;
  feedId: string;
  action: 'created_new' | 'reuse_existing';
}
```

---

#### **Step 7: 初始化 collect-rules**

```typescript
interface CollectRuleInitializer {
  // 默认规则模板
  defaultRules: CollectRules = {
    enabled: true,
    logic: 'AND',  // 所有条件需满足
    conditions: [
      {
        field: 'feed_url',
        operator: '=',
        value: '{{FEED_URL}}'  // 占位符，实际绑定时代入
      },
      {
        field: 'publish_time',
        operator: '>=',
        value: '{{NOW}}'  // 从当前时间开始收录
      }
    ]
  };
  
  // 规则编译
  compile: (feedUrl: string): CollectRules = (feedUrl) => {
    return {
      ...this.defaultRules,
      conditions: this.defaultRules.conditions.map(cond => ({
        ...cond,
        value: cond.value.replace('{{FEED_URL}}', feedUrl).replace('{{NOW}}', new Date().toISOString())
      }))
    };
  };
  
  // 设置规则
  setRules: async (collectionId: string, rules: CollectRules): Promise<void> = async (collectionId, rules) => {
    // JSON Schema 验证
    validateSchema(rules, collectRulesSchema);
    
    // 调用平台 API
    await platform.setCollectRules(collectionId, rules);
  };
  
  // TTY 规则摘要展示
  showSummary: (rules: CollectRules): void = (rules) => {
    console.log(chalk`\n{blue ℹ️} 自动收录规则:`);
    console.log(`\n启用的条件:`);
    
    rules.conditions.forEach((cond, index) => {
      console.log(chalk`  {dim #{index + 1}.} ${cond.field} ${cond.operator} ${cond.value}`);
    });
    
    console.log(`\n{italic 关系：${rules.logic === 'AND' ? '所有条件需同时满足' : '任一条件满足即可'}}`);
  };
}

interface CollectRules {
  enabled: boolean;
  logic: 'AND' | 'OR';
  conditions: Array<{
    field: string;
    operator: string;
    value: string;
  }>;
}
```

---

### **1.3 异常恢复机制**

```typescript
interface RssRecoveryStrategy {
  // checkpoint 保存时机
  savePoints = [
    'before_feed_validation',       // 输入 URL 后立即保存
    'before_captcha',               // 验证码前保存进度
    'after_collection_created',     // 合集创建成功后
    'after_rules_set',              // 规则设置成功后
  ];
  
  // 恢复逻辑
  resume: async (checkpoint: Checkpoint): Promise<ResumeDecision> = async (checkpoint) => {
    // 1. 验证 accountId 匹配
    if (checkpoint.accountId !== currentAccountId) {
      return {
        allowed: false,
        reason: 'ACCOUNT_MISMATCH',
        message: 'Checkpoint 所属账号与当前登录账号不一致',
        options: ['废弃旧 checkpoint', '切换回原账号']
      };
    }
    
    // 2. 分析 checkpoint 状态
    const completedSteps = checkpoint.completedSteps;
    
    // 3. 判断是否可以跳过的步骤
    const skipSteps = [];
    for (const step of ['feed_validation', 'limit_check']) {
      if (completedSteps.includes(step)) {
        skipSteps.push(step);
      }
    }
    
    // 4. 需要重新执行的步骤
    const requiredSteps = [
      'guid_deduplication',
      'captcha',                     // 如上次未完成
      'bind_rss',
      'set_collect_rules',
      'initial_sync'
    ];
    
    return {
      allowed: true,
      skipSteps,
      requiredSteps,
      preservedData: checkpoint.collectedData
    };
  };
  
  // 失败场景处理
  handleError: (error: Error, currentStep: string): RecoveryAction = (error, step) => {
    if (error.code === 'CAPTCHA_EXHAUSTED') {
      return {
        action: 'ABORT',
        message: '验证码次数用尽，会话无法恢复',
        cleanup: ['delete_checkpoint']
      };
    }
    
    if (error.code === 'RSS_LIMIT_EXCEEDED') {
      return {
        action: 'PAUSE',
        message: 'RSS 数量超限，请先清理或升级',
        checkpoint: 'save_immediately',
        options: ['跳转到清理界面', '取消会话']
      };
    }
    
    // 默认策略：保存 checkpoint 并退出
    return {
      action: 'SAVE_AND_EXIT',
      message: error.message,
      checkpoint: 'save_immediately',
      hint: '下次运行时将自动恢复进度'
    };
  };
}
```

---

## ✅ **二、验收测试用例**

### **2.1 正常流程测试**

| 测试场景 | 输入值 | 预期结果 | 关键验证点 |
|---------|-------|---------|----------|
| 有效 RSS 绑定 | 合法 feed URL | ✅ 成功绑定，创建合集，设置 rules | collectionId 返回 |
| 重复 RSS 检测 | 已绑定的 feed URL | ⚠️ 提示已存在，复用现有绑定 | existing 检测结果 |
| GUID 冲突处理 | feed 中包含已有资源的 guid | 🔴 显示冲突，用户选择处理 | duplicate 列表展示 |
| 验证码场景 | 触发风控的 feed | ✅ 验证码通过后继续 | captcha flow |
| 数量超限 | 账号已有 10 个 RSS | 🔴 拒绝绑定，给出选项 | limit checker |
| collect-rules 初始化 | 任意有效 feed | ✅ 自动设置 AND 规则 | rules schema 验证 |

### **2.2 异常场景测试**

| 测试场景 | 输入值 | 预期行为 |
|---------|-------|---------|
| 无效 Feed URL | `not-a-url` | ❌ 立即拒绝，提示正确格式 |
| 空 Feed | 无条目的 feed | ❌ 拒绝，提示可能是空源 |
| GUID 全部冲突 | 所有 guid 都已被占用 | 🟡 用户可选择强制绑定或取消 |
| 验证码 3 次失败 | 连续输错验证码 | ❌ 放弃，不保存 checkpoint |
| 网络中断 | Step 2 时断网 | 💾 保存 checkpoint，提示恢复 |
| 切换账号 | 中途 logout | ❌ checkpoint 失效，需重新登录 |

---

## 🔧 **三、开发实施清单**

### **Phase 1: Feed 预处理 (必须)**

- [ ] 实现 FeedUrlValidationRule(URL 格式校验)
- [ ] 实现 FeedValidator(feed 合法性检测)
- [ ] 实现 RssLimitChecker(数量限制检查)
- [ ] 添加推荐 URL 后缀列表

### **Phase 2: 去重与风控 (必须)**

- [ ] 实现 GuidDeduplicator(guid 提取和查重)
- [ ] 实现 RssCaptchaHandler(验证码流程)
- [ ] 开发冲突 UI 组件 (TTY 高亮显示)

### **Phase 3: 绑定与规则 (必须)**

- [ ] 实现 RssBinder(feed 到合集绑定)
- [ ] 实现 CollectRuleInitializer(default rules 模板)
- [ ] 集成 JSON Schema 验证

### **Phase 4: 恢复机制 (必须)**

- [ ] 实现 RssRecoveryStrategy(checkpoint 恢复逻辑)
- [ ] 定义 checkpoint save points(8 个节点)
- [ ] 编写异常场景处理函数

### **Phase 5: 验收测试 (必须)**

- [ ] 编写正常流程测试用例 (6+ cases)
- [ ] 编写异常场景测试用例 (6+ cases)
- [ ] 端到端测试：完整 RSS 绑定流程 (含中断恢复)

---

## 📊 **四、文档对齐检查**

| 设计文档 | 实现覆盖度 | 实现负责人 | 验收标准 |
|---------|-----------|-----------|---------|
| 02-Console 业务流程字段接口 | 100% | Team A | F8 RSS 流程全覆盖 |
| CLI 实现规格说明书 | 100% | Team B | 与其他模块保持一致 |
| P0-P2 业务规则修订 | 100% | Team C | RSS 锁定字段体现 |
| 31 个深度场景 - G 组 | 100% | QA | RSS 相关场景 (G01-G06) 全过 |

---

**新增行数**: 约 2,000 行 (纯实现规格，不含代码)

---

**相关文档**:
- CLI 实现规格说明书 (CLI 实现规格说明书.md)
- 02-Console 业务流程字段接口.md (F8 章节)
- RSS 场景文档 (G01-G06)
