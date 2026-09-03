# C0 - 合集创建完整流程设计

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **对齐业务梳理**: P0-C0-CollectionCreation.md + Console collection/creator.tsx  
> **关键发现**: 合集壳是资源、条目分批提交规则 (100/批)

---

## 📋 **一、功能需求清单**

| 功能 ID | 功能名称 | 功能描述 | 复用模块 | 来源 |
|--------|---------|---------|---------|------|
| C0-F1 | 合集类型初始化 | init collection 命令创建 manifest | FRAMEWORK | P0-C0 |
| C0-F2 | 条目来源选择 | 本地文件 / 已有平台资源 | - | P0-C0 |
| C0-F3 | 批量导入规则 | 单次最多 100 个条目 | - | Console L50 |
| C0-F4 | 分批目录草稿 | 按 100 条分批写目录草稿 | - | DESIGN.md |
| C0-F5 | display.display 设置 | catalogueProperty 映射 | - | P0-C0 |
| C0-F6 | 目录变化检测 | fingerprint 判断是否 merge=1 | - | Platform API |
| C0-F7 | Checkpoint 保存 | Ctrl+C中断后恢复进度 | G3-CHECKPOINT | 全局 |

---

## 🔄 **二、Step 编排流程**

```
[开始 freelog collection] 
        ↓ checkpoint.init()
     [Step1: 初始化合集工程]
        ├─ init collection (from framework)
        ├─ 创建 manifest.collection.display
        └─ 生成默认展示配置
        ↓ checkpoint.save(step=1)
     [Step2: 添加条目入口]
        ├─ 选择条目来源：本地文件 OR 已有平台资源
        └─ 输入条目信息
        ↓ checkpoint.save(step=2)
     [Step3: 批量处理条目][循环分支]
        ├─ IF local files mode THEN
        │   scanDirectory() → createResource() → addEntry()
        └─ IF existing resources mode THEN
            queryPlatformResources() → selectResources() → addEntry()
        ↓ checkpoint.save(step=3) (每 100 条一次)
     [Step4: 完善展示配置]
        ├─ 设置 display.mode/sortOrder/titleSource
        ├─ 配置显示编号/图片/描述
        └─ 生成 catalogueProperty 映射
        ↓ checkpoint.save(step=4)
     [Step5: 发布合集]
        ├─ 检测目录变化 (fingerprint 对比)
        ├─ 调用 collection publish API
        └─ merge=1 if changed, merge=0 otherwise
        ↓ checkpoint.save(step=5)
    [成功 ✔ → Dashboard]
```

---

## 📊 **三、每个 Step 的详细设计**

### **Step1: 初始化合集工程**

#### **TTY Interactive Flow**

```bash
$ freelog init collection my-collection

┌─ 创建新的合集工程 ───────────────────┐
│                                        │
│ ▼ 合集基本信息                         │
│   名称：my-collection                  │
│   标题：我的精选合集                   │
│                                       │
│ ▶ 展示配置                            │
│   ├─ displayMode: grid/list          │
│   ├─ sortOrder: date/asc             │
│   └─ titleSource: resource.title     │
│                                       │
│ ☑ 显示项目标题                        │
│ ☑ 显示项目标识                          │
│ ☑ 显示项目描述                        │
│                                       │
│ ✅ 合集工程已创建                      │
│   freelog.manifest.json              │
│   .freelogignore                     │
│                                       │
│ [下一步] ENTER | [取消] ESC            │
└────────────────────────────────────────┘
```

---

### **Step2: 添加条目入口**

#### **核心业务规则 If-then-else**

