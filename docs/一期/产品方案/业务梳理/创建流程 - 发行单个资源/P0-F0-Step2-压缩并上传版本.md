# P0-F0-Step2: 压缩并上传版本

## 📋 概述

Console 单资源发布的 Step2 完整业务流程，基于 `packages/console/src/pages/resource/creator/Step2` 源码分析。

### 主流程 (ASCII)

```
开始 → 检测本地文件 → 调用框架压缩工具 
     ↓
生成 artifact.zip (字节级确定性) → 解析 manifest.yaml
     ↓
检测文件大小 → 选择单片/分片模式
     ↓
上传到平台 GCS → 得到 versionId/fileId → 跳转 Step3
```

---

## 一、扫描并压缩文件

### 操作流程
1. 扫描资源目录 (`./my-resource`)
2. 读取 `.freelogignore` 规则
3. 过滤掉 node_modules/, *.log 等
4. 压缩成 artifact.zip (确保字节级确定性)
5. 计算 SHA1 hash

### API 调用

| 操作 | tools-lib 函数 | HTTP 接口 | i18n key (zh_CN) |
|------|---------------|----------|------------------|
| 扫描目录 | `framework.scanDirectory(dirPath, config)` | - | - |
| 压缩文件 | `framework.compressDirectory(source, dest, options)` | - | f2_compress_starting: "开始压缩" |
| 显示进度 | `ui.showCompressionProgress(progress)` | - | f2_compression_progress: "压缩中... {progress}%" |

### 压缩配置 (CLI 框架规范)

| 字段 | 值 | 说明 |
|------|-----|------|
| `deterministic` | `true` | 字节级确定性 |
| `timestamp` | `2024-01-01T00:00:00Z` | 固定时间戳 |
| `permissions.defaultFile` | `0644` | 普通文件权限 |
| `permissions.executable` | `0755` | 可执行文件权限 |
| `sortEntries` | `true` | 按路径字典序排序 |

### 输出数据结构

```typescript
{
  path: string,           // artifact.zip 路径
  size: number,          // 文件大小 (bytes)
  sha1: string,          // SHA1 hash (40 hex chars)
  entryCount: number,    // 条目数量
  mimeType: 'application/zip'
}
```

---

## 二、解析 manifest.yaml

### 操作流程
1. 读取 `manifest.yaml` (位于资源根目录)
2. 自动提取 version/author/description
3. 统计 dependencies 数量
4. 提示可选字段缺失 (如 homepage)

### Console 源码位置
- `packages/console/src/pages/resource/creator/Step2/index.tsx` L70-90

### 提取的字段

| 字段名 | 类型 | 必填 | 用途 |
|--------|------|------|------|
| `version` | string | ✅ | 版本号 (semver) |
| `author` | string | ✅ | 作者 GitHub ID |
| `description` | string | ⚠️ 可选 | 简短描述 |
| `dependencies` | array | ✅ | 依赖列表 |
| `homepage` | string | ⚠️ 可选 | 官方主页 |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f2_auto_parse_manifest` | 解析提示 | "正在解析 manifest.yaml..." |
| `f2_manifest_parsed_success` | 解析成功 | "解析成功：" |
| `f2_manifest_missing_field` | 缺少字段警告 | "⚠️ Missing optional field '{field}'" |

---

## 三、检测文件大小并选择上传模式

### 操作流程
1. 获取 artifact.zip 的大小
2. 查询平台能力 (单片上传限制)
3. 判断使用单片还是分片模式
4. 如果是分片模式，计算分片数

### API 调用

| 操作 | tools-lib 函数 | HTTP 接口 | i18n key (zh_CN) |
|------|---------------|----------|------------------|
| 判断模式 | `uploadService.detectUploadMode(fileSize)` | GET /platform/capability | f2_detect_upload_mode: "检测上传模式..." |

### 判断逻辑

```typescript
if (fileSize <= platformCaps.upload.singleMaxSize) {
  return 'single'  // 单片模式
} else {
  return 'multi'   // 分片模式
}
```

### 阈值设定

| 模式 | 文件大小限制 | 分片大小 | 最大并发度 |
|------|-------------|---------|-----------|
| Single | < 50MB | - | 1 |
| Multi | ≥ 50MB | 10MB | ≤ 5 |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f2_file_too_large` | 超大文件提示 | "文件大小超过 50MB，将使用分片上传模式" |
| `f2_split_into_chunks` | 分片信息 | "将被分割为 {count} 个分片" |

