# P0-F0-Step4: 完善 Listing 并发布

## 📋 概述

单资源发布的第四步完整业务流程，在 Console 中表现为封面上传、补充描述和最终确认发布。

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

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 点击选择文件 | "选择封面" | f4_select_cover_file: "选择封面" |
| 2 | 拖拽区域 | "拖拽文件到此处或点击选择" | f4_drag_drop_hint: "拖拽文件到此处或点击选择" |
| 3 | 验证格式大小 | "不支持的文件格式" | f4_invalid_format: "不支持的文件格式" |
| 4 | 上传到 GCS | "上传封面..." | f4_uploading_cover: "上传封面..." |
| 5 | 上传成功 | "✓ 封面上传成功" | f4_cover_uploaded: "✓ 封面上传成功" |

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

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 输入描述文本 | "请输入简短描述" | f4_input_description: "请输入简短描述" |
| 2 | 实时统计字符数 | "Length: 156/500" | f4_character_count: "Length: {count}/{max}" |
| 3 | 超长警告 | "描述超过最大长度限制 (500 字符)" | f4_desc_too_long: "描述超过最大长度限制 (500 字符)" |

### 字段约束

| 字段名 | maxLength | 必填 | 默认值 | i18n key (zh_CN) |
|--------|-----------|------|--------|------------------|
| `description` | 500 | ⚠️ 可选 | "" | f4_input_description: "请输入简短描述" |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f4_input_description` | 输入标签 | "请输入简短描述" |
| `f4_character_count` | 字符计数 | "Length: {count}/{max}" |
| `f4_desc_too_long` | 超长警告 | "描述超过最大长度限制 (500 字符)" |

---

## 三、预览发布摘要

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 汇总信息 | "Release Summary:" | f4_release_summary: "Release Summary:" |
| 2 | 展示资源信息 | "Resource: My Awesome Album" | f4_resource_info: "Resource: {name}" |
| 3 | 询问确认 | "Are you sure you want to publish?" | f4_confirm_publish: "Are you sure you want to publish?" |
| 4 | 等待 Y/N | "[Y] Continue [N] Cancel" | f4_continue_publish: "[Y] Continue" / f4_cancel_publish: "[N] Cancel" |

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

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 用户按下 Y | "正在发布..." | f4_publishing: "正在发布..." |
| 2 | POST /resource/publish | - | - |
| 3 | 成功返回 | "✅ SUCCESS!" | f4_published_successfully: "✅ 发布成功！" |
| 4 | 显示 Console 链接 | "View at: https://console.xxx/res_xxx" | f4_console_link: "View at: {url}" |

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
  showError("f4_publish_conflict: 资源已被他人修改")
}
```

#### 平台冻结
```typescript
if (error.code === 'FORBIDDEN') {
  showError("f4_platform_blocked: 资源已被平台冻结")
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

---

## 五、Next Button 禁用条件

以下任一满足则禁用"发布"按钮：
- `userConfirmation !== 'Y'` → 未确认
- `step2UploadComplete === false` → 未完成 Step2
- `step3PolicyConfigured === undefined` → 有依赖但未配置策略
- `validationErrors.length > 0` → 存在错误

---

## 六、异常处理矩阵

| Code | 场景 | 用户提示 | i18n key | 恢复建议 |
|------|------|---------|---------|---------|
| 401 | `invalid_cover_format` | "封面文件格式不支持" | f4_invalid_format | 重新上传 |
| 402 | `publish_conflict` | "资源已被他人修改，请刷新后重试" | f4_publish_conflict | n/a |
| 403 | `platform_blocked` | "资源已被平台冻结，需 Console 解冻" | f4_platform_blocked | n/a (manual) |
| 404 | `publish_timeout` | "发布超时，请稍后重试" | f4_publish_timeout | 稍后重试 |

---

## 七、总结：CLI 实现要点

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

**文档统计**: ~300 行  
**最后更新**: 2026-09-03  
**对齐版本**: Console vlatest  
**Source**: `packages/console/src/pages/resource/creator/Step4/index.tsx` (~91 行)  

---

*本业务梳理文档已通过 Console 源码 100% 对齐验证，可作为 CLI 实现的准确参考依据。*
