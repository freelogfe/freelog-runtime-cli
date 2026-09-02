# G2 - 文件上传服务模块设计规范

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **复用场景**: F0, M0, C0 (所有需要上传的场景)

---

## 📋 **一、模块能力清单**

### **1.1 核心功能分解**

| 功能 ID | 功能名称 | 功能描述 | 触发条件 | 返回数据 |
|--------|---------|---------|---------|---------|
| G2-F1 | 文件大小检测 | 自动检测文件尺寸并分类 | upload() 调用前 | fileSize, mode |
| G2-F2 | 单片上传模式 | ≤10MB 直接上传 | fileSize <= 10MB | {fileId, url} |
| G2-F3 | 分片上传模式 | >10MB 分片并发上传 | fileSize > 10MB | {fileId, url} |
| G2-F4 | SHA1 计算 | 客户端计算文件 SHA1 hash | upload() 调用前 | fileSha1 |
| G2-F5 | 进度回调 | 实时进度条显示 | upload() 进行中 | {loaded, total, percentage} |
| G2-F6 | 自动重试 | 网络异常时指数退避重试 | retryable errors | N/A |
| G2-F7 | Chunk 去重 | 基于 SHA1 的重复文件优化 | same file detected | Save bandwidth |

### **1.2 与业务梳理的对齐关系**

| PHASE Step | 调用的 G2 功能 | Console Source Reference |
|-----------|-------------|-------------------------|
| F0-Step2 | G2-F1, G2-F2/F3, G2-F4, G2-F6 | creator/Step2 L1-300 |
| F0-Step4 | G2-F1, G2-F2, G2-F4, G2-F7 | creator/Step4 cover upload |
| M0-Step2 | G2-F1, G2-F3, G2-F4, G2-F6 | versionCreator file upload |

---

## 🔧 **二、API 接口定义 (TypeScript Interface Only)**

### **2.1 Upload Config Interface**

```typescript
// ONLY INTERFACE DEFINITION - NO IMPLEMENTATION
interface UploadConfig {
  // Required fields
  token: string;                          // API 认证 Token
  path: StorageUploadPath;               // 存储路径
  
  // Optional fields
  maxRetries?: number;                   // 最大重试次数 (default: 3)
  chunkSize?: number;                    // 分片大小 bytes (default: 5*1024*1024)
  maxConcurrency?: number;               // 并发度 (default: 5)
  
  // Callbacks
  onProgress?: (progressEvent: ProgressEvent) => void;
  
  // Headers to include
  headers?: {
    'file-sha1'?: string;                // 用于去重检测
    'file-size'?: number;                // 文件大小
    'content-type'?: string;             // MIME type
  };
}

// Progress Event Structure
interface ProgressEvent {
  loaded: number;                        // 已上传字节数
  total: number;                         // 总字节数
  percentage: number;                    // 进度百分比 (0-100)
  speed: number;                         // 当前速度 bytes/s
  estimatedRemainingTime: number;        // 预计剩余时间 seconds
}

// Upload Result Structure
interface UploadResult {
  fileId: string;                        // 服务器分配的文件 ID
  fileName: string;                      // 原始文件名
  fileSize: number;                      // 文件大小 bytes
  fileSha1: string;                      // 文件 SHA1 hash
  url: string;                           // CDN 访问 URL
  uploadMode: 'single' | 'chunked';     // 上传模式
  uploadTime: number;                    // 上传耗时 ms
}
```

### **2.2 API Error Codes (from tools-lib)**

| HTTP Code | Error Code | Message | Retryable? |
|-----------|------------|---------|------------|
| 413 | ERR_FILE_TOO_LARGE | 文件大小超过限制 | ❌ No |
| 403 | ERR_UPLOAD_FAILED | 上传失败 | ✅ Yes (3x) |
| 500 | ERR_SERVER_ERROR | 服务器错误 | ✅ Yes (3x) |
| 504 | ERR_TIMEOUT | 请求超时 | ✅ Yes (3x) |

---

## 💡 **三、核心算法流程 (Pseudocode)**

### **3.1 Upload Mode Decision Algorithm**

```
IF config.filePath exists THEN
  fileStats = fs.statSync(config.filePath)
  fileSize = fileStats.size
  
  # Determine upload mode based on threshold
  SINGLE_UPLOAD_THRESHOLD = 10 * 1024 * 1024  # 10MB
  
  IF fileSize <= SINGLE_UPLOAD_THRESHOLD THEN
    uploadMode = 'single'
    displayInfo(`文件大小 ${formatBytes(fileSize)}，采用单片上传模式`)
    result = await uploadSingle(config)
  ELSE
    uploadMode = 'chunked'
    CHUNK_SIZE = config.chunkSize || 5 * 1024 * 1024  # 5MB per chunk
    chunkCount = Math.ceil(fileSize / CHUNK_SIZE)
    
    displayInfo(`文件大小 ${formatBytes(fileSize)}，采用分片上传 (${chunkCount} chunks)`)
    result = await uploadWithChunkStrategy(config, chunkCount)
  END IF
  
  RETURN result
ELSE
  throwError(ERR_FILE_NOT_FOUND, "文件不存在")
END IF
```

