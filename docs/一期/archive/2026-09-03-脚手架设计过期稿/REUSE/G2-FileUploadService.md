# REUSE/G2 - 文件上传服务设计

> **版本**: v1.0 | **最后更新**: 2026-09-03

---

## 📋 **一、服务目标**

为 PHASE 提供统一的文件上传抽象，屏蔽单片/分片模式差异和断点续传细节。

### **1.1 核心职责**

```
┌──────────────────────────────────────┐
│   G2-UPLOAD Service                   │
│   ──────────────────                  │
│   · 自动检测文件大小并选择模式        │
│   · 单片/分片统一接口                 │
│   · 断点续传集成（依赖 G3-CHECKPOINT）  │
│   · TTY 进度条 / NDJSON事件流            │
│   · 网络异常自动重试                    │
└──────────────────────────────────────┘
           ↓ 调用
┌──────────────────────────────────────┐
│   tools-lib File API                  │
│   (平台文件上传接口)                   │
└──────────────────────────────────────┘
```

---

## 🔧 **二、接口契约**

### **2.1 主要方法签名**

| 方法名 | 参数 | 返回值 | 说明 |
|--------|------|--------|------|
| `uploadFile()` | `config: UploadConfig` | `{fileId: string, url: string}` | 统一上传入口 |
| `detectUploadMode()` | `size: number` | `'single' \| 'multi'` | >50MB 返回 multi |
| `uploadChunk()` | `chunkData: Chunk` | `{chunkIndex: number}` | 分片上传子方法 |
| `mergeChunks()` | `fileId: string, chunkCount: number` | `{mergedUrl: string}` | 合并分片 |

### **2.2 UploadConfig 结构**

```yaml
token: string                # 鉴权 token
filePath: string             # 本地文件路径
headers:                     # 自定义请求头
  file-sha1: string          # SHA1 校验值
  file-size: number          # 字节大小
  content-type: string       # MIME 类型
mode: single|multi           # 上传模式
onProgress: function         # 进度回调
checkpointKey: string        # Checkpoint 标识
```

---

## 📊 **三、TTY 进度展示**

### **3.1 ASCII Diagram 示例**

```bash
$ freelog publish

┌─ Step2/5: 压缩并上传资源包 ───────────┐
│                                        │
│ ⬆️ 开始上传 → G2-UPLOAD                  │
│                                        │
│ 📁 artifact.zip                        │
│   Size:    5,456,789 bytes             │
│   SHA1:    a1b2c3d...e4f5g             │
│   Mode:    chunked (5 chunks)          │
│                                        │
│ ████████████░░░░░░ 65%                │
│                                        │
│ Speed:     2.5 MB/s                    │
│ Time left: 12s                         │
│ Progress:  chunk 3 of 5                │
│                                        │
│ [Cancel] Ctrl+C                        │
└────────────────────────────────────────┘
```

### **3.2 NDJSON Event Stream**

```json
{"schemaVersion":1,"command":"upload","seq":1,"event":"start","data":{"fileId":"pending","path":"artifact.zip"}}
{"schemaVersion":1,"command":"upload","seq":2,"event":"progress","data":{"loaded":3545678,"total":5456789,"percentage":65,"speed":2500000}}
{"schemaVersion":1,"command":"upload","seq":3,"event":"chunk_complete","data":{"chunkIndex":3,"totalChunks":5}}
{"schemaVersion":1,"command":"upload","seq":4,"event":"complete","data":{"fileId":"FL-20260903-abc123","url":"https://cdn.freelog.dev/file_xyz789"}}
```

---

## 🔗 **四、与 G3-CHECKPOINT 集成**

### **4.1 Checkpoint 保存策略**

