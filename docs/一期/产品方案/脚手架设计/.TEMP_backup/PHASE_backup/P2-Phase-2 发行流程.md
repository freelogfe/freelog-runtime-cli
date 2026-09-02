# P2-Phase-2 发行流程编排

> **版本**: v1.0 | **最后更新**: 2026-09-02  
> **对齐 Source**: `business/业务梳理/流程设计 - 创建资源/` + `business/业务梳理/资源管理/` + `business/业务梳理/合集管理/`

---

## 📋 **一、Phase 职责**

P2-Phase-2 负责调度所有单资源发布相关的工作流，编排业务梳理中的 Step:

```
┌─────────────────────────────────────────────────────────────┐
│                P2-Phase-2 发行流程编排                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  F1      │    │  M1      │    │  C1      │              │
│  │ 创建单个 │ →  │ 版本更新 │ →  │ 合集创建 │              │
│  │ 资源     │    │          │    │          │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│                                                             │
│  Phase 2 负责：                                                │
│  1. 按顺序编排 Step 执行                                        │
│  2. 维护 Checkpoint 状态                                       │
│  3. 处理异常分支和重试                                         │
│  4. 组装最终提交的数据结构                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔗 **二、调用的 Step 清单**

### **F1 单资源发布** (来自业务梳理)

| Step | 来源文档 | 主要职责 |
|------|----------|---------|
| **F1.1 Step1** | `业务梳理/流程设计 - 创建资源/01-1-Step1-创建资源壳.md` | 选择类型、输入标题、authId 生成、唯一性验证、提交资源壳 |
| **F1.2 Step2** | `业务梳理/流程设计 - 创建资源/01-2-Step2-上传资源与配置.md` | 扫描文件、多文件并发上传、SHA1 校验、配置文件保存 |
| **F1.3 Step3** | `业务梳理/流程设计 - 创建资源/01-3-Step3-策略模板.md` | 选择策略模板、参数填写、schema 验证、bytecode 编译 |
| **F1.4 Step4** | `业务梳理/流程设计 - 创建资源/01-4-Step4-完善 Listing 信息.md` | 标题描述编辑、封面上传验证、标签去重、链接数量限制 |

### **M1 版本更新**

| Step | 来源文档 | 主要职责 |
|------|----------|---------|
| **M1 Step1** | `业务梳理/资源管理/01-版本更新.md` | 读取远端最新状态、检查冻结标识、获取可修改字段 |
| **M1 Step2** | `业务梳理/资源管理/01-版本更新.md` | 继承元数据、合并配置、对比文件差异 |

### **C1 合集创建**

| Step | 来源文档 | 主要职责 |
|------|----------|---------|
| **C1 Step1** | `业务梳理/流程设计 - 创建合集/03-1-Step1.md` | 批量目录扫描 |
| **C1 Step2** | `业务梳理/流程设计 - 创建合集/03-2-Step2.md` | 合集元数据录入 |
| **C1 Step3** | `业务梳理/流程设计 - 创建合集/03-3-Step3.md` | 资源选择交互 |
| **C1 Step4** | `业务梳理/流程设计 - 创建合集/03-4-Step4.md` | RSS 订阅绑定 |
| **C1 Step5** | `业务梳理/流程设计 - 创建合集/03-5-Step5.md` | 合集发布提交 |

---

## 💻 **三、完整编排逻辑**

### **📌 F1 单资源发布编排**

```typescript
// packages/cli/src/phases/P2-publish.ts

interface PublishOptions {
  directoryPath: string;
  type: string;                    // 资源类型 ID (如："theme-aurora")
  authId?: string;                 // 可选，手动指定 authId
}

