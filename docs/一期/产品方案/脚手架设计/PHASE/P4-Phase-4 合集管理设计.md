# P4-Phase-4 合集管理详细设计

> **版本**: v1.0 | **最后更新**: 2026-09-02  
> **对齐 Source**: `business/业务梳理/合集管理/` + `business/业务梳理/流程设计 - 创建合集/`

---

## 📋 **一、Phase 职责**

P4-Phase-4 负责**所有合集 (Collection) 相关的管理操作**,包括创建、RSS 自动收录、CRUD 操作:

```
┌─────────────────────────────────────────────────────────────┐
│                P4-Phase-4 合集管理                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  C1      │    │  C2      │    │  C3      │              │
│  │ 合集创建 │ →  │ RSS 收录 │ →  │ CRUD 操作 │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│                                                             │
│  Phase 4 职责：                                                 │
│  1. 批量资源扫描与选择                                         │
│  2. RSS Feed 自动收录调度                                        │
│  3. 合集 CRUD 编排                                                │
│  4. Checkpoint 保存                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔗 **二、调用的 Step 清单**

| 编号 | Step 名称 | 来源文档 | 主要职责 |
|------|----------|---------|---------|
| **C1** | `流程设计 - 创建合集/` | 合集创建完整流程 |
| **C2** | `合集管理/01-条目管理.md` | RSS 自动收录逻辑 |
| **C3** | `合集管理/02-集合信息.md` | 合集 CRUD 操作 |

---

## ⏸️ **三、Checkpoint 机制**

| Checkpoint Key | 保存时机 | 数据结构 |
|---------------|---------|---------|
| `c1-scan-complete` | C1 Step1 完成 | `{ scannedResources[] }` |
| `c1-metadata-entered` | C1 Step2 完成 | `{ metadata }` |
| `c1-resources-selected` | C1 Step3 完成 | `{ selectedResourceIds[] }` |
| `c1-rss-configured` | C1 Step4 完成 | `{ rssBinding? }` |
| `c2-rss-scanned` | C2 扫描完成 | `{ newEpisodes[], scanTime }` |
| `c3-collection-created` | C3 Create 完成 | `{ collectionId, itemCount }` |

---

## 💻 **四、C1 合集创建完整设计**

### **4.1 Step1: 批量目录扫描**

#### **业务流程**

```
Step 1/5: 批量目录扫描
├─ Input: { directoryPath, options }
│  ├─ recursive: boolean (默认 true)
│  ├─ excludeDirs: string[] (default: ['.hidden', 'node_modules'])
│  └─ maxDepth: number (default: 10)
│
├─ DirectoryScanner:
│  ├─ 遍历所有子目录
│  ├─ 检测每个目录的 Manifest.yaml
│  ├─ 验证资源有效性
│  └─ 返回有效资源列表
│
└─ Output: ScannedResource[]
   └─ [{ id, title, type, path, isValid }]
```

#### **扫描规则**

```typescript
interface ScanOptions {
  directoryPath: string;
  recursive?: boolean = true;
  excludeDirs?: string[] = ['.hidden', 'node_modules', '.git'];
  maxDepth?: number = 10;
}

interface ScannedResource {
  id: string | null;
  title: string;                 // 从 manifest 提取或目录名
  type: ResourceTypeCode;        // theme/plugin/library/software
  path: string;                  // 绝对路径
  isValid: boolean;
  errorMessage?: string;         // 无效原因
}

