# P5-Phase-5 合集管理

> **版本**: v1.0 | **最后更新**: 2026-09-02  
> **对齐 Source**: `packages/cli/src/phases/P5-collections.ts` + `business/业务梳理/合集管理/`

---

## 📋 **一、Phase 职责**

P5-Phase-5 负责**合集 (Collection) 的 CRUD 和 RSS 自动化收录**:

```
┌──────────────────────────────────────────────┐
│         P5-Phase-5 合集管理                    │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─ C2 RSS 收录自动化 ─────────────────────┐   │
│  │  ScanRSS → AddEpisodes → Verify        │   │
│  └────────────────────────────────────────┘   │
│  ↓                                           │
│  ┌─ C3 合集 CRUD 编排 ─────────────────────┐   │
│  │  Create → Read → Update → Delete        │   │
│  └────────────────────────────────────────┘   │
│                                              │
└──────────────────────────────────────────────┘
```

**重要说明:**
- ✅ **C2 = RSS 自动收录** (定期扫描 RSS feed 添加新资源)
- ✅ **C3 = 合集 CRUD** (创建/查看/更新/删除合集)
- ❌ **不是批量发布** - 那是 P4 的功能

---

## 🔗 **二、调用的 Step**

### **C2 条目管理与 RSS:**

| Step | 来源文档 | API 调用 |
|------|----------|---------|
| **C2 Step1** | `业务梳理/合集管理/01-条目管理.md` | `ReadCollectionItems()` |
| **C2 Step2** | `业务梳理/合集管理/02-集合信息.md` | `UpdateCollectionInfo()` |
| **C2 Step3** | `业务梳理/合集管理/03-策略管理.md` | `InheritPolicyToSubitems()` |

### **C3 合集 CRUD:**

| Step | 来源文档 | API 调用 |
|------|----------|---------|
| **C3 Step1** | `业务梳理/流程设计 - 创建合集/总纲.md` | `CreateCollection()` |
| **C3 Step2** | `业务梳理/流程设计 - 创建合集/总纲.md` | `ReadCollection()` |
| **C3 Step3** | `业务梳理/流程设计 - 创建合集/总纲.md` | `UpdateCollection()` |
| **C3 Step4** | `业务梳理/流程设计 - 创建合集/总纲.md` | `DeleteCollection()` |

---

## 💻 **三、完整编排逻辑**

### **1. C2 RSS 收录自动化**

```typescript
// packages/cli/src/phases/P5-rss-collection.ts
async function phase5AutoRSSCollection(collectionId: string): Promise<void> {
  const context = new RSSCollectionContext();
  
  try {
    // ✅ C2 Step1: 读取当前 RSS 配置
    console.log(ui.section('🌀 读取 RSS 配置...'));
    
    const rssConfig = await api.collection.readRSSBinding(collectionId);
    
    if (!rssConfig.enabled) {
      throw new CLIError(CLI_ERROR_CODES.RSS_BINDING_FAILED);
    }
    
    console.log(`Feed URL: ${rssConfig.feedUrl}`);
    console.log(`上次更新：${formatTime(rssConfig.lastScannedAt)}`);
    console.log(`收录模式：${rssConfig.scanMode} (${rssConfig.interval} minutes)`);
    
    context.rssConfig = rssConfig;
    
    // ✅ C2 Step2: 扫描 RSS feed
    console.log(ui.section('🔄 扫描 RSS Feed...'));
    
    const rssFeed = await fetchRSSFeed(rssConfig.feedUrl, {
      timeout: 30 * 1000, // 30 seconds
      userAgent: 'Freelog-Cli-RSS-Scanner/1.0',
    });
    
    const newEpisodes = filterNewEpisodes(
      rssFeed.episodes,
      context.currentEpisodes,
      {
        since: rssConfig.lastScannedAt,
        maxCount: 50, // Limit to prevent overload
      }
    );
    
    console.log(`✓ 发现 ${newEpisodes.length} 个新条目`);
    
    if (newEpisodes.length === 0) {
      console.log(ui.success('✅ 无新条目，跳过本次收录'));
      return;
    }
    
    context.newEpisodes = newEpisodes;
    
    // ✅ C2 Step3: 验证 GUID 唯一性
    console.log(ui.section('✅ 验证 GUID 唯一性...'));
    
    const duplicateGuids = findDuplicateGuids(newEpisodes, {
      checkInCollection: true,
      checkGlobally: false, // Only check in this collection
    });
    
    if (duplicateGuids.length > 0) {
      console.log(ui.warning(`⚠️ 发现 ${duplicateGuids.length} 个重复 GUID`));
      
      printDuplicateGuids(duplicateGuids);
      
      const action = await promptUser('是否继续？[y/N]: ');
      
      if (action !== 'y') {
        throw new CLIError(CLI_ERROR_CODES.GUID_DUPLICATE);
      }
    }
    
    // ✅ C2 Step4: 添加新条目
    console.log(ui.section('➕ 添加新条目...'));
    
    const addedEpisodes = await Promise.all(
      newEpisodes.map(episode => 
        api.collection.addEpisode({
          collectionId,
          episode: {
            title: episode.title,
            guid: episode.guid,
            pubDate: episode.pubDate,
            enclosure: episode.enclosure,
          },
        })
      )
    );
    
    console.log(ui.success(`✅ 已添加 ${addedEpisodes.length} 个新条目`));
    
    // ✅ C2 Step5: 更新 RSS 配置
    const updatedRssConfig = await api.collection.updateRSSBinding(collectionId, {
      lastScannedAt: new Date(),
    });
    
    context.rssConfig = updatedRssConfig;
    
  } catch (error) {
    handleRSSCollectionError(error, context);
  }
}
```

