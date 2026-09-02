# 业务梳理 vs Console 源码完整对齐检查报告

> **生成时间**: 2026-09-02  
> **目标**: 系统性地逐一核对业务梳理中的每个文件与 Console 源码，确保 100% 完整对齐  
> **原则**: CLI 设计有取舍，但核心流程和字段约束必须精确

---

## 📊 **核对总览**

### **待核对文件总数**: 17 个文件

| 编号 | 业务梳理文件 | Console 对应文件 | 预估行数 | 优先级 | 状态 |
|------|-------------|----------------|---------|--------|------|
| F0-1 | 流程设计 - 创建资源/01-1-Step1-创建资源壳.md | creator/Step1/index.tsx | ~320 | CRITICAL | ✅ 已完成 |
| F0-2 | 流程设计 - 创建资源/01-2-Step2-上传资源与配置.md | creator/Step2/index.tsx | ~1063 | CRITICAL | ✅ 已完成 |
| F0-3 | 流程设计 - 创建资源/01-3-Step3-配置授权策略.md | creator/Step3/index.tsx | ~228 | HIGH | ⏳ 待核对 |
| F0-4 | 流程设计 - 创建资源/01-4-Step4-完善 Listing.md | creator/Step4/index.tsx | ~91 | MEDIUM | ⏳ 待核对 |
| M0-1 | 资源管理/01-版本更新.md | versionCreator/$id/index.tsx | ~1239 | CRITICAL | ✅ 已完成 |
| M0-2 | 资源管理/02-属性与描述更新.md | sidebar/info/$id/index.tsx | ~492 | CRITICAL | ⏳ 发现重大差异 |
| M0-3 | 资源管理/03-授权策略管理.md | sidebar/policy/$id/index.tsx | TBD | CRITICAL | ⏳ 待核对 |
| C0-1 | 流程设计 - 创建合集/03-1-Step1-扫描本地目录.md | collectionCreator/Step1/index.tsx | ~295 | CRITICAL | ⏳ 待核对 |
| C0-2 | 流程设计 - 创建合集/03-2-Step2-填写合集信息.md | collectionCreator/Step2/index.tsx | ~1505 | CRITICAL | ⏳ 待核对 |
| C0-3 | 流程设计 - 创建合集/03-3-Step3-选择资源并排序.md | collectionCreator/Step3/index.tsx | ~145 | HIGH | ⏳ 待核对 |
| C0-4 | 流程设计 - 创建合集/03-4-Step4-配置收录规则.md | collectionCreator/Step4/index.tsx | TBD | HIGH | ⏳ 待核对 |
| C0-5 | 流程设计 - 创建合集/03-5-Step5-完善 Listing 并上架.md | collectionCreator/Step5/index.tsx | TBD | HIGH | ⏳ 待核对 |
| C2-1 | 合集管理/01-单品管理.md | collectionDetails/, collectionSidebar/versionInfo | TBD | CRITICAL | ⏳ 待核对 |
| C2-2 | 合集管理/02-合集信息.md | collectionSidebar/info | TBD | HIGH | ⏳ 待核对 |
| C2-3 | 合集管理/03-策略管理.md | collectionSidebar/policy | TBD | HIGH | ⏳ 待核对 |
| F1-1 | 批量发布/F2.1-批量发布总纲.md | creatorBatch/Handle/Card, Finish | TBD | CRITICAL | ⏳ 待核对 |

---

## 🔥 **已完成核对的关键发现**

### **1. F0-1: Step1-创建资源壳 (creator/Step1/index.tsx)**

**核对结果**: ✅ 已完成详细核对  
**Console 文件路径**: `D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/creator/Step1/index.tsx`  
**总行数**: ~320 行

**关键发现:**

#### **字段约束详情:**

| 字段 | 组件名 | maxLength | 验证规则 | Console 证据 |
|------|--------|-----------|----------|-------------|
| 资源类型 | `FResourceTypeInput4` | - | 必填 | L91-102 |
| 标题 | `FInput_PinyinSafeTextCounter` | **100** | 必填 | L126-155 |
| authId | `FInput_PinyinSafeTextCounter` | **60** | 必填 + 唯一性 | L196-215 |

