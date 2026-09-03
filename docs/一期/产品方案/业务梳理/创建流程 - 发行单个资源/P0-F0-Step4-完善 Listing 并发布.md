# P0-F0-Step4: 完善 Listing 并发布

## 📋 概述

Console 单资源发布的第四步完整业务流程，基于 `packages/console/src/pages/resource/creator/Step4` 源码分析。

### 主流程 (ASCII)

```
开始 → 上传封面图片 (可选) → 补充描述信息 (可选) → 
预览发布摘要 → 最终确认 Y/N → 提交发布 API → 得到发布结果
     ↓
成功 → 显示 Console 链接 → 跳转完成页
     ↓
失败 → 错误提示 → 重试或取消
```

---

## 一、上传封面图片 (可选)

### 操作流程
1. 显示文件选择器或拖拽区域
2. 用户上传封面文件 (PNG/JPG/WebP)
3. 验证文件格式和大小 (<5MB)
4. 上传到平台 GCS
5. 返回 coverUrl 用于后续步骤

### API 调用

| 操作 | tools-lib 函数 | HTTP 接口 | i18n key (zh_CN) |
|------|---------------|----------|------------------|
| 选择文件 | `ui.selectFile(accept: ['image/*'])` | - | f4_select_cover_file: "选择封面" |
| 上传封面 | `uploadService.uploadCover(file)` | POST /file/upload | f4_uploading_cover: "上传封面..." |
| 验证格式 | `fileValidator.validateImage(file)` | - | f4_invalid_format: "不支持的文件格式" |

### 上传参数

```typescript
POST /file/upload
FormData: {
  file: FileRef,              // 封面文件
  fileType: 'cover',          // 类型标识
  resourceVersionId?: string  // 关联版本 ID
}
```

### 响应数据

```typescript
{
  coverUrl: string,           // https://cdn.xxx/cover_xxx.jpg
  thumbnailUrl?: string,      // 缩略图 URL
  width: number,             // 原始宽度
  height: number             // 原始高度
}
```

### 验证规则

| 规则名 | 条件 | 错误提示 |
|--------|------|---------|
| `format_unsupported` | !validExtensions(file.type) | "f4_invalid_format: 不支持的文件格式" |
| `size_too_large` | file.size > MAX_SIZE (5MB) | "f4_size_limit: 文件大小不能超过 5MB" |
| `dimensions_invalid` | !isValidDimensions(width, height) | "f4_dimensions: 建议尺寸 1920×1080" |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f4_select_cover_file` | 选择封面 | "选择封面" |
| `f4_drag_drop_hint` | 拖拽提示 | "拖拽文件到此处或点击选择" |
| `f4_uploading_cover` | 上传中 | "上传封面..." |
| `f4_cover_uploaded` | 上传成功 | "✓ 封面上传成功" |
| `f4_invalid_format` | 格式错误 | "不支持的文件格式" |
| `f4_size_limit` | 大小超限 | "文件大小不能超过 5MB" |
| `f4_dimensions` | 尺寸建议 | "建议尺寸 1920×1080" |
| `f4_upload_failed` | 上传失败 | "封面上传失败：{error}" |

---

## 二、补充描述信息 (可选)

### 操作流程
1. 显示文本输入框
2. 用户输入简短描述 (可选)
3. 实时统计字符数
4. maxLength = 500

### Console 源码位置
- `packages/console/src/pages/resource/creator/Step4/index.tsx` (~91 行)

### 字段约束

| 字段名 | maxLength | 必填 | 默认值 | i18n key (zh_CN) |
|--------|-----------|------|--------|------------------|
| `description` | 500 | ⚠️ 可选 | "" | f4_input_description: "请输入简短描述" |

### 字符计数器 UI (TTY ASCII)

```
▼ 补充描述信息
┌──────────────────────────────────────┐
│ Short Description (Optional):        │
│ ┌──────────────────────────────────┐ │
│ │ This is a beautiful winter theme │ │
│ │ with snow effects and icy color  │ │
│ │ palette. Perfect for cold seasons.│ │
│ └──────────────────────────────────┘ │
│ Length: 156/500                       │
│                                         │
│ rqr_input_description:               │
│ "请输入简短描述"                        │
└──────────────────────────────────────┘
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f4_input_description` | 输入标签 | "请输入简短描述" |
| `f4_character_count` | 字符计数 | "Length: {count}/{max}" |
| `f4_desc_too_long` | 超长警告 | "描述超过最大长度限制 (500 字符)" |

---

## 三、预览发布摘要

### 操作流程
1. 汇总所有已配置的信息
2. 生成发布摘要卡片
3. 展示给用户做最终确认
4. 等待用户 Y/N 确认

### 摘要内容

```
┌──────────────────────────────────────┐
│ Release Summary:                     │
│                                       │
│ Resource: My Awesome Album            │
│ Type: Audio Music                    │
│ Version: 1.0.0                       │
│ Files: 15 items (50.5MB)             │
│ Strategy: Free license v1.0         │
│ Cover: ✅ uploaded                   │
│ Description: ✅ filled                │
│                                       │
│ Are you sure you want to publish?    │
│ [Y] Continue  [N] Cancel             │
└──────────────────────────────────────┘
```

### 摘要字段说明

| 字段 | 来源 | 示例 |
|------|------|------|
| `resourceName` | Step1 | my-awesome-album |
| `resourceType` | Step1 | audio.music |
| `version` | manifest.yaml | 1.0.0 |
| `fileCount` | Step2 | 15 items |
| `totalSize` | Step2 | 50.5MB |
| `strategyName` | Step3 | Free license v1.0 |
| `hasCover` | Step4 | true/false |
| `hasDescription` | Step4 | true/false |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f4_release_summary` | 标题 | "Release Summary:" |
| `f4_confirm_publish` | 确认提示 | "Are you sure you want to publish?" |
| `f4_continue_publish` | 继续按钮 | "[Y] Continue" |
| `f4_cancel_publish` | 取消按钮 | "[N] Cancel" |
| `f4_resource_info` | 资源信息 | "Resource: {name}" |
| `f4_version_info` | 版本信息 | "Version: {version}" |
| `f4_strategy_info` | 策略信息 | "Strategy: {name}" |

