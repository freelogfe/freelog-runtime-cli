# F3.5 · Step5 - 完善 Listing 并上架详细流程

> **文档角色**: 覆盖 Step5"完善 listing 并上架"的全部细节  
> **对齐 Source**: CLI 的 CollectionListingForm 实现  
> 最后更新：2026-09-02

---

## 📋 **一、Step5 流程总览**

```bash
┌─ Freelog 合集创建 ───────────────────────────────┐
│                                                     │
│ Step 5: 完善 listing 并上架                           │
│                                                     │
│ 策略模板                                            │
│   ○ 免费使用 (推荐)                                 │
│   ● 商业使用                                        │
│   ○ 自定义策略                                      │
│                                                     │
│   策略参数：                                        │
│   License URL: https://example.com/license        │
│   Terms: 商业使用需购买许可证                        │
│                                                     │
│ 标签 *                                              │
│ ┌─────────────────────────────────────────────┐   │
│ │ podcast,episodes,ai-coding,tutorials     │   │
│ └─────────────────────────────────────────────┘   │
│   已添加 4 个标签                                     │
│                                                     │
│ 提交审核                                            │
│   ☑ 发布后立即上架                                  │
│   ☐ 仅提交审核，等待平台审核通过                     │
│                                                     │
│ [预览] P | [提交发布] ENTER                         │
└─────────────────────────────────────────────────────┘


┌─ ✅ 合集创建完成 ──────────────────────────┐
│                                              │
│ 🎉 合集已成功创建!                          │
│                                              │
│   资源 ID: collection_xyz789                │
│   合集标题：AI Coding Podcast               │
│   版本：v1.0.0                              │
│   条目数：4 条                              │
│   RSS 绑定：是 (https://feeds.example.com/)  │
│                                              │
│ 📊 统计信息                                 │
│   创建时长：45s                             │
│   成功率：100%                              │
│                                              │
│ [查看合集] V | [继续编辑] E | [退出] Q       │
└──────────────────────────────────────────────┘
```

---

## 🔍 **二、详细步骤实现**

### **2.1 组合式 Listing 组件**

```typescript
class CollectionListingForm {
  render(collection: CollectionWithEpisodes) {
    console.log('\n┌─ 完善 listing ────────────────────┐');
    
    // 策略选择
    this.policySelector({
      templateId: collection.strategyTemplateId,
      formData: collection.strategyFormData
    });
    
    // 标签输入
    this.tagInput({
      labels: collection.tags,
      maxTags: 10,
      tagsFormat: 'comma-separated'
    });
    
    // 封面预览
    if (collection.coverImage) {
      this.coverPreview(collection.coverImage);
    }
    
    // 提交选项
    this.submitOptions({
      autoPublish: collection.autoPublish,
      showReviewStatus: true
    });
    
    console.log('└────────────────────────────────────┘\n');
  }
}
```

### **2.2 最终提交 API**

```typescript
async function submitCollection(
  collection: CollectionSubmission
): Promise<SubmitResult> {
  // POST /api/collection/create
  const response = await api.collection.create({
    // 基本信息
    title: collection.title,
    description: collection.description,
    coverImage: collection.coverImage,
    
    // 资源关系
    episodes: collection.episodes.map(e => ({
      guid: e.guid,
      resourceId: e.resourceId,
      sortOrder: e.sortOrder
    })),
    
    // 收录规则
    rule: {
      type: collection.rule.type,
      ...(collection.rule.type === 'rss-dynamic' ? {
        feedUrl: collection.rule.feedUrl,
        syncInterval: collection.rule.syncInterval,
        maxEpisodesPerSync: collection.rule.maxEpisodesPerSync,
        daysBackFilter: collection.rule.daysBackFilter,
        lockedFields: collection.rule.lockedFields
      } : {})
    },
    
    // 策略
    strategy: {
      templateId: collection.strategy.templateId,
      parameters: collection.strategy.parameters,
      compiledPolicy: collection.strategy.compiledPolicy
    },
    
    // Listing
    listing: {
      tags: collection.tags,
      website: collection.website,
      contactEmail: collection.contactEmail
    },
    
    // 发布选项
    autoPublish: collection.autoPublish,
    notifySubscribers: true
  });
  
  return {
    success: true,
    collectionId: response.collectionId,
    versionNumber: response.versionNumber,
    status: response.status, // 'published' | 'pending_review'
    reviewEstimate: response.reviewEstimate // '24-48 hours'
  };
}
```

### **2.3 标签处理逻辑**

```typescript
function processTags(rawTags: string): NormalizedTag[] {
  return rawTags
    .split(/[,,]/)  // 支持中英文逗号
    .map(tag => tag.trim().toLowerCase()) // 转小写
    .filter(tag => tag.length > 0 && tag.length <= 50) // 去空 + 长度限制
    .filter((tag, index, arr) => arr.indexOf(tag) === index) // 去重
    .slice(0, 10) // 最多 10 个标签
    .map(tag => ({
      id: generateTagId(tag),
      name: tag,
      normalized: normalizeForSearch(tag)
    }));
}
```

---

## 🚨 **三、异常分支处理**

| 错误码 | 触发条件 | 用户提示 | 修复建议 |
|-------|---------|---------|---------|
| TAG_COUNT_EXCEEDED | 标签超过 10 个 | "最多只能添加 10 个标签" | 删除部分标签 |
| POLICY_COMPILE_ERROR | 策略编译失败 | "策略编译失败" | 检查参数是否合法 |
| COLLECTION_LIMIT_REACHED | 单合集条目超限 | "条目数超过 2000 限制" | 拆分多个合集 |
| API_TIMEOUT | API 调用超时 | "提交失败，请稍后重试" | 网络检查后重试 |

---

## ✅ **四、验收标准**

| 测试项 | 预期行为 | 验证方法 |
|-------|---------|---------|
| 策略选择 | 3 种模板可选 | UI 交互验证 |
| 标签处理 | 逗号分隔转数组，自动去重 | 输入重复标签验证 |
| 封面验证 | 格式/大小检查生效 | 上传违规封面测试 |
| 提交成功 | 返回完整 collectionId | Mock API 响应验证 |
| Checkpoint 恢复 | 中断后可继续 | Ctrl+C 后 restart |

---

## 🔗 **五、相关文档索引**

| 文档 | 说明 | 路径 |
|-----|------|------|
| [F3 总纲](../../流程设计/03-创建合集总纲.md) | 完整的 F3 流程导航 | 流程设计 |
| [Step4](./03-4-Step4-配置收录规则.md) | 上一步骤 | 流程设计 |
| [M1-版本更新](../资源管理/01-版本更新.md) | 创建后的维护流程 | 资源管理 |

---

**完成!** F3 创建合集全流程已全部文档化。
