# F3.5 · Step5 - 完善 Listing 并上架

> **文档角色**:覆盖 Console CollectionCreator Step5"完善 listing 并上架"的源码对齐  
> **对齐 Source**:Console `packages/console/src/pages/collection/creator/Step5/index.tsx`  
> 最后更新:2026-09-02

---

## 📋 **一、流程总览**

```
┌─ Freelog 合集创建 ────────────────┐
│                                     │
│ ▼ 策略模板选择                       │
│   ○ 免费使用 (推荐)                 │
│   ● 商业使用                        │
│   ○ 自定义策略                      │
│                                     │
│ 策略参数：                          │
│   License URL:https://example.com│
│   Terms:商业使用需购买许可证        │
│                                     │
│ ▼ 标签 *                             │
│ ┌───────────────────────────┐      │
│ │ podcast,episodes,ai    │      │
│ └───────────────────────────┘      │
│   已添加 4 个标签                      │
│                                     │
│ ☑ 发布后立即上架                     │
│ ☐ 仅提交审核，等待平台审核通过         │
│                                     │
│ [提交发布]ENTER | [预览]P          │
└─────────────────────────────────────┘
```

**业务规则**:
1. **策略模板选择**:免费使用/商业使用/自定义策略
2. **标签处理**:逗号分隔→数组，自动去重，最多 10 个
3. **提交选项**:可选择立即上架或仅提交审核
4. **最终验证**:封面/策略/标签完整校验

---

## 🔍 **二、Console 源码证据**

### **2.1 Listing 表单组件**

```typescript
// packages/console/src/pages/collection/creator/Step5/index.tsx
class CollectionListingForm {
  render(collection: CollectionWithEpisodes) {
    return (
      <div>
        {/* 策略选择 */}
        <PolicySelector
          templateId={collection.strategyTemplateId}
          formData={collection.strategyFormData}
          onChange={(strategy) => setCollection({ ...collection, strategy })}
        />
        
        {/* 标签输入 */}
        <TagInput
          labels={collection.tags}
          maxTags={10}
          format="comma-separated"
          transform={(raw) => 
            raw
              .split(/[,,]/)
              .map(t => t.trim().toLowerCase())
              .filter((t, i, arr) => arr.indexOf(t) === i)
              .slice(0, 10)
          }
        />
        
        {/* 封面预览 */}
        {collection.coverImage && (
          <CoverPreview cover={collection.coverImage} />
        )}
        
        {/* 提交选项 */}
        <Checkbox
          checked={collection.autoPublish}
          onChange={(e) => setAutoPublish(e.target.checked)}
        >
          发布后立即上架
        </Checkbox>
        
        <Button onClick={submitCollection} disabled={!isValid}>
          提交发布
        </Button>
      </div>
    );
  }
}
```

### **2.2 最终提交 API**

```typescript
async function submitCollection(collection: CollectionSubmission) {
  // POST /api/collection/create
  const response = await api.collection.create({
    title: collection.title,
    description: collection.description,
    coverImage: collection.coverImage,
    
    episodes: collection.episodes.map(e => ({
      guid: e.guid,
      resourceId: e.resourceId,
      sortOrder: e.sortOrder
    })),
    
    rule: {
      type: collection.rule.type,
      ...(collection.rule.type === 'rss-dynamic' ? {
        feedUrl: collection.rule.feedUrl,
        lockedFields: collection.rule.lockedFields
      } : {})
    },
    
    strategy: {
      templateId: collection.strategy.templateId,
      parameters: collection.strategy.parameters,
      compiledPolicy: collection.strategy.compiledPolicy
    },
    
    listing: {
      tags: collection.tags,
      website: collection.website
    },
    
    autoPublish: collection.autoPublish
  });
  
  return {
    success: true,
    collectionId: response.collectionId,
    status: response.status,
    reviewEstimate: '24-48 hours'
  };
}
```

**CLI 说明**:暂不支持复杂的策略选择和 RSS 绑定配置，仅实现基础提交功能。

---

## 🚨 **三、异常分支**

| 错误码 | 触发条件 | 用户提示 | 修复建议 |
|--------|---------|---------|----------|
| TAG_COUNT_EXCEEDED | 标签超过 10 个 | "最多只能添加 10 个标签" | 删除部分标签 |
| POLICY_COMPILE_ERROR | 策略编译失败 | "策略编译失败" | 检查参数是否合法 |
| COLLECTION_LIMIT_REACHED | 单合集条目超限 | "条目数超过 2000 限制" | 拆分多个合集 |
| API_TIMEOUT | API 调用超时 | "提交失败，请稍后重试" | 网络检查后重试 |

---

## ✅ **四、验收标准**

| 测试项 | 预期行为 | 验证方法 |
|--------|---------|----------|
| 策略选择 | 3 种模板可选 | UI 交互验证 |
| 标签处理 | 逗号分隔转数组，自动去重 | 输入重复标签验证 |
| 提交成功 | 返回完整 collectionId | Mock API 响应验证 |
| Checkpoint 恢复 | 中断后可继续 | Ctrl+C 后 restart 验证 |

---

**下一步**:回到 **[F3 总纲](../../流程设计/03-创建合集总纲.md)**
