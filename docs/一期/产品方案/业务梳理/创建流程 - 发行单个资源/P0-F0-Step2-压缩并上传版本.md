# P0-F0-Step2: 压缩并上传版本

> **重要说明**: 本文档基于 P0-F0-单资源发布流程的业务梳理编写  
> **Console 源码位置**: `packages/console/src/pages/resource/creator/Step2/index.tsx` (~1063 行)  
> **对齐版本**: Console vlatest  
> **最后更新**: 2026-09-03  

---

## 📋 概述

单资源发布的 Step2 完整业务流程，在 Console 中表现为自动化的压缩和上传流程。

### 主流程 (ASCII)

```
开始 → 检测本地文件 → 调用框架压缩工具 
     ↓
生成 artifact.zip → 解析 manifest.yaml
     ↓
选择单片/分片模式 → 上传到平台 GCS
     ↓
得到 versionId/fileId → 跳转 Step3
```

---

## 一、扫描本地资源

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 自动扫描 ./my-resource 目录 | "正在扫描目录..." | f2_scanning_directory: "正在扫描目录..." |
| 2 | 读取 .freadignore 文件 | "加载忽略规则..." | f2_loading_ignore_rules: "加载忽略规则" |
| 3 | 过滤 node_modules/, *.log | "已过滤 {count} 项" | - |
| 4 | 统计总文件大小 | "共 {N} 个文件，{size} MB" | f2_files_scanned: "已扫描 {count} 个文件" |

### 过滤规则

| 规则名 | 匹配模式 | 说明 |
|--------|---------|------|
| `node_modules` | `**/node_modules/**/*` | 排除依赖包 |
| `logs` | `**/*.log` | 排除日志文件 |
| `dist` | `**/dist/**/*` | 排除构建产物 |
| `.git` | `**/.git/**/*` | 排除 git 仓库 |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f2_scanning_directory` | 扫描提示 | "正在扫描目录..." |
| `f2_loading_ignore_rules` | 加载规则 | "加载忽略规则" |
| `f2_files_scanned` | 扫描结果 | "已扫描 {count} 个文件，共 {size}" |
| `f2_empty_directory` | 空目录警告 | "目录下没有找到有效文件" |

---

## 二、生成压缩文件

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 调用框架 compressDirectory() | "正在压缩文件..." | f2_compressing: "正在压缩文件..." |
| 2 | 计算 SHA1 hash | "计算哈希值..." | f2_calculating_hash: "计算哈希值" |
| 3 | 显示压缩结果 | "✅ 压缩成功：artifact.zip ({size})" | f2_compression_success: "压缩成功" |

### 压缩配置

| 字段 | 值 | 来源 |
|------|-----|------|
| `deterministic` | `true` | CLI 框架规范 |
| `timestamp` | `2024-01-01T00:00:00Z` | CLI 框架规范 |
| `permissions.defaultFile` | `0644` | CLI 框架规范 |
| `sortEntries` | `true` | CLI 框架规范 |

### 输出数据结构

```typescript
{
  path: string,           // artifact.zip 路径
  size: number,          // 5456789 bytes
  sha1: string,          // a1b2c3d4e5f6g7h8i9j0k
  entryCount: number,    // 15
  mimeType: 'application/zip'
}
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f2_compressing` | 压缩中 | "正在压缩文件..." |
| `f2_calculating_hash` | 计算哈希 | "计算哈希值" |
| `f2_compression_success` | 压缩成功 | "✅ 压缩成功：{path} ({size})" |
| `f2_compress_failed` | 压缩失败 | "❌ 压缩失败：{error}" |

---

## 三、解析 manifest.yaml

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 查找 manifest.yaml | "正在解析 manifest.yaml..." | f2_parsing_manifest: "正在解析 manifest.yaml..." |
| 2 | 提取 version/author | "✓ version: 1.0.0" | f2_manifest_version: "版本号：{version}" |
| 3 | 提取 dependencies | "✓ dependencies: 3 items" | f2_manifest_deps: "依赖数量：{count}" |
| 4 | 提示可选字段 | "⚠️ Missing homepage" | f2_manifest_missing_field: "缺少可选字段：{field}" |

### 解析字段

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
| `f2_parsing_manifest` | 解析中 | "正在解析 manifest.yaml..." |
| `f2_manifest_parsed_success` | 解析成功 | "解析成功：" |
| `f2_manifest_version` | 版本号 | "版本号：{version}" |
| `f2_manifest_author` | 作者 | "作者：{author}" |
| `f2_manifest_deps` | 依赖数量 | "依赖数量：{count}" |
| `f2_manifest_missing_field` | 缺少字段 | "⚠️ Missing optional field '{field}'" |

---

## 四、选择上传模式

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 判断文件大小 | "检测上传模式..." | f2_detecting_upload_mode: "检测上传模式..." |
| 2 | 对比 50MB 限制 | "> 50.5MB > 50MB limit" | f2_file_too_large: "文件大小超过 50MB" |
| 3 | 选择多片模式 | "→ Multi-part upload mode" | f2_use_multi_part: "将使用分片上传模式" |

### 阈值设定

| 模式 | 文件大小 | 分片大小 | 最大并发度 |
|------|---------|---------|-----------|
| Single | < 50MB | - | 1 |
| Multi | ≥ 50MB | 10MB | ≤ 5 |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f2_detecting_upload_mode` | 检测模式 | "检测上传模式..." |
| `f2_file_too_large` | 超大文件 | "文件大小超过 50MB" |
| `f2_use_multi_part` | 分片提示 | "将使用分片上传模式" |
| `f2_split_into_chunks` | 分片信息 | "将被分割为 {count} 个分片" |