### **3.2 SHA1 Hash Calculation & Deduplication**

```
# Calculate SHA1 before upload
fileSha1 = calculateSHA1File(filePath)

# Include in request headers for server-side dedup check
headers = {
  'file-sha1': fileSha1,
  'file-size': fileSize,
  'content-type': mimeType
}

# If server responds with existing fileId → skip upload
IF response.hasExistingFile THEN
  useExistingFile(response.fileId, response.url)
  RETURN { reuse: true, ... }
END IF

# Otherwise proceed with normal upload
upload(headers)
```

### **3.3 Chunk-based Upload with Retry**

```
IF fileSize > THRESHOLD THEN
  chunks = splitFileIntoChunks(filePath, chunkSize)
  uploadedIndices = new Set()
  failedAttempts = {}
  
  FOR EACH chunkIndex FROM 0 TO chunkCount-1 DO
    semaphore.acquire()  # Limit concurrent uploads
    
    promise = async () => {
      WHILE failedAttempts[chunkIndex] < MAX_RETRIES DO
        try
          chunkData = readChunk(filePath, chunkIndex, chunkSize)
          
          response = await uploadChunk({
            chunkData,
            chunkIndex,
            fileSha1,
            headers
          })
          
          uploadedIndices.add(chunkIndex)
          updateProgressBar(chunkIndex, chunkCount)
          BREAK  # Success
          
        catch networkError THEN
          failedAttempts[chunkIndex]++
          delay = exponentialBackoff(failedAttempts[chunkIndex])
          sleep(delay)
        END TRY
      END WHILE
      
      IF failedAttempts[chunkIndex] >= MAX_RETRIES THEN
        throwError(ERR_UPLOAD_FAILED, `分片${chunkIndex}上传失败`)
      END IF
    }
    
    semaphore.release()
  END FOR
  
  # Merge all successful chunks
  mergeResponse = await mergeChunks({
    fileSha1,
    chunkIndices: [...uploadedIndices].sort()
  })
  
  RETURN {
    fileId: mergeResponse.fileId,
    uploadMode: 'chunked',
    ...
  }
END IF
```

---

## ⚠️ **四、异常处理策略**

### **4.1 Retry Logic (Exponential Backoff)**

```
retryOperation(operation, maxRetries = 3):
  attemptCount = 0
  
  WHILE attemptCount < maxRetries DO
    try
      result = await operation()
      RETURN result
    catch error THEN
      attemptCount++
      
      IF attemptCount < maxRetries AND error.retryable THEN
        delay = baseDelay * Math.pow(2, attemptCount)
        displayInfo(`将在 ${delay}ms 后重试... (${attemptCount}/${maxRetries})`)
        sleep(delay)
      ELSE
        THROW error
      END IF
    END TRY
  END WHILE
```

### **4.2 Network Interruption Recovery**

```
ON_NETWORK_LOSS():
  currentCheckpoint = {
    lastCompletedChunk: uploadedIndices.max(),
    startTime: uploadStartTime,
    totalChunks: chunkCount
  }
  
  saveToLocalDisk(currentCheckpoint)
  
  displayWarning("网络连接中断，已在本地保存进度")
  
  ON_NEXT_LAUNCH():
    checkpoint = loadFromDisk()
    
    IF checkpoint valid THEN
      resumeUpload({
        startFromChunk: checkpoint.lastCompletedChunk + 1,
        ...
      })
    END IF
```

---

## ✅ **五、验收标准**

### **5.1 Functional Test Cases**

| Test Case | File Size | Expected Behavior |
|----------|-----------|-------------------|
| G2-HAPPY-SINGLE | 5 MB | Single upload mode, complete upload |
| G2-HAPPY-CHUNKED | 15 MB | Chunked mode (3 chunks), complete upload |
| G2-HAPPY-DUPLICATE | Same as previous upload | Server returns existing fileId, no re-upload |
| G2-ERROR-TIMEOUT | Any size | Retry 3x with exponential backoff |
| G2-ERROR-NETWORK-LOSS | Large file | Pause and save progress, offer resume |

### **5.2 Performance Benchmarks**

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Single upload speed | ≥5 MB/s | Throughput test |
| Chunk concurrency | 5 parallel | Concurrent connections |
| Deduplication detection | <100ms | Response time |
| Resume recovery | <1s | Time to restore state |

---

## 🔗 **六、交叉引用**

| 引用位置 | 被调用的 G2 功能 | 用途 |
|---------|---------------|------|
| F0-Step2 | G2-F2/G2-F3 | 资源包上传 |
| F0-Step4 | G2-F1/G2-F2 | 封面图片上传 |
| M0-Step2 | G2-F3/G2-F6 | 新版本文件上传 |
| C0-Step2 | G2-F1-G2-F3 | RSS 封面上传 (可选) |

---

**📌 使用说明**: 本模块由 tools-lib 统一实现，PHASE 文档只需声明需求和约束，代码实现不在此重复定义。
