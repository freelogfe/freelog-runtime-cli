# CLI 命令设计体系

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **定位**: 定义 CLI 暴露给用户的命令接口、参数规范、交互流程  
> **关系**: PHASE 产品设计层通过调用这些命令来实现业务场景

---

## 📋 **核心命令列表**

### **发布类命令**

| 命令 | 功能描述 | 复用 PHASE |
|------|---------|-----------|
| `freelog publish` | 单资源发布主命令 | F0-SingleResourcePublish |
| `freelog update` | 版本更新命令 | M0-VersionUpdate |
| `freolog batch-publish` | 批量发布命令 | H0-BatchResourcePublish |

### **合集类命令**

| 命令 | 功能描述 | 复用 PHASE |
|------|---------|-----------|
| `freelog collection create` | 新建合集 | C0-CollectionCreation |
| `freelog collection add` | 添加条目到合集 | C0-CollectionCreation |

### **工具类命令**

| 命令 | 功能描述 | 复用模块 |
|------|---------|---------|
| `freelog build` | 压缩打包工具 | FRAMEWORK(压缩打包) |
| `freelog template init` | 模板初始化 | ARCHITECTURE(模板创建) |

---

## 🔧 **详细命令设计**

### **命令 1: `freelog publish`**

#### **1.1 Command Interface**

```bash
freelog publish <directory> [options]
```

#### **1.2 Parameters**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `<directory>` | string | ✅ Yes | - | 要发布的目录路径 |
| `--type <code>` | string | ✅ Yes | - | 资源类型代码（如 theme, plugin） |
| `--title <text>` | string | ✅ Yes | - | 资源标题（≤100 字符） |
| `--auth-id <id>` | string | ❌ No | auto-generated | 授权标识（30-100 字符） |
| `--name <text>` | string | ❌ No | auto from filename | 资源名称（≤60 字符） |
| `--file <path>` | string | ❌ No | auto compress | 预压缩包路径（跳过 build 步骤） |
| `--policy <id>` | string | ❌ No | auto-select default | 策略模板 ID |
| `--intro <text>` | string | ❌ No | "" | 介绍文字（≤200 字符） |
| `--description <text>` | string | ❌ No | "" | 简短描述（≤200 字符） |
| `--labels <tag1,tag2>` | array | ❌ No | [] | 标签列表（最多 20 个） |
| `--custom-props <k:v,...>` | array | ❌ No | [] | 补充属性（最多 30 项） |
| `--no-checkpoint` | flag | ❌ No | false | 禁用 Checkpoint 断点续传 |
| `--force` | flag | ❌ No | false | 跳过确认直接提交 |

#### **1.3 TTY Interactive Flow**

```bash
$ freelog publish ./my-theme

▶ Step 1: 基础信息
  资源类型：[主题▼] ← User selects from dropdown
  资源标题：星空之美主题 ← User enters text
  授权 ID: xingkongzhimei-theme-abc123 ← Auto-generated or manual input
  资源名称：星空之美 ← Optional input
  
  [下一步] ENTER | [取消] ESC

▶ Step 2: 资源包处理
  📦 压缩中... → artifact.zip
    Size: 5.4MB | SHA1: a1b2c3d...e4f5g
    
  ⚙️ 系统属性解析:
    ✓ version: 1.0.0
    ✓ author: liu-kai-github
    
  ☑ 补充属性配置:
    [+] custom_key = custom_value
    
  ⬆️ 上传进度条 ████████░░░░ 65%
  
  [上一步] B | [下一步] N

▶ Step 3: 策略配置 [可选]
  ✓ free-open-source (免费开源协议)
  
  [保持] K | [更换] C | [跳过] S

▶ Step 4: Listing 完善
  介绍文字：一款极光效果的主题 ✨
  简短描述：支持动态极光动画
  标签：theme aurora dynamic
  
  [上一步] B | [确认提交] C

✔ 资源发布成功！
  Resource ID: xingkongzhimei-theme-abc123
  View in dashboard: https://console.freelog.dev/resource/xxx
```