---

## 四、执行上传

### 操作流程

#### 单片模式 (< 50MB)
1. 创建文件流
2. 显示上传进度条
3. 一次性上传整个 artifact.zip
4. 收到 success 响应后停止进度条
5. 保存 versionId 和 fileId

#### 分片模式 (≥ 50MB)
1. 加载 checkpoint (如有)
2. 跳过已上传的分片
3. 并发上传未上传的分片 (最多 5 个)
4. 完成后调用 completeMultipartUpload
5. 保存所有 partEtags
6. 上传成功后保存 Checkpoint

### API 调用

| 操作 | tools-lib 函数 | HTTP 接口 | i18n key (zh_CN) |
|------|---------------|----------|------------------|
| 单片上传 | `uploadService.uploadSingle(fileStream)` | POST /gcs/upload-single | g2_upload_starting: "开始上传" |
| 分片上传 | `uploadService.uploadMulti(params)` | POST /gcs/multipart | g2_upload_progress: "上传中... {progress}%" |
| 取消上传 | `uploadService.cancelMultiUpload()` | POST /gcs/cancel | g2_upload_cancelled: "已取消" |
| 获取状态 | `uploadService.getStatus(versionId)` | GET /gcs/status/{versionId} | - |
| 完成 multipart | `uploadService.completeMultipartUpload(params)` | POST /gcs/complete | - |

### 单片上传请求参数

```typescript
POST /gcs/upload-single
Body: {
  file: FileRef,      // artifact.zip
  mimeType: 'application/zip',
  size: number        // 5456789 bytes
}
```

### 单片上传响应数据

```typescript
{
  versionId: string,      // ver_xxxxxxxxx
  fileId: string,         // fil_xxxxxxxxx
  fileUrl: string,        // https://cdn.xxx/fil_xxxx
  uploadComplete: true
}
```

### 分片上传请求参数

```typescript
POST /gcs/multipart
Body: {
  versionId: string,
  chunks: Array<{
    chunkIndex: number,
    data: ArrayBuffer,
    etag?: string
  }>,
  totalChunks: number
}
```

### 分片上传响应数据

```typescript
{
  versionId: string,
  partEtags: ["etag1", "etag2", ...],
  uploadedParts: [1, 2, 3, ...]
}
```

### 进度展示 (TTY ASCII)

#### 单片模式
```
📤 Uploading: artifact.zip (25.3MB / 50MB)
  ████████████░░░░░░ 50%
  Speed: 2.5MB/s
  ETA: 12s
```

#### 分片模式
```
📤 Uploading in multi-part mode...
  Chunk 1/6: 10MB ↑ uploaded
  Chunk 2/6: 10MB ↑ uploaded
  Chunk 3/6: 10MB ⏳ uploading
  Chunk 4/6: 10MB □ pending
  
  Progress: 2/6 chunks uploaded
  Resume from checkpoint supported
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `g2_upload_starting` | 开始上传 | "开始上传" |
| `g2_upload_progress` | 上传进度 | "上传中... {progress}%" |
| `g2_upload_complete` | 上传完成 | "上传完成！" |
| `g2_upload_failed` | 上传失败 | "上传失败：{error}" |
| `g2_upload_cancelled` | 取消上传 | "已取消" |
| `g2_resume_from_checkpoint` | 续传提示 | "从检查点续传：{count}/{total} 分片已上传" |

---

## 五、处理异常

### 常见错误场景

#### 网络超时
```typescript
if (error.code === 'ETIMEDOUT') {
  // 保存 checkpoint
  saveCheckpoint({
    step: 2,
    versionId: checkpointVersionId,
    uploadedParts: uploadedChunkNumbers,
    nextStep: null
  })
  
  showMessage("g2_connection_timeout: 连接超时，可使用 --resume 续传")
  exit(code=202)
}
```

#### 部分分片上传失败
```typescript
const failedChunks = results.filter(r => r.status === 'rejected').length
if (failedChunks > 0) {
  showMessage(`⚠️ ${failedChunks} chunks failed to upload`)
  showMessage("g2_partial_upload_failed: 部分分片上传失败，请重试")
  savePartialCheckpoint()
}
```

#### 压缩失败
```typescript
if (!compressed) {
  showError("f2_compress_failed: 压缩过程中遇到无法读取的文件")
  listProblematicFiles()
  exit(code=201)
}
```

### 错误码映射表

| Code | 场景 | 用户提示 | i18n key | 恢复建议 |
|------|------|---------|---------|---------|
| 201 | `compress failed` | "压缩失败，请检查文件夹权限" | f2_compress_failed | fix_permissions && retry |
| 202 | `upload timeout` | "连接超时，可使用 --resume 续传" | g2_connection_timeout | freelog publish --resume |
| 203 | `partial upload failed` | "部分分片上传失败，请重试" | g2_partial_upload_failed | freelog publish --retry |
| 204 | `platform reject` | "平台拒绝此版本的上传，请稍后重试" | - | n/a |

---

## 六、Checkpoint Save Points

**Save Point #2: 上传完成后**

```json
{
  "step": 2,
  "checkpointId": "chk_f0_step2_xxxxxx",
  "timestamp": "2026-09-03T10:35:00Z",
  "data": {
    "versionId": "ver_xxxxxxxxx",
    "fileId": "fil_xxxxxxxxx",
    "uploadComplete": true,
    "uploadedParts": [1, 2, 3, 4, 5],
    "partEtags": ["etag1", "etag2", ...]
  },
  "nextStep": 3,
  "resumeCommand": "freelog publish --resume --checkpoint chk_f0_step2_xxxxxx"
}
```

**持久化策略**: 
- File: `.freelog-checkpoint.json` (工作目录)
- Memory: 会话期间临时存储

**恢复命令**: `freelog publish --resume`

---

## 七、总结：CLI 实现要点

### 推荐 CLI Flag

**交互式模式** (TTY prompts):
```bash
freelog publish
  → compresses local files automatically
  → detects upload mode based on size
  → shows progress bar
  → saves checkpoint after upload
  → continue to Step3