```
IF CLI provides --source flag THEN
  source_type = CLI_source_flag
  
ELSE IF TTY mode THEN
  displayMenu(["从本地文件创建", "从已有平台资源添加", "混合模式"])
  source_type = getUserSelection()
END IF

# 场景 A: 从本地文件创建子资源
IF source_type == 'local_files' OR CLI_mode == 'import-dir' THEN
  # 扫描输入目录
  input_dir = scanUserInput("请输入包含资源的目录路径")
  
  files = scanDirectory(input_dir)
  valid_files = filterByResourceType(files)
  invalid_files = rejectByRule(files)
  
  displayStats({
    total: len(valid_files),
    rejected: len(invalid_files),
    will_process: len(valid_files)
  })
  
  FOR EACH file IN valid_files DO
    # 先创建并发布子资源
    resource_id = callAPI(createVersion, {
      typeCode: detectResourceType(file),
      authId: generateAuthId(file.name),
      fileSha1: calculateSHA1(file.path),
      ...metadata
    })
    
    # 将子资源 ID 加入合集条目
    entry = {
      itemId: generateItemId(),
      itemTitle: file.title,
      sortId: nextSortIndex(),
      resourceId: resource_id,
      status: 'online'
    }
    
    addToDraftCatalogue(entry)
  END FOR
  
# 场景 B: 从已有平台资源添加
ELSE IF source_type == 'existing_resources' THEN
  # 查询符合条件的资源
  search_params = {
    ownerId: currentUserId,
    status: 'online',
    notInCollection: true  # 未被当前合集重复使用
  }
  
  resources = queryPlatformResources(search_params)
  
  # 分页选择（每次最多 100）
  selected_count = 0
  WHILE selected_count < 100 AND user_selects_more DO
    displayPaginatedList(resources[selected_count:selected_count+50])
    selection = getUserMultiSelect()
    
    FOR EACH resource IN selection DO
      IF isAlreadyInCollection(resource.id) THEN
        skipAndWarn(resource.id)
        CONTINUE
      END IF
      
      entry = {
        itemId: generateItemId(),
        itemTitle: resource.title,
        sortId: nextSortIndex(),
        resourceId: resource.id,
        status: resource.status
      }
      
      addToDraftCatalogue(entry)
      selected_count++
    END FOR
  END WHILE
  
ELSE IF CLI provides --resource-ids flag THEN
  # 声明式指定资源 ID 列表
  resource_ids = parseCommaSeparatedList(CLI_resource_ids)
  
  FOR EACH id IN resource_ids DO
    IF len(resource_ids) > 100 THEN
      showWarning(`单次最多 100 个条目，当前 ${len(resource_ids)}`)
      limit_to_100()
    END IF
    
    resource = fetchResourceById(id)
    validateAddCondition(resource)
    
    entry = createEntryFromResource(resource)
    addToDraftCatalogue(entry)
  END FOR
END IF
```

---

### **Step3: 批量处理条目 (核心逻辑)**

#### **批量规则与检查点策略**

```
伪代码：
MAX_ITEMS_PER_BATCH = 100  # Console 单次选择上限
checkpoint_batch_size = 100  # 每 100 条保存 checkpoint

current_batch = []
processed_count = 0
skipped_count = 0
failed_count = 0

FOR EACH item IN items_to_add DO
  IF processed_count % checkpoint_batch_size == 0 AND processed_count > 0 THEN
    # 每 100 条保存一次 checkpoint
    checkpoint_data = {
      phase: 'batch_processing',
      batch_index: processed_count / checkpoint_batch_size,
      total_batches: ceil(total_items / checkpoint_batch_size)
    }
    
    G3.saveCheckpoint('C0-Step3-batch', checkpoint_data)
    
    showInfo(`已处理 ${processed_count} 个条目，保存进度`)
  END IF
  
  # 字段验证
  IF NOT validateEntryFields(item) THEN
    skipped_count++
    log(`跳过无效条目：${item.itemId}`)
    CONTINUE
  END IF
  
  # 唯一性检查
  IF isDuplicateItemId(item.itemId) THEN
    skipped_count++
    warnAndPromptSkip()
    CONTINUE
  END IF
  
  # 添加到草稿目录
  draft_catalogue.append(item)
  processed_count++
END FOR

# 写入目录草稿
if processed_count > 0 THEN
  result = callAPI(writeCatalogueDraft, {
    collectionId: collectionResourceId,
    entries: draft_catalogue,
    fingerprint: computeFingerprint(draft_catalogue)
  })
  
  IF success THEN
    G3.clearCheckpoint('C0-Step3-batch')
    displaySuccess(`成功添加 ${processed_count} 个条目`)
  ELSE
    showWarning(`部分失败：${processed_count}成功/${failed_count}失败`)
  END IF
END IF
```

---

### **Step4: 完善展示配置**

#### **display.catalogueProperty 映射表**

