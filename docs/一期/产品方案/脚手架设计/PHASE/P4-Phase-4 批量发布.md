# P4-Phase-4 批量发布

> **版本**: v1.0 | **最后更新**: 2026-09-02  
> **对齐 Source**: `packages/cli/src/phases/P4-batch.ts` + `business/业务梳理/F2.1-批量发布.md`

---

## 📋 **一、Phase 职责**

P4-Phase-4 负责**单资源的批量并发发行**(不是合集)!

```
┌──────────────────────────────────────────────┐
│         P4-Phase-4 批量发布 (单资源批量)       │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─ F2.1 批量创建资源 ─────────────────────┐   │
│  │  Phase1 → Phase2 → Phase3 → Phase4     │   │
│  │  (多个 F1 命令的并发执行)                │   │
│  └────────────────────────────────────────┘   │
│                                              │
└──────────────────────────────────────────────┘
```

**重要说明:**
- ✅ **F2 批量发布** = 一次性发布多个本地目录 (例如：同时发布 10 个主题工程)
- ❌ **不是合集批量** - 那是 C2/C3 的功能
- ✅ **每个批次都是独立的单资源发布** (类似多次运行 `freelog publish ./dir`)
- ⚠️ **与合集 (Collection) 无关**

---

## 🔗 **二、调用的 Step**

### **F2.1 批量发布完整流程:**

| Step | 来源文档 | API 调用 |
|------|----------|---------|
| **F2.1 Phase1** | `业务梳理/F2.1-批量发布.md` | `DirectoryScanner.scan()` |
| **F2.1 Phase2** | `业务梳理/F2.1-批量发布.md` | `BatchDivider.divide()` |
| **F2.1 Phase3** | `业务梳理/F2.1-批量发布.md` | `BatchPublisher.publishAll()` |
| **F2.1 Phase4** | `业务梳理/F2.1-批量发布.md` | `ReportGenerator.generate()` |

---

## 💻 **三、完整编排逻辑**

### **1. F2.1 批量创建资源编排**