#### **1.4 Validation Rules**

| Field | Rule | Error Code | User Message |
|-------|------|------------|--------------|
| type | Regex `^[a-z][a-z0-9_\-]*$` | ERR_INVALID_TYPE | "无效的资源类型" |
| title | Max 100 chars | ERR_TITLE_TOO_LONG | "标题长度不能超过 100 字符" |
| authId | Min 30 chars, alphanumeric+hyphen | ERR_AUTH_ID_LENGTH | "授权标识长度需在 30-100 字符之间" |
| authId | Must be unique | ERR_DUPLICATE_AUTH_ID | "该标识已被其他用户使用" |
| file | Max 100MB | ERR_FILE_TOO_LARGE | "文件大小超过 100MB 限制" |
| intro | Max 200 chars | ERR_INTRO_TOO_LONG | "介绍文字不超过 200 个字符" |
| labels | Max 20 items, dedup first | ERR_TOO_MANY_TAGS | "最多支持 20 个标签" |

#### **1.5 Implementation Details**

**AuthId Generation Algorithm**:
```
1. Extract pinyin from title (if Chinese)
2. Sanitize: remove non-alphanumeric characters except hyphen
3. Append: `-typeCode-timestamp(random)-hexRandom(5chars)`
4. Enforce min length ≥30 by padding if necessary
5. Debounced API check (300ms delay) for uniqueness
```

**Checkpoint Save Points**:
- SP1: After Step1 complete → `{resourceTypeCode, title, authId}`
- SP2: After Step2 upload → `{fileSha1, fileSize, uploadUrl}`
- SP3: After Step3 policy select → `{selectedPolicyId}`
- SP4: After Step4 submit → `{finalResourceId}`

**Recovery Logic**:
```
On startup:
  IF checkpoints exist THEN
    Show recovery prompt: "发现未完成的发布任务，是否恢复？(Y/n/c)"
    
    IF user selects Y THEN
      Restore last checkpoint state
      Jump to next step
    ELSE IF user selects c THEN
      Delete checkpoint and exit
    END IF
  END IF
```

#### **1.6 Exit Codes**

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User cancelled |
| 2 | Validation error |
| 3 | Network/API failure |
| 4 | Checkpoint corrupted |

---

### **命令 2: `freelog update`**

#### **2.1 Command Interface**

```bash
freelog update <resourceId> [options]
```

#### **2.2 Key Features**

- **同文件升版**: `--reuse-version` flag 复用已发版的 fileSha1
- **继承逻辑**: 自动继承 latestVersion 的描述、属性、依赖
- **版本计算**: 建议 patch+1 (如 1.0.0 → 1.0.1)

#### **2.3 Interaction Flow**

```bash
$ freelog update my-theme-v2 --reuse-version

▶ Loading latest version info...
  Current: v1.0.0 (fileSha1: abc123...)
  
  Inherited fields:
    ✓ description: "一款极光效果的主题"
    ✓ dependencies: [...automatically inherited...]
    ✓ inputAttrs: {...}

▶ Enter new version number: 1.0.1
▶ Enter new file path: ./dist/theme.zip
▶ Verify fileSha1 matches previous upload? YES/NO

✔ Version 1.0.1 published successfully!
```

---

### **命令 3: `freelog collection create`**

#### **3.1 Command Interface**

```bash
freelog collection create [options]
```

#### **3.2 Parameters**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--name <text>` | string | ✅ Yes | - | 合集名称 |
| `--items <id1,id2,...>` | array | ✅ Yes | - | 资源 ID 列表（分批提交，单次最多 100 个） |
| `--display-name <text>` | string | ❌ No | auto from name | 展示名称 |
| `--description <text>` | string | ❌ No | "" | 合集描述 |
| `--fingerprint <sha256>` | string | ❌ No | auto-compute | 目录指纹（用于检测变化） |
| `--merge <0|1>` | number | ❌ No | 1 | 是否合并目录变化 |
| `--no-checkpoint` | flag | ❌ No | false | 禁用断点续传 |
| `--force` | flag | ❌ No | false | 跳过确认直接提交 |

