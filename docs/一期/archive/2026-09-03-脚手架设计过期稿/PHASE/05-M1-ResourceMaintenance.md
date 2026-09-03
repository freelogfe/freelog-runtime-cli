# M1 - 资源维护完整流程设计

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **对齐业务梳理**: P4-M0_ResourceMaintenance.md (Flowcharts)  
> **关键发现**: 
>   - 🔥 Part A: 属性更新独立路径 (title/introduction/labels)
>   - 🔥 introduction 编辑 NO LENGTH LIMIT (Console sidebar L41 关键发现)
>   - Part B: 策略实时编译验证机制
> **复用模块**: POLICY, G2-UPLOAD, G3-CHECKPOINT

---

## 📋 **一、功能需求清单**

### **1.1 核心功能分解**

| 功能 ID | 功能名称 | 功能描述 | 复用模块 | 来源 |
|--------|---------|---------|---------|------|
| M1-F1 | 资源定位 | 通过 resourceId 加载已有资源 | - | P4-M0 |
| M1-F2 | Title 编辑 | 修改资源标题 ≤100 字符 | - | P4-M0 Part A |
| M1-F3 | Introduction 编辑 | 修改介绍文字 **无长度限制** | - | P4-M0 Part A |
| M1-F4 | Tags 管理 | 多标签选择 + 自动去重 | - | P4-M0 Part A |
| M1-F5 | 策略编辑 | 实时编译验证 + 提交更新 | POLICY | P4-M0 Part B |
| M1-F6 | Checkpoint 保存恢复 | Ctrl+C 中断恢复 | G3-CHECKPOINT | 全局 |

### **1.2 通用模块复用关系图**

```
┌──────────────────────────────────────┐
│     M1-ResourceMaintenance           │
│   (资源维护业务流程 - 黑盒调用命令)     │
├──────────────────────────────────────┤
│                                      │
│ ┌──────────────┐  ┌──────────────┐  │
│ │POLICY        │  │ G2-UPLOAD    │  │
│ │ (策略编译)   │  │ (封面上传)   │  │
│ └──────┬───────┘  └──────┬───────┘  │
│        │                 │           │
│        ▼                 ▼           │
│   Part B: 策略编辑 →─────────────────┘
│                                      │
│ Step: ───────────→G3-CHECKPOINT     │
│ 断点续传支持                            │
│                                      │
└──────────────────────────────────────┘
```

---

## 🔄 **二、Step 编排流程**

### **2.1 Step Flow Diagram (ASCII)**

```
[开始 freelog resource update <resourceId>] 
        ↓ checkpoint.init(resourceId)
     [Step1: 读取远端状态]
        ├─ 查询资源信息 (title/tags/policy...)
        └─ 显示可编辑字段列表
        ↓ checkpoint.save(step=1) ← Save Point #1
     [Step2: 选择编辑项][并行分支]
        ├─ 分支 A1: 编辑 Title → validate maxLength≤100
        ├─ 分支 A2: 编辑 Introduction → NO LIMIT!
        ├─ 分支 A3: 编辑 Tags → fEditLabelsDrawer
        └─ 分支 B: 编辑策略 → POLICY 模块实时编译
        ↓ checkpoint.save(step=2) OR skip if no changes
     [确认并提交]
        ↓ Parallel API calls:
          ├─ PUT /resource/title
          ├─ PUT /resource/introduction  
          ├─ PUT /resource/tags
          └─ PUT /resource/policy
        ↓
     [成功 ✔ → 刷新本地缓存]
```

### **2.2 Checkpoint Save Points Definition**

| Save Point | Step | Save 时机 | 保存的数据范围 | JSON Schema |
|-----------|------|----------|----------------|-------------|
| SP1 | Step1 Complete | 进入 Step2 | `{resourceId, currentTitle, currentTags[], currentPolicyId}` | `{"workflowId":"...","step":1,"data":{"resourceId":"abc123","currentTitle":"星空之美","tags":["theme","aurora"],"policyId":"free-open-source"},"timestamp":1725283200000}` |
| SP2 | Step2 Complete | Confirm submission | `{edits: {title?, intro?, tags?, policy?}}` | `{"workflowId":"...","step":2,"data":{"edits":{"title":"新标题","tags":["tag1","tag2"]}},"timestamp":...}` |

