# C0-4 · RSS 自动化收录设置

> **对齐 Source**: Console `collectionCreator/Step4/index.tsx` L1-324  
> **核心职责**: 配置合集封面、描述、更新设置和标签  
> **CLI 限制**: RSS 模式下部分字段禁用

---

## 1. 流程总览

```bash
$ freelog collection create ./rss/feed.xml --type theme

[Step4] RSS 自动化收录设置
  ├─ 封面上传：支持 JPG/PNG/GIF (非动画)
  ├─ 短描述：200 字符限制
  ├─ 更新设置：状态/可见性配置
  └─ 标签管理：fEditLabelsDrawer 弹窗
```

---

## 2. Console 源码证据与业务流程

### 2.1 封面上传 (L53-104)

**Console 位置**: L53-104

**业务流程**:
```typescript
// 判断是否为 RSS 合集
const isRssCollection = collectionCreatorPage.step2_rssImportProcessing;

// 封面上传组件
<FUploadCover
  disabled={isRssCollection}       // RSS 模式禁止修改封面
  onUploadSuccess={(url) => {
    dispatch(onChange_step4_resourceCover({ value: url }));
  }}
  onError={(err) => {
    fMessage(err, 'error');
  }}
>
  {step4_resourceCover === '' && (
    <a className={styles.FUploadImageChildren}>
      <FIcons.FCloudUpload />
      <span>{upload_image}</span>
    </a>
  )}

  {step4_resourceCover !== '' && (
    <div className={styles.cover}>
      <FCoverImage src={step4_resourceCover} width={200} />
      {!isRssCollection && (              // RSS 模式不显示编辑按钮
        <div className={styles.coverEdit}>
          <FIcons.FEdit />
          <span>{btn_edit_cover}</span>
        </div>
      )}
    </div>
  )}
</FUploadCover>
```

**说明文案**(L61):
- "只支持 JPG/PNG/GIF，GIF 文件不能动画化，大小不超过 5M，建议尺寸为 800X600"
- "未上传封面时，默认使用系统封面"

**CLI 对应实现**:
- RSS 模式跳过封面上传 (自动从第一条资源获取)
- 普通模式可上传自定义封面或使用自动生成

---

### 2.2 短描述 (L108-131)

**Console 位置**: L108-131

**业务流程**:
```typescript
<div className={isRssCollection ? styles.disabledField : undefined}>
  <FInput.FMultiLine
    value={step4_resourceIntroduction}
    lengthLimit={200}           // Console 限制！
    onChange={(e) => {
      if (isRssCollection) {     // RSS 模式禁止编辑
        return;
      }
      dispatch(change({ step4_resourceIntroduction: e.target.value }));
    }}
  />
</div>
```

**字段约束**:
- ✅ **短描述**: maxLength=200(L117)
- ✅ **RSS 模式**: 禁止编辑此字段

---

### 2.3 更新设置 (L135-151)

**Console 位置**: L135-151

**业务流程**:
```typescript
<UpdateStatesSettingBlock
  disabled={isRssCollection}        // RSS 模式禁用
  username={userInfo?.userName || ''}
  resourceID={''}                   // 合集 ID(新创建时空)
  value={step4_updateSetting}
  onChange={(value) => {
    if (isRssCollection) return;
    dispatch(change({ step4_updateSetting: value }));
  }}
/>
```

**UpdateStatesSettingBlock 数据结构** (参考 sidebar 模块):
```typescript
interface UpdateSetting {
  conditions: Array<{
    key: string;                    // 条件类型 (如"更新时间","新增时间")
    value: string;                  // 条件值
    valueError?: string;            // 错误信息
  }>;
  autoUpdate?: boolean;             // 是否自动更新
  notifySubscribers?: boolean;      // 通知订阅者
}
```

---

### 2.4 标签管理 (L155-244)

**Console 位置**: L155-244

