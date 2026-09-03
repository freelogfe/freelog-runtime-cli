# H0 - 批量发布完整流程设计

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **对齐业务梳理**: P0-H0-BatchPublish.md + Console import-dir logic  
> **关键发现**: 报告机制、失败重试、幂等性校验

---

## 📋 **一、功能需求清单**

| 功能 ID | 功能名称 | 功能描述 | 复用模块 | 来源 |
|--------|---------|---------|---------|------|
| H0-F1 | 目录扫描 | scanDirectory 识别资源文件 | - | P0-H0 |
| H0-F2 | 幂等键生成 | path+sha1+typeCode+authId | - | DESIGN.md |
| H0-F3 | 批量创建策略 | createBatch OR 逐项创建 | tools-lib | P0-H0 |
| H0-F4 | 报告生成 | .freelog/reports/<runId>.json | - | DESIGN.md |
| H0-F5 | 失败重试 | --resume / --retry <report> | G3-CHECKPOINT | DESIGN.md |
| H0-F6 | 状态统计 | skip/failed/waived/passed | - | DESIGN.md |
| H0-F7 | Checkpoint 恢复 | remote_outcome_unknown 对账 | G3-CHECKPOINT | DESIGN.md |

---

## 🔄 **二、Step 编排流程**

```
[开始 freelog resource import-dir] 
        ↓ checkpoint.init()
     [Step1: 扫描输入目录]
        ├─ scanDirectory(input_path)
        ├─ 计算每项的幂等键 (path+sha1+type+authId)
        └─ 生成处理计划 (plan.json)
        ↓ checkpoint.save(step=1)
     [Step2: 预处理验证]
        ├─ 检查文件类型和大小限制
        ├─ 验证授权名唯一性
        └─ 拒绝不符合规则的文件
        ↓ checkpoint.save(step=2)
     [Step3: 批量执行创建][循环分支]
        ├─ IF createBatch API available THEN
        │   tryCreateBatch(files_batch)
        │   → success/failure/unknown 三种结果
        └─ ELSE fallback to individual creation
            → for each file: createVersion()
        ↓ checkpoint.save(step=3) per batch
     [Step4: 生成报告]
        ├─ write detailed report JSON
        ├─ update latest.json pointer
        └─ list statistics (passed/skipped/failed)
        ↓ checkpoint.save(step=4)
     [成功 ✔ → Exit with code]
```

---

## 📊 **三、每个 Step 的详细设计**

### **Step1: 扫描输入目录**

#### **TTY Interactive Flow (ASCII Diagram)**

```bash
$ freelog resource import-dir ./assets

┌─ Step1/4: 扫描输入目录 ──────────────┐
│                                       │
│ ▶ 扫描目录                            │
│   Source: ./assets/                  │
│   Files detected: 25                │
│                                       │
│ ⚙️ 分析文件格式                       │
│   ✓ ZIP files:      18              │
│   ✓ PNG images:      4               │
│   ✗ Ignored:         3 (*.log, .tmp)│
│                                       │
│ ▶ 生成幂等键                          │
│   1. theme-a.zip → KEY-abc123...     │
│   2. theme-b.zip → KEY-def456...     │
│   ...                                │
│                                       │
│ 📊 处理计划                           │
│   Will process: 18 files             │
│   Skip invalid: 3 files              │
│                                       │
│ [下一步] ENTER | [取消] ESC            │
└───────────────────────────────────────┘
```

#### **幂等键生成逻辑**

```
伪代码：
FOR EACH file IN scanned_files DO
  # 规范化路径（POSIX format）
  normalized_path = normalizePath(file.relative_path)
  
  # 计算内容 SHA1
  file_sha1 = calculateSHA1(file.absolute_path)
  
  # 检测资源类型
  resource_type = detectResourceTypeByFile(file)
  
  # 生成授权名（可配置或自动）
  auth_id = generateAuthIdFromMetadata(file)
  
  # 组合幂等键
  idempotency_key = `${normalized_path}|${file_sha1}|${resource_type}|${auth_id}`
  
  item_plan = {
    idempotencyKey: idempotency_key,
    filePath: file.absolute_path,
    relativePath: file.relative_path,
    fileSha1: file_sha1,
    resourceType: resource_type,
    authId: auth_id,
    status: 'pending',  # pending/processing/completed/failed/skipped
    retryCount: 0
  }
  
  plans.push(item_plan)
END FOR

# 输出处理计划
writePlanJSON(plans)
```

---

### **Step2: 预处理验证**

#### **核心验证规则 If-then-else**

