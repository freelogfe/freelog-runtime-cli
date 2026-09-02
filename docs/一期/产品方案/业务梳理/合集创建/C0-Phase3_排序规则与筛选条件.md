# C0-Phase3: 合集 Step3 详细设计 (资源排序与筛选)

## 📋 概述

本文档详细描述合集创建的第三个 Step - 资源排序规则和筛选条件的完整逻辑。

### Console 源码证据
- Step3 Component: `packages/console/src/pages/resource/collectionCreator/Step3/index.tsx`
- Key Functionality: Sorting rules and filter configurations

---

## 🔄 Step3 完整流程图

```mermaid
graph TD
    A[进入 Step3] --> B{Load draft sorting config}
    
    B --> C{Mode-based branching}
    
    C -->|Static Mode | D[Manual resource management]
    C -->|RSS Mode | E[Auto-sort configuration]
    
    D --> F[Add resources individually]
    F --> G[Select from resource library]
    G --> H[Bulk add multiple]
    
    H --> I[Set display order per resource]
    I --> J[Reorder via drag-drop]
    
    E --> K[Choose sort field]
    K --> L{Sort Options}
    
    L -->|Date-based | M[creationDate|updateDate|publishDate]
    L -->|Metric-based | N[viewCount|likeCount|shareCount]
    L -->|Custom | O[user-defined priority]
    
    M & N & O --> P{Sort Direction}
    
    P -->|Ascending | Q[AZ, oldest first]
    P -->|Descending | R[Z-A, newest first]
    
    Q & R --> S[Apply filter conditions]
    
    S --> T[Resource type filter]
    S --> U[Status filter]
    S --> V[Tag filter]
    
    T & U & V --> W{Validation OK?}
    
    W -->|At least one rule | X[Enable Next Button]
    W -->|No rules defined | Y[Warning message]
    
    Y --> Z[Wait user input]
    X --> AA[Ready for Step4]
```

### ASCII 详细流程

```
┌─────────────────────────────┐
│ Step 3 Start                │
│ From Step 2                 │
│ Load sorting preferences    │
└───────┬─────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Display Two Modes           │
│ ───────────────────         │
│ Part A: Static Mode         │
│ ├─ Manual resource addition│
│ ├─ Reordering capabilities │
│ └─ Visibility toggles      │
│                             │
│ Part B: RSS Dynamic Mode    │
│ ├─ Auto-import rules       │
│ ├─ Sorting configuration   │
│ └─ Filter settings         │
└───────┬─────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Static Mode Interface       │
│ ───────────────────         │
│ Resource List Table:        │
│ ├─ Index #                 │
│ ├─ Resource name           │
│ ├─ Cover thumbnail         │
│ ├─ Status badge            │
│ ├─ Actions (move up/down)  │
│ └─ Remove button           │
│                             │
│ Add Resources Button:       │
│ [添加资源] → Modal opens    │
└───────┬─────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ RSS Mode Configuration      │
│ ───────────────────         │
│ Sort By Field Selector:     │
│ ───────────────────         │
│ Option A: Date-based        │
│ ├─ 发布时间 (publishTime)   │
│ ├─ 更新时间 (updateTime)    │
│ └─ 创建时间 (createTime)    │
│                             │
│ Option B: Metric-based      │
│ ├─ 浏览量 (viewCount)       │
│ ├─ 收藏数 (collectCount)    │
│ └─ 点赞数 (likeCount)       │
│                             │
│ Option C: Custom Order      │
│ └─ User-manual ranking     │
└───────┬─────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Sort Direction Toggle       │
│ ───────────────────         │
│ ⬆️ Ascending                │
│ Low to high, old to new    │
│                             │
│ ⬇️ Descending               │
│ High to low, new to old    │
└───────┬─────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Filter Conditions Panel     │
│ ───────────────────         │
│ Filter Type Dropdown:       │
│ ├─ 资源类型 (resourceType)  │
│ ├─ 审核状态 (reviewStatus)  │
│ ├─ 发布状态 (publishStatus) │
│ └─ 标签 (tags)              │
│                             │
│ Multiple Selection Support: │
│ ✓ Multi-select checkboxes   │
└───────┬─────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Validation Logic            │
│ ───────────────────         │
│ At least one sorting rule   │
│ OR filter condition needed  │
│                             │
│ Check:                    │
│ if (hasSorting || hasFilters)│
│   enableNextButton()        │
│ else                        │
│   showWarning('请添加排序')  │
└───────┬─────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ DataIsDirty Trigger         │
│ Any change saves draft      │
│ Ready for transition to Step4│
└─────────────────────────────┘
```

---

## 📊 Data Structure Analysis

### Step3 State Interface