**业务流程**:
```typescript
// 空状态提示
{step4_resourceLabels.length === 0 && (
  <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
    <FContentText text={'rqr_input_resouce_tag_empty_msg'} type={'additional2'} />
    
    <FRectBtn
      onClick={async () => {
        const result = await fEditLabelsDrawer({
          labels: [],
          resourceTypeCode: step1_createdResourceInfo?.resourceTypeCode || undefined,
        });
        if (!result) return;
        
        dispatch(onChange_step4_resourceLabels({ value: result }));
      }}
    >
      {rqr_input_resouce_tag_empty_btn}
    </FRectBtn>
  </div>
)}

// 已有标签展示
{step4_resourceLabels.length > 0 && (
  <ResourceLabelsCard
    labels={step4_resourceLabels || []}
    onClick={async () => {
      const result = await fEditLabelsDrawer({
        labels: step4_resourceLabels || [],
        resourceTypeCode: step1_createdResourceInfo?.resourceTypeCode || undefined,
      });
      if (!result) return;
      
      dispatch(onChange_step4_resourceLabels({ value: result }));
    }}
  />
)}
```

**fEditLabelsDrawer 参数结构**:
```typescript
interface EditLabelsParams {
  labels: string[];                 // 当前标签列表
  resourceTypeCode?: string;        // 资源类型代码 (用于推荐)
}

// 返回值
type LabelResult = null | string[];   // null 表示取消，string[] 为新的标签列表
```

---

### 2.5 提交流程 (L292-312)

**Console 位置**: L292-312

**业务流程**:
```typescript
<FRectBtn
  disabled={
    step4_resourceIntroduction.length > 200 ||        // 超过长度限制
    step4_updateSetting.conditions.some((c) => {     // 有错误条件
      return c.value === '' || c.valueError !== '';
    })
  }
  type={'primary'}
  onClick={async () => {
    // 如已有策略，显示处理中提示
    if (step3_policies.length > 0) {
      set$inProcessModal(true);
      await FUtil.Tool.promiseSleep(500);
    }
    dispatch(onClick_step4_submitBtn());
  }}
>
  {cqr_step4_btn_release}
</FRectBtn>
```

---

## 3. 字段约束汇总

| 字段 | 长度限制 | 必填 | 验证规则 | Console 证据 |
|------|---------|------|---------|-------------|
| 封面图片 | ≤5MB | 否 | JPG/PNG/GIF(非动画) | Step4 L53-104 |
| 短描述 | ≤200 | 否 | 超长按钮禁用 | Step4 L117,L294 |
| 更新设置条件 | - | 是 | 无空值和错误 | Step4 L295-297 |
| 标签数量 | 最多 10 | 否 | fEditLabelsDrawer 内部校验 | Step4 L197,L226 |

---

## 4. API 契约

### FServiceAPI.Collection.create (创建合集)

**Request**:
```typescript
{
  resourceTypeCode: string;         // 资源类型代码
  collectionTitle: string;          // 合集标题
  collectionDescription?: string;   // 合集描述
  coverImages?: string[];           // 封面 URL 数组
  tags?: string[];                  // 标签数组
  updateSettings?: UpdateSetting;   // 更新设置
  policies?: Array<{                // 授权策略
    policyId: string;
    status: 1 | 0;
  }>;
}
```

**Response**:
```typescript
{
  collectionId: string;
  resourceId: string;               // 合集资源 ID
  resourceName: string;
  resourceTitle: string;
  status: 'draft' | 'online';
  message?: string;                 // 失败原因
}
```

---

## 5. CLI 特殊说明

### 5.1 RSS 模式处理

**检测逻辑**:
```typescript
function isRSSMode(collectionData: CollectionConfig): boolean {
  return !!collectionData.rssUrl || collectionData.autoPublish === true;
}

// RSS 模式下的行为
if (isRSSMode(config)) {
  step4_resourceCover.disabled = true;
  step4_resourceIntroduction.disabled = true;
  step4_updateSetting.disabled = true;
  // 仅允许修改标签
}
```

### 5.2 封面自动生成

```typescript
async function generateCover() {
  if (!config.customCover) {
    // 从第一条资源获取封面
    const firstResource = await getFirstResourceInCollection();
    config.collectionCover = firstResource.coverImages[0];
  }
}
```

### 5.3 标签交互

命令行方式添加标签:
```bash
freelog collection create --tags "主题,免费，设计"
```

或交互式:
```
请为合集添加标签 (多个标签用逗号分隔):
> 主题，免费，设计
```

---

**End of C0-4 Documentation**