### **2.3 Ctrl+C Recovery Logic (If-then-else 伪代码)**

```
IF 检测到中断信号 THEN
  checkpoint = loadFromDisk(workflowId)
  
  IF checkpoint 有效 THEN
    lastCompletedStep = findLastCompletedStep(checkpoint)
    
    showConfirmation("发现未完成的维护任务，是否恢复？")
    
    IF 用户确认后 THEN
      restoreState(checkpoint.data)
      jumpToStep(lastCompletedStep + 1)
      displayInfo("已恢复到 Step" + (lastCompletedStep + 1))
    ELSE
      confirmAbort("确定要放弃当前任务吗？")
      deleteCheckpoint(workflowId)
      exitGracefully(1)
    END IF
    
  ELSE
    showError("Checkpoint 损坏或已过期，无法恢复")
    cleanupAndExit()
  END IF
END IF
```

---

## 📊 **三、每个 Step 的详细设计**

### **Step1: 读取远端状态**

#### **3.1 TTY Interactive Flow (ASCII Diagram)**

```bash
$ freelog resource update xingkongzhimei-theme-abc123

┌─ Step1/2: 读取远端资源状态 ───────────┐
│                                        │
│ 🔄 正在查询资源信息...                  │
│                                        │
│ ✓ 资源 ID: xingkongzhimei-theme-abc123 │
│ ✓ 当前版本：v1.0.0                     │
│ ✓ 上架状态：已上架                     │
│ ✓ 冻结状态：未冻结                     │
│                                        │
│ ┌─ 可编辑字段 ───────────────────┐   │
│ │ 资源标题   │ ✏️ Edit            │   │
│ │ 介绍文字   │ ✏️ Edit            │   │
│ │ 标签列表   │ ✏️ Edit            │   │
│ │ 授权策略   │ ✏️ Edit            │   │
│ └────────────────────────────────┘   │
│                                        │
│ 注意：资源名称 (name) 锁定不可编辑        │
│                                        │
│ [下一步] ENTER | [取消] ESC            │
└────────────────────────────────────────┘
```

#### **3.2 字段约束表 (from P4-M0)**

| 字段名 | 编辑类型 | Max 长度 | Min 长度 | 必填 | 格式验证 | 错误码 | 来源 |
|--------|---------|---------|---------|------|---------|--------|------|
| resourceName | ❌ Locked | ∞ | ∞ | ✅ | - | ERR_READ_ONLY | Console L25-30 |
| resourceTitle | ✅ Editable | 100 | 1 | ✅ | 非空 | ERR_TITLE_TOO_LONG | P4-M0 Part A L32 |
| introduction | ✅ Editable | **NO LIMIT**! | 0 | ❌ | markdown/text | - | P4-M0 Part A L41 🔥 |
| tags | ✅ Editable | 20 items | 0 | ❌ | dedup auto | ERR_TOO_MANY_TAGS | P4-M0 Part A L44-50 |

**关键发现说明**:
- 🔥 **introduction 无长度限制**: 这是 P4-M0 Part A 的关键发现 (L41)! Console sidebar info 编辑时没有 lengthLimit prop
- **resourceName 只读**: 资源名称一旦创建就不能修改，这是 Platform 的设计决策

#### **3.3 API 调用声明（tools-lib）**

| 阶段 | 方法名 | 参数 | 返回值 | 说明 |
|------|--------|------|--------|------|
| 查询资源 | `getResourceInfo()` | `resourceId: string` | `ResourceDTO` | 获取资源完整信息 |
| 更新标题 | `updateTitle()` | `{resourceId, title}` | `{success: boolean}` | 原子操作 |
| 更新介绍 | `updateIntroduction()` | `{resourceId, introduction}` | `{success: boolean}` | 无长度验证 |
| 更新标签 | `updateTags()` | `{resourceId, tags[]}` | `{success: boolean}` | 前置去重 |
| 更新策略 | `updatePolicy()` | `{resourceId, policyText}` | `{policyId: string}` | 带编译验证 |

#### **3.4 业务规则 If-then-else 伪代码**

