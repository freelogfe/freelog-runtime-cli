# F0 - 单资源发布完整流程 CLI 设计规范

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **对齐业务梳理**: P0-F0 Phase1-4 已验证文档  
> **关键发现**: Step3 可选 (Console L100), intro maxLength=200, title maxLength=100

---

## 📋 **一、功能需求清单**

### **1.1 核心功能分解**

| 功能 ID | 功能名称 | 功能描述 | 复用模块 | 来自业务梳理 |
|--------|---------|---------|---------|------------|
| F0-F1 | 资源类型选择 | 从主题/插件/库/软件中选择类型 | - | P0-F0-Phase1 |
| F0-F2 | authId 生成与校验 | 自动生成 + 唯一性验证 | tools-lib API | P0-F0-Phase1 |
| F0-F3 | 标题与名称输入 | ≤100 字符/≤60 字符 | - | P0-F0-Phase1 |
| F0-F4 | 文件上传 (含 SHA1) | 自动检测大小选择单片/分片模式 | **G2-UPLOAD** | P0-F0-Phase2 |
| F0-F5 | 补充属性管理 | ≤30 项自定义属性 | - | P0-F0-Phase2 |
| F0-F6 | 策略模板选择 | 免费/商业/自定义 3 种模式 | **POLICY** | P0-F0-Phase3 |
| F0-F7 | 封面图片上传 | ≤5MB PNG/JPG/WebP | **G2-UPLOAD** | P0-F0-Phase4 |
| F0-F8 | 标签处理 | trim/lowercase/dedup 最多 20 个 | - | P0-F0-Phase4 |
| F0-F9 | Checkpoint 保存恢复 | Ctrl+C 中断恢复 | **G3-CHECKPOINT** | 全局 |

### **1.2 公共模块复用关系**

```
┌─────────────────────────────────────┐
│    F0-SingleResourcePublish         │
├─────────────────────────────────────┤
│                                      │
│ ┌──────────────┐  ┌──────────────┐  │
│ │  G2-UPLOAD   │  │ POLICY       │  │
│ │ (文件上传)   │  │ (策略系统)   │  │
│ └──────┬───────┘  └──────┬───────┘  │
│        │                 │           │
│        ▼                 ▼           │
│ ┌─────────────────────────────────┐ │
│ │     Step2 调用 UPLOAD            │ │
│ │     Step3 调用 POLICY            │ │
│ └───────────────┬─────────────────┘ │
│                 ▼                   │
│        ┌──────────────┐             │
│        │ G3-CHECKPOINT│             │
│        │  (全局保存)  │             │
│        └──────────────┘             │
│                                      │
└─────────────────────────────────────┘
```

---

## 🔄 **二、Step 编排流程**

### **2.1 主流程时序图 (ASCII)**

```
[开始 freelog publish] 
        ↓ checkpoint.init()
     [Step1: 基础信息填写]
        ├─ 选择资源类型 (F0-F1)
        ├─ 生成并校验 authId (F0-F2)
        └─ 输入标题/名称 (F0-F3)
        ↓ checkpoint.save(step=1) ← Save Point #1
     [Step2: 上传资源包]
        ├─ 读取本地文件计算 SHA1
        ├─ 调用 UPLOAD 模块 (F0-F4)
        └─ 添加补充属性 (F0-F5)
        ↓ checkpoint.save(step=2) ← Save Point #2
     [Step3: 配置授权策略][可选分支]
        ├─ 加载可用策略列表
        ├─ 调用 POLICY 模块 (F0-F6)
        └─ 可选跳过 (Console L100 证据)
        ↓ checkpoint.save(step=3) OR NO SAVE
     [Step4: 完善 Listing]
        ├─ 封面上传 (调用 UPLOAD) (F0-F7)
        ├─ 填写介绍 (≤200 字符)
        └─ 标签处理 (trim/lowercase/dedup) (F0-F8)
        ↓ checkpoint.save(step=4) ← Save Point #3
    [确认并提交]
        ↓
    [POST /v2/resources via tools-lib]
        ↓
    [成功 ✔ → Dashboard]
    [失败 ✖ → Error Display]
```

### **2.2 Checkpoint Save Points Definition**