**⚠️ 重要差异发现**:
- **标题最大长度 = 100 字符** (`L128: lengthLimit={100}`)
- **❌ 业务梳理中如果写的是 200 字符，是错误的!**

**Console 证据:**
```typescript
// F0-1: creator/Step1/index.tsx (L126-138)
<FInput_PinyinSafeTextCounter
  value={resourceCreatorPage.step1_resourceTitle}
  lengthLimit={100}        // ✅ 标题最大长度 = 100
  style={{ width: '100%' }}
  placeholder={FI18n.i18nNext.t('cqr_input_title_hint')}
  onChangeValue={(value) => {
    // ... 自动更新 authId 逻辑
    const name: string = value.substring(0, 60);
    if (resourceCreatorPage.step1_resourceTitle === resourceCreatorPage.step1_resourceName && name !== resourceCreatorPage.step1_resourceName) {
      run();  // 触发 300ms debounce
      dispatch<OnChange_step1_resourceName_Action>({
        type: 'resourceCreatorPage/onChange_step1_resourceName',
        payload: { value: name },
      });
    }
  }}
/>
```

**禁止字符自动转换 (L140 注释):**
```typescript
// .replace(new RegExp(/(\|\/|:|\*|\?|"|<|>|\||\s|@|\$|#)+/, 'g'), '_');
// 禁止字符：| / : * ? " < > | \s @ $ #
// 替换为：_ (下划线)
```

**300ms Debounce + 唯一性验证 (L27-36):**
```typescript
const { run } = AHooks.useDebounceFn(
  () => {
    dispatch<OnVerify_step1_resourceName_Action>({
      type: 'resourceCreatorPage/onVerify_step1_resourceName',
    });
  },
  {
    wait: 300,    // ✅ 300ms debounce
  },
);
```

**authId 自动生成逻辑 (L139-152):**
```typescript
const name: string = value.substring(0, 60);  // 截取前 60 字符作为 authId
if (title === resourceName && name !== resourceName) {
  run();  // 触发验证
  dispatch<OnChange_step1_resourceName_Action>({...});
}
```

**影响范围:**
- ⚠️ 如果业务梳理或 PHASE 文档中标题长度写的是 200 字符，必须修正为 100!
- ⚠️ authId 的最大长度是 60 字符 (标题的前 60 个字符)

---

### **2. F0-2: Step2-上传资源与配置 (creator/Step2/index.tsx)**

**核对结果**: ✅ 已完成初步核对  
**Console 文件路径**: `D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/creator/Step2/index.tsx`  
**总行数**: ~1063 行

**关键发现:**
- ✅ fResourcePropertyEditor3(补充属性弹窗): value maxLength = **100 字符**
- ✅ fResourceOptionEditor(可选配置弹窗): type='input'或'select'
- ✅ FMicroAPP_Authorization(依赖授权组件): 增删查改完整实现

**⚠️ 重要差异发现**:
- **M0 版本更新中**: value maxLength = **140 字符** (`versionCreator/$id/index.tsx L813`)
- **F0 单资源创建中**: value maxLength = **100 字符** (`creator/Step2/index.tsx L613`)

**影响范围**: 
- ⚠️ 如果后续 UI 组件或 API 没有区分这两种长度，可能导致数据截断
- ⚠️ PHASE 文档中需要明确标注这种差异

**Console 证据**:
```typescript
// F0 - creator/Step2/index.tsx (L607-614)
value_Editable: {
  text: {
    nullable: true,
    minLength: 0,
    maxLength: 100        // ✅ F0=100
  }
};

// M0 - versionCreator/$id/index.tsx (L809-816)
value_Editable: {
  text: {
    nullable: true,
    minLength: 0,
    maxLength: 140        // ✅ M0=140
  }
};
```

---

### **2. M0-1: 版本更新 (versionCreator/$id/index.tsx)**