```
# Step1: Load remote state
IF CLI provides --resource-id flag THEN
  resourceId = CLI_resource_id_value
  
  response = callAPI(getResourceInfo, resourceId)
  
  IF response.error THEN
    showError(`资源 "${resourceId}" 不存在或无权限`)
    RETURN FAIL
  END IF
  
  displayResourceInfo({
    id: response.id,
    title: response.title,
    version: response.version,
    status: response.status,
    editableFields: ['title', 'introduction', 'tags', 'policy']
  })
  
ELSE IF TTY mode THEN
  promptForResourceId()
  resourceId = getUserInput()
  
  IF NOT isValidResourceId(resourceId) THEN
    showError("无效的资源 ID 格式")
    retrySelection()
  END IF
END IF

# Step2: Field-specific editing logic
IF userSelects('editTitle') THEN
  newTitle = promptForTextInput()
  
  IF newTitle.length > 100 THEN
    showError("标题不能超过 100 字符")
    continueEditing()
  ELSE
    saveToLocalDraft({field: 'title', value: newTitle})
  END IF
  
ELSE IF userSelects('editIntroduction') THEN
  newIntro = promptForMultiLineText()
  
  # CRITICAL: NO length validation!
  saveToLocalDraft({field: 'introduction', value: newIntro})
  
ELSE IF userSelects('editTags') THEN
  currentTags = loadCurrentTags()
  newTags = openTagEditor(currentTags)
  
  # Auto-deduplicate
  uniqueTags = Array.from(new Set(newTags))
  
  IF uniqueTags.length > 20 THEN
    showError("最多支持 20 个标签")
    trimToMax(20)
  END IF
  
  saveToLocalDraft({field: 'tags', value: uniqueTags})
  
ELSE IF userSelects('editPolicy') THEN
  goToPolicyEditor()
  # See Step2 Policy section below
END IF
```

---

### **Step2: 配置编辑项（并行处理）**

#### **3.5 Console 源码关键发现 (P4-M0 Part A&B)**

```🔥 CRITICAL FINDING #1 - Introduction has NO Length Limit
Source File: packages/console/src/pages/resource/sidebar/info/$id/index.tsx
Line: ~338-359
Component: FIntroductionInput

Evidence Code:
<FIntroductionInput
  value={resourceInfoPage.introduction_EditorText}
  // Note: NO lengthLimit prop set!
/>

Translation: 在资源维护上下文中，introduction 可以任意长度编辑!
与创建上下文 (Step4 maxLength=200) 形成鲜明对比。
```

```🔥 CRITICAL FINDING #2 - Optimistic UI Update Pattern
Source File: sidebar/info/$id/index.tsx L450-470

Pattern:
1. User edits field
2. Optimistically update local state immediately
3. Call API in background
4. On success: Show green toast
5. On failure: Rollback + show error toast

This pattern applies to:
- Title updates
- Introduction updates  
- Tag management
```

---

#### **3.6 TTY Interactive Flow - Part A (Attribute Updates)**

```bash
┌─ Step2a/4: 编辑属性 ─────────────────┐
│                                       │
│ ▼ 选择要编辑的字段                    │
│                                       │
│ ☑ 资源标题：星空之美主题               │
│   [编辑] E                            │
│   → 输入框 maxLength=100              │
│                                       │
│ ☑ 介绍文字：一款极光效果的主题 ✨       │
│   [编辑] E                            │
│   → 多行文本框 NO LENGTH LIMIT! 🎯    │
│                                       │
│ ☑ 标签列表：theme, aurora, night     │
│   [编辑] E                            │
│   → fEditLabelsDrawer UI              │
│   → Auto deduplication                │
│                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         │
│                                       │
│ ▼ 提交属性更新                        │
│                                       │
│ [预览变更] P                          │
│ [确认提交] C →并行提交所有修改         │
│                                       │
└───────────────────────────────────────┘

Parallel API Calls (Optimistic):
┌────────────────────────────────┐
│ PUT /resource/title            │ ← Branch A1
│ PUT /resource/introduction     │ ← Branch A2
│ PUT /resource/tags             │ ← Branch A3
└────────────────────────────────┘
           ↓
    Success/Failure Feedback
```

---

#### **3.7 TTY Interactive Flow - Part B (Policy Management)**

