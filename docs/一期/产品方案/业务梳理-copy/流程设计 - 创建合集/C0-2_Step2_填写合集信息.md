# C0-2 · Step2 - 填写合集信息

> **对齐 Source**: Console `collectionCreator/Step2/index.tsx` L1-1426  
> **核心职责**: 管理合集单品、配置系统属性 + 自定义属性、设置展示样式和排序  
> **CLI 限制**: 不支持微前端授权、仅免费策略

---

## 1. 流程总览

```bash
$ freelog collection create ./collection --name "我的合集"

[Step2] 填写合集信息
  ├─ 添加单品资源 → fSelectResourcesAsCollectionItems
  ├─ 展示样式设置 → CollectionSetting(card/list)
  ├─ 调整排序 → SortOrderModal(Added/Title/UpdateDate)
  ├─ 系统属性 → FAttrsAndConfigs (仅 type='additional')
  └─ 自定义属性 → FAttrsAndConfigs (value≤140)
```

---

## 2. Console 源码证据与业务流程

### 2.1 单品资源管理 (L318-706)

**Console 位置**: L318-706

**业务流程**:
```typescript
// 单品数量显示
<FContentText text={`单品数量 ${step2_resources_totalCount}`} />

// 添加单品按钮 (已有单品时仍显示)
{step2_resources.length > 0 && (
  <FTextBtn onClick={onClick_addItemsFromLibrary}>
    <FAdd />
    添加单品
  </FTextBtn>
)}

// 展示样式设置下拉菜单
<FTextBtn onClick={() => set$collectionSettingExpansion(get$() === 'style' ? '' : 'style')}>
  展示样式设置
</FTextBtn>
{$collectionSettingExpansion === 'style' && <CollectionSetting ... />}

// 调整排序下拉菜单
<FTextBtn onClick={() => set$sortOrderModalShow(true)}>
  调整排序
</FTextBtn>
<SortOrderModal 
  sortOrderModalShow={$sortOrderModalShow}
  onSort={(sort) => {
    await FServiceAPI.Resource.reorderCollectionItems_Draft({
      resourceId: step1_createdResourceInfo?.resourceID || '',
      sortField: sort === 'added' ? 'createDate' : sort === 'title' ? 'itemTitle' : 'resourceUpdateDate',
      sortType: sort === 'added' ? -1 : sort === 'title' ? 1 : -1,
    });
  }}
/>

// 单品列表展示组件
<FCollectionItems2
  showView={step2_collectionItemsSetting.collection_view === 'collection_view_list' ? 'list' : 'card'}
  showCheckbox={'hide'}
  checkedItemIDs={$checkedItemIDs}
  showCover={...}
  showNumber={...}
  showTitle={...}  // rtitle/sn/custom/hide
  showIntroduction={...}
  resources={step2_resources}
  onChangeCustomTitle={async (itemID, title) => {
    await FServiceAPI.Resource.updateCollectionItemsInfo_Draft({
      resourceId: step1_createdResourceInfo?.resourceID || '',
      data: [{ itemId: itemID, itemTitle: title }],
    });
  }}
  onClickDelete={async (itemID) => {
    await FServiceAPI.Resource.deleteCollectionItems_Draft({
      resourceId: step1_createdResourceInfo?.resourceID || '',
      removeCollectionItemIds: [itemID],
    });
  }}
/>

// 分页控件 (卡片视图 6 条/页，列表视图 10 条/页)
{((step2_collectionItemsSetting.collection_view === 'collection_view_list' && step2_resources_totalCount > 10) ||
  (step2_collectionItemsSetting.collection_view === 'collection_view_card' && step2_resources_totalCount > 6)) && (
  <Pagination
    current={step2_resources_pageCurrent}
    pageSize={step2_resources_pageSize}
    total={step2_resources_totalCount}
    pageSizeOptions={collection_view === 'collection_view_card' ? [6,12,18,24,30] : [10,20,30,40,50]}
    onChange={onChangePage}
  />
)}
```

**UI 约束**: 
- card 视图默认 6 条/页，可选 12/18/24/30
- list 视图默认 10 条/页，可选 20/30/40/50
- SortOrderModal: Added(降序)/Title(升序)/UpdateDate(降序)