| Save Point | Step | Save Condition | Data Structure |
|-----------|------|----------------|----------------|
| SP1 | Step1 Complete | User enters Step2 | {resourceTypeCode, resourceTitle, authId} |
| SP2 | Step2 Complete | User enters Step3 | {fileSha1, fileSize, uploadUrl, customProperties[]} |
| SP3 | Step3 Complete | User enters Step4 | {selectedPolicy, policyParams} (OR skip if not used) |
| SP4 | Step4 Complete | Confirm submission | {coverUrl, introduction, tags[]} |

### **2.3 Ctrl+C Recovery Algorithm (If-Then-Else Only)**

```
IF SIGINT detected THEN
  checkpoint = loadFromDisk(workflowId)
  
  IF checkpoint is valid THEN
    lastCompletedStep = findLastCompletedStep(checkpoint)
    
    showConfirmation("发现未完成的发布任务，是否恢复？")
    
    IF user confirms THEN
      restoreState(checkpoint.data)
      jumpToStep(lastCompletedStep + 2)  // 0-based to 1-based
    ELSE
      deleteCheckpoint(workflowId)
      exitGracefully()
    END IF
    
  ELSE
    showError("Checkpoint 损坏，无法恢复")
    cleanupAndExit()
  END IF
END IF
```

---

## 📊 **三、字段约束数据库 (from Business Review)**

### **3.1 必填字段表**

| 字段名 | Step | Min 长度 | Max 长度 | 必填 | 格式 | 错误提示 | Console Source |
|--------|------|----------|----------|------|------|---------|----------------|
| typeCode | Step1 | 1 | ∞ | ✅ | ^[a-z][a-z0-9_\-]*$ | "请输入有效的资源类型" | Step1 L126-180 |
| resourceTitle | Step1 | 1 | 100 | ✅ | 非空 | "标题不能为空" | Step1 L250-290 |
| authId | Step1 | 30 | 100 | ✅ | 小写 + 连字符 | "授权标识需符合格式" | Step1 L181-240 |
| file | Step2 | - | 100MB | ✅ | 文件存在 | "文件不存在或无法访问" | Step2 L1-300 |

### **3.2 可选字段表**

| 字段名 | Step | Min 长度 | Max 长度 | 默认值 | 格式 | 自动处理 | Notes |
|--------|------|----------|----------|--------|------|---------|-------|
| resourceName | Step1 | 1 | 60 | auto | alphanumeric+Chinese | from filename | Optional |
| customProperties | Step2 | 0 | 30 items | [] | key=value | none | Per-field ≤100 chars |
| selectedPolicy | Step3 | 0* | ∞ | null | PolicyID | none | **Step3 is OPTIONAL** |
| coverImage | Step4 | - | 5MB | auto | PNG/JPG/WebP | ≥800×600 recommended | Optional |
| introduction | Step4 | 0 | 200 | "" | plain text | none | Step4 context only |
| tags | Step4 | 0 | 20 | [] | Chinese/English | trim/lowercase/dedup | Optional |

*注：根据 Console creator/index.tsx L100，Step3 是可选的

---

## 💡 **四、业务规则算法 (Pseudocode Format)**

### **4.1 authId 自动生成规则**

```
IF user provides --auth-id flag THEN
  authId = user_input
  
  # Validate length
  IF authId.length < 30 OR authId.length > 100 THEN
    throwError(ERR_AUTH_ID_LENGTH, `授权标识长度需在 30-100 字符之间`)
  END IF
  
ELSE IF user provides --title flag THEN
  title = user_title
  
  # Auto-generate using timestamp pattern
  timestampStr = Date.now().toString(36)
  randomHex = Math.random().toString(36).substring(2, 7)
  resourceType = CLI_type_code_value
  
  authId = `${resourceType}-${timestampStr}-${randomHex}`
  
  WHILE authId.length < 30 DO
    randomSuffix = generateRandomString(5)
    authId = `${authId}-${randomSuffix}`
  END WHILE
  
  authId = authId.substring(0, 100)  # Truncate to max length
  
  # Debounced uniqueness check (300ms)
  setTimeout(() => {
    response = await checkAuthIdAvailability(authId)
    
    IF !response.isAvailable THEN
      authId = `${authId}-${generateUniqueID()}`
      retry availability check
      
      IF still unavailable THEN
        promptUserForManualOverride()
      END IF
    END IF
  }, 300)
END IF

validateFormat(authId)
displaySuccess("授权标识已生成 ✓")
```

### **4.2 标签处理规则**