---

### **2. C3 合集 CRUD 编排**

```typescript
// packages/cli/src/phases/P5-collection-crud.ts
interface CollectionCRUDAction {
  action: 'create' | 'read' | 'update' | 'delete';
  collectionId?: string;
  params?: any;
}

async function phase5ManageCRUD(action: CollectionCRUDAction): Promise<void> {
  const context = new CRUDContext();
  
  switch (action.action) {
    case 'create':
      await createCollection(action.params);
      break;
      
    case 'read':
      await readCollection(action.collectionId!);
      break;
      
    case 'update':
      await updateCollection(action.collectionId!, action.params);
      break;
      
    case 'delete':
      await deleteCollection(action.collectionId!);
      break;
  }
}

// Create Collection
async function createCollection(params: CreateParams): Promise<CreateResult> {
  console.log(ui.section('📚 创建合集'));
  
  // Prompt for basic info
  const metadata = await promptCollectionMetadata({
    title: '',
    description: '',
    coverImage: null,
    tags: [],
    website: '',
    contactEmail: '',
  });
  
  // Submit
  const result = await api.collection.create({
    metadata,
  });
  
  console.log(ui.success(`✅ 合集创建成功!`));
  console.log(`   ID: ${result.id}`);
  console.log(`   标题：${result.metadata.title}`);
  console.log(`   URL: ${result.publicUrl}`);
  console.log(`   条目数：${result.itemCount}`);
  
  return result;
}

// Read Collection
async function readCollection(collectionId: string): Promise<void> {
  console.log(ui.section('👁️ 查看合集详情'));
  
  const collection = await api.collection.read(collectionId);
  
  console.log(`ID: ${collection.id}`);
  console.log(`标题：${collection.metadata.title}`);
  console.log(`描述：${collection.metadata.description}`);
  console.log(`创建时间：${formatTime(collection.createdAt)}`);
  console.log(`更新时间：${formatTime(collection.updatedAt)}`);
  console.log(`封面：${collection.metadata.coverImage || 'N/A'}`);
  console.log(`标签：${collection.metadata.tags.join(', ')}`);
  
  // Show items summary
  console.log(`\n┌─ 条目列表 ───────────────────────┐`);
  console.log(`│ 总条目数：${collection.itemCount}`);
  console.log(`│ 已上架：${collection.onlineItemCount}`);
  console.log(`│ 下架中：${collection.delistingItemCount}`);
  console.log(`└──────────────────────────────────┘`);
  
  // Show RSS binding status
  if (collection.rssBinding?.enabled) {
    console.log(`\n┌─ RSS 绑定 ─────────────────────────┐`);
    console.log(`│ 状态：🟢 已启用`);
    console.log(`│ Feed URL: ${collection.rssBinding.feedUrl}`);
    console.log(`│ 最后扫描：${formatTime(collection.rssBinding.lastScannedAt)}`);
    console.log(`│ 收录模式：${collection.rssBinding.scanMode}`);
    console.log(`└────────────────────────────────────┘`);
  } else {
    console.log('\n💡 未绑定 RSS，使用命令 "freelog collection rss enable <id>" 开启');
  }
}

// Update Collection (with policy inheritance)
async function updateCollection(
  collectionId: string,
  updates: UpdateParams
): Promise<void> {
  console.log(ui.section('✏️ 更新合集'));
  
  // Check which fields are locked by RSS
  const current = await api.collection.read(collectionId);
  
  const lockedFields = await checkRSSLockedFields(collectionId);
  
  console.log('┌─ 字段锁定状态 ───────────────────┐');
  for (const field of Object.keys(lockedFields)) {
    const isLocked = lockedFields[field];
    console.log(`│ ${field}: ${isLocked ? '🔒 锁定 (RSS)' : '📝 可编辑'}`);
  }
  console.log('└──────────────────────────────────┘');
  
  // Prepare update payload
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([key]) => !lockedFields[key])
  );
  
  // Update with policy inheritance strategy
  if (updates.policyInheritanceStrategy) {
    const strategy = updates.policyInheritanceStrategy;
    
    console.log(ui.info(`应用策略继承模式：${strategy}`));
    
    switch (strategy) {
      case 'Force':
        // Force uniform policy across all sub-items
        console.log('💾 强制统一策略到所有子条目...');
        
        const forceResult = await applyUniformPolicy(collectionId, {
          template: updates.policyTemplate,
          params: updates.policyParams,
          batchSize: 10,
        });
        
        console.log(`✓ 已更新 ${forceResult.updatedCount} 个子条目`);
        break;
        
      case 'Inherit':
        // Inherit from parent with priority rules
        console.log('🔄 继承父级策略并应用优先级规则...');
        
        const inheritResult = await inheritFromParentWithPriority(collectionId, {
          template: updates.policyTemplate,
          priority: updates.priorityRule,
        });
        
        console.log(`✓ 已更新 ${inheritResult.updatedCount} 个子条目`);
        break;
        
      case 'Independent':
        // Independent control with whitelist
        console.log('🔓 独立控制模板白名单...');
        
        const independentResult = await configureIndependentPolicy(collectionId, {
          whitelist: updates.templateWhitelist,
        });
        
        console.log(`✓ 已更新 ${independentResult.updatedCount} 个子条目`);
        break;
    }
  }
  
  // Execute update
  const result = await api.collection.update(collectionId, safeUpdates);
  
  console.log(ui.success('✅ 合集已更新'));
  console.log(`   更新时间：${formatTime(result.updatedAt)}`);
  
  // Handle partial failures in batch mode
  if (result.partialFailures && result.partialFailures.length > 0) {
    console.log(ui.warning(`⚠️ ${result.partialFailures.length} 个子项更新失败`));
    
    if (result.partialFailures.length > 10) {
      console.log('💡 暂停更新，请检查错误后重试');
      process.exit(1);
    } else {
      console.log('💡 继续处理剩余子项...');
      printFailureSummary(result.partialFailures);
    }
  }
}

// Delete Collection
async function deleteCollection(collectionId: string): Promise<void> {
  console.log(ui.section('🗑️ 删除合集'));
  
  const collection = await api.collection.read(collectionId);
  
  console.log(`合集：${collection.metadata.title}`);
  console.log(`条目数：${collection.itemCount}`);
  console.log(`关联资源：${collection.resourceIds.length}`);
  console.log('');
  console.log(ui.warning('⚠️ 此操作将永久删除合集及其所有条目!'));
  console.log('资源本身不会被删除，仅从合集中移除。');
  
  const confirmed = await promptUser('确认删除？[y/N]: ');
  
  if (confirmed !== 'y') {
    console.log(ui.info('已取消'));
    return;
  }
  
  const result = await api.collection.delete(collectionId);
  
  console.log(ui.success('✅ 合集已删除'));
}
```