```typescript
// packages/cli/src/phases/P4-batch-publish.ts
interface BatchPublishOptions {
  directoryPath: string;      // 包含多个工程的根目录
  batchSize?: number;         // Default: 10 (每批处理的数量)
  maxConcurrency?: number;    // Default: 3 (最大并发数)
}

async function phase4BatchPublish(options: BatchPublishOptions): Promise<void> {
  const context = new BatchPublishContext();
  
  try {
    console.log(ui.section('🔥 批量发布开始'));
    console.log(`📁 扫描目录：${options.directoryPath}`);
    console.log(`📊 批次大小：${options.batchSize}`);
    console.log(`🚀 并发数：${options.maxConcurrency}`);
    
    // ✅ Phase1: 目录扫描
    console.log('\n【Phase 1】目录扫描');
    
    const scanResult = await api.collection.scanDirectory(options.directoryPath, {
      recursive: true,
      includeHiddenFiles: false,
    });
    
    if (!scanResult.validResources.length) {
      throw new CLIError(CLI_ERROR_CODES.DIRECTORY_EMPTY);
    }
    
    console.log(`✓ 找到 ${scanResult.validResources.length} 个有效资源`);
    
    context.scannedResources = scanResult.validResources;
    
    // ✅ Phase2: 批次划分与配置
    console.log('\n【Phase 2】批次划分');
    
    const batches = divideIntoBatches(
      scanResult.validResources,
      options.batchSize
    );
    
    console.log(`✓ 划分为 ${batches.length} 个批次`);
    
    // Check for frozen resources
    for (const batch of batches) {
      const frozenResources = await checkFrozenStatus(batch.resources);
      
      if (frozenResources.length > 0) {
        console.log(ui.warning(`⚠️ ${frozenResources.length} 个资源已被冻结，将跳过`));
        
        // Skip frozen resources
        batch.resources = batch.resources.filter(
          r => !frozenResources.find(f => f.id === r.id)
        );
      }
    }
    
    context.batches = batches;
    
    // ✅ Phase3: 并发发布
    console.log('\n【Phase 3】并发发布');
    
    const semaphore = new Semaphore(options.maxConcurrency);
    
    const results = await Promise.allSettled(
      batches.map(batch => 
        semaphore.acquire(() => publishBatch(batch))
      )
    );
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.filter(r => r.status === 'rejected').length;
    
    console.log(`✓ 成功：${successCount} 批次`);
    console.log(`✗ 失败：${failedCount} 批次`);
    
    context.publishResults = results;
    
    // ✅ Phase4: 汇总报告
    console.log('\n【Phase 4】生成报告');
    
    const report = generateBatchReport({
      startTime: context.startTime,
      results: context.publishResults,
      successCount,
      failedCount,
    });
    
    // Export to CSV/PDF
    await exportReport(report, {
      format: 'csv', // or 'pdf'
      outputPath: './batch-publish-report.csv',
    });
    
    console.log(ui.success('🎉 批量发布完成!'));
    console.log(`📈 成功率：${((successCount / batches.length) * 100).toFixed(1)}%`);
    console.log(`⏱️ 总耗时：${formatDuration(context.duration)}`);
    console.log(`📄 报告已导出到：batch-publish-report.csv`);
    
  } catch (error) {
    handleBatchPublishError(error, context);
  }
}

// Sub-function: Publish single batch with exponential backoff retry
async function publishBatch(batch: ResourceBatch): Promise<BatchResult> {
  const maxRetries = 5;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.all(
        batch.resources.map(resource => 
          api.resource.publish({
            resourceId: resource.id,
            files: resource.files,
            config: resource.config,
          })
        )
      );
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error; // Give up after max retries
      }
      
      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(ui.warning(`⏳ 第${attempt}次失败，等待 ${delay/1000}s 后重试...`));
      
      await sleep(delay);
    }
  }
}

// Batch divider algorithm
function divideIntoBatches(resources: Resource[], batchSize: number): ResourceBatch[] {
  const batches: ResourceBatch[] = [];
  
  for (let i = 0; i < resources.length; i += batchSize) {
    const batchResources = resources.slice(i, i + batchSize);
    
    batches.push({
      index: batches.length,
      resources: batchResources,
      total: batchResources.length,
    });
  }
  
  return batches;
}

// Check frozen status before publishing
async function checkFrozenStatus(resources: Resource[]): Promise<FrozenResource[]> {
  const frozenList: FrozenResource[] = [];
  
  for (const resource of resources) {
    const state = await api.resource.readVersion(resource.id);
    
    if (state.isFrozen) {
      frozenList.push({
        id: resource.id,
        title: resource.title,
        frozenAt: state.frozenAt,
      });
    }
  }
  
  return frozenList;
}

// Generate comprehensive batch report
function generateBatchReport(params: {
  startTime: Date;
  results: PromiseSettledResult<any>[];
  successCount: number;
  failedCount: number;
}): BatchReport {
  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();
  
  const failureDetails = params.results
    .filter(r => r.status === 'rejected')
    .map(r => ({
      reason: (r as RejectedPromise).reason,
      timestamp: new Date(),
    }));
  
  const performanceMetrics = {
    avgSpeed: calculateAverageSpeed(params),
    totalDuration: duration,
    dataTransferred: calculateTotalData(params),
  };
  
  return {
    summary: {
      totalBatches: params.successCount + params.failedCount,
      successCount: params.successCount,
      failedCount: params.failedCount,
      successRate: (params.successCount / (params.successCount + params.failedCount)) * 100,
    },
    performance: performanceMetrics,
    failures: failureDetails,
    exportedAt: endTime,
  };
}
```

---

## 🔧 **四、关键组件实现**

### **1. Semaphore 并发控制**