```
inputTags = CLI_tags_array || TTY_input_tags

# Step 1: Trim whitespace
processedTags = inputTags.map(tag => tag.trim())

# Step 2: Filter empty tags
processedTags = processedTags.filter(tag => tag.length > 0)

# Step 3: Convert to lowercase
processedTags = processedTags.map(tag => tag.toLowerCase())

# Step 4: Deduplicate using Set
uniqueTags = Array.from(new Set(processedTags))

# Step 5: Check count limit
IF uniqueTags.length > 20 THEN
  throwError(ERR_TOO_MANY_TAGS, `最多支持 20 个标签，当前 ${uniqueTags.length} 个`)
END IF

displayInfo(`已处理 ${uniqueTags.length} 个标签`)
return uniqueTags
```

### **4.3 File Size Upload Mode Decision**

```
filePath = CLI_file_path

# Get file size
fileSize = fs.statSync(filePath).size

# Determine upload mode based on threshold (10MB)
THRESHOLD = 10 * 1024 * 1024  # 10MB

IF fileSize <= THRESHOLD THEN
  uploadMode = 'single'
  chunkCount = 1
  displayInfo(`文件大小 ${formatBytes(fileSize)}，将采用单片上传模式`)
ELSE
  uploadMode = 'chunked'
  CHUNK_SIZE = 5 * 1024 * 1024  # 5MB per chunk
  chunkCount = Math.ceil(fileSize / CHUNK_SIZE)
  displayInfo(`文件大小 ${formatBytes(fileSize)}，将采用分片上传 (${chunkCount} 个分片)` )
END IF

# Calculate SHA1 for deduplication check
fileSha1 = calculateSHA1File(filePath)
displayInfo(`文件 SHA1: ${fileSha1.substring(0, 16)}...`)
```

---

## ⚠️ **五、异常处理矩阵**

### **5.1 Step-by-Step Error Mapping**

| Step | 错误场景 | HTTP Code | Error Code | User Message | Recovery Action | Auto Retry? |
|------|---------|-----------|------------|--------------|-----------------|-------------|
| **Step1** | AuthID 冲突 | 409 | ERR_DUPLICATE_AUTH_ID | "该标识已被其他用户使用" | Return to Step1 | ❌ No |
| | Invalid Type | 400 | ERR_INVALID_TYPE | "无效的资源类型" | Re-select type | ❌ No |
| | Title Too Long | 400 | ERR_TITLE_TOO_LONG | "标题不能超过 100 字符" | Truncate automatically | ❌ No |
| | Network Timeout | 504 | ERR_NETWORK_TIMEOUT | "网络连接超时，请检查网络后重试" | Retry 3x exponential backoff | ✅ Yes (3x) |
| **Step2** | File Not Found | - | ERR_FILE_NOT_FOUND | "文件不存在或无法访问" | Browse again | ❌ No |
| | Upload Failed | 413/403 | ERR_UPLOAD_FAILED | "上传失败，请检查文件大小" | Retry 3x | ✅ Yes (3x) |
| | Disk Space Full | ENOSPC | ERR_DISK_FULL | "磁盘空间不足" | Abort workflow | ❌ No |
| **Step3** | Policy Not Found | 404 | ERR_POLICY_NOT_FOUND | "找不到指定的策略" | Re-select policy | ❌ No |
| | Payment Required | 402 | ERR_PAYMENT_REQUIRED | "此策略需要付费签约" | Redirect to payment | ❌ No |
| **Step4** | Cover Too Large | 413 | ERR_COVER_TOO_LARGE | "封面图片超过 5MB" | Regenerate cover | ❌ No |
| | Invalid Cover Format | 400 | ERR_INVALID_COVER_FORMAT | "封面必须为 PNG/JPG/WebP" | Select valid cover | ❌ No |
| | Introduction Too Long | 400 | ERR_INTRO_TOO_LONG | "介绍内容不能超过 200 字符" | Trim automatically | ❌ No |
| | Too Many Tags | 400 | ERR_TOO_MANY_TAGS | "最多支持 20 个标签" | Auto-deduplicate | ❌ No |

### **5.2 Global Recovery Strategies**

```
UNEXPECTED ERROR HANDLER:
  Catch errors from any step
  
  IF error.retryable === true THEN
    attemptCount++
    
    IF attemptCount < MAX_RETRIES (3) THEN
      delay = baseDelay * Math.pow(2, attemptCount)
      sleep(delay)
      retryOperation()
    ELSE
      offerRecoveryOptions([
        "返回上一步",
        "放弃并重试",
        "联系技术支持"
      ])
    END IF
  ELSE
    showPermanentFailure(error.message)
    forceManualIntervention()
  END IF

ERROR ON CHECKPOINT PERSISTENCE:
  IF saveToDisk fails THEN
    displayWarning("Checkpoint 保存失败，但仍继续执行")
    logErrorToFile()
    continueExecution()
  END IF
```