---

### **3. Policy Inheritance 策略实现**

```typescript
interface PolicyInheritanceOptions {
  template: string;
  params?: Record<string, any>;
  batchSize?: number;
}

// Strategy 1: Force Mode - 强制统一策略
async function applyUniformPolicy(
  collectionId: string,
  options: PolicyInheritanceOptions
): Promise<{ updatedCount: number }> {
  const results: ApplyResult[] = [];
  
  // Get all sub-items
  const subItems = await api.collection.readAllEpisodes(collectionId);
  
  // Process in batches
  const batchSize = options.batchSize || 10;
  
  for (let i = 0; i < subItems.length; i += batchSize) {
    const batch = subItems.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(item => 
        api.collection.applyPolicy(item.id, {
          template: options.template,
          params: options.params,
        })
      )
    );
    
    results.push(...batchResults);
    
    console.log(`进度：${i + batch.length}/${subItems.length}`);
  }
  
  const successCount = results.filter(r => r.success).length;
  
  return { updatedCount: successCount };
}

// Strategy 2: Inherit Mode - 继承父级并设置优先级
async function inheritFromParentWithPriority(
  collectionId: string,
  options: { template: string; priority: string }
): Promise<{ updatedCount: number }> {
  const priorityRules = parsePriorityRule(options.priority);
  
  const subItems = await api.collection.readAllEpisodes(collectionId);
  
  for (const item of subItems) {
    // Check if item matches priority rule
    if (matchesPriorityRule(item, priorityRules)) {
      await api.collection.applyPolicy(item.id, {
        template: options.template,
        params: {
          source: 'parent_inheritance',
          priority: options.priority,
        },
      });
    }
  }
  
  return { updatedCount: subItems.length };
}

// Strategy 3: Independent Mode - 独立控制白名单
async function configureIndependentPolicy(
  collectionId: string,
  options: { whitelist: string[] }
): Promise<{ updatedCount: number }> {
  const subItems = await api.collection.readAllEpisodes(collectionId);
  
  // Cache for available templates
  const templates = await api.resource.getPolicyTemplates();
  const validTemplateIds = new Set(options.whitelist);
  
  for (const item of subItems) {
    // Select allowed template based on item type or other criteria
    const allowedTemplate = templates.find(t => 
      validTemplateIds.has(t.id) && isCompatible(t, item.type)
    );
    
    if (allowedTemplate) {
      await api.collection.applyPolicy(item.id, {
        template: allowedTemplate.id,
        params: {
          source: 'independent_control',
        },
      });
    }
  }
  
  return { updatedCount: subItems.length };
}
```