```typescript
class Semaphore {
  private maxConcurrent: number;
  private available: number;
  private queue: Function[] = [];
  
  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
    this.available = maxConcurrent;
  }
  
  async acquire(fn: () => Promise<any>): Promise<any> {
    // Wait if no available permits
    while (this.available <= 0) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    
    // Acquire permit
    this.available--;
    
    try {
      return await fn();
    } finally {
      // Release permit and wake up waiting tasks
      this.available++;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }
}
```

---

### **2. ProgressBar 实时进度显示**

```typescript
class ProgressBar {
  private total: number;
  private current: number = 0;
  private startTime: Date;
  
  constructor(total: number) {
    this.total = total;
    this.startTime = new Date();
  }
  
  update(current: number) {
    this.current = current;
    this.render();
  }
  
  private render() {
    const percent = ((this.current / this.total) * 100).toFixed(1);
    const elapsed = new Date().getTime() - this.startTime.getTime();
    const eta = this.current > 0 
      ? Math.ceil(elapsed / this.current * (this.total - this.current) / 1000)
      : 0;
    
    // ANSI escape codes for terminal control
    process.stdout.write(`\r${bgBlue('进度')} [${bar(this.current, this.total)}] ${percent}% `);
    process.stdout.write(`(${formatTime(elapsed)}/${formatTime(eta * 1000)}`);
  }
}

// Usage in batch publishing
async function publishBatchWithProgress(batch: ResourceBatch): Promise<void> {
  const progressBar = new ProgressBar(batch.total);
  
  await Promise.all(
    batch.resources.map(async (resource, index) => {
      const result = await publishSingleResource(resource);
      progressBar.update(index + 1);
      return result;
    })
  );
}
```

---

## ⚠️ **五、异常分支处理**

### **1. 批次部分失败 (BATCH_PARTIAL_FAILURE)**

```typescript
if (error.code === 'BATCH_PARTIAL_FAILURE') {
  console.log(ui.warning(`⚠️ 批次 ${error.batchIndex} 部分失败`));
  console.log(`成功：${error.successCount}/${error.totalCount}`);
  
  // Generate failure report for this batch
  const failureReport = generateFailureReport(error.failures);
  
  console.log('💡 失败原因:');
  printFailureSummary(failureReport);
  
  // Provide suggestions
  console.log('💡 建议操作:');
  console.log('   1. 查看失败详情：freelog batch --report');
  console.log('   2. 修复错误后重试失败批次：freelog batch --retry');
  
  process.exit(1);
}
```

### **2. 网络错误重试策略**

```typescript
async function publishWithRetry(resource: Resource): Promise<PublishResult> {
  const maxRetries = 5;
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await api.resource.publish({
        resourceId: resource.id,
        files: resource.files,
        config: resource.config,
      });
      
    } catch (error) {
      lastError = error;
      
      if (error.code === 'NETWORK_ERROR') {
        const delay = Math.pow(2, attempt - 1) * 1000; // 指数退避
        console.log(ui.warning(`⏳ 网络错误，${delay/1000}s 后重试 (${attempt}/${maxRetries})`));
        await sleep(delay);
        continue;
      } else if (error.code === 'API_RATE_LIMIT') {
        const retryAfter = parseInt(error.headers?.['Retry-After'] || '30');
        console.log(ui.warning(`⏳ 速率限制，${retryAfter}s 后重试`));
        await sleep(retryAfter * 1000);
        continue;
      } else {
        break; // Non-retryable error
      }
    }
  }
  
  throw lastError;
}
```

---

## 🎯 **六、验收标准**

- [x] F2.1 批量发行完整可用
- [x] Semaphore 并发控制正确 (默认 maxConcurrency=3)
- [x] 指数退避重试机制工作 (1s, 2s, 4s, 8s, 16s)
- [x] CSV/PDF 报告格式正确
- [x] 冻结资源自动跳过
- [ ] 进度条实时更新

---

**📌 下一步**: [P5-Phase-5 合集管理](./P5-Phase-5%20 合集管理.md)
