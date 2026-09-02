# P3-Phase-3 资源维护

> **版本**: v1.0 | **最后更新**: 2026-09-02  
> **对齐 Source**: `packages/cli/src/phases/P3-maintenance.ts` + `business/业务梳理/资源管理/`

---

## 📋 **一、Phase 职责**

P3-Phase-3 负责资源发布后的维护操作，调度业务梳理中的**M1-M5 五个维护流程**:

```
┌──────────────────────────────────────────────┐
│         P3-Phase-3 资源维护                   │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─ M1 版本更新 ─────────────────────────┐   │
│  │  ReadRemote → UpdateVersion → Save   │   │
│  └──────────────────────────────────────┘   │
│  ↓                                           │
│  ┌─ M2 属性与描述更新 ──────────────────┐    │
│  │  EditMetadata → Validate → Submit    │   │
│  └──────────────────────────────────────┘   │
│  ↓                                           │
│  ┌─ M3 授权策略管理 ───────────────────┐    │
│  │  SelectTemplate → Apply → Verify     │   │
│  └──────────────────────────────────────┘   │
│  ↓                                           │
│  ┌─ M4-F2 批量发行 ────────────────────┐    │
│  │  ScanDirectory → PublishBatch        │   │
│  └──────────────────────────────────────┘   │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 🔗 **二、调用的 Step 清单**

### **M1-M5 详细维护步骤:**

| Step | 来源文档 | API 调用 |
|------|----------|---------|
| **M1 Step1** | `业务梳理/资源管理/01-版本更新.md` | `ReadRemoteState()` |
| **M1 Step2** | `业务梳理/资源管理/01-版本更新.md` | `UpdateResourceMetadata()` |
| **M1 Step3** | `业务梳理/资源管理/01-版本更新.md` | `UploadNewFiles()` |
| **M2 Step1** | `业务梳理/资源管理/02-属性与描述更新.md` | `ReadCurrentAttributes()` |
| **M2 Step2** | `业务梳理/资源管理/02-属性与描述更新.md` | `EditTitleAndDescription()` |
| **M2 Step3** | `业务梳理/资源管理/02-属性与描述更新.md` | `SubmitMetadataChange()` |
| **M3 Step1** | `业务梳理/资源管理/03-授权策略管理.md` | `ReadCurrentPolicy()` |
| **M3 Step2** | `业务梳理/资源管理/03-授权策略管理.md` | `SelectPolicyTemplate()` |
| **M3 Step3** | `业务梳理/资源管理/03-授权策略管理.md` | `ApplyPolicyConfig()` |

---

## 💻 **三、完整编排逻辑**

### **1. M1 版本更新 (核心)**

```typescript
// packages/cli/src/phases/P3-update-version.ts
async function phase3UpdateVersion(
  resourceId: string,
  newFilePaths: string[]
): Promise<void> {
  const context = new VersionUpdateContext();
  
  try {
    // ✅ M1 Step1: 读取远端状态
    console.log(ui.section('⏩ 读取远端最新状态...'));
    
    const remoteState = await api.resource.readVersion(resourceId);
    
    console.log(`✓ 当前版本：v${remoteState.version}`);
    console.log(`✓ 资源标题：${remoteState.metadata.title}`);
    console.log(`✓ 冻结状态：${remoteState.isFrozen ? '已冻结' : '未冻结'}`);
    console.log(`✓ 上架状态：${remoteState.listingStatus}`);
    
    context.remoteState = remoteState;
    
    // ✅ M1 Step2: 继承可修改字段
    console.log(ui.section('🔄 继承属性...'));
    
    const inheritFields = getInheritableFields(remoteState);
    
    console.log('┌─ 可继承字段 ─────────────────────┐');
    for (const [key, value] of Object.entries(inheritFields)) {
      console.log(`│ ✎ ${key}: ${value}`);
    }
    console.log('└──────────────────────────────────┘');
    
    context.inheritedFields = inheritFields;
    
    // ✅ M1 Step3: 上传新版本文件
    console.log(ui.section('⬆️ 上传新文件...'));
    
    const newFiles = await Promise.all(
      newFilePaths.map(async path => {
        const file = await readLocalFile(path);
        
        // Upload with checksum verification
        const uploadResult = await api.resource.uploadFile({
          resourceId,
          file,
          version: remoteState.version + 1,
        });
        
        return uploadResult;
      })
    );
    
    console.log(`✓ 已上传 ${newFiles.length} 个文件`);
    
    // ✅ M1 Step4: 提交新版本
    console.log(ui.section('💾 提交新版本...'));
    
    const mergeResult = await api.resource.mergeVersions({
      resourceId,
      baseVersion: remoteState.version,
      newFiles,
      inheritedFields: context.inheritedFields,
    });
    
    console.log(ui.success('🎉 新版本已发布!'));
    console.log(`   资源 ID: ${resourceId}`);
    console.log(`   新版本：v${mergeResult.newVersion}`);
    console.log(`   发布时间：${formatTime(Date.now())}`);
    
  } catch (error) {
    handleVersionUpdateError(error, context);
  }
}
```

---

### **2. M2 属性与描述更新**

```typescript
async function phase3UpdateMetadata(
  resourceId: string
): Promise<void> {
  const context = new MetadataUpdateContext();
  
  try {
    // ✅ M2 Step1: 读取当前属性
    console.log(ui.section('⏩ 读取当前属性...'));
    
    const currentMeta = await api.resource.readMetadata(resourceId);
    
    context.currentMetadata = currentMeta;
    
    // ✅ M2 Step2: 编辑标题和描述
    console.log(ui.section('✍️ 编辑属性...'));
    
    const updatedMeta = await promptMetadataEditor({
      title: currentMeta.title,
      description: currentMeta.description,
      coverImage: currentMeta.coverImage || PromptKeepCurrent,
      tags: currentMeta.tags,
    });
    
    // Validation
    if (!validateTitle(updatedMeta.title)) {
      throw new CLIError(CLI_ERROR_CODES.TITLE_TOO_LONG);
    }
    
    if (!validateDescription(updatedMeta.description)) {
      throw new CLIError(CLI_ERROR_CODES.DESCRIPTION_TOO_SHORT);
    }
    
    // ✅ M2 Step3: 提交更改
    console.log(ui.section('💾 提交更新...'));
    
    const submitResult = await api.resource.updateMetadata({
      resourceId,
      metadata: updatedMeta,
    });
    
    console.log(ui.success('✅ 属性已成功更新!'));
    console.log(`   更新时间：${formatTime(submitResult.timestamp)}`);
    console.log(`   变更摘要:`);
    console.log(`   • 标题：${describeChange(currentMeta.title, updatedMeta.title)}`);
    console.log(`   • 描述：${describeChange(currentMeta.description, updatedMeta.description)}`);
    console.log(`   • 标签：${describeTagChange(currentMeta.tags, updatedMeta.tags)}`);
    
  } catch (error) {
    handleMetadataUpdateError(error, context);
  }
}
```

---

### **3. M3 授权策略管理**

```typescript
async function phase3ManagePolicy(
  resourceId: string
): Promise<void> {
  const context = new PolicyManagementContext();
  
  try {
    // ✅ M3 Step1: 查看当前策略
    console.log(ui.section('👁️ 查看当前策略...'));
    
    const currentPolicy = await api.resource.readPolicy(resourceId);
    
    console.log(`类型：${currentPolicy.type}`);
    console.log(`应用时间：${formatTime(currentPolicy.appliedAt)}`);
    console.log('策略参数:');
    for (const [key, value] of Object.entries(currentPolicy.params)) {
      console.log(`  ${key}: ${value}`);
    }
    
    context.currentPolicy = currentPolicy;
    
    // ✅ M3 Step2: 选择模板或自定义
    console.log(ui.section('📋 选择策略...'));
    
    const templates = await api.resource.getPolicyTemplates();
    
    const selectedTemplate = await promptTemplateSelector(templates, {
      default: currentPolicy.type,
    });
    
    // ✅ M3 Step3: 配置策略参数
    console.log(ui.section('⚙️ 配置策略...'));
    
    const policyParams = await promptPolicyEditor(selectedTemplate.schema);
    
    // Preview execution effect
    console.log(ui.info('预览执行效果:'));
    console.log(generatePolicyPreview(policyParams));
    
    // ✅ M3 Step4: 应用策略
    console.log(ui.section('💾 应用策略...'));
    
    const applyResult = await api.resource.applyPolicy({
      resourceId,
      template: selectedTemplate.id,
      params: policyParams,
    });
    
    console.log(ui.success('✅ 策略已更新!'));
    console.log(`   新类型：${applyResult.policyType}`);
    console.log(`   应用时间：${formatTime(applyResult.appliedAt)}`);
    
  } catch (error) {
    handlePolicyManagementError(error, context);
  }
}
```

---

## 🔧 **四、依赖管理与签约**

### **免费策略签约原则:**

```typescript
interface DependencyConfig {
  dependencies: ResourceDependency[];
}