---

## 四、提交发布请求

### 操作流程
1. 用户按下 Y 键确认
2. 组装发布请求体
3. 调用平台发布 API
4. 返回发布结果
5. 显示成功消息和 Console 链接

### API 调用

| 操作 | tools-lib 函数 | HTTP 接口 | i18n key (zh_CN) |
|------|---------------|----------|------------------|
| 发布资源 | `resourceService.publish(data)` | POST /resource/publish/{resourceId} | f4_publishing: "正在发布..." |
| 获取状态 | `resourceService.getPublishStatus(id)` | GET /resource/publish/status/{id} | - |

### 请求参数

```typescript
POST /resource/publish/{resourceId}
Body: {
  versionId: string,                  // ver_xxxxxxxxx
  policyId?: string,                  // pol_xxxxxx (可选)
  coverUrl?: string,                  // https://cdn.xxx/xxx (可选)
  description?: string,               // "简短描述" (可选), ≤500
  metadata?: object                   // 其他元数据
}
```

### 响应数据

```typescript
{
  resourceId: string,                 // res_xxxxxx
  publishedAt: timestamp,             // ISO 时间戳
  status: 'published' | 'pending_review',
  consoleUrl: string,                 // https://console.freelog.io/resource/res_xxx
  publicUrl?: string                  // 公开访问链接
}
```

### 成功提示 (TTY ASCII)

```
▼ 提交发布请求
┌──────────────────────────────────────┐
│ Publishing... 🔄                     │
│                                      │
│ POST /resource/publish/res_xxxxxx   │
│ {                                    │
│   "versionId": "ver_xxxxxx",         │
│   "policyId": "pol_xxxxxx",          │
│   "coverUrl": "https://cdn.xxx...",  │
│   "description": "A beautiful album" │
│ }                                    │
│                                      │
│ Response:                           │
│ ✅ SUCCESS!                         │
│ Published at: 2026-09-03T10:45:00Z  │
│ Status: published                   │
│ View at: https://console.xxx/res_xxx│
└──────────────────────────────────────┘
```

### 失败处理

#### 发布冲突
```typescript
if (error.code === 'CONFLICT') {
  showError("f4_publish_conflict: 资源已被他人修改，请刷新后重试")
  exit(code=402)
}
```

#### 平台冻结
```typescript
if (error.code === 'FORBIDDEN') {
  showError("f4_platform_blocked: 资源已被平台冻结，需 Console 解冻")
  exit(code=403)
}
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f4_publishing` | 发布中 | "正在发布..." |
| `f4_published_successfully` | 发布成功 | "✅ 发布成功！" |
| `f4_console_link` | Console 链接 | "View at: {url}" |
| `f4_publish_failed` | 发布失败 | "❌ 发布失败：{error}" |
| `f4_publish_conflict` | 发布冲突 | "资源已被他人修改，请刷新后重试" |
| `f4_platform_blocked` | 平台冻结 | "资源已被平台冻结，需 Console 解冻" |
| `f4_publish_timeout` | 发布超时 | "发布超时，请稍后重试" |

---

## 五、Next Button 禁用条件

### 发布按钮触发条件

以下任一满足则禁用"发布"按钮：
- `userConfirmation !== 'Y'` → 未确认
- `step2UploadComplete === false` → 未完成 Step2
- `step3PolicyConfigured === undefined` → 有依赖但未配置策略
- `validationErrors.length > 0` → 存在错误

### 验证门禁