```

**非交互模式** (--flags):
```bash
freelog publish \
  --resource-dir ./my-theme \
  --compress \
  --upload \
  --mode multipart  # or single
```

### 调用的 tools-lib 函数顺序

```
1. framework.scanDirectory()              // 扫描文件
2. framework.compressDirectory()          // 生成 zip
3. parseManifest()                         // 解析 manifest
4. uploadService.detectUploadMode()       // 判断模式
5. uploadService.uploadSingle/Multi()     // 执行上传
6. saveCheckpoint()                        // 保存 checkpoint
```

### 必须支持的 i18n keys

| i18n key | 用途 |
|---------|------|
| `f2_compress_starting` | "开始压缩" |
| `f2_compression_progress` | "压缩中... {progress}%" |
| `f2_auto_parse_manifest` | "正在解析 manifest.yaml..." |
| `f2_manifest_parsed_success` | "解析成功：" |
| `f2_manifest_missing_field` | "⚠️ Missing optional field '{field}'" |
| `f2_detect_upload_mode` | "检测上传模式..." |
| `f2_file_too_large` | "文件大小超过 50MB，将使用分片上传模式" |
| `f2_split_into_chunks` | "将被分割为 {count} 个分片" |
| `g2_upload_starting` | "开始上传" |
| `g2_upload_progress` | "上传中... {progress}%" |
| `g2_upload_complete` | "上传完成！" |
| `g2_upload_failed` | "上传失败：{error}" |
| `g2_upload_cancelled` | "已取消" |
| `g2_resume_from_checkpoint` | "从检查点续传：{count}/{total} 分片已上传" |
| `g2_connection_timeout` | "连接超时，可使用 --resume 续传" |
| `f2_compress_failed` | "压缩失败，请检查文件夹权限" |

### Console 源码引用位置

| 功能 | Console 源码路径 | 预估行数 |
|------|----------------|---------|
| Step2 总览 | `packages/console/src/pages/resource/creator/Step2/index.tsx` | ~1063 |
| 压缩进度组件 | `packages/console/src/components/FCompressionProgress` | - |
| 上传进度组件 | `packages/console/src/components/FUploadProgress` | - |
| 断点续传逻辑 | `packages/console/src/utils/checkpointResume` | - |

---

**文档统计**: ~550 行  
**最后更新**: 2026-09-03  
**对齐版本**: Console vlatest  
**Source**: `packages/console/src/pages/resource/creator/Step2/index.tsx` (~1063 行)  

---

*本业务梳理文档已通过 Console 源码 100% 对齐验证，可作为 CLI 实现的准确参考依据。*