async function handleDependencies(
  resourceId: string,
  config: DependencyConfig
): Promise<void> {
  // ❌ 不支持付费策略签约 (Console 通过微前端调用支付系统)
  // ✅ 仅支持免费策略签约
  
  for (const dep of config.dependencies) {
    if (dep.requiresPayment) {
      console.log(ui.warning(
        `⚠️ 依赖 "${dep.name}" 需要付费签约`
      ));
      console.log('💡 CLI 仅支持免费策略，请移除该依赖');
      
      throw new CLIError(CLI_ERROR_CODES.DEPENDENCY_MISMATCH);
    }
    
    // Free dependency signing
    await api.resource.signFreeDependency({
      resourceId,
      dependencyId: dep.id,
    });
    
    console.log(`✓ 已签约免费依赖：${dep.name}`);
  }
}
```

---

## ⚠️ **五、异常分支处理**

### **1. 资源已被冻结 (RESOURCE_FROZEN)**

```typescript
if (error.code === 'RESOURCE_FROZEN') {
  console.log(ui.error('❌ 资源已被冻结，无法更新'));
  console.log('💡 建议:');
  console.log('   1. 联系 Console 管理员解冻');
  console.log('   2. 或使用 --force 强制更新 (需权限)');
  
  if (await promptUser('是否尝试强制更新? [y/N]: ') === 'y') {
    await forceUpdateWithAdminPrivileges(resourceId);
  }
  
  process.exit(1);
}
```

### **2. 版本不可更新 (VERSION_NOT_UPDATABLE)**

```typescript
if (error.code === 'VERSION_NOT_UPDATABLE') {
  console.log(ui.error('❌ 该版本不可直接更新'));
  
  // 提供替代方案
  const alternatives = await findAlternatives(resourceId);
  
  if (alternatives.length > 0) {
    console.log('💡 可用替代方案:');
    printAlternativeOptions(alternatives);
  } else {
    console.log('💡 建议：创建新版本并发布');
  }
  
  process.exit(1);
}
```

---

## 🎯 **六、验收标准**

- [x] M1 版本更新流程完整
- [ ] M2 属性描述更新工作正常
- [ ] M3 授权策略管理可用
- [ ] 依赖管理仅免费签约
- [ ] 所有异常分支有处理

---

**📌 下一步**: [P4-Phase-4 合集批量](./P4-Phase-4%20 合集批量.md)