#### **3.3 Directory Fingerprint Mechanism**

```typescript
// Local fingerprint computation
local_fingerprint = computeSHA1(
  current_draft_catalogue_files.map(f => f.path + f.sha1)
)

// Platform fingerprint query
platform_fingerprint = queryPlatformCatalogueFingerprint(collectionId)

// Merge decision logic
IF local_fingerprint == platform_fingerprint THEN
  merge_flag = 0  // No directory changes detected
ELSE
  merge_flag = 1  // Merge directory changes
END IF
```

#### **3.4 TTY Interactive Flow**

```bash
$ freelog collection create --name "我的精选合集"

▶ Step 1/5: 初始化合集工程
  Creating .freelog/collection/ folder...
  ✓ Collection initialized
  [下一步] ENTER

▶ Step 2/5: 添加条目入口
  ┌─ Select Entry Sources ───────────┐
  │ • From local project (./theme/)  │
  │ • From platform resources        │
  │ • Mix both                       │ ← Selected
  └──────────────────────────────────┘
  [下一步] ENTER

▶ Step 3/5: 批量处理条目
  Scanning local directories...
  Found 87 items to add
  
  Batch processing (100 items max per submission):
  ├─ Batch 1: 87 items ✅ Success
  └─ Total uploaded: 87 resources
  [下一步] ENTER

▶ Step 4/5: 完善展示配置
  Display Name: 我的精选合集
  Description: 这是一个精心挑选的合集
  Catalogue Fingerprint: a1b2c3d...e4f5g
  Merge Flag: 1 (directory changes detected)
  [下一步] ENTER

▶ Step 5/5: 发布合集
  Publishing collection...
  ├─ Submitting cataloguedProperties...
  ├─ Computing fingerprint...
  └─ Updating display properties...
  
✔ Collection published successfully!
  Collection ID: coll_xkjs2023abc123
  Items count: 87
  View in dashboard: https://console.freelog.dev/collection/xxx
```

---

### **命令 4: `freelog batch-publish`** ⭐ NEW FOR WEEK 3

#### **4.1 Command Interface**

```bash
freelog batch-publish <input_dir> [options]
```

**用途**: 批量发布多个资源文件到平台

#### **4.2 Core Parameters**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `<input_dir>` | string | ✅ Yes | - | 待发布的文件目录 |
| `--auth-id-prefix <prefix>` | string | ❌ No | - | 批量 authId 前缀 |
| `--type <code>` | string | ✅ Yes | - | 资源类型代码 |
| `--parallel <N>` | number | ❌ No | 5 | 并发批次数量 |
| `--report-dir <path>` | string | ❌ No | `.freelog/reports/` | 报告输出目录 |
| `--status-file <path>` | string | ❌ No | `.freelog/batch-status.json` | 状态跟踪文件 |
| `--no-progress` | flag | ❌ No | false | 不显示进度条 |
| `--skip-existing` | flag | ❌ No | false | 跳过已存在的资源 |
| `--retry <N>` | number | ❌ No | 3 | 最大重试次数 |

#### **4.3 Idempotency Key Generation**

```typescript
// Generate unique idempotency key for each item
function generateIdempotencyKey(filePath, resourceType, authId) {
  const sha1 = calculateSHA1(filePath)
  const normalizedPath = normalizePath(filePath)
  
  // Format: path_sha1_type_authId
  return `${normalizedPath}|${sha1}|${resourceType}|${authId}`
}

// Usage example
key = generateIdempotencyKey(
  './themes/theme-1.zip',    // filePath
  'theme',                    // typeCode  
  'theme-abc123'             // authId
)
// Result: "themes/theme-1.zip|a1b2c3d...e4f5g|theme|theme-abc123"
```

#### **4.4 Batch Processing Flow**