---

## ✅ **六、验收标准 (Acceptance Criteria)**

### **6.1 Happy Path Test Cases**

| Test Case ID | Precondition | Steps | Expected Result |
|-------------|--------------|-------|-----------------|
| F0-HAPPY-001 | Valid files, stable network | 1. Run command<br/>2. Follow TTY flow<br/>3. Submit | All validations pass<br/>Upload succeeds<br/>Success message shown |
| F0-HAPPY-002 | Non-interactive mode all params provided | Run with --submit flag | All steps execute without prompts<br/>Clean exit with code 0 |

### **6.2 Error Scenario Test Cases**

| Test Case ID | Trigger | Expected Behavior |
|-------------|---------|-------------------|
| F0-ERROR-001 | AuthID already exists | Show conflict warning<br/>Cannot proceed until resolved<br/>Checkpoint saved with partial state |
| F0-ERROR-002 | File > 100MB | Reject immediately<br/>Show clear error message<br/>Do NOT attempt upload |
| F0-ERROR-003 | Tag count > 20 | Auto-deduplicate first<br/>Still reject if > 20 after dedup<br/>Display helpful message |
| F0-ERROR-004 | Ctrl+C during upload | Stop upload gracefully<br/>Save checkpoint with current state<br/>Offer resume on next launch |

---

## 🔗 **七、与其他文档的交叉引用**

### **7.1 被引用的通用模块**

| 模块 ID | 模块名称 | 引用位置 | 用途 |
|--------|---------|---------|------|
| **G2-UPLOAD** | 文件上传服务 | Step2, Step4 | 文件上传、封面上传 |
| **G3-CHECKPOINT** | 断点续传机制 | Global | 所有 Step 后的进度保存 |
| **POLICY/POLICY-StrategySystem** | 策略系统 | Step3 | 策略模板选择和签约 |

### **7.2 引用的业务梳理文档**

| 文档 ID | 文档名称 | 验证内容 |
|--------|---------|---------|
| P0-F0-Phase1.md | 单资源 Step1 详细设计 | 字段约束、authId 生成逻辑 |
| P0-F0-Phase2.md | 单资源 Step2 文件上传 | 上传模式决策、customProperties |
| P0-F0-Phase3.md | 单资源 Step3 授权策略 | Step3 可选性、策略选择 |
| P0-F0-Phase4.md | 单资源 Step4 资源发布 | 封面约束、介绍 maxLength、标签处理 |

---

## 📝 **附录 A: Console 源码证据索引**

| 功能点 | Console Source File | Line Numbers | Key Evidence |
|--------|---------------------|--------------|--------------|
| Step3 可选性 | creator/index.tsx | L100 | `step3_policies.length > 0 ? finished : ''` |
| Title maxLength | creator/Step1/index.tsx | L126-155 | `lengthLimit={100}` |
| resourceName maxLength | creator/Step1/index.tsx | L198-215 | `lengthLimit={60}` |
| Introduction maxLength | creator/Step4/index.tsx | L95-107 | `lengthLimit={200}` |
| Draft auto-save | creator/index.tsx | L40-43 | `watch=dataIsDirty_count` |
| AuthId validation debounce | creator/Step1/index.tsx | L262-270 | `setTimeout(..., 300)` |
| Cover size limit | FUploadCover component | Various | `maxSize: 5 * 1024 * 1024` |

---

## 📝 **附录 B: 实现优先级建议**

### **Phase 1: 核心流程实现 (Week 1-2)**
1. F0-F1: 资源类型选择
2. F0-F2: authId 生成与校验
3. F0-F3: 标题与名称输入
4. F0-F9: Checkpoint 基础功能

### **Phase 2: 工具集成 (Week 3)**
5. F0-F4: 文件上传 (集成 G2-UPLOAD)
6. F0-F7: 封面上传 (复用 G2-UPLOAD)

### **Phase 3: 策略与高级功能 (Week 4)**
7. F0-F6: 策略模板选择 (集成 POLICY)
8. F0-F5: 补充属性管理
9. F0-F8: 标签处理

---

**📌 使用说明**: 本文档可直接指导开发者实现单资源发布 CLI 功能，无需额外查阅其他资料。