async function scanDirectory(options: ScanOptions): Promise<ScannedResource[]> {
  const results: ScannedResource[] = [];
  
  for await (const dir of walkDirectory(options.directoryPath, options)) {
    const manifest = await readManifest(path.join(dir.path, 'manifest.yaml'));
    
    if (!manifest) {
      results.push({
        id: null,
        title: path.basename(dir.path),
        type: 'unknown',
        path: dir.path,
        isValid: false,
        errorMessage: 'Missing manifest.yaml'
      });
      continue;
    }
    
    results.push({
      id: manifest.resourceId || null,
      title: manifest.title,
      type: manifest.type,
      path: dir.path,
      isValid: true
    });
  }
  
  return results.filter(r => r.isValid);
}
```

---

### **4.2 Step2: 合集元数据录入**

#### **业务流程**

```
Step 2/5: 合集元数据录入
├─ Prompt 用户输入:
│  ├─ title: 必填，1-200 字符
│  ├─ description: 必填，50-1000 字符
│  ├─ coverImage: 可选 (JPG/PNG/WebP <5MB ≥800×600)
│  ├─ tags: 可选，最多 20 个
│  ├─ website: 可选，URL 格式
│  └─ contactEmail: 可选，邮箱格式
│
├─ Validation: 字段约束检查
├─ Cover Image Upload: 上传封面到临时存储
└─ Save to Checkpoint: step2-metadata-entered
```

#### **字段约束表**

| 字段 | 约束规则 | 提示文案 | 错误码 |
|------|---------|---------|--------|
| title | 1-200 字符 | "标题长度必须在 1-200 之间" | COLLECTION_TITLE_INVALID |
| description | 50-1000 字符 | "描述长度必须在 50-1000 之间" | COLLECTION_DESC_INVALID |
| coverImage | JPG/PNG/WebP <5MB ≥800×600 | "封面图片不符合要求" | COVER_IMAGE_INVALID |
| tags | 最多 20 个 | "最多只能添加 20 个标签" | TAGS_TOO_MANY |
| website | URL 格式 | "请输入有效的 URL" | INVALID_WEBSITE_URL |
| contactEmail | RFC 5322 格式 | "请输入有效的邮箱地址" | INVALID_EMAIL_FORMAT |

#### **数据结构**

```typescript
interface CollectionMetadata {
  title: string;
  description: string;
  coverImage?: FileRef;
  tags?: string[];               // 最大 20 个
  website?: string;
  contactEmail?: string;
}

// 验证函数
function validateCollectionMetadata(metadata: Partial<CollectionMetadata>): ValidationResult {
  const errors: string[] = [];
  
  if (!metadata.title || metadata.title.length < 1 || metadata.title.length > 200) {
    errors.push('标题长度必须在 1-200 字符之间');
  }
  
  if (!metadata.description || metadata.description.length < 50 || metadata.description.length > 1000) {
    errors.push('描述长度必须在 50-1000 字符之间');
  }
  
  if (metadata.coverImage) {
    const imgValidation = validateCoverImage(metadata.coverImage);
    if (!imgValidation.valid) {
      errors.push(`封面图片无效：${imgValidation.error}`);
    }
  }
  
  if (metadata.tags && metadata.tags.length > 20) {
    errors.push('最多只能添加 20 个标签');
  }
  
  return { valid: errors.length === 0, errors };
}
```

---

### **4.3 Step3: 资源选择交互**

#### **业务流程**

```
Step 3/5: 资源选择交互
├─ Display: 已扫描的资源列表
│  ├─ 按类型分组显示 (theme/plugin/library/software)
│  ├─ 每个资源显示：{title, type, path}
│  └─ 多选 checkbox 框
│
├─ User Actions:
│  ├─ Select All / Deselect All
│  ├─ Filter by Type (下拉框)
│  └─ Manual Selection (checkbox)
│
└─ Constraints:
   ├─ 最少选择 1 个资源
   ├─ 最多选择 100 个资源
   └─ 已选择数量实时更新 (X/100)
```

#### **数据结构**

```typescript
interface ResourceSelectionContext {
  allResources: ScannedResource[];
  selectedIds: string[];           // 选中的资源 ID 列表
  filteredByType?: ResourceTypeCode; // 按类型过滤
  displayGrouped: Record<string, ScannedResource[]>; // 按类型分组显示
}