```
FOR EACH item IN plans DO
  # 文件大小验证
  file_size = fs.statSync(item.filePath).size
  
  MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
  
  IF file_size > MAX_FILE_SIZE THEN
    item.status = 'skipped'
    item.skipReason = 'FILE_TOO_LARGE'
    failed_items++
    CONTINUE
  END IF
  
  # 文件类型验证
  allowed_types = ['.zip', '.png', '.jpg', '.webp', '.mp4']
  IF NOT allowedTypes.includes(fileExtension(item.filePath)) THEN
    item.status = 'skipped'
    item.skipReason = 'INVALID_FILE_TYPE'
    skipped_items++
    CONTINUE
  END IF
  
  # 授权名唯一性验证
  existing_auth_ids = collectAllAuthIdsInPlans()
  
  IF existingAuthIds.includes(item.authId) AND item is not first occurrence THEN
    item.status = 'skipped'
    item.skipReason = 'DUPLICATE_AUTH_ID'
    warnDuplicateAuthId(item.authId)
    skipped_items++
    CONTINUE
  END IF
  
  item.status = 'ready_to_process'
  valid_items++
END FOR

displayValidationSummary({
  total: len(plans),
  valid: valid_items,
  skipped: skipped_items,
  failed: failed_items
})

IF valid_items == 0 THEN
  showError("没有符合条件的文件，无法继续")
  exitCode = ERR_NO_VALID_FILES
END IF
```

---

### **Step3: 批量执行创建**

#### **createBatch vs 逐项创建策略**

```
伪代码：
# 检查是否支持批量创建
can_use_batch_api = checkIfCreateBatchAvailable(currentEnv)

IF can_use_batch_api AND valid_items > 1 THEN
  # 方案 A: 批量创建
  BATCH_LIMIT = 50  # 假设平台限制每批 50 个
  
  batches = chunkItems(valid_items, BATCH_LIMIT)
  
  FOR EACH batch IN batches DO
    result = callAPI(createBatch, {
      items: batch,
      env: currentEnv
    })
    
    # 解析返回结果
    FOR EACH (item, platform_result) IN zip(batch, result.items) DO
      IF platform_result.success THEN
        item.status = 'completed'
        item.resourceId = platform_result.resourceId
        item.versionId = platform_result.versionId
        
      ELSIF platform_result.error_code == 409 THEN
        # 重复创建冲突
        item.status = 'failed'
        item.failureReason = 'ALREADY_EXISTS'
        
      ELSE IF platform_result.error_code >= 500 THEN
        # 服务器错误，可重试
        item.status = 'failed'
        item.failureReason = 'REMOTE_SERVER_ERROR'
        item.retryable = true
        
      ELSE
        # 其他业务错误
        item.status = 'failed'
        item.failureReason = platform_result.error_message
      END IF
    END FOR
    
    # 每批保存一次 checkpoint
    G3.saveCheckpoint('H0-Step3-batch', {
      batchIndex: batchIndex,
      totalBatches: len(batches),
      processedItems: processed_count
    })
  END FOR
  
ELSE
  # 方案 B: 逐项创建（fallback）
  FOR EACH item IN valid_items DO
    # 查询幂等性（避免重复创建）
    existing_resource = queryIfExists(item.authId, item.resourceType)
    
    IF existing_resource EXISTS THEN
      # 确认是幂等的
      IF matchesCurrentPlan(existing_resource, item) THEN
        item.status = 'skipped'
        item.skipReason = 'IDEMPOTENT_EXIST'
        item.resourceId = existing_resource.id
        
        displayInfo(`已存在相同资源，跳过创建`)
        continue
      END IF
    END IF
    
    # 实际调用创建 API
    TRY
      result = callAPI(createVersion, {
        typeCode: item.resourceType,
        authId: item.authId,
        title: extractTitleFromFile(item.filePath),
        fileSha1: item.fileSha1,
        ...metadata
      })
      
      item.status = 'completed'
      item.resourceId = result.resourceId
      item.versionId = result.versionId
      
    CATCH NetworkError OR TimeoutError THEN
      # 网络异常，标记为 unknown
      item.status = 'unknown'
      item.unknownState = 'remote_outcome_unknown'
      
      showWarning(`创建结果未知，需对账 ${item.filePath}`)
      
    CATCH PlatformError AS e THEN
      item.status = 'failed'
      item.failureReason = e.message
      
    END TRY
  END FOR
END IF
```

#### **remote_outcome_unknown 的处理逻辑**