```bash
$ freelog batch-publish ./my-resources --type theme --parallel 10

▶ Step 1/4: 扫描输入目录
  Scanning ./my-resources...
  Found files:
    ├─ theme-1/index.html (5.2MB)
    ├─ theme-2/index.html (3.8MB)
    ├─ plugin-1/main.js (1.2MB)
    └─ library-core/utils.js (890KB)
  Total: 4 files, 11.09MB
  [下一步] ENTER

▶ Step 2/4: 预处理验证
  Generating idempotency keys...
  Validating file sizes (max 100MB each)...
  ✓ All files validated
  [下一步] ENTER

▶ Step 3/4: 批量创建 (createBatch OR fallback)
  Attempting createBatch API call...
  
  Batch job started:
    ├── Item 1: theme-1 → PENDING
    ├── Item 2: theme-2 → PENDING
    ├── Item 3: plugin-1 → PENDING
    └── Item 4: library-core → PENDING
  
  Processing parallel batches (10 concurrent):
    ████████████████░░░░ 60% complete
    Speed: 2.5MB/s avg
    
  Results:
    ✓ theme-1 → SUCCESS (resourceId: theme_abc1)
    ✓ theme-2 → SUCCESS (resourceId: theme_def2)
    ✓ plugin-1 → SUCCESS (resourceId: plug_ghi3)
    ✗ library-core → RETRYING (error: network timeout)
      Retry 1/3...
      Retry 2/3...
      ✓ library-core → SUCCESS after retries
  
  Final status: 4/4 succeeded, 0 failed
  [下一步] ENTER

▶ Step 4/4: 生成报告
  Generating batch report...
  Report saved to: .freelog/reports/batch-20260903.json
  
  📊 Summary:
    Total items: 4
    ✓ Successful: 4
    ✗ Failed: 0
    ⚠ Retried: 1
    📦 Total size: 11.09MB
    ⏱ Duration: 4.2s
  
  ✔ Batch publish completed!
```

#### **4.5 Parallel Processing Logic**

```typescript
const MAX_PARALLEL = options.parallel || 5
const BATCH_SIZE = 100  # Max items per API call

// Chunk files into parallel batches
chunks = chunkFiles(scannedFiles, MAX_PARALLEL)

results = await Promise.allSettled(
  chunks.map(chunk => processBatch(chunk))
)

async function processBatch(batchItems) {
  // Try createBatch first (more efficient)
  try {
    response = await api.createBatch({
      items: batchItems.map(item => ({
        idempotencyKey: item.key,
        filePath: item.path,
        resourceType: item.type,
        authId: item.authId
      }))
    })
    
    return { status: 'success', data: response }
    
  } catch (batchError) {
    // Fallback: individual creates
    const results = []
    for (item of batchItems) {
      result = await api.createItem(item)
      results.push(result)
    }
    
    return { status: 'fallback', data: results }
  }
}
```

#### **4.6 Report Generation Schema**

```json
{
  "batchId": "batch_20260903_143522",
  "startTime": "2026-09-03T14:35:22Z",
  "endTime": "2026-09-03T14:35:26Z",
  "inputDir": "./my-resources",
  "totalItems": 4,
  "summary": {
    "successful": 4,
    "failed": 0,
    "retried": 1,
    "skipped": 0,
    "unknownState": 0
  },
  "items": [
    {
      "filePath": "themes/theme-1/index.html",
      "idempotencyKey": "themes/theme-1|a1b2c3d...|theme|theme-abc1",
      "status": "completed",
      "resourceId": "theme_abc1",
      "retryCount": 0,
      "duration": "0.8s",
      "size": 5242880
    },
    {
      "filePath": "libs/library-core/utils.js",
      "idempotencyKey": "libs/library-core|e4f5g6h...|library|lib-xyz9",
      "status": "completed",
      "resourceId": "lib_xyz9",
      "retryCount": 3,
      "duration": "2.1s",
      "size": 912384,
      "note": "Retried due to network timeout"
    }
  ],
  "errors": [],
  "remoteOutcomeUnknown": []
}
```

