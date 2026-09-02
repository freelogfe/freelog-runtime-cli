# F1.4 · Step4 - 完善 Listing 详细流程

> **文档角色**: 覆盖 Step4"完善资源信息 (Listing)"的全部细节  
> **对齐 Source**: Console 的 creator/Step4/MetaInfoForm.tsx  
> 最后更新：2026-09-02

---

## 📋 **一、Step4 流程总览**

```bash
$ freelog publish ./my-awesome-theme

┌─ Freelog 资源发行 ───────────────────────────────┐
│                                                   │
│ Step 4/4: 完善资源信息                              │
│                                                   │
│ ✓ 已完成：Step1 → Step2 → Step3                  │
│                                                   │
│ ┌─ 封面图片 ─────────────────────────────┐       │
│ │                                       │       │
│ │     🖼️                                │       │
│ │   点击上传封面                        │       │
│ │   (800x600 ~ 1920x1080)               │       │
│ │                                       │       │
│ │ 已选：cover.png (245 KB)              │       │
│ │ 尺寸：1280x720 | SHA256: abc123...    │       │
│ └───────────────────────────────────────┘       │
│                                                   │
│ ┌─ 标签 ────────────────────────────────┐       │
│ │ theme, aurora, night, sky             │       │
│ │ ✅ 已添加 4 个标签                       │       │
│ └───────────────────────────────────────┘       │
│                                                   │
│ ┌─ 描述 ────────────────────────────────┐       │
│ │ 一款带有星空 Aurora 效果的主题，         │       │
│ │ 支持深色模式自适应，包含 50+ 预设        │       │
│ │ 配色方案，适合创意类项目使用。             │       │
│ │ 128/1000 字符                            │       │
│ └───────────────────────────────────────┘       │
│                                                   │
│ ▓▓▓▓▓▓▓▓▓░░ 80%                                  │
│ ⏳ 正在准备提交...                               │
│                                                   │
│ [上一步] BACKSPACE  |  [提交上架] ENTER          │
└───────────────────────────────────────────────────┘
```

---

## 🔍 **二、详细步骤实现**

### **2.1 封面图片上传与验证**

**Console 源码证据** (packages/console/src/pages/resource/creator/Step4/index.tsx):

```typescript
const handleCoverUpload = async (file: File) => {
  try {
    // 前置验证
    await validateCoverImage(file); 
    
    // 上传到 OSS
    const uploaded = await uploadCover(file);
    setCoverImage(uploaded);
  } catch (err) {
    if (err instanceof ValidationError) {
      setError(err.message);
    }
  }
};

interface ImageValidationRules {
  formats: ['image/jpeg', 'image/png', 'image/webp'];
  maxSize: 5 * 1024 * 1024; // 5MB
  minWidth: 800;
  minHeight: 600;
  maxWidth: 3840;
  maxHeight: 2160;
}

async function validateCoverImage(file: File): Promise<ValidatedImage> {
  // 1. 格式验证
  if (!ALLOWED_FORMATS.includes(file.type)) {
    throw new ValidationError('COVER_FORMAT_INVALID', 
      '仅支持 JPG/PNG/WebP 格式');
  }
  
  // 2. 大小验证
  if (file.size > MAX_SIZE) {
    throw new ValidationError('COVER_SIZE_EXCEEDED',
      `封面图片不能大于${MAX_SIZE / 1024 / 1024}MB`);
  }
  
  // 3. 尺寸验证
  const dimensions = await getImageDimensions(file);
  if (dimensions.width < MIN_WIDTH || dimensions.height < MIN_HEIGHT) {
    throw new ValidationError('COVER_DIMENSIONS_INSUFFICIENT',
      `封面图片最小尺寸为${MIN_WIDTH}x${MIN_HEIGHT}`);
  }
  
  // 4. 质量检查 (检测过度压缩/模糊)
  const qualityScore = await analyzeImageQuality(file);
  if (qualityScore < MIN_QUALITY_THRESHOLD) {
    throw new ValidationError('COVER_QUALITY_LOW',
      '封面图片质量过低，请上传更清晰的图片');
  }
  
  const sha256 = await calculateSHA256(file.path);
  
  return { file, sha256, dimensions, qualityScore };
}
```