async function phase2Publish(options: PublishOptions): Promise<void> {
  const context = new PublishContext();
  
  try {
    console.log(ui.section('🚀 开始发布'));
    
    // ═══════════════════════════════════════════════════════
    // ✅ Step1: 创建资源壳 (来源：F1.1-Step1.md)
    // ═══════════════════════════════════════════════════════
    console.log('\n【Step 1/4】创建资源壳...');
    
    const step1Result = await executeStep({
      name: 'Step1',
      checkpointKey: 'step1-create-shell',
      func: async () => {
        // 调用业务梳理中的 Step1 逻辑
        return await importBusinessStep('F1.1-Step1', {
          options: {
            type: options.type,
            directoryPath: options.directoryPath,
          }
        });
      }
    });
    
    // Save to context
    context.resourceId = step1Result.resourceId;
    context.authId = step1Result.authId;
    context.title = step1Result.title;
    
    // ═══════════════════════════════════════════════════════
    // ✅ Step2: 上传资源文件 (来源：F1.2-Step2.md)
    // ═══════════════════════════════════════════════════════
    console.log('\n【Step 2/4】上传资源文件...');
    
    const step2Result = await executeStep({
      name: 'Step2',
      checkpointKey: 'step2-upload-files',
      parentContext: context,
      func: async () => {
        return await importBusinessStep('F1.2-Step2', {
          resourceId: context.resourceId,
          directoryPath: options.directoryPath,
        });
      }
    });
    
    context.uploadedFiles = step2Result.files;
    
    // ═══════════════════════════════════════════════════════
    // ✅ Step3: 配置授权策略 (来源：F1.3-Step3.md)
    // ═══════════════════════════════════════════════════════
    console.log('\n【Step 3/4】配置授权策略...');
    
    const step3Result = await executeStep({
      name: 'Step3',
      checkpointKey: 'step3-policy',
      parentContext: context,
      func: async () => {
        return await importBusinessStep('F1.3-Step3', {
          resourceId: context.resourceId,
          template: 'free-use', // Or user-selected
        });
      }
    });
    
    context.policyConfig = step3Result.policy;
    
    // ═══════════════════════════════════════════════════════
    // ✅ Step4: 完善 Listing (来源：F1.4-Step4.md)
    // ═══════════════════════════════════════════════════════
    console.log('\n【Step 4/4】完善 Listing...');
    
    await executeStep({
      name: 'Step4',
      checkpointKey: 'step4-listing',
      parentContext: context,
      func: async () => {
        return await importBusinessStep('F1.4-Step4', {
          resourceId: context.resourceId,
          title: context.title,
          directoryPath: options.directoryPath,
        });
      }
    });
    
    console.log(ui.success('🎉 发布成功!'));
    
  } catch (error) {
    // 保存错误 Checkpoint
    await saveCheckpoint('error', {
      error,
      timestamp: Date.now(),
      context: { ...context }
    });
    
    // 检查是否可以恢复
    if (await shouldContinueFromCheckpoint()) {
      console.log(ui.info('检测到中断点，是否从之前恢复？[y/N]: '));
      
      const confirm = await promptUser('');
      
      if (confirm === 'y') {
        return continueFromCheckpoint(context);
      }
    }
    
    throw error;
  }
}