#### **4.7 Exception Handling**

| Error Code | HTTP Code | Trigger Condition | Recovery Action |
|-----------|-----------|------------------|-----------------|
| ERR_BATCH_PARTIAL_SUCCESS | 207 | Some items succeed, others fail | Review report, retry failures |
| ERR_RATE_LIMIT_REACHED | 429 | API rate limit exceeded | Wait cooldown period, resume later |
| ERR_IDEMPOTENCY_CONFLICT | 409 | Same key submitted twice | Verify remote state, restore if matches |
| ERR_REMOTE_UNKNOWN_OUTCOME | 0 | Remote write result uncertain | Manual verification required |
| ERR_REPORT_GENERATION_FAILED | 500 | Cannot write report file | Save to alternate location |

#### **4.8 Exit Codes**

| Code | Meaning |
|------|---------|
| 0 | All items successful |
| 1 | Partial success (some failures) |
| 2 | Validation error (bad input) |
| 3 | Network/API failure (all failed) |
| 4 | Unknown state items require manual check |

**备注**: This command is designed for CI/CD scenarios where bulk updates are needed.
It provides detailed reporting and retry mechanisms for reliability.
**

#### **3.1 Command Interface**

```bash
freelog collection create [options]
```

#### **3.2 Options**

| Flag | Required | Description |
|------|----------|-------------|
| `--name <text>` | ✅ Yes | 合集名称 |
| `--items <id1,id2,...>` | ✅ Yes | 资源 ID 列表（分批提交，单次最多 100 个） |
| `--display-name <text>` | ❌ No | 展示名称 |
| `--description <text>` | ❌ No | 合集描述 |

#### **3.3 Directory Fingerprint Mechanism**

```
Local fingerprint = computeSHA1(current_draft_catalogue_files)
Platform fingerprint = queryPlatformCatalogueFingerprint(collectionId)

IF local_fingerprint == platform_fingerprint THEN
  merge_flag = 0  # No directory changes
ELSE
  merge_flag = 1  # Merge directory changes
END IF
```

---

## 🔗 **与 PHASE 的关系**

```
┌──────────────────────────────────────┐
│  PHASE (F0/M0/C0/H0)                  │
│   ─────────────────                    │
│   业务流程编排                         │
│   ↓                                    │
│   调用命令完成各 Step                 │
└──────────────────────────────────────┘
              ↓ 黑盒调用
┌──────────────────────────────────────┐
│  COMMAND DESIGN (本文档)              │
│   ───────────────────                  │
│   命令接口规范 + 参数约束             │
│   TTY 交互流程                         │
│   异常处理和错误码映射                │
└──────────────────────────────────────┘
              ↓ 内部实现
┌──────────────────────────────────────┐
│  FRAMEWORK / REUSE                     │
│   ──────────────────                   │
│   压缩打包工具                        │
│   文件上传服务 G2                      │
│   Checkpoint 断点续传 G3                │
│   Policy 策略编译系统                   │
└──────────────────────────────────────┘
```

**关键原则**:
- ✅ PHASE **只声明**调用哪个命令，用什么参数
- ✅ PHASE **不展开**命令内部的实现细节
- ✅ COMMAND DESIGN **完整定义**接口契约和交互规范
- ✅ COMMAND DESIGN **指导**开发者实现命令

---

## 📝 **扩展新命令的指南**

当你需要添加新命令时，请遵循此模板：

1. **Command Interface**: `freelog <command> [args] [options]`
2. **Parameters Table**: 列出所有 flags 和 requirements
3. **TTY Flow Diagram**: ASCII art 展示交互过程
4. **Validation Rules**: 字段约束表和错误码
5. **Implementation Notes**: 关键算法或逻辑说明
6. **Exit Codes**: 可能的退出码含义
7. **Cross References**: 关联的 PHASE 文档

---

**文档统计**: ~500+ lines  
**维护者**: CLI Design Team  
**对齐版本**: Console CLI Integration Specification
