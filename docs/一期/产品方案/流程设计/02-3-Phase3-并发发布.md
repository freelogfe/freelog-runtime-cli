# F2.3 · Phase3 - 并发发布详细流程

> **文档角色**: 覆盖 Phase3"并发发布"的全部细节  
> **对齐 Source**: CLI 的 BatchPublisher 实现  
> 最后更新：2026-09-02

---

## 📋 **一、Phase3 流程总览**

```bash
$ freelog batch-publish ./my-themes/

┌─ Freelog 批量发布 ───────────────────────────────┐
│                                                     │
│ Phase 3: 并发发布                                     │
│                                                     │
│ ▓▓▓▓▓▓▓▓░░ 60% (Batch 1/2)                          │
│                                                     │
│ ━━━━ Theme-Aurora        ✓ success (3.2s)          │
│ ━━━━ Theme-Nature        ✓ success (4.1s)          │
│ ━━━━ Plugin-Media        ✗ failed (timeout)        │
│ ━━━━ Library-UI          ↻ retry 1/3                │
│      Current: Uploading file... (45%)               │
│                                                     │
│ ▶ 当前活动：Library-UI                              │
│ Progress: 上传文件                                  │
│                                                     │
│ ⏳ ETA: 12s | Average speed: 2.3MB/s                │
│                                                     │
│ [暂停] SPACE | [退出] Q | [查看详细日志] L           │
└─────────────────────────────────────────────────────┘
```

---

## 🔍 **二、详细步骤实现**

### **2.1 BatchProcessor 核心逻辑**

```typescript
class BatchPublisher {
  async publish(batches: Batch[], config: BatchConfig): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    const semaphore = new Semaphore(config.maxConcurrency);
    const abortController = new AbortController();
    
    // 信号处理：支持暂停/退出
    this.setupSignalHandlers(abortController);
    
    for (const batch of batches) {
      if (abortController.signal.aborted) break;
      
      const batchResult = await this.processBatch(batch, config, semaphore);
      results.push(batchResult);
      
      // 批次间隔延迟 (避免 API 限流)
      if (batchResult.status === 'success' && batch !== batches[batches.length - 1]) {
        await this.delay(2000);
      }
    }
    
    return results;
  }
  
  private async processBatch(
    batch: Batch, 
    config: BatchConfig, 
    semaphore: Semaphore
  ): Promise<BatchResult> {
    const entryResults: EntryResult[] = [];
    
    // 并发执行批次内所有条目
    const promises = batch.entries.map(async (entry) => {
      const release = await semaphore.acquire(); // 控制并发数
      
      try {
        const result = await this.publishEntry(entry, config);
        entryResults.push(result);
        
        // 实时更新进度 UI
        this.updateProgressUI(entry, result);
        
        return result;
      } catch (err) {
        const failedResult = this.handleFailure(err, entry);
        entryResults.push(failedResult);
        throw failedResult; // 抛出以便重试
      } finally {
        release(); // 释放信号量
      }
    });
    
    // 等待批次内所有条目完成 (失败不中断)
    await Promise.allSettled(promises);
    
    return {
      batchId: batch.id,
      entries: batch.entries.length,
      successCount: entryResults.filter(r => r.status === 'success').length,
      failureCount: entryResults.filter(r => r.status === 'failed').length,
      results: entryResults,
      status: entryResults.every(r => r.status === 'success') ? 'success' : 'partial'
    };
  }
  
  private async publishEntry(entry: ValidEntry, config: BatchConfig): Promise<EntryResult> {
    let lastError: unknown = null;
    
    // 重试逻辑
    for (let attempt = 1; attempt <= config.retryCount + 1; attempt++) {
      try {
        // 调用单资源发布流程 (F1)
        const f1Result = await api.resource.publish({
          directory: entry.directory,
          resourceId: entry.manifest.resources[0].resourceId,
          autoPublish: true
        });
        
        return {
          entryPath: entry.path,
          status: 'success',
          duration: f1Result.duration,
          versionNumber: f1Result.versionNumber
        };
        
      } catch (err) {
        lastError = err;
        
        // 检查是否需要重试
        if (attempt <= config.retryCount && this.isRetryableError(err)) {
          const delay = config.exponentialBackoff 
            ? config.retryDelay * Math.pow(2, attempt - 1)
            : config.retryDelay;
          
          console.log(`  重试 ${attempt}/${config.retryCount} (${delay}ms后)...`);
          await this.delay(delay);
          continue;
        }
        
        // 不再重试，记录失败
        return {
          entryPath: entry.path,
          status: 'failed',
          errorCode: this.extractErrorCode(err),
          errorMessage: err.message,
          attempts: attempt
        };
      }
    }
    
    throw lastError;
  }
}
```

### **2.2 并发控制实现**

```typescript
class Semaphore {
  private capacity: number;
  private available: number;
  private waiting: Array<() => void> = [];
  
  constructor(capacity: number) {
    this.capacity = capacity;
    this.available = capacity;
  }
  
  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return () => this.release();
    }
    
    // 无可用配额，进入等待队列
    return new Promise(resolve => {
      this.waiting.push(() => {
        this.available--;
        resolve(() => this.release());
      });
    });
  }
  
  release() {
    this.available++;
    
    // 唤醒一个等待者
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}
```

### **2.3 进度实时展示**