| CLI Field | Platform Field | 说明 |
|-----------|----------------|------|
| `collection.display.mode` | `catalogueProperty.displayMode` | grid/list/pager |
| `collection.display.sortOrder` | `catalogueProperty.sortOrder` | date/desc/asc/popular |
| `collection.display.titleSource` | `catalogueProperty.titleSource` | resource.title/manual |
| `collection.display.showNumber` | `catalogueProperty.showNumber` | boolean |
| `collection.display.showCover` | `catalogueProperty.showCover` | boolean |
| `collection.display.showDescription` | `catalogueProperty.showDescription` | boolean |

#### **TTY Interactive Flow**

```bash
┌─ Step4/5: 完善展示配置 ──────────────┐
│                                       │
│ ▼ 展示模式                            │
│   [grid▼] (网格布局)                 │
│   list (列表布局)                    │
│   pager (分页模式)                   │
│                                       │
│ ▼ 排序方式                            │
│   [日期▼] (最新优先)                  │
│   时间倒序                           │
│   人气排序                           │
│                                       │
│ ☑ 显示编号                           │
│ ☑ 显示封面图片                       │
│ ☑ 显示条目描述                       │
│                                       │
│ ⚠️ 提示：首次发布将设置目录草稿        │
│ [下一步] ENTER | [修改条目] B         │
└───────────────────────────────────────┘
```

---

### **Step5: 发布合集**

#### **目录变化检测逻辑**

```
伪代码：
# 计算本地目录指纹
local_fingerprint = computeFingerprint(current_draft_catalogue)

# 读取平台已有指纹
platform_fingerprint = queryPlatformCatalogueFingerprint(collectionId)

# 比较是否变化
IF local_fingerprint == platform_fingerprint THEN
  showInfo("目录内容未变化，无需重新发布")
  confirmContinue("仍要发布吗？(仅用于更新展示配置)")
  
  IF confirms THEN
    merge_flag = 0  # 不合并目录变化
  ELSE
    abortWorkflow()
  END IF
  
ELSE
  showInfo("检测到目录变化，将合并目录更新")
  merge_flag = 1  # 合并目录变化
  
  displayDiffSummary({
    added: count_added_entries(),
    removed: count_removed_entries(),
    reordered: count_reordereds()
  })
END IF

# 调用合集发布 API
result = callAPI(publishCollection, {
  collectionId: collectionResourceId,
  display: collection_display_config,
  merge: merge_flag,
  cataloguedFingerprint: local_fingerprint
})

IF success THEN
  updateState({
    lastPublishedAt: Date.now(),
    cataloguedFingerprint: local_fingerprint
  })
  G3.clearCheckpoint('C0-Step5-publish')
ELSE
  showError(result.error.message)
END IF
```

---

## ⚠️ **六、异常处理矩阵**

| Step | 错误场景 | Error Code | 用户友好消息 | Recovery Action |
|------|---------|------------|-------------|-----------------|
| **Step1** | Template Missing | ERR_TEMPLATE_MISSING | "合集模板不存在或无效" | Rerun with valid template |
| **Step2** | Resource Not Online | ERR_NOT_ONLINE | "条目资源未上架，无法加入合集" | 先发布子资源 |
| | Already In Collection | ERR_ALREADY_IN_COLLECTION | "该资源已在其他合集中" | Remove from other collection first |
| **Step3** | Batch Size Exceeded | ERR_TOO_MANY_ITEMS | "单次最多 100 个条目，当前 X 个" | Split into multiple batches |
| | Duplicate ItemID | ERR_DUPLICATE_ITEM | "条目 ID 重复，请修正" | Regenerate unique IDs |
| **Step5** | No Directory Changes | ERR_NO_CHANGES | "目录未发生变化，无需发布" | Skip or modify content |

---

## 🧪 **七、验收测试用例**

| Case ID | 测试场景 | 预期结果 | 对应 Step |
|---------|---------|---------|---------|
| C0-T1 | 本地文件批量创建 | 100 条分批次处理，checkpoint 正确保存 | Step3 |
| C0-T2 | 已有资源混合格式 | 同时支持本地文件和平台资源 ID | Step2-A+B |
| C0-T3 | 目录指纹检测 | 无变化时 merge=0，有变化 merge=1 | Step5 |
| C0-T4 | 重复资源检测 | already_in_collection 错误处理 | Step2-B |

---

**📌 使用说明**: 本文档指导开发者实现合集创建功能，需特别注意 100 条分批规则和目录指纹机制。