**TTY CLI 交互**:
```typescript
┌─ 上传封面图片 ─────────────────────────┐
│                                         │
│ 选择封面图片                            │
│ ┌─────────────────────────────────────┐│
│ │                                   │ │
│ │         🖼️                          │ │
│ │     点击此处或按 A 键                │ │
│ │   选择本地图片文件                  │ │
│ │                                     │ │
│ │ 支持的格式：JPG / PNG / WebP        │ │
│ │ 最大尺寸：5 MB                      │ │
│ │ 建议尺寸：1280×720 px               │ │
│ └─────────────────────────────────────┘│
│                                         │
│ ▲▼ 选择 | ESC 跳过                     │
└────────────────────────────────────────┘
```

**验收标准**:
| 测试项 | 预期行为 |
|-------|---------|
| 格式验证 | JPG/PNG/WebP 允许，其他拒绝 |
| 大小验证 | >5MB 拒绝并提示 |
| 尺寸验证 | <800×600 拒绝并提示 |
| 质量检查 | 过度压缩图片提示警告 |

---

### **2.2 标签处理逻辑**

**控制台源码实现**:

```typescript
const handleTagChange = (rawTags: string) => {
  const tags = rawTags.split(',').map(t => t.trim());
  const validTags = tags.filter(t => t.length > 0 && t.length <= 50);
  setTags(normalizeTags(validTags));
};

interface TagProcessor {
  normalize(rawTags: string[]): NormalizedTag[] {
    return rawTags
      .split(',')
      .map(tag => tag.trim().toLowerCase()) // 转小写
      .filter(tag => tag.length > 0 && tag.length <= 50) // 去空 + 长度限制
      .filter((tag, index, arr) => arr.indexOf(tag) === index) // 去重
      .map(tag => ({
        id: generateTagId(tag),
        name: tag,
        normalized: normalizeForSearch(tag)
      }));
  }
}
```

**TTY CLI 交互**:
```typescript
┌─ 输入标签 ─────────────────────────────┐
│                                         │
│ 标签 *                                  │
│ ┌─────────────────────────────────────┐│
│ │ theme, aurora, night, sky           ││
│ └─────────────────────────────────────┘│
│                                          │
│ ✅ 已添加 4 个标签                         │
│ ⚠️ 最多 20 个标签，每个 50 字符以内            │
│                                          │
│ 下一个字段：TAB | 取消：ESC             │
└──────────────────────────────────────────┘
```

**业务规则**:
1. **分隔符**: 逗号分隔 (支持中文/英文逗号 `,,`)
2. **标准化**: 自动转小写 + 去空格 + 去重
3. **数量限制**: 最多 20 个标签
4. **长度限制**: 每个标签最多 50 字符

---

### **2.3 描述约束与验证**

**描述文本框**:

```typescript
interface DescriptionRules {
  minLength: 50;   // 最少 50 字符
  maxLength: 1000; // 最多 1000 字符
  allowedHtml: ['<br>', '<a>']; // 允许的 HTML 标签
  maxLinks: 3;     // 最多 3 个链接
}

function validateDescription(text: string): ValidationResult {
  const charCount = countCharacters(text);
  
  if (charCount < MIN_LENGTH) {
    return error(`描述至少需要${MIN_LENGTH}个字符 (当前${charCount})`);
  }
  
  if (charCount > MAX_LENGTH) {
    return error(`描述不能超过${MAX_LENGTH}个字符 (当前${charCount})`);
  }
  
  const links = extractLinks(text);
  if (links.length > MAX_LINKS) {
    return error(`描述中最多只能包含${MAX_LINKS}个链接 (当前${links.length})`);
  }
  
  return success();
}
```

**TTY CLI 交互**:
```typescript
┌─ 输入描述 ─────────────────────────────┐
│                                         │
│ 描述 *                                  │
│ ┌─────────────────────────────────────┐│
│ │ 一款带有星空 Aurora 效果的主题，     ││
│ │ 支持深色模式自适应，包含 50+ 预设     ││
│ │ 配色方案，适合创意类项目使用。        ││
│ │ 128/1000 字符                         ││
│ └─────────────────────────────────────┘│
│                                          │
│ ▲▼ 编辑 | TAB 下一个 | ESC 取消         │
└──────────────────────────────────────────┘
```