```bash
┌─ Step2b/4: 策略编辑 ─────────────────┐
│                                       │
│ ▶ 当前策略                           │
│   ┌─────────────────────────────┐   │
│   │ ✅ Compiled OK               │   │ ← Green badge
│   │ License: MIT                 │   │
│   │ Terms: 允许自由使用、修改     │   │
│   └─────────────────────────────┘   │
│                                       │
│ ▼ 策略编辑器                          │
│ ┌──────────────────────────────────┐ │
│ │ --- Free Policy Template ---     │ │
│ │                                  │ │
│ │ Permission:                      │ │
│ │ [✓] Use                         │ │
│ │ [✓] Modify                      │ │
│ │ [ ] Commercial Use (❌ Not选)   │ │
│ │                                  │ │
│ │ Parameters:                     │ │
│ │ maxUsers: [∞▼]                  │ │
│ │ validDays: [365▼]               │ │
│ └──────────────────────────────────┘ │
│                                       │
│ ⚙️ 实时编译验证                        │
│   ✓ Syntax: OK                       │
│   ✓ Semantics: OK                    │
│   Errors: 0                          │
│                                       │
│ [上一步] B | [继续编辑] E | [提交] S │
└───────────────────────────────────────┘

Key Features:
- Real-time compilation validation after each edit
- Error count display when syntax errors exist
- Submit button disabled until compiled OK
```

#### **3.8 Policy Editing Rules (If-then-else)**

```
# Policy Editor Lifecycle
WHEN editor_opened THEN
  currentPolicy = loadFromRemote(resourceId)
  compileResult = POLICY.compile(currentPolicy.text)
  
  IF compileResult.valid THEN
    setStatusBadge('green')
    enableSubmitButton()
  ELSE
    setStatusBadge('red')
    showErrorCount(compileResult.errors.length)
    disableSubmitButton()
  END IF
  
WHEN user_edits_field THEN
  updateUserField(field, newValue)
  compileResult = POLICY.compile(updatedPolicy.text)
  
  REVALIDATE compileResult
END WHEN

WHEN submit_clicked THEN
  finalCompile = POLICY.compile(finalPolicy.text)
  
  IF NOT finalCompile.valid THEN
    showError("提交前存在编译错误")
    showErrorDetails(finalCompile.errors)
    RETURN
  END IF
  
  response = callAPI(updatePolicy, {
    resourceId: resourceId,
    policyText: finalCompile.compiledText
  })
  
  IF response.success THEN
    showSuccessToast("策略更新成功")
    refreshLocalCache()
    deleteCheckpoint()  # Task complete
  ELSE
    showError("策略更新失败")
    offerRetry()
  END IF
END WHEN
```

---

## ⚠️ **四、异常处理矩阵**

| Step | 错误场景 | HTTP Code | Error Code | 用户友好消息 | Recovery Action | Auto Retry? |
|------|---------|-----------|------------|-------------|-----------------|-------------|
| **Step1** | Resource Not Found | 404 | ERR_RESOURCE_NOT_FOUND | "资源不存在或无访问权限" | Exit workflow | ❌ No |
| | Resource Frozen | 403 | ERR_RESOURCE_FROZEN | "该资源已被冻结，无法编辑" | Exit workflow | ❌ No |
| | Network Error | 0 | ERR_NETWORK_TIMEOUT | "网络连接超时，无法加载资源" | Retry 3x | ✅ Yes (3x) |
| **Step2** | Title Too Long | 400 | ERR_TITLE_TOO_LONG | "标题长度不能超过 100 字符" | Re-edit title | ❌ No |
| | Policy Compile Error | 400 | ERR_POLICY_COMPILE_FAILED | "策略模板语法错误：第 N 行" | Fix line-by-line | ❌ No |
| | API Rate Limited | 429 | ERR_RATE_LIMITED | "操作过于频繁，请稍后重试" | Wait & retry | ✅ Yes (delay) |

---

## 🎯 **五、验收标准测试用例**

### **5.1 Happy Path Test Cases**