// Helper: Execute single step with checkpoint management
async function executeStep<T>(params: {
  name: string;
  checkpointKey: string;
  parentContext?: any;
  func: () => Promise<T>;
}): Promise<T> {
  const { name, checkpointKey, parentContext, func } = params;
  
  // Try to restore from checkpoint
  const checkpoint = await loadCheckpoint(checkpointKey);
  
  if (checkpoint && parentContext) {
    console.log(`↺ 从 Step ${name} 恢复...`);
    
    // Restore context
    Object.assign(parentContext, checkpoint.context);
    
    // Continue from this point
    return await func();
  }
  
  // New execution
  try {
    console.log(`▶️ 开始执行 Step ${name}...`);
    
    const result = await func();
    
    // Save checkpoint after success
    await saveCheckpoint(checkpointKey, {
      context: { /* saved state */ },
      timestamp: Date.now()
    });
    
    return result;
    
  } catch (error) {
    // Save checkpoint before throwing
    await saveCheckpoint(checkpointKey, {
      error,
      timestamp: Date.now(),
      context: parentContext ? { ...parentContext } : {}
    });
    
    throw error;
  }
}
```

---

### **📌 M1 版本更新编排**

```typescript
async function phase2UpdateVersion(resourceId: string, newFiles: File[]): Promise<void> {
  const context = new VersionUpdateContext();
  
  // ═══════════════════════════════════════════════════════
  // ✅ Step1: 读取远端状态 (来源：M1-Step1.md)
  // ═══════════════════════════════════════════════════════
  console.log('\n【Step 1/2】读取远端状态...');
  
  const remoteState = await api.resource.readVersion(resourceId);
  
  context.remoteState = remoteState;
  
  if (remoteState.isFrozen) {
    console.log(ui.warning('⚠️ 资源已被冻结，无法更新'));
    process.exit(1);
  }
  
  // ═══════════════════════════════════════════════════════
  // ✅ Step2: 上传新版本 (来源：M1-Step2.md)
  // ═══════════════════════════════════════════════════════
  console.log('\n【Step 2/2】上传新版本...');
  
  const newVersion = remoteState.version + 1;
  
  const uploadResult = await Promise.all(
    newFiles.map(file => 
      api.resource.uploadFile({
        resourceId,
        version: newVersion,
        file,
      })
    )
  );
  
  // Merge with inherited fields
  const mergeResult = await api.resource.mergeVersions({
    resourceId,
    baseVersion: remoteState.version,
    newFiles: uploadResult,
    inheritedFields: {
      title: remoteState.metadata.title,
      author: remoteState.metadata.author,
      ...remoteState.optionalConfig,
    }
  });
  
  console.log(ui.success(`✅ 新版本 ${mergeResult.newVersion} 已发布`));
}
```

---

### **📌 C1 合集创建编排**

```typescript
async function phase2CreateCollection(params: CreateCollectionParams): Promise<void> {
  const context = new CollectionCreateContext();
  
  // ═══════════════════════════════════════════════════════
  // ✅ Step1: 批量扫描 (来源：C1-Step1.md)
  // ═══════════════════════════════════════════════════════
  console.log('\n【Step 1/5】批量扫描目录...');
  
  const scanResult = await api.collection.scanDirectory(params.directoryPath, {
    recursive: true,
    includeHiddenFiles: false,
  });
  
  context.resources = scanResult.validResources;
  
  if (!scanResult.validResources.length) {
    throw new CLIError(CLI_ERROR_CODES.DIRECTORY_EMPTY);
  }
  
  // ═══════════════════════════════════════════════════════
  // ✅ Step2: 合集元数据 (来源：C1-Step2.md)
  // ═══════════════════════════════════════════════════════
  console.log('\n【Step 2/5】录入合集信息...');
  
  const metadata = await promptCollectionMetadata({
    title: '',
    description: '',
    coverImage: null,
    tags: [],
    website: '',
    contactEmail: '',
  });
  
  context.metadata = metadata;
  
  // ═══════════════════════════════════════════════════════
  // ✅ Step3: 资源选择 (来源：C1-Step3.md)
  // ═══════════════════════════════════════════════════════
  console.log('\n【Step 3/5】选择资源...');
  
  const selectedResources = params.resources || context.resources.slice(0, 10);
  
  context.selectedResources = selectedResources;
  
  // ═══════════════════════════════════════════════════════
  // ✅ Step4: RSS 绑定 (来源：C1-Step4.md)
  // ═══════════════════════════════════════════════════════
  console.log('\n【Step 4/5】配置 RSS 订阅...');
  
  const rssConfig = await promptRSSBinding({
    feedUrl: '',
    enabled: false,
  });
  
  context.rssConfig = rssConfig;
  
  // ═══════════════════════════════════════════════════════
  // ✅ Step5: 发布提交 (来源：C1-Step5.md)
  // ═══════════════════════════════════════════════════════
  console.log('\n【Step 5/5】发布合集...');
  
  const result = await api.collection.create({
    metadata,
    resourceIds: selectedResources.map(r => r.id),
    rssBinding: rssConfig.enabled ? rssConfig : null,
  });
  
  console.log(ui.success('✅ 合集创建成功!'));
  console.log(`   URL: ${result.publicUrl}`);
  console.log(`   条目数：${selectedResources.length}`);
}
```

---

## ⚠️ **四、全局异常处理机制**

### **错误码分层包装**

```typescript
// Layer 1: tools-lib 返回 APIError
interface APIError {
  code: string;           // 服务器返回的错误码
  message: string;
  details?: any;
}

// Layer 2: CLI 包装成 CLIError (见 ARCHITECTURE/05-错误码体系.md)
class CLIError extends Error {
  constructor(
    public code: CLI_ERROR_CODES,
    public details?: any,
    public hint?: string
  ) {
    super(message);
  }
}

// Layer 3: UI 层友好的错误提示
function formatUserErrorMessage(error: CLIError): string {
  switch (error.code) {
    case 'AUTH_ID_EXISTS':
      return `⚠️ 该授权标识已被使用\n💡 建议：修改标题或手动修改 authId`;
    default:
      return `${error.message}\n${error.hint || ''}`;
  }
}
```

---

## 🎯 **五、验收标准**

### **功能验收:**
- [ ] F1 全流程可执行 (Step1-4)
- [ ] M1 版本更新工作正常
- [ ] C1 合集创建完整
- [ ] Checkpoint 恢复机制工作
- [ ] 所有异常分支有处理

### **完整性检查:**
- [x] 每个 Step 都对应业务梳理文档
- [x] 数据结构传递正确 (Step1 输出→Step2 输入)
- [x] Checkpoint 保存时机合理
- [ ] 错误码映射准确 (~35 个)

---

**📌 下一步**: [P3-Phase-3 资源维护](./P3-Phase-3%20 资源维护.md)
