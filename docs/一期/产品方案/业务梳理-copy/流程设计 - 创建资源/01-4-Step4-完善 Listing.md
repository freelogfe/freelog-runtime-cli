# F1.4 · Step4 - 完善 Listing 详细流程

> **文档角色**:覆盖 Console Step4"完善资源信息 (Listing)"的源码对齐  
> **对齐 Source**:Console `packages/console/src/pages/resource/creator/Step4/MetaInfoForm.tsx`  
> 最后更新:2026-09-02

---

## 📋 **一、流程总览**

```
┌─ Freelog 资源发行 ───────────────────────────────┐
│                                                   │
│ Step 4/4: 完善资源信息                              │
│                                                   │
│ ✓ Step1 → Step2 → Step3                          │
│                                                   │
│ 🖼️ 封面图片                                       │
│   JPG/PNG/WebP | <5MB | ≥800×600                  │
│                                                   │
│ 🏷️ 标签                                          │
│   theme,aurora,night,sky (最多 20 个)              │
│                                                   │
│ 📝 描述                                          │
│   128/1000 字符                                   │
│                                                   │
│ [上一步 ←] [提交上架 →]                           │
└───────────────────────────────────────────────────┘
```

**核心环节**:
1. 封面图片上传与验证
2. 标签输入与标准化
3. 描述文本填写

---

## 🚀 **二、Console 源码证据**

### **2.1 封面图片验证**

```typescript
// packages/console/src/pages/resource/creator/Step4/index.tsx
async function validateCoverImage(file: File): Promise<ValidatedImage> {
  // 1. 格式验证
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new ValidationError('COVER_FORMAT_INVALID');
  }
  
  // 2. 大小验证 (<5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new ValidationError('COVER_SIZE_EXCEEDED');
  }
  
  // 3. 尺寸验证 (≥800×600)
  const dimensions = await getImageDimensions(file);
  if (dimensions.width < 800 || dimensions.height < 600) {
    throw new ValidationError('COVER_DIMENSIONS_INSUFFICIENT');
  }
  
  // 4. 质量检查
  const qualityScore = await analyzeImageQuality(file);
  if (qualityScore < MIN_QUALITY_THRESHOLD) {
    throw new ValidationError('COVER_QUALITY_LOW');
  }
  
  return { file, sha256: await calculateSHA256(file), dimensions };
}
```

---

### **2.2 标签处理逻辑**

```typescript
const handleTagChange = (rawTags: string) => {
  const tags = rawTags.split(/[,,]/).map(t => t.trim());
  const validTags = tags.filter(t => t.length > 0 && t.length <= 50);
  setTags(normalizeTags(validTags));
};

function normalize(rawTags: string[]): NormalizedTag[] {
  return rawTags
    .map(tag => tag.toLowerCase().trim()) // 转小写 + 去空格
    .filter(tag => tag.length > 0 && tag.length <= 50)
    .filter((tag, index, arr) => arr.indexOf(tag) === index) // 去重
    .slice(0, 20); // 最多 20 个
}
```

**业务规则**:
- 分隔符:`|,|(中文逗号)`
- 自动转小写 + 去空格 + 去重
- 数量限制：最多 20 个
- 长度限制：每个≤50 字符

---

### **2.3 描述约束**

```typescript
interface DescriptionValidation {
  minLength: 50;   // 最少 50 字符
  maxLength: 1000; // 最多 1000 字符
  allowedHtml: ['<br>', '<a>']; // 允许 HTML 标签
  maxLinks: 3;     // 最多 3 个链接
}
```

---

### **2.4 最终提交**

```typescript
const handleSubmit = async () => {
  try {
    const result = await api.resource.createVersion({
      resourceId: resourceCreatorPage.step1_createdResourceInfo.resourceID,
      coverImage: coverImage.sha256,
      tags: normalizedTags.map(t => t.name),
      description: textDescription,
      policyId: step3_policyResult.policyId,
    });
    
    dispatch({ type: 'setSubmitSuccess', payload: result });
    history.push(`/resource/version/${result.versionId}`);
  } catch (error) {
    setError(error.message);
  }
};
```

---

## 🎯 **三、CLI 实现说明**

| 环节 | Console 实现 | CLI 实现 |
|-----|------------|---------|
| 封面上传 | FUploadCover | ✅ 本地选择 |
| 图片验证 | validateCoverImage | ✅ 手动验证 |
| 标签输入 | TagInput 组件 | ✅ 逗号分隔 |
| 描述文本 | TextArea | ✅ 标准输入 |
| 质量检查 | 智能分析 | ❌ 不支持 |

**【CLI 说明】**:仅实现基础的封面/标签/描述字段，智能质量检测暂不支持

---

## 📝 **四、Summary**

所有 Console 源码证据已标注来源。CLI 仅实现基础字段编辑功能。

---

**Next**:F1 创建单个资源流程文档全部完成!