function groupResourcesByType(resources: ScannedResource[]): Record<string, ScannedResource[]> {
  return resources.reduce((acc, resource) => {
    const type = resource.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(resource);
    return acc;
  }, {} as Record<string, ScannedResource[]>);
}
```

---

### **4.4 Step4: RSS 订阅绑定**

#### **业务流程**

```
Step 4/5: RSS 订阅绑定
├─ Prompt 是否启用 RSS:
│  ├─ □ 暂时不启用 RSS 自动收录
│  ├─ ✓ 启用 RSS 自动收录
│  │  └─ Feed URL: [https://example.com/feed.xml]
│  │  └─ Scan Mode: [weekly ▼] (weekly/daily/on-demand)
│  │  └─ Interval: [168] (小时，scanMode=weekly/daily 时)
│  │
├─ Validation:
│  ├─ feedUrl: HTTPS 格式验证
│  ├─ Feed URL 可达性测试 (可选)
│  └─ XML 格式验证 (可选)
│
└─ Save to Checkpoint: c1-rss-configured
```

#### **RSS 配置结构**

```typescript
interface RSSBindingConfig {
  enabled: boolean;
  feedUrl: string;                     // HTTPS 格式
  scanMode: 'weekly' | 'daily' | 'on-demand';
  interval?: number;                   // 扫描间隔 (小时)
  lastScannedAt?: string;              // ISO 时间戳
  nextScanAt?: string;                 // 下次扫描时间
}

// 验证函数
function validateRSSFeed(url: string): ValidationResult {
  const urlPattern = /^https:\/\/[\w.-]+(?:\/.*)?$/i;
  
  if (!urlPattern.test(url)) {
    return { valid: false, error: 'INVALID_URL_FORMAT' };
  }
  
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use HTTPS' };
    }
  } catch (e) {
    return { valid: false, error: 'INVALID_URL' };
  }
  
  return { valid: true };
}
```

---

### **4.5 Step5: 发布提交**

#### **业务流程**

```
Step 5/5: 发布提交
├─ Final Confirmation:
│  ├─ 合集元数据摘要
│  ├─ 已选资源列表 (数量统计：XX/100)
│  ├─ RSS 配置摘要
│  └─ ☑ 确认发布合集
│
├─ POST /v2/collections
│  ├─ Body: { metadata, resourceIds[], rssBinding? }
│  └─ Response: { collectionId, publicUrl, itemCount }
│
└─ ✅ 成功!
```

#### **API 调用**

**请求**: `POST /v2/collections`

**Request Body:**
```json
{
  "metadata": {
    "title": "优秀主题精选",
    "description": "精选最具创意的 Freelog 主题作品",
    "tags": ["curated", "theme", "awesome"],
    "website": "https://example.com",
    "contactEmail": "curator@example.com"
  },
  "resourceIds": [
    "res_abc123",
    "res_def456",
    "res_ghi789"
  ],
  "rssBinding": {
    "enabled": true,
    "feedUrl": "https://example.com/feed.xml",
    "scanMode": "weekly",
    "interval": 168
  }
}
```

**Success Response:**
```json
{
  "collectionId": "col_xxx123",
  "publicUrl": "https://freelog.dev/collection/col_xxx123",
  "itemCount": 3,
  "createdAt": "2026-09-02T15:00:00Z",
  "rssEnabled": true
}
```

---

## 💻 **五、C2 RSS 自动收录设计**

### **5.1 业务流程**

```
C2 RSS 自动收录流程:

Step 1: 读取 RSS 配置
├─ GET /v2/collections/{collectionId}/rss
├─ 获取当前绑定的 RSS 配置
└─ 展示上次扫描时间和状态

Step 2: 扫描 RSS Feed
├─ GET {feedUrl}
├─ 解析 XML 响应
├─ 提取 episodes/items 列表
└─ 对比本地已有条目，识别新内容

Step 3: GUID 唯一性验证
├─ FOR EACH newEpisode DO
│  ├─ 检查 GUID 是否存在于本合集
│  ├─ IF exists THEN skip
│  └─ ELSE mark for add
└─ 报告重复 GUID 数量

Step 4: 批量添加条目
├─ POST /v2/collections/{collectionId}/episodes/batch
│  ├─ Body: [{ title, guid, pubDate, enclosure }]
│  └─ Response: { addedCount, failedGuids[] }
└─ 更新 RSS 配置:lastScannedAt