---

### 2.2 基础属性管理 (L710-905)

**Console 位置**: L710-905

**业务流程**:
```typescript
// 自定义属性添加按钮 (限制最多 30 个)
{step2_customProperties.length < 30 && (
  <FTooltip title={info_versionoptions}>
    <FTextBtn onClick={async () => {
      const dataSource = await fResourcePropertyEditor3({
        disabledKeys: [...systemProperties, ...customProperties, ...customConfigurations],
        disabledNames: [...systemProperties, ...customProperties, ...customConfigurations],
      });
      if (!dataSource) return;
      
      await onChange_needSaveDraft({
        step2_customProperties: [...step2_customProperties, {
          key: dataSource.key,
          name: dataSource.name,
          value: '',
          description: dataSource.description,
        }],
      });
    }}>
      <FProperty />
      添加属性
    </FTextBtn>
  </FTooltip>
)}

// 空状态提示
{step2_systemProperties.length === 0 && step2_customProperties.length === 0 && (
  <FContentText text="暂无数据" type={'additional2'} />
)}

// 系统属性 + 自定义属性编辑器
<FAttrsAndConfigs
  dateSource={[
    // 系统属性 (只读 key/name/value)
    ...step2_systemProperties.map<IAttrsAndConfigsItem>((sp) => ({
      key: sp.key,
      value: sp.value,
      name: sp.name,
      description: sp.description,
      configs: {
        item_Deletable: false,
        key_Editable: false,
        name_Editable: false,
        description_Editable: false,
        value_Editable: sp.type === 'additional' && sp.valueConfig,  // 仅 type='additional'可编辑值
      },
    })),
    
    // 自定义属性 (全部可编辑，value≤140)
    ...step2_customProperties.map<IAttrsAndConfigsItem>((cp) => ({
      key: cp.key,
      value: cp.value,
      name: cp.name,
      description: cp.description,
      configs: {
        item_Deletable: true,
        key_Editable: true,
        name_Editable: true,
        description_Editable: true,
        value_Editable: {
          text: {
            nullable: true,
            minLength: 0,
            maxLength: 140,  // ← Console 限制!
          },
        },
      },
    })),
  ]}
  onChangeItem={async (oldData, newData, index) => {
    if (index < step2_systemProperties.length) {
      // 更新系统属性
      await onChange_needSaveDraft({
        step2_systemProperties: [...step2_systemProperties].map((sp, i) => 
          i === index ? newData : sp
        ),
      });
    } else {
      // 更新自定义属性
      await onChange_needSaveDraft({
        step2_customProperties: [...step2_customProperties].map((cp, i) => 
          i === index - step2_systemProperties.length ? newData : cp
        ),
      });
    }
  }}
  onDeleteItem={async (value) => {
    await onChange_needSaveDraft({
      step2_customProperties: step2_customProperties.filter(v => v.key !== value.key),
    });
  }}
/>
```

**UI 约束**: 
- 最多 30 个自定义属性 (L726, L956)
- customProperties[].value maxLength=140(L849)
- systemProperties 仅 type='additional'时可编辑值(L830)

---

### 2.3 可选配置 (L939-1120)

**Console 位置**: L940-1120

**业务流程**:
```typescript
{showMore && (
  <>
    {step2_resourceTypeConfig.isSupportOptionalConfig && (
      <div className={styles.block}>
        <FContentText text="资源选项" type={'highlight'} />
        
        {step2_customConfigurations.length < 30 && (
          <FTextBtn onClick={async () => {
            const dataSource = await fResourceOptionEditor({
              disabledKeys: [...systemProperties, ...customProperties, ...customConfigurations],
              disabledNames: [...systemProperties, ...customProperties, ...customConfigurations],
            });
            
            if (!dataSource) return;
            
            await onChange_needSaveDraft({
              step2_customConfigurations: [...step2_customConfigurations, {
                key: dataSource.key,
                name: dataSource.name,
                type: dataSource.type,  // 'input' | 'select'
                input: dataSource.input,
                select: dataSource.select,
                description: dataSource.description,
              }],
            });
          }}>
            添加可选配置
          </FTextBtn>
        )}
      </div>
    )}
  </>
)}
```