```
伪代码：
# 远程写请求已发出但客户端未能确认响应
IF item.status == 'unknown' AND item.unknownState == 'remote_outcome_unknown' THEN
  # 强制停止自动重试
  showCriticalWarning(`检测到远程写结果不确定的项`);
  showInfo(`为避免重复创建，CLI 不会自动重试`);
  showInfo(`需要通过以下流程对账:`);
  showSteps([
    "1. 按授权名查询平台是否有对应资源",
    "2. 核对版本号、文件 SHA1、owner 等信息",
    "3. 确认已创建则补本地状态，确认未创建则可重试"
  ]);
  
  user_action = promptUser("如何处理？");
  
  IF user_action == 'verify_and_restore' THEN
    # 手动对账流程
    platform_resource = queryPlatformResource(item.authId);
    
    IF platform_resource FOUND THEN
      # 验证一致性
      IF platform_resource.matchesLocalPlan(item) THEN
        # 确认是同一个资源
        item.status = 'completed';
        item.resourceId = platform_resource.id;
        item.versionId = platform_resource.latestVersion.id;
        
        showSuccess(`已成功恢复到本地状态`);
      ELSE
        showError(`平台资源与本地计划不一致，请人工审核`);
        abortWorkflow();
      END IF
    ELSE
      showInfo(`平台未找到对应资源，可以安全重试`);
      item.status = 'pending_for_retry';
    END IF
  ELSE IF user_action == 'abort' THEN
    abortWorkflow();
  END IF
END IF
```

---

### **Step4: 生成报告**

#### **报告 Schema**

```json
{
  "schemaVersion": "1",
  "runId": "RUN-20260903-abc123",
  "command": "import-dir",
  "env": "dev",
  "inputPath": "./assets",
  "inputFingerprint": "sha256:...",
  "configFingerprint": "sha256:...",
  "startTime": "2026-09-03T10:00:00Z",
  "endTime": "2026-09-03T10:05:30Z",
  "statistics": {
    "total": 25,
    "passed": 18,
    "skipped": 4,
    "failed": 2,
    "waived": 1
  },
  "items": [
    {
      "idempotencyKey": "KEY-abc123...",
      "filePath": "./assets/theme-a.zip",
      "status": "passed",
      "resourceId": "FL-20260903-xxx",
      "versionId": "V-20260903-xxx",
      "errorMessage": null
    },
    {
      "idempotencyKey": "KEY-def456...",
      "status": "failed",
      "failureReason": "FILE_TOO_LARGE",
      "errorMessage": "文件大小超过 100MB 限制"
    }
  ],
  "actor": "liu-kai-github",
  "cleanedUp": false
}
```

#### **TTY 进度展示**

```bash
┌─ Step4/4: 生成报告 ─────────────────┐
│                                      │
│ 📊 批量发布完成                       │
│                                      │
│ ✅ 成功：18 个                        │
│ ⏭️ 跳过：4 个 (已存在/无效)           │
│ ❌ 失败：2 个                         │
│ ⏸️ 待定：1 个 (需对账)                │
│                                      │
│ 📄 详细报告已生成                     │
│   .freelog/reports/RUN-20260903.json │
│   .freelog/reports/latest.json       │
│                                      │
│ 💡 建议命令:                          │
│   • freelog resource import-dir --resume RUN-20260903  (恢复未完成项)
│   • freelog resource import-dir --retry RUN-20260903   (只重试失败项)
│                                      │
│ [退出] ENTER                         │
└──────────────────────────────────────┘
```

---

## ⚠️ **七、异常处理矩阵**

| Step | 错误场景 | Error Code | 用户友好消息 | Recovery Action |
|------|---------|------------|-------------|-----------------|
| **Step1** | Directory Not Found | ERR_DIR_NOT_FOUND | "输入目录不存在" | Change input path |
| | Permission Denied | EACCES | "没有权限读取目录" | Fix permissions |
| **Step2** | File Too Large | ERR_FILE_TOO_LARGE | "文件大小超过 100MB" | Compress or remove |
| | Invalid File Type | ERR_INVALID_TYPE | "不支持的文件格式" | Convert to supported format |
| **Step3** | Batch API Unavailable | ERR_BATCH_UNSUPPORTED | "当前环境不支持批量创建" | Fallback to individual creation |
| | Remote Outcome Unknown | ERR_REMOTE_UNKNOWN | "远程写结果不确定，需对账" | Manual verification required |
| | Duplicate AuthID | ERR_DUPLICATE_AUTH | "授权名已被占用" | Skip or use unique name |
| **Step4** | Report Write Failed | ERR_REPORT_WRITE | "报告写入失败" | Check disk space and permissions |

---

## 🧪 **八、验收测试用例**

| Case ID | 测试场景 | 预期结果 | 对应 Step |
|---------|---------|---------|---------|
| H0-T1 | 正常批量创建 | 100 条分批处理，checkpoint 正确保存 | Step3-A |
| H0-T2 | 幂等性验证 | 已存在资源跳过创建而非报错 | Step3-B |
| H0-T3 | remote_outcome_unknown | 停止自动重试，提供对账指引 | Step3-B-Fallback |
| H0-T4 | 报告生成完整性 | JSON schema 正确，statistics 准确 | Step4 |
| H0-T5 | --resume / --retry | 从 checkpoint 恢复或只重试失败项 | Step4-Suggestions |

---

**📌 使用说明**: 本文档指导开发者实现批量发布功能，需特别注意幂等键生成和 remote_outcome_unknown 的对账机制。