**业务规则**:
| 规则 | 说明 |
|------|------|
| 最短长度 | 50 字符 |
| 最长长度 | 1000 字符 |
| 链接数量 | 最多 3 个 URL |
| HTML 标签 | 仅允许 `<br>` `<a>` |

---

### **2.4 最终提交上架**

**提交数据结构**:

```typescript
// POST /api/resource/version/create
const submitPayload = {
  resourceId,                // 从 Step1 获得
  fileId,                    // 从 Step2 获得
  policyId,                  // 从 Step3 获得
  listing: {
    title,                   // Step1 的标题
    description,             // Step4 的描述
    coverImage: {
      fileId: coverFileId,
      sha256: coverSha256
    },
    tags: normalizedTags.map(t => t.name)
  },
  autoPublish: false         // 默认不自动上架，需要审核
};

const result = await api.resource.createVersion(submitPayload);
// 返回：{ versionId, versionNumber: 'v1.0.0', status: 'pending_review' }
```

**TTY CLI 交互**:
```typescript
┌─ 确认并提交 ───────────────────────────┐
│                                         │
│ 资源信息概览                            │
│                                         │
│ • 类型：Theme-Aurora                    │
│ • 标题：星空之美                        │
│ • 版本：v1.0.0                          │
│ • 策略：商业使用                        │
│ • 标签：theme, aurora, night, sky     │
│ • 封面：cover.png (245 KB)              │
│ • 描述：一款带有星空 Aurora 效果的主题... │
│                                         │
│ ⚡ 即将上架到 Freelog 市场                 │
│  提交后将进行自动审核                     │
│                                         │
│ [撤销修改] R  |  [确定提交] ENTER       │
└──────────────────────────────────────────┘
```

---

## 🚨 **三、异常分支与错误码**

| 错误码 | 触发条件 | 用户提示 | 修复建议 |
|-------|---------|---------|---------|
| COVER_FORMAT_INVALID | 封面格式不支持 | "不支持的图片格式" | 转换为 JPG/PNG/WebP |
| COVER_SIZE_EXCEEDED | 封面超过 5MB | "封面图片太大，不超过 5MB" | 压缩图片尺寸 |
| COVER_DIMENSIONS_INSUFFICIENT | 封面分辨率不足 | "封面图片太小，最小 800×600" | 更换更大尺寸的封面 |
| COVER_QUALITY_LOW | 封面质量过差 | "封面图片质量过低" | 上传更清晰的图片 |
| TAG_COUNT_EXCEEDED | 标签超过 20 个 | "最多只能添加 20 个标签" | 删除部分标签 |
| DESCRIPTION_TOO_SHORT | 描述太短 | "描述至少需要 50 个字符" | 补充描述内容 |
| DESCRIPTION_TOO_LONG | 描述过长 | "描述不能超过 1000 个字符" | 精简描述文字 |
| API_TIMEOUT | API 调用超时 | "提交失败，请稍后重试" | 网络检查后重试 |

---

## ✅ **四、验收标准**

| 测试项 | 预期行为 | 验证方法 |
|-------|---------|---------|
| 封面上传 | 支持点击/拖拽上传 | UI 交互验证 |
| 封面验证 | 格式/大小/尺寸/质量检查 | 上传违规封面 |
| 标签处理 | 自动转小写/去重 | 输入重复标签验证 |
| 标签计数 | 实时显示已添加数量 | 输入多个标签观察 |
| 描述字数 | 128/1000 字符计数 | 输入不同长度验证 |
| 链接限制 | 最多 3 个链接 | 插入第 4 个链接测试 |
| 最终提交 | 正确组装所有数据 | Mock API 响应验证 |

---

## 🔗 **五、相关文档索引**

| 文档 | 说明 | 路径 |
|-----|------|------|
| [F1 总纲](../../流程设计/01-创建单个资源总纲.md) | 完整的 F1 流程导航 | 流程设计 |
| [Step1](./01-1-Step1-创建资源壳.md) | 上一步骤 | 流程设计 |
| [Step2](./01-2-Step2-上传资源与配置.md) | 上一步骤 | 流程设计 |
| [Step3](./01-3-Step3-配置授权策略.md) | 上一步骤 | 流程设计 |

---

**下一步**: 阅读 **[02-批量创建资源](./02-批量创建资源.md)** 了解批量发布场景