**UI 约束**: 
- 仅当 isSupportOptionalConfig=true 时显示
- 最多 30 个可选配置
- type: 'input' | 'select'

---

### 2.4 保存草稿机制 (L81-90, L107-130)

**Console 位置**: L81-90, L107-130

**业务流程**:
```typescript
// 300ms debounce 自动保存草稿
const { run: run_saveDraft } = AHooks.useDebounceFn(
  () => {
    dispatch({
      type: 'collectionCreatorPage/step2_SaveDraft',
    });
  },
  { wait: 300 },  // 300ms debounce!
);

async function onChange_needSaveDraft(payload: Partial<CollectionCreatorPageModelState>) {
  await dispatch({
    type: 'collectionCreatorPage/change',
    payload: { ...payload, step2_otherChanged: true },
  });
  run_saveDraft();  // 触发自动保存
}

async function onChange_needSaveDraft_collectionItems(payload: Partial<CollectionCreatorPageModelState>) {
  await dispatch({
    type: 'collectionCreatorPage/change',
    payload: { ...payload, step2_collectionItemsChanged: true },
  });
  run_saveDraft();
}
```

**CLI 说明**: CLI 不提供草稿功能，需一次性完成提交

---

### 2.5 提交流程 (L1371-1425)

**Console 位置**: L1371-1425 (saveInputAttrs + saveCustomPropertyDescriptors)

**完整数据结构定义**:
```typescript
// 保存系统属性
export async function saveInputAttrs({ resourceID, systemProperties }) {
  const { data } = await FServiceAPI.Resource.updateCollection({
    resourceId: resourceID,
    inputAttrs: systemProperties
      .filter((sp) => sp.type === 'additional')
      .map((sp) => ({
        key: sp.key,
        value: sp.value,
      })),
    authExcludedItems: [],
  });
}

// 保存自定义属性 + 可选配置
export async function saveCustomPropertyDescriptors({
  resourceID,
  customProperties,
  customConfigurations,
}) {
  const { data } = await FServiceAPI.Resource.updateCollection({
    resourceId: resourceID,
    customPropertyDescriptors: [
      // 自定义属性转换
      ...customProperties.map((i) => ({
        type: 'readonlyText',           // 固定为只读文本
        key: i.key,
        name: i.name,
        remark: i.description,
        defaultValue: i.value,
      })),
      
      // 可选配置转换
      ...customConfigurations.map((i) => {
        const isInput: boolean = i.type === 'input';
        const options: string[] = i.select;
        return {
          type: isInput ? 'editableText' : 'select',  // input→editableText, select→select
          key: i.key,
          name: i.name,
          remark: i.description,
          defaultValue: isInput ? i.input : options[0],
          candidateItems: isInput ? undefined : options,
        };
      }),
    ],
    authExcludedItems: [],
  });
}
```

**CLI 对应实现**:
- 调用 updateCollection API 保存系统属性 + 自定义属性 + 可选配置
- customProperties 转换为 readonlyText 类型
- customConfigurations 转换为 editableText 或 select 类型

---

## 3. 字段约束汇总

| 字段 | UI 组件 | 长度限制 | 必填 | 验证规则 | Console 证据 |
|------|--------|---------|------|---------|-------------|
| collectionItems | FCollectionItems2 | 无限制 | 是 | 至少一个单品 | Step2 L513 |
| collection_view | CollectionSetting | card/list | 否 | 展示样式 | Step2 L469 |
| systemProperties | FAttrsAndConfigs | 无限制 | 否 | 仅 type='additional'可编辑 | Step2 L819 |
| customProperties | FAttrsAndConfigs | ≤30 个 | 否 | value≤140 | Step2 L834, L849 |
| customConfigurations | FResourceOptions | ≤30 个 | 否 | input/select | Step2 L972 |
| sortOrder | SortOrderModal | Added/Title/UpdateDate | 否 | 排序方式 | Step2 L1309 |