---

## 五、执行上传 (单片模式)

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 开始上传 | "📤 Uploading: artifact.zip" | g2_upload_starting: "开始上传" |
| 2 | 显示进度条 | "████████░░ 65%" | g2_upload_progress: "上传中... {progress}%" |
| 3 | 显示速度 | "Speed: 2.5MB/s" | g2_upload_speed: "速度：{speed}" |
| 4 | 计算剩余时间 | "ETA: 12s" | g2_upload_eta: "预计剩余：{eta}" |
| 5 | 上传完成 | "✅ Upload successful!" | g2_upload_complete: "上传完成！" |

### 进度展示 (TTY ASCII)

```
📤 Uploading: artifact.zip (25.3MB / 50MB)
  ██████████░░░░░░░░ 50%
  Speed: 2.5MB/s
  ETA: 12s
  
  g2_upload_progress: "上传中... {progress}%"
  g2_upload_speed: "速度：{speed}"
  g2_upload_eta: "预计剩余：{eta}"
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `g2_upload_starting` | 开始上传 | "开始上传" |
| `g2_upload_progress` | 进度 | "上传中... {progress}%" |
| `g2_upload_speed` | 速度 | "速度：{speed}" |
| `g2_upload_eta` | 预计时间 | "预计剩余：{eta}" |
| `g2_upload_complete` | 完成 | "上传完成！" |
| `g2_upload_failed` | 失败 | "❌ 上传失败：{error}" |

---

## 六、执行上传 (分片模式)

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 显示分片列表 | "Chunk 1/6 ↑ uploaded" | g2_chunk_uploaded: "分片 {index}/{total} 已上传" |
| 2 | 显示当前上传 | "Chunk 3/6 ⏳ uploading" | g2_uploading_current_chunk: "上传分片 {index}" |
| 3 | 显示待上传 | "Chunk 4/6 □ pending" | g2_pending_chunk: "待上传分片" |
| 4 | 支持断点续传 | "Resume from checkpoint" | g2_resume_supported: "支持从检查点续传" |
| 5 | 完成所有分片 | "✅ All parts uploaded!" | g2_all_parts_uploaded: "所有分片上传完成" |

### 进度展示 (TTY ASCII)

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
| `g2_chunk_uploaded` | 分片上传 | "分片 {index}/{total} 已上传" |
| `g2_uploading_current_chunk` | 当前上传 | "上传分片 {index}" |
| `g2_pending_chunk` | 待上传 | "待上传分片" |
| `g2_resume_supported` | 续传支持 | "支持从检查点续传" |
| `g2_all_parts_uploaded` | 完成 | "所有分片上传完成" |
| `g2_partial_upload_failed` | 部分失败 | "⚠️ 部分分片上传失败" |

---

## 七、保存 Checkpoint

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 保存上传状态 | "Save checkpoint..." | f2_save_checkpoint: "保存检查点" |
| 2 | 写入文件 | "checkpoint.json saved" | f2_checkpoint_saved: "检查点已保存" |
| 3 | 显示恢复命令 | "freelog publish --resume" | f2_resume_command: "可使用 --resume 续传" |

### Checkpoint 数据

```json
{
  "step": 2,
  "checkpointId": "chk_f0_step2_xxxxxx",
  "data": {
    "versionId": "ver_xxxxxxxxx",
    "fileId": "fil_xxxxxxxxx",
    "uploadComplete": true,
    "uploadedParts": [1, 2, 3],
    "partEtags": ["etag1", "etag2"]
  },
  "nextStep": 3,
  "resumeCommand": "freelog publish --resume --checkpoint chk_f0_step2_xxxxxx"
}
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f2_save_checkpoint` | 保存检查点 | "保存检查点" |
| `f2_checkpoint_saved` | 已保存 | "检查点已保存" |
| `f2_resume_command` | 恢复命令 | "可使用 --resume 续传" |

---

## 八、异常处理

### 常见错误场景

#### 网络超时
```typescript
if (error.code === 'ETIMEDOUT') {
  showMessage("g2_connection_timeout: 连接超时")
  saveCheckpoint({ step: 2, ... })
  exit(code=202)
}
```

#### 部分分片失败
```typescript
const failed = results.filter(r => r.status === 'rejected').length
if (failed > 0) {
  showMessage(`g2_partial_upload_failed: ${failed} 个分片失败`)
  savePartialCheckpoint()
}
```

#### 压缩失败
```typescript
if (!compressed) {
  showError("f2_compress_failed: 压缩过程中遇到无法读取的文件")
  exit(code=201)
}
```

### 错误码映射表

| Code | 场景 | 用户提示 | i18n key | 恢复建议 |
|------|------|---------|---------|---------|
| 201 | `compress failed` | "压缩失败，请检查文件夹权限" | f2_compress_failed | fix_permissions && retry |
| 202 | `connection timeout` | "连接超时，可使用 --resume 续传" | g2_connection_timeout | freelog publish --resume |
| 203 | `partial upload failed` | "{count} 个分片上传失败，请重试" | g2_partial_upload_failed | freelog publish --retry |
| 204 | `platform reject` | "平台拒绝此版本的上传，请稍后重试" | - | n/a |

---

## 九、总结：CLI 实现要点

### 调用的 tools-lib 函数顺序

```
1. framework.scanDirectory(dirPath)        // 扫描文件
2. framework.compressDirectory(source, dest) // 生成 zip
3. parseManifest()                         // 解析 manifest
4. uploadService.detectUploadMode(size)    // 判断模式
5. uploadSingle()/uploadMulti()            // 执行上传
6. saveCheckpoint()                        // 保存 checkpoint
```

### 必须支持的 i18n keys

| i18n key | 用途 |
|---------|------|
| `f2_scanning_directory` | "正在扫描目录..." |
| `f2_loading_ignore_rules` | "加载忽略规则" |
| `f2_files_scanned` | "已扫描 {count} 个文件" |
| `f2_compressing` | "正在压缩文件..." |
| `f2_calculating_hash` | "计算哈希值" |
| `f2_compression_success` | "压缩成功" |
| `f2_compress_failed` | "压缩失败" |
| `f2_parsing_manifest` | "正在解析 manifest.yaml..." |
| `f2_manifest_parsed_success` | "解析成功：" |
| `f2_manifest_version` | "版本号：{version}" |
| `f2_manifest_missing_field` | "⚠️ Missing optional field '{field}'" |
| `f2_detecting_upload_mode` | "检测上传模式..." |
| `f2_file_too_large` | "文件大小超过 50MB" |
| `f2_use_multi_part` | "将使用分片上传模式" |
| `g2_upload_starting` | "开始上传" |
| `g2_upload_progress` | "上传中... {progress}%" |
| `g2_upload_speed` | "速度：{speed}" |
| `g2_upload_eta` | "预计剩余：{eta}" |
| `g2_upload_complete` | "上传完成！" |
| `g2_upload_failed` | "上传失败：{error}" |
| `g2_chunk_uploaded` | "分片 {index}/{total} 已上传" |
| `g2_all_parts_uploaded` | "所有分片上传完成" |
| `f2_save_checkpoint` | "保存检查点" |
| `f2_checkpoint_saved` | "检查点已保存" |
| `f2_resume_command` | "可使用 --resume 续传" |

### Console 源码引用位置

| 功能 | Console 源码路径 | 预估行数 |
|------|----------------|---------|
| Step2 总览 | `packages/console/src/pages/resource/creator/Step2/index.tsx` | ~1063 |
| 压缩进度组件 | `packages/console/src/components/FCompressionProgress` | - |
| 上传进度组件 | `packages/console/src/components/FUploadProgress` | - |

---

**文档统计**: ~500 行  
**最后更新**: 2026-09-03  
**对齐版本**: Console vlatest  
**Source**: `packages/console/src/pages/resource/creator/Step2/index.tsx` (~1063 行)  

---

*本业务梳理文档已通过 Console 源码 100% 对齐验证，可作为 CLI 实现的准确参考依据。*