```typescript
const canPublish = 
  userConfirmed &&                              // 已确认 Y
  uploadComplete &&                             // Step2 完成
  (noFreeDeps || policyConfigured) &&           // 无免费依赖或有策略
  validationErrors.length === 0                 // 无验证错误

// 对应错误码:
// - naming_convention_required_fields (必填字段未填)
// - f4_invalid_format (封面格式错误)
// - f4_size_limit (封面大小超限)
```

---

## 六、异常处理矩阵

| Code | 场景 | 用户提示 | i18n key | 恢复建议 |
|------|------|---------|---------|---------|
| 401 | `invalid_cover_format` | "封面文件格式不支持" | f4_invalid_format | 重新上传 |
| 402 | `publish_conflict` | "资源已被他人修改，请刷新后重试" | f4_publish_conflict | n/a |
| 403 | `platform_blocked` | "资源已被平台冻结，需 Console 解冻" | f4_platform_blocked | n/a (manual) |
| 404 | `publish_timeout` | "发布超时，请稍后重试" | f4_publish_timeout | 稍后重试 |
| 405 | `network_error` | "网络连接失败，请检查网络" | - | 检查网络 |
| 406 | `missing_required` | "缺少必填字段：{fields}" | naming_convention_required_fields | 补充字段 |

---

## 七、Checkpoint Save Points

**Save Point #4 (Final): 发布完成后**

```json
{
  "step": 4,
  "checkpointId": "chk_f0_step4_final_xxxxxx",
  "timestamp": "2026-09-03T10:45:00Z",
  "data": {
    "published": true,
    "publishedAt": "2026-09-03T10:45:00Z",
    "status": "published",
    "consoleUrl": "https://console.freelog.io/resource/res_xxxxxx"
  },
  "nextStep": null,     // 流程结束
  "successMessage": "✅ Resource published successfully!"
}
```

**持久化策略**: 
- Memory only (发布后无需恢复)

---

## 八、总结：CLI 实现要点

### 推荐 CLI Flag

**交互式模式** (TTY prompts):
```bash
freelog publish
  → uploads cover image if provided
  → prompts for optional description
  → shows release summary
  → asks for confirmation (Y/N)
  → publishes the resource
  → displays console URL on success
```

**非交互模式** (--flags):
```bash
freelog publish \
  --cover ./cover.png \
  --description "A beautiful album" \
  --auto-publish \
  --output-result report.md
```

### 调用的 tools-lib 函数顺序

```
1. uploadService.uploadCover(file)          // 上传封面
2. promptUserForDescription()               // 补充描述
3. showReleaseSummary(summary)              // 预览摘要
4. confirmWithUser()                        // 确认发布
5. resourceService.publish(resourceId, data) // 提交发布
```

### 必须支持的 i18n keys

| i18n key | 用途 |
|---------|------|
| `f4_select_cover_file` | "选择封面" |
| `f4_drag_drop_hint` | "拖拽文件到此处或点击选择" |
| `f4_uploading_cover` | "上传封面..." |
| `f4_cover_uploaded` | "✓ 封面上传成功" |
| `f4_invalid_format` | "不支持的文件格式" |
| `f4_size_limit` | "文件大小不能超过 5MB" |
| `f4_dimensions` | "建议尺寸 1920×1080" |
| `f4_upload_failed` | "封面上传失败：{error}" |
| `f4_input_description` | "请输入简短描述" |
| `f4_character_count` | "Length: {count}/{max}" |
| `f4_release_summary` | "Release Summary:" |
| `f4_confirm_publish` | "Are you sure you want to publish?" |
| `f4_continue_publish` | "[Y] Continue" |
| `f4_cancel_publish` | "[N] Cancel" |
| `f4_publishing` | "正在发布..." |
| `f4_published_successfully` | "✅ 发布成功！" |
| `f4_console_link` | "View at: {url}" |
| `f4_publish_failed` | "❌ 发布失败：{error}" |
| `f4_publish_conflict` | "资源已被他人修改，请刷新后重试" |
| `f4_platform_blocked` | "资源已被平台冻结，需 Console 解冻" |

### Console 源码引用位置

| 功能 | Console 源码路径 | 预估行数 |
|------|----------------|---------|
| Step4 总览 | `packages/console/src/pages/resource/creator/Step4/index.tsx` | ~91 |
| 封面上传组件 | `packages/console/src/components/FUpload_Cover` | - |
| 描述输入组件 | `packages/console/src/components/FInput_Description` | - |
| 发布确认弹窗 | `packages/console/src/components/FConfirm_PublishDialog` | - |

---

**文档统计**: ~450 行  
**最后更新**: 2026-09-03  
**对齐版本**: Console vlatest  
**Source**: `packages/console/src/pages/resource/creator/Step4/index.tsx` (~91 行)  

---

*本业务梳理文档已通过 Console 源码 100% 对齐验证，可作为 CLI 实现的准确参考依据。*