**特殊行为**:
- systemProperties 仅 type='additional'时可编辑 value(L830)
- customProperties[].value maxLength=140(L849)
- 最多 30 个自定义属性 (L726, L956)
- 卡片视图 6 条/页，列表视图 10 条/页(L620-658)

---

## 4. API 契约

### FServiceAPI.Resource.updateCollection

**Request** (保存系统属性):
```typescript
{
  resourceId: string;
  inputAttrs: Array<{
    key: string;
    value: string;
  }>;
  authExcludedItems: [];  // 固定为空数组
}
```

**Request** (保存自定义属性 + 可选配置):
```typescript
{
  resourceId: string;
  customPropertyDescriptors: Array<{
    // 自定义属性转换 (readonlyText)
    type: 'readonlyText';
    key: string;
    name: string;
    remark: string;
    defaultValue: string;
    
    // 可选配置转换 (editableText 或 select)
    type: 'editableText' | 'select';
    key: string;
    name: string;
    remark: string;
    defaultValue: string;
    candidateItems?: string[];  // select 类型时有
  }>;
  authExcludedItems: [];  // 固定为空数组
}
```

**Response**:
```typescript
{
  data: {
    success: boolean;
  }
}
```

### FServiceAPI.Resource.reorderCollectionItems_Draft

**Request**:
```typescript
{
  resourceId: string;
  sortField: 'createDate' | 'itemTitle' | 'resourceUpdateDate';
  sortType: 1 | -1;  // 1:升序, -1:降序
}
```

### FServiceAPI.Resource.updateCollectionItemsInfo_Draft

**Request**:
```typescript
{
  resourceId: string;
  data: Array<{
    itemId: string;
    itemTitle: string;
  }>;
}
```

### FServiceAPI.Resource.deleteCollectionItems_Draft

**Request**:
```typescript
{
  resourceId: string;
  removeCollectionItemIds: string[];
}
```

### FServiceAPI.Resource.setCollectionItemsSortID_Draft

**Request**:
```typescript
{
  resourceId: string;
  data: {
    itemIds: string[];
    targetSortId: number;
  };
}
```

---

## 5. 数据处理

### step2_state 数据结构

```typescript
interface Step2State {
  step2_resources: Array<{
    itemID: string;
    resourceID: string;
    itemTitle?: string;
    resourceName: string;
    resourceTitle: string;
    coverImages: string[];
  }>;
  step2_resources_totalCount: number;
  step2_resources_pageCurrent: number;
  step2_resources_pageSize: number;
  step2_resources_state: 'noData' | 'loading' | 'loaded' | 'noSearchResult';
  step2_collectionItemsSetting: {
    collection_view: 'collection_view_card' | 'collection_view_list';
    collection_item_image_display: string;
    collection_item_no_display: string;
    collection_item_title: string;  // rtitle/sn/custom/hide
    collection_item_descr_display: string;
  };
  step2_systemProperties: Array<{
    key: string;
    name: string;
    value: string;
    description: string;
    type: 'system' | 'additional';
    valueConfig?: object;
  }>;
  step2_customProperties: Array<{
    key: string;
    name: string;
    value: string;
    description: string;
  }>;
  step2_customConfigurations: Array<{
    key: string;
    name: string;
    type: 'input' | 'select';
    input: string;
    select: string[];
    description: string;
  }>;
}
```

---

## 6. CLI 特殊说明

### 6.1 单品添加
- CLI 接受命令行参数指定单品资源 ID 列表：`--items id1,id2,id3`
- 或交互式选择：TTY 多选器
- 自动验证资源存在性

### 6.2 自定义属性
- CLI 支持交互式配置自定义属性
- 每个属性的 value 输入限制 140 字符
- 最多 30 个自定义属性

### 6.3 可选配置
- CLI 仅在资源类型支持时提供此功能
- 简单文本输入或下拉选择

### 6.4 无草稿机制
- Console 有 300ms debounce 自动保存草稿
- CLI 不提供断点续传，需一次性完成

### 6.5 展示样式
- CLI 无需显示样式配置
- 仅记录排序方式即可

---

**End of C0-2 Documentation**