**核对结果**: ✅ 已完成初步核对  
**Console 文件路径**: `D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/versionCreator/$id/index.tsx`  
**总行数**: ~1239 行

**关键发现:**
- ✅ 补充属性 value maxLength = **140 字符**
- ✅ 可选配置最大数量 = 30 个
- ✅ key/name 唯一性校验逻辑完整
- ✅ Draft 自动保存防抖时间 = 300ms (`useDebounceEffect L95-110`)

---

## ⚠️ **高度可疑的遗漏点**

### **1. C0-2: Step2-填写合集信息 (collectionCreator/Step2/index.tsx)**

**预警等级**: 🔴 高危 - 1505 行文件，存在大量遗漏风险!

**预估遗漏项:**
- ❓ 封面图片上传组件及验证规则
- ❓ 合集标题/描述的字符限制
- ❓ package.json 自动解析逻辑
- ❓ 必填字段校验规则
- ❓ TTY 表单交互细节

**下一步动作**: 必须立即深度读取该文件

---

### **2. F0-1: Step1-创建资源壳 (creator/Step1/index.tsx)**

**预警等级**: 🟡 中危 - ~472 行，可能存在遗漏

**预估遗漏项:**
- ❓ 资源类型 Tree 结构的具体实现
- ❓ 标题输入 200 字符限制的 Console 证据
- ❓ authId 生成算法的拼音转换逻辑
- ❓ 300ms debounce 的唯一性验证代码
- ❓ 禁止字符列表的详细定义

---

## 📋 **详细核对计划**

### **阶段 1：核心流程深度核对 (优先级 CRITICAL)**

**执行顺序**: F0-1 → F0-2 → F0-3 → F0-4 → M0-1 → M0-2 → M0-3

#### **任务 1.1: F0-1 Step1-创建资源壳**
- **Console 文件**: `creator/Step1/index.tsx (~472 行)`
- **核对重点**:
  1. 资源类型 Tree 结构的默认选中逻辑
  2. 标题输入框的 200 字符限制和禁止字符列表
  3. generateAuthId() 函数的具体实现
  4. 300ms debounce + unique validation 的代码
- **预期输出**: 补充缺失的字段约束和 Console 源码证据

#### **任务 1.2: F0-2 Step2-上传资源与配置**
- **Console 文件**: `creator/Step2/index.tsx (~1063 行)`
- **核对重点**:
  1. 4 种上传方式 (localUpload/storageSpace/markdownEditor/cartoonEditor) 的分支逻辑
  2. FAttrsAndConfigs 组件的 value_Editable 配置
  3. videoCover 上传的条件判断 (`isVideoResource`)
  4. Draft 自动保存的 debounce 实现
  5. FMicroAPP_Authorization 组件的 prop 传递
- **预期输出**: 已核对完成，需补充 M0/F0 value 长度差异说明

#### **任务 1.3: F0-3 Step3-配置授权策略**
- **Console 文件**: `creator/Step3/index.tsx (~228 行)`
- **核对重点**:
  1. 3 种策略模板 (free/paid/custom) 的选择逻辑
  2. PolicyEngine.compile() 的参数和返回值
  3. 动态表单渲染器的 Schema 解析
- **预期输出**: 确认 G1-POLICY 是否完整覆盖

#### **任务 1.4: F0-4 Step4-完善 Listing**
- **Console 文件**: `creator/Step4/index.tsx (~91 行)`
- **核对重点**:
  1. 封面图片验证规则 (格式/大小 <5MB/尺寸≥800×600)
  2. 标签处理的最大数量限制 (20 个?)
  3. 描述字段的字符范围 (50-1000?)
- **预期输出**: 补充具体的数字约束

---

### **阶段 2：资源维护详细核对 (优先级 HIGH)**

**执行顺序**: M0-2 → M0-3

#### **任务 2.1: M0-2 属性与描述更新**
- **Console 文件**: `sidebar/info.tsx` (需要先找到完整路径)
- **核对重点**:
  1. 可编辑字段的清单
  2. 修改前后的状态管理
  3. API 调用链路
- **预期输出**: 补充缺失的字段列表和约束