---

## ⚠️ **四、异常分支处理**

### **1. RSS 字段被锁定 (RSS_FIELD_LOCKED)**

```typescript
if (error.code === 'RSS_FIELD_LOCKED') {
  console.log(ui.error(`❌ 字段 "${error.field}" 被 RSS 锁定`));
  
  console.log('\n💡 建议操作:');
  console.log('   1. 禁用 RSS 自动收录：freelog collection rss disable <id>');
  console.log('   2. 或修改 RSS 配置后重试');
  
  if (await promptUser('是否禁用 RSS 并继续？[y/N]: ') === 'y') {
    await api.collection.disableRSSBinding(error.collectionId);
    retryOperation();
  } else {
    process.exit(1);
  }
}
```

### **2. GUID 重复冲突 (GUID_DUPLICATE)**

```typescript
if (error.code === 'GUID_DUPLICATE') {
  console.log(ui.error(`❌ GUID "${error.guid}" 已存在`));
  
  console.log('\n💡 可能的原因:');
  console.log('   • 该条目已在其他合集中收录');
  console.log('   • 本地配置文件有误');
  console.log('   • RSS feed 格式不正确');
  
  console.log('\n💡 建议操作:');
  console.log('   1. 检查 episode.json 的 GUID 配置');
  console.log('   2. 使用唯一的 GUID 值');
  
  process.exit(1);
}
```

---

## 🎯 **五、验收标准**

- [ ] C2 RSS 自动收录工作正常
- [ ] C3 CRUD 支持完整
- [ ] Policy 继承三种模式可用
- [ ] RSS 字段锁定检测正确
- [ ] GUID 去重机制工作
- [ ] 部分失败报告生成正确

---

**📌 PHASE 层所有文档已完成!** 

现在 ARCHITECTURE 和 PHASE 已经完整覆盖了业务梳理中的所有 Step!