Step 5: 生成报告
├─ Added: XX items
├─ Skipped: YY items (duplicate GUIDs)
└─ Errors: ZZ errors
```

---

## 💻 **六、C3 合集 CRUD 设计**

### **6.1 Create**

已通过 C1 Step5 实现，复用。

### **6.2 Read**

#### **API 调用**

**请求**: `GET /v2/collections/{collectionId}`

**Response:**
```json
{
  "collectionId": "col_xxx123",
  "metadata": { ... },
  "resourceIds": [...],
  "rssBinding": { ... },
  "stats": {
    "totalItems": 100,
    "onlineItems": 95,
    "delistingItems": 3,
    "frozenItems": 2
  },
  "createdAt": "...",
  "updatedAt": "..."
}
```

### **6.3 Update**

#### **业务流程**

```
C3 Update:
├─ 读取当前合集信息
├─ 展示可编辑字段 (标注 RSS 锁定字段)
├─ 用户修改非锁定字段
├─ Policy Inheritance 策略继承 (可选):
│  ├─ Force: 强制统一策略到所有子项
│  ├─ Inherit: 从父级继承并设置优先级
│  └─ Independent: 独立控制模板白名单
└─ PUT /v2/collections/{id}
```

#### **Policy Inheritance 策略**

```typescript
interface PolicyInheritanceOptions {
  strategy: 'Force' | 'Inherit' | 'Independent';
  templateId: string;
  params?: Record<string, any>;
  priorityRule?: string;            // 优先级规则
  templateWhitelist?: string[];     // 白名单 (Independent 模式)
}

// 三种策略的应用逻辑
async function applyPolicyInheritance(
  collectionId: string,
  options: PolicyInheritanceOptions
): Promise<{ updatedCount: number }> {
  switch (options.strategy) {
    case 'Force':
      return await applyUniformPolicy(collectionId, options);
    case 'Inherit':
      return await inheritFromParentWithPriority(collectionId, options);
    case 'Independent':
      return await configureIndependentPolicy(collectionId, options);
  }
}
```

### **6.4 Delete**

#### **业务流程**

```
C3 Delete:
├─ 读取合集信息
├─ 展示: 资源数量，关联资源 ID
├─ Warning: "删除后无法恢复"!
├─ Confirm: [y/N]
└─ DELETE /v2/collections/{id}
```

**Response:**
```json
{
  "deleted": true,
  "collectionId": "col_xxx123"
}
```

---

## 🚨 **七、异常分支处理矩阵**

| 错误码 | 触发条件 | 用户提示 | 修复建议 | 重试策略 |
|--------|---------|---------|---------|---------|
| DIRECTORY_EMPTY | 扫描无有效资源 | "❌ 目录中没有有效资源" | "💡 请检查目录结构" | reject |
| COLLECTION_TITLE_EXISTS | 标题重复 | "⚠️ 该合集标题已被使用" | "💡 更换独特标题" | prompt_user |
| RESOURCES_NOT_FOUND | 部分资源不存在 | "⚠️ ${count} 个资源不存在" | "💡 这些资源可能已被删除" | filter_invalid |
| RSS_FEED_UNREACHABLE | Feed 不可访问 | "⚠️ RSS Feed 无法访问" | "💡 检查 URL 是否正确" | prompt_correction |
| RSS_FEED_PARSE_ERROR | XML 解析失败 | "⚠️ RSS Feed 格式错误" | "💡 确保是有效的 RSS 源" | prompt_correction |
| RESOURCE_LIMIT_EXCEEDED | 资源超限 (>100) | "⚠️ 合集最多包含 100 个资源" | "💡 选择更少的资源" | reduce_selection |
| INSUFFICIENT_PERMISSIONS | 无权操作 | "❌ 没有权限执行此操作" | "💡 检查账号权限" | reject |
| POLICY_INHERITANCE_FAILED | 策略继承失败 | "⚠️ 策略继承失败" | "💡 请单独配置策略" | fallback_independent |

---

## ✅ **八、验收标准**

### **功能验收项**
- [ ] C1 合集创建完整流程可执行
- [ ] C2 RSS 自动收录工作正常
- [ ] C3 CRUD 支持完整
- [ ] Policy 继承三种模式可用
- [ ] RSS 字段锁定检测正确
- [ ] GUID 去重机制工作

### **数据结构验收项**
- [ ] CollectionMetadata 类型定义明确
- [ ] RSSBindingConfig 参数完整
- [ ] API Request/Response 一致

### **异常分支验收项**
- [ ] 所有错误码有对应处理
- [ ] 用户提示清晰且有修复建议
- [ ] Retry 策略合理

---

**📌 下一步**: [ARCHITECTURE/README.md](../ARCHITECTURE/README.md)
