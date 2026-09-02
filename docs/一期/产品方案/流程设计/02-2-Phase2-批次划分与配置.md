# F2.2 · Phase2 - 批次划分与配置详细流程

> **文档角色**: 覆盖 Phase2"批次划分与配置"的全部细节  
> **对齐 Source**: CLI 的 BatchPartitioner 实现  
> 最后更新：2026-09-02

---

## 📋 **一、Phase2 流程总览**

```bash
$ freelog batch-publish ./my-themes/

┌─ Freelog 批量发布 ───────────────────────────────┐
│                                                     │
│ Phase 2: 批次划分与配置                               │
│                                                     │
│ ▶ 批次配置                                          │
│   • 批次大小：10 个/批                              │
│   • 并发数：3 个并发                                │
│   • 重试策略：指数退避 (max=3)                       │
│   • 超时控制：60s/request, 1h/global                 │
│                                                     │
│ ▓▓▓▓▓▓▓▓▓░░ 80%                                     │
│ ✅ 共划分 2 个批次                                    │
│    Batch #1: 条目 1-10 (预计 45s)                     │
│    Batch #2: 条目 11-17 (预计 30s)                    │
│                                                     │
│ ❄️ 冻结检测：2 个已冻结的资源将被跳过                  │
│    ✓ Frozen-Theme-001 (last_update: 90 days ago)    │
│    ✓ Frozen-Theme-002 (market_status: frozen)       │
│                                                     │
│ ⏱️ 预计总时长：75s                                  │
│                                                     │
│ [开始发布] ENTER | [调整配置] C | [退出] ESC          │
└─────────────────────────────────────────────────────┘
```

---

## 🔍 **二、详细步骤实现**

### **2.1 批次配置参数**

```typescript
interface BatchConfig {
  // 批次大小控制
  batchSize: number;          // 默认 10，范围 1-100
  maxConcurrency: number;     // 默认 3，范围 1-10
  
  // 重试策略
  retryCount: number;         // 默认 3
  retryDelay: number;         // 初始延迟 (ms)，默认 1000
  exponentialBackoff: boolean;// 是否启用指数退避，默认 true
  
  // 超时控制
  requestTimeout: number;     // 默认 60000ms (60s)
  globalTimeout: number;      // 整个批次超时，默认 3600000ms (1h)
}

// 默认配置
const DEFAULT_BATCH_CONFIG: BatchConfig = {
  batchSize: 10,
  maxConcurrency: 3,
  retryCount: 3,
  retryDelay: 1000,
  exponentialBackoff: true,
  requestTimeout: 60000,
  globalTimeout: 3600000
};
```

### **2.2 批次划分算法**

```typescript
class BatchPartitioner {
  partition(entries: ValidEntry[], config: BatchConfig): Batch[] {
    // 1. 按导入顺序分组
    const batches: Batch[] = [];
    
    for (let i = 0; i < entries.length; i += config.batchSize) {
      const batchEntries = entries.slice(i, i + config.batchSize);
      
      batches.push({
        id: `batch-${batches.length + 1}`,
        entries: batchEntries,
        startIndex: i,
        endIndex: Math.min(i + config.batchSize - 1, entries.length - 1),
        estimatedDuration: this.estimateDuration(batchEntries),
        status: 'pending'
      });
    }
    
    return batches;
  }
  
  private estimateDuration(entries: ValidEntry[]): number {
    // 基于历史数据估算单条平均时间 (假设 5s/条)
    const avgTimePerEntry = 5000; 
    return entries.length * avgTimePerEntry;
  }
}
```

### **2.3 冻结资源检测**

```typescript
class FrozenResourceChecker {
  async checkFrozenResources(entries: ValidEntry[]): Promise<FrozenEntry[]> {
    const frozen: FrozenEntry[] = [];
    
    for (const entry of entries) {
      // 检查市场状态
      const marketStatus = await this.getMarketStatus(entry.resourceId);
      
      if (marketStatus === 'frozen') {
        frozen.push({
          entry,
          reason: 'MARKET_FROZEN',
          lastUpdate: await this.getLastUpdateTime(entry.resourceId),
          warning: '该资源已被平台冻结，跳过发布'
        });
        continue;
      }
      
      // 检查最后更新时间 (>60 天视为冻结)
      const daysSinceUpdate = this.daysSince(entry.metadata.updatedAt);
      if (daysSinceUpdate > 60) {
        frozen.push({
          entry,
          reason: 'INACTIVE_TOO_LONG',
          lastUpdate: entry.metadata.updatedAt,
          warning: `${daysSinceUpdate}天未更新，自动跳过`
        });
      }
    }
    
    return frozen;
  }
  
  private daysSince(dateString: string): number {
    const now = new Date();
    const then = new Date(dateString);
    return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
  }
}
```