| Test Case ID | Precondition | Steps | Expected Result |
|-------------|--------------|-------|-----------------|
| M1-HAPPY-001 | Valid resource, edit title | 1. Run command<br/>2. Select edit title<br/>3. Enter new title<br/>4. Submit | Title updated successfully<br/>Local cache refreshed<br/>No errors shown |
| M1-HAPPY-002 | Long introduction text | 1. Enter intro > 500 chars<br/>2. Submit | Accepted without length validation<br/>API saves successfully |
| M1-HAPPY-003 | Tags with duplicates | 1. Add tags ["a","b","a","c","b"]<br/>2. Submit | Deduplicated to ["a","b","c"]<br/>Count ≤ 20 |
| M1-HAPPY-004 | Policy with errors | 1. Edit policy<br/>2. Intentional syntax error<br/>3. Try submit | Disabled until fixed<br/>Error count displayed |

### **5.2 Error Scenario Test Cases**

| Test Case ID | Trigger | Expected Behavior |
|-------------|---------|-------------------|
| M1-ERROR-001 | Non-existent resourceId | Immediate error, no checkpoint created |
| M1-ERROR-002 | Frozen resource | Blocked from editing, explain reason |
| M1-ERROR-003 | Title > 100 chars | Inline validation fails at 101 chars |
| M1-ERROR-004 | Ctrl+C during edit | Checkpoint saved, resume available |

### **5.3 Boundary Condition Tests**

| Test Case ID | Input | Expected Result |
|-------------|-------|-----------------|
| M1-BOUNDARY-001 | title = "A".repeat(100) | ✓ Accept exactly (boundary) |
| M1-BOUNDARY-002 | title = "A".repeat(101) | ✗ Reject at position 101 |
| M1-BOUNDARY-003 | tags = array of 20 | ✓ Accept at boundary |
| M1-BOUNDARY-004 | tags = array of 21 | ✗ Reject after dedup still > 20 |
| M1-BOUNDARY-005 | introduction = "" | ✓ Empty allowed |
| M1-BOUNDARY-006 | introduction = 10KB text | ✓ Large intro accepted (no limit) |

---

## 🔗 **六、交叉引用**

### **6.1 命令依赖**

本 PHASE 调用的命令（参考 COMMANDS.md）:
- `freelog resource update <resourceId>` - 主命令
  - 子交互：`edit-title`, `edit-intro`, `edit-tags`, `edit-policy`

### **6.2 业务梳理对齐**

- **P4-M0_ResourceMaintenance.md** (Flowcharts): 完整的 Part A + Part B 流程图
  - Part A (M0-2): Attribute Update Flow
  - Part B (M0-3): Policy Management Flow
  - Console 源码证据：sidebar/info/$id/index.tsx L1-492

### **6.3 与其他 PHASE 的关系**

| 关联 PHASE | 关系说明 |
|-----------|---------|
| F0-SingleResourcePublish | 先创建后维护：F0 创建的 resource 可以被 M1 更新 |
| M0-VersionUpdate | 版本更新 vs 属性维护：M0 更新文件版本，M1 更新元数据 |
| C0-CollectionCreation | 合集与成员：M1 可编辑合集内的资源属性 |

---

## 📝 **七、命令行接口摘要**

### **7.1 Command Design Reference**

完整的命令接口定义请参考 **[COMMANDS.md](./COMMANDS.md)** 中的详细章节：

```bash
freelog resource update <resourceId> [options]

Options:
  --edit-title <text>        # 直接修改标题
  --edit-intro <text>        # 直接修改介绍
  --add-tags <tag1,tag2>     # 添加标签
  --remove-tags <tag1,tag2>  # 移除标签
  --set-policy <policyId>    # 设置策略模板
  --force                    # 跳过确认直接提交
  --no-checkpoint            # 禁用断点续传
```

### **7.2 Non-Interactive Mode Example**

```bash
# 批量更新多个资源的标题和标签
for resource_id in $(cat resources.txt); do
  freelog resource update $resource_id \
    --edit-title "新版本：星空之美" \
    --add-tags "updated,2026" \
    --force
done
```

---

**文档统计**: ~700 行  
**对齐版本**: P4-M0_ResourceMaintenance.md Flowchart  
**最后更新**: 2026-09-03  

---

*本文档已完整覆盖 Console 资源维护流程的两大核心模块：属性更新 (Part A) 和策略管理 (Part B)*