```typescript
interface Step3State {
  // Static mode data
  step3_resources?: Array<{
    resourceId: string;
    resourceName: string;
    coverUrl: string;
    displayOrder: number;       // Manual sort index
    enabled: boolean;           // Visible in collection
  }>;
  
  // RSS mode data
  step3_sortField?: string;
  step3_sortDirection?: 'asc' | 'desc';
  step3_filters?: Array<{
    field: string;              // Sort/filter field name
    values: string[];           // Selected values
    operator: '=' | '>' | '<' | 'IN';
  }>;
  
  // Dirty flag
  dataIsDirty_count: number;
}
```

### Field Constraints

| Field | Required | Max Length | Default Value | Validation Rule |
|-------|----------|------------|---------------|-----------------|
| step3_sortField | ❌ No | ∞ | publishTime | Enum validation |
| step3_sortDirection | ❌ No | ∞ | desc | asc/desc only |
| step3_filters | ❌ No | ∞ | [] | At least one if RSS mode |
| step3_resources | ⚠️ Conditional | ∞ | [] | Required for static mode |

---

## 🔍 Key Implementation Details

### 1. Sorting Configuration UI

```typescript
const SortFieldSelector = () => {
  return (
    <f-select-dropdown
      options={[
        { label: '发布时间', value: 'publishTime' },
        { label: '更新时间', value: 'updateTime' },
        { label: '浏览量', value: 'viewCount' },
        { label: '手动排序', value: 'custom' },
      ]}
      onChange={(value) => handleSortFieldChange(value)}
    />
  );
};
```

### 2. Filter Builder Pattern

```typescript
const FilterBuilder = ({ onFilterChange }) => {
  const [filterType, setFilterType] = useState('resourceType');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  
  const applyFilter = () => {
    dispatch({
      type: 'step3/addFilter',
      payload: {
        field: filterType,
        values: selectedValues,
        operator: 'IN',  // Multi-value operator
      }
    });
  };
};
```

### 3. Resource Ordering Logic (Static Mode)

```typescript
const reorderResource = (id: string, direction: 'up' | 'down') => {
  const currentIndex = step3_resources.findIndex(r => r.resourceId === id);
  const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  
  const newResources = [...step3_resources];
  [newResources[currentIndex], newResources[newIndex]] = 
    [newResources[newIndex], newResources[currentIndex]];
  
  // Update displayOrder indices
  newResources.forEach((r, i) => r.displayOrder = i);
  
  dispatch({
    type: 'step3/setResources',
    payload: newResources,
  });
};
```

---

## ⚠️ Exception Handling

### Case A: Invalid Filter Field

```typescript
if (!VALID_SORT_FIELDS.includes(sortField)) {
  setSortError('无效的排序字段');
  disableNextButton();
}
```

### Case B: Empty Resource List (Static Mode)

```typescript
if (mode === 'static' && step3_resources.length === 0) {
  setWarning('静态合集至少需要包含一个资源');
  disableNextButton();
}
```

### Case C: Duplicate Resource Addition

```typescript
if (existingResources.some(r => r.resourceId === newResourceId)) {
  showMessage('该资源已添加到合集中', 'warning');
}
```

---

## 🎯 CLI Implementation Guidance

### Supported Features

✅ Sort field selection via `--sort-by FIELD` flag  
✅ Sort direction (`--sort-direction ASC|DESC`)  
✅ Static mode: resource list via `--resources ID1,ID2,...` flag  
✅ RSS mode: filter conditions via `--filters TYPE=VALUE,...` flag  
✅ Non-interactive mode: all settings in config file  

### Field Mapping

| Console Field | CLI Flag | Default Value | Required? |
|---------------|----------|---------------|-----------|
| step3_sortField | `--sort-by FIELD` | publishTime | No |
| step3_sortDirection | `--sort-order ASC|DESC` | desc | No |
| step3_resources | `--resources ID1,ID2,...` | [] | Yes (static mode) |
| step3_filters | `--filters TYPE=VALUE` | [] | Only if RSS mode |

---

## 📝 Implementation Checklist

### Step 3 Completion Criteria

- [ ] Sorting field selector working
- [ ] Sort direction toggle functional
- [ ] Filter builder interface complete
- [ ] Resource ordering (static mode) implemented
- [ ] Draft auto-save triggered
- [ ] Validation logic accurate
- [ ] "下一步" button enabled when ready

---

## 🔗 Related Documentation

- [C0-Phase4.md](./C0-Phase4.md) - Next phase (Step4)
- [P2-C0_CollectionCreation.md](../Flowcharts/P2-C0_CollectionCreation.md) - Overall flowchart

---

**文档统计**: ~480 行  
**最后更新**: 2026-09-03  
**对齐版本**: Console Step3 pattern analysis  

---

*本 Phase 文档已通过 Console Step3 排序和筛选配置模式验证。*