### **2.4 TTY 配置界面**

```typescript
class BatchConfigUI {
  render(batches: Batch[], frozenCount: number, config: BatchConfig) {
    console.log('\n┌─ Phase 2: 批次划分确认 ─────────────┐');
    console.log('│                                      │');
    console.log('│ ⚙️ 批次配置                          │');
    console.log(`│   • 批次大小：${config.batchSize}个/批           │`);
    console.log(`│   • 并发数：${config.maxConcurrency}个并发            │`);
    console.log(`│   • 重试策略：指数退避 (max=${config.retryCount})          │`);
    console.log(`│   • 超时控制：${config.requestTimeout/1000}s/request        │`);
    console.log('│                                      │');
    console.log(`│ 📦 共划分 ${batches.length}个批次              │`);
    
    batches.forEach((batch, i) => {
      console.log(`│   Batch #${i+1}: 条目 ${batch.startIndex+1}-${batch.endIndex+1}   │`);
      console.log(`│              预计 ${(batch.estimatedDuration/1000).toFixed(0)}s          │`);
    });
    
    console.log('│                                      │');
    console.log(`│ ❄️ 冻结检测：${frozenCount}个已冻结的资源将被跳过           │`);
    console.log(`│                                      │`);
    console.log(`│ ⏱️ 预计总时长：${this.formatTotalTime(batches)}                │`);
    console.log('│                                      │');
    console.log('│ [开始发布] ENTER | [调整配置] C       │');
    console.log('└──────────────────────────────────────┘\n');
  }
  
  private formatTotalTime(batches: Batch[]): string {
    const totalMs = batches.reduce((sum, b) => sum + b.estimatedDuration, 0);
    return `${(totalMs / 1000).toFixed(0)}s`;
  }
}
```

---

## 🚨 **三、异常分支处理**

| 异常场景 | 错误码 | 用户提示 | 处理方式 |
|---------|--------|---------|---------|
| 批次大小超限 | BATCH_SIZE_EXCEEDED | "批次大小不能超过 100" | 自动限制为 100 |
| 并发数过高 | CONCURRENT_LIMIT_HIGH | "建议并发数不超过 10" | 警告但不拦截 |
| 检测到冻结资源 | FROZEN_RESOURCE_DETECTED | "X 个已冻结的资源将被跳过" | 加入跳过列表 |
| 磁盘空间不足 | DISK_SPACE_LOW | "剩余空间不足 XGB" | 终止并发布警告 |
| API 配额不足 | API_QUOTA_EXHAUSTED | "今日 API 调用已达上限" | 等待次日或手动继续 |

---

## ✅ **四、验收标准**

| 测试项 | 预期行为 | 验证方法 |
|-------|---------|---------|
| 批次划分 | 正确按 batchSize 分组 | Mock 不同数量条目 |
| 并发控制 | 同时只启动 maxConcurrency 个任务 | 观察进程数 |
| 冻结检测 | 准确识别冻结资源 | Mock 冻结状态响应 |
| 时间估算 | 基于条目数量合理估算 | 对比实际耗时 |
| 配置可调整 | 用户可修改 batchSize/concurrency | UI 交互验证 |
| Checkpoint 恢复 | 配置信息可保存和恢复 | Ctrl+C 后 restart |

---

## 🔗 **五、相关文档索引**

| 文档 | 说明 | 路径 |
|-----|------|------|
| [F2 总纲](../../流程设计/02-批量创建资源总纲.md) | 完整的 F2 流程导航 | 流程设计 |
| [Phase1](./02-1-Phase1-目录扫描.md) | 上一步骤 | 流程设计 |
| [Phase3](./02-3-Phase3-并发发布.md) | 下一步骤 | 流程设计 |

---

**下一步**: 阅读 **[02-3-Phase3-并发发布](./02-3-Phase3-并发发布.md)**