#### **任务 2.2: M0-3 授权策略管理**
- **Console 文件**: `sidebar/policy.tsx`
- **核对重点**:
  1. 策略更换的流程
  2. 免费→付费切换的特殊处理
  3. 历史策略的版本保留
- **预期输出**: 确认 M3 场景的细节完整性

---

### **阶段 3：合集创建深度核对 (优先级 CRITICAL)**

**执行顺序**: C0-1 → C0-2 → C0-3 → C0-4 → C0-5

**特别警告**: C0-2 (Step2) 有 1505 行，是最大的嫌疑文件!

#### **任务 3.1: C0-1 Step1-扫描本地目录**
- **Console 文件**: `collectionCreator/Step1/index.tsx (~295 行)`
- **核对重点**:
  1. DirectoryScanner 的实现
  2. Episode 解析逻辑 (JSON/RSS XML)
  3. GUID 必填验证
- **预期输出**: 对比业务梳理中的扫描算法

#### **任务 3.2: C0-2 Step2-填写合集信息 ⚠️**
- **Console 文件**: `collectionCreator/Step2/index.tsx (~1505 行)`
- **核对重点**:
  1. 封面上传组件及验证规则
  2. 合集标题/描述的约束
  3. package.json 自动填充逻辑
  4. 所有必填字段的校验
- **预期输出**: **极大概率存在大量遗漏!**

#### **任务 3.3-3.5: Step3-5**
- 依次核对剩余 Steps
- 重点关注 RSS Binding 流程

---

### **阶段 4：批量发布核对 (优先级 CRITICAL)**

#### **任务 4.1: F1-1 批量发布总纲**
- **Console 文件**: `creatorBatch/Handle/Card.tsx`, `Finish.tsx`
- **核对重点**:
  1. 批量导入的核心算法
  2. 错误卡片/ErrorCard 的处理
  3. 进度条渲染器
- **预期输出**: 补充批量处理的 Checkpoint 机制

---

## 🎯 **CLI 设计取舍回顾**

### **依赖管理 - 纯免费策略签约**
- ✅ CLI 添加依赖时只需要对免费策略完成签约即可发行
- ❌ CLI 不支持付费策略的签约支付流程 (需要 Console Handoff)
- 🔄 付费策略依赖标记为"稍后处理",用户可以跳过

**证据**:
- `FMicroAPP_Authorization`组件在 Console 中使用
- CLI 使用 `dep init-auth-map` 生成模板
- CLI 调用 batchCreateContracts + batchSetContracts API

### **Draft vs Checkpoint**
- ✅ Console 支持 Draft 自动保存 (300ms debounce)
- ✅ CLI 支持 Checkpoint 断点续传 (Ctrl+C 后恢复)
- **对齐**: 两者实现不同的技术路径，但业务目标一致

---

## 📝 **附录：Console 源码完整路径索引**

```
D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/
├── creator/
│   ├── Step1/           # F0-1
│   │   └── index.tsx    (~472 行)
│   ├── Step2/           # F0-2
│   │   └── index.tsx    (~1063 行)
│   ├── Step3/           # F0-3
│   │   └── index.tsx    (~228 行)
│   └── Step4/           # F0-4
│       └── index.tsx    (~91 行)
├── versionCreator/
│   └── $id/             # M0-1
│       └── index.tsx    (~1239 行)
├── collectionCreator/   # C0-1~C0-5
│   ├── Step1/           (~295 行)
│   ├── Step2/           (~1505 行)🔴
│   ├── Step3/           (~145 行)
│   └── Step4/           (?)
├── collectionDetails/   # C2-1
│   └── $id/
├── collectionSidebar/   # C2-2, C2-3
│   ├── info/
│   ├── policy/
│   └── versionInfo/
├── creatorBatch/        # F1-1
│   ├── Handle/
│   │   └── Card.tsx
│   └── Finish/
└── sidebar/             # M0-2, M0-3
    ├── info/
    └── policy/
```

---

**结束**。此报告将持续更新，每完成一项核对就补充详细内容。