```
伪代码：
# 上传前初始化 checkpoint
checkpoint_key = `F0-Step2-upload-${workflowId}`
initial_state = {
  phase: 'init',
  metadata: {
    filePath: config.filePath,
    fileSize: config.headers['file-size'],
    sha1: config.headers['file-sha1'],
    uploadMode: detected_mode,
    totalChunks: calculated_chunks
  },
  currentChunk: 0,
  percentage: 0
}
G3.saveCheckpoint(checkpoint_key, initial_state)

# 每个分片完成后更新进度
WHILE currentChunk < totalChunks DO
  result = uploadSingleChunk(chunkData)
  
  IF success THEN
    update_progress(currentChunk, totalChunks)
    
    new_state = {
      ...current_state,
      phase: 'uploading',
      currentChunk: currentChunk + 1,
      percentage: ((currentChunk + 1) / totalChunks) * 100
    }
    
    G3.saveCheckpoint(checkpoint_key, new_state)
    currentChunk++
  ELSE IF network_error THEN
    resumeFromCheckpoint(checkpoint_key)
  ELSE IF permanent_error THEN
    G3.clearCheckpoint(checkpoint_key)
    throwError(ERR_UPLOAD_FAILED)
  END IF
END WHILE

# 上传成功清理 checkpoint
G3.clearCheckpoint(checkpoint_key)
```

### **4.2 恢复逻辑**

```
IF resumeFromCheckpoint(checkpoint_key) THEN
  recovered_state = G3.restoreCheckpoint(checkpoint_key)
  
  showInfo(`检测到未完成的上传，将从第 ${recovered_state.currentChunk + 1}个分片继续`)
  
  user_confirm = promptUser("是否继续？(Y/n)")
  
  IF user_confirms THEN
    currentChunk = recovered_state.currentChunk
    continueUpload()
  ELSE
    cancelUpload()
    G3.clearCheckpoint(checkpoint_key)
  END IF
END IF
```

---

## ⚠️ **五、异常处理矩阵**

| 错误场景 | HTTP Code | Error Code | 用户友好消息 | Recovery Action | Auto Retry? |
|---------|-----------|------------|-------------|-----------------|-------------|
| Network Timeout | 408 | G2-202 | "网络连接超时，请检查网络后重试" | Retry with exponential backoff | ✅ Yes (3x) |
| Chunk Upload Failed | 400 | G2-203 | "分片上传失败，请稍后重试" | Resume from last chunk | ✅ Yes (resume) |
| Merge Failed | 500 | G2-204 | "分片合并失败，请重新上传" | Abort and retry from start | ❌ No |
| Disk Space Full | ENOSPC | G2-205 | "磁盘空间不足，请释放空间后重试" | Abort workflow | ❌ No |
| Invalid Checksum | 400 | G2-206 | "文件校验失败，服务端收到内容与本地计算不符" | Recalculate SHA1 and re-upload | ✅ Yes |
| Authentication Expired | 401 | G2-207 | "登录已过期，请重新登录" | Run freelog login and retry | ❌ No (manual) |
| Server Error | 500/502/503 | G2-208 | "服务器错误，请稍后重试" | Exponential backoff retry | ✅ Yes (3x) |

---

## 🧪 **六、验收测试用例**

| Case ID | 测试场景 | 预期结果 | 对应功能 |
|---------|---------|---------|---------|
| G2-T1 | 小文件 (<10MB) 单片上传 | 直接上传成功，无分片逻辑 | 3.1 Single Mode |
| G2-T2 | 大文件 (>50MB) 自动分片 | chunkCount 正确计算，并行上传 | 3.2 Multi Mode |
| G2-T3 | Ctrl+C中断上传 | Checkpoint保存成功，可恢复 | 4.1 Checkpoint Save |
| G2-T4 | 网络中断后恢复 | 从断点继续而非重传全部 | 4.2 Resume Logic |
| G2-T5 | 分片哈希不匹配 | 报错 ERR_CHECKSUM_MISMATCH | 5. Exception Handling |

---

## 🔗 **七、交叉引用**

- **被 PHASE/F0 引用**: Step2 文件上传流程
- **依赖 G3-CHECKPOINT**: 断点续传机制
- **对齐 Platform API**: Console /storages/upload endpoint

---

**📌 使用说明**: 本文档指导开发者实现统一的文件上传服务，PHASE 层无需关心具体上传细节。