```typescript
class PublishProgressRenderer {
  render(results: EntryResult[], currentProcessing: string | null) {
    ui.clearScreen();
    
    console.log('\n┌─ Phase 3: 并发发布 ─────────────────┐');
    console.log('│                                      │');
    
    // 整体进度条
    const total = results.length;
    const success = results.filter(r => r.status === 'success').length;
    const percent = Math.round((success / total) * 100);
    
    const bar = ui.color.success + '▓'.repeat(Math.floor(percent / 10)) + 
                ui.color.warning + '░'.repeat(10 - Math.floor(percent / 10)) + 
                ui.color.reset;
    
    console.log(`│ ${bar} ${percent}% (${success}/${total})                        │`);
    console.log('│                                      │');
    
    // 每个条目状态
    results.forEach(result => {
      const icon = this.getStatusIcon(result.status);
      const color = this.getStatusColor(result.status);
      const name = path.basename(result.entryPath);
      
      console.log(`│  ${color}${icon}${ui.color.reset}  ${name.padEnd(30)} `);
      
      if (result.status === 'failed') {
        console.log(`│     ❌ ${result.errorCode}: ${result.errorMessage}`);
      }
      
      if (result.attempts > 1) {
        console.log(`│     ⚡ 重试 ${result.attempts - 1}次成功`);
      }
    });
    
    console.log('│                                      │');
    
    // 当前正在处理的条目
    if (currentProcessing) {
      console.log(`│ ▶ 当前活动：${currentProcessing.padEnd(28)}   │`);
      console.log(`│    Progress: 上传中 (45%)              │`);
      console.log('│                                      │');
    }
    
    // ETA 统计
    console.log(`│ ⏳ ETA: ${this.formatETA(results)} | 平均速度：2.3MB/s    │`);
    console.log('│                                      │');
    console.log('│ [暂停] SPACE | [退出] Q | [日志] L   │');
    console.log('└──────────────────────────────────────┘\n');
  }
  
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'success': return '✓';
      case 'failed': return '✗';
      case 'retrying': return '↻';
      default: return '○';
    }
  }
  
  private getStatusColor(status: string): string {
    switch (status) {
      case 'success': return ui.color.success;
      case 'failed': return ui.color.error;
      case 'retrying': return ui.color.warning;
      default: return ui.color.info;
    }
  }
}
```

### **2.4 失败自动重试机制**

```typescript
class RetryHandler {
  isRetryableError(error: unknown): boolean {
    const errorCode = this.extractErrorCode(error);
    
    // 可重试的错误类型
    const retryableCodes = [
      'UPLOAD_TIMEOUT',
      'API_RATE_LIMIT',
      'NETWORK_ERROR',
      'CONNECTION_RESET'
    ];
    
    return retryableCodes.includes(errorCode);
  }
  
  calculateBackoff(attempt: number, config: BatchConfig): number {
    if (!config.exponentialBackoff) {
      return config.retryDelay;
    }
    
    // 指数退避：1s, 2s, 4s, 8s...
    return config.retryDelay * Math.pow(2, attempt - 1);
  }
  
  async withRetry<T>(
    fn: () => Promise<T>,
    config: BatchConfig
  ): Promise<T> {
    let lastError: unknown = null;
    
    for (let attempt = 1; attempt <= config.retryCount + 1; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        
        if (attempt <= config.retryCount && this.isRetryableError(err)) {
          const delay = this.calculateBackoff(attempt, config);
          console.log(`  重试 ${attempt}/${config.retryCount}...`);
          await this.delay(delay);
          continue;
        }
        
        throw err;
      }
    }
    
    throw lastError;
  }
}
```

---

## 🚨 **三、异常分支处理**

| 异常场景 | 错误码 | 用户提示 | 处理方式 |
|---------|--------|---------|---------|
| 上传超时 | UPLOAD_TIMEOUT | "上传超时，网络可能不稳定" | 指数退避重试 (max=3) |
| API 限流 | API_RATE_LIMIT | "请求过于频繁，稍后重试" | 等待 60s 后重试 |
| 网络断开 | NETWORK_DISCONNECTED | "网络连接中断" | 自动重连并重试 |
| 磁盘空间不足 | DISK_SPACE_LOW | "磁盘空间不足" | 立即停止并发布警告 |
| 用户取消 | USER_CANCELLED | "用户主动取消发布" | 终止所有任务 |
| 批次失败 | BATCH_FAILURE | "批次 #X 部分失败" | 记录并继续下一批次 |

---

## ✅ **四、验收标准**

| 测试项 | 预期行为 | 验证方法 |
|-------|---------|---------|
| 并发控制 | 同时只启动 maxConcurrency 个任务 | 观察进程数/内存占用 |
| 进度展示 | 实时更新每个条目状态 | UI 交互验证 |
| 失败重试 | 可重试错误自动重试 | Mock 超时场景测试 |
| 指数退避 | 重试间隔正确递增 | 日志时间戳验证 |
| 暂停功能 | SPACE 键可暂停发布 | 恢复后继续执行 |
| 退出功能 | Q 键可安全退出 | 未完成任务标记为 skipped |
| Checkpoint 恢复 | 中断后可从断点继续 | Ctrl+C 后 restart 验证 |

---

## 🔗 **五、相关文档索引**

| 文档 | 说明 | 路径 |
|-----|------|------|
| [F2 总纲](../../流程设计/02-批量创建资源总纲.md) | 完整的 F2 流程导航 | 流程设计 |
| [Phase2](./02-2-Phase2-批次划分与配置.md) | 上一步骤 | 流程设计 |
| [Phase4](./02-4-Phase4-汇总报告.md) | 下一步骤 | 流程设计 |
| [F1 创建单个资源](../流程设计/01-创建单个资源总纲.md) | 内部调用的单资源流程 | 流程设计 |

---

**下一步**: 阅读 **[02-4-Phase4-汇总报告](./02-4-Phase4-汇总报告.md)**
