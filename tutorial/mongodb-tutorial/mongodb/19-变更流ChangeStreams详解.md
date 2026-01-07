# 第十九章：变更流（Change Streams）详解

## 19.1 变更流基础

### 什么是变更流？

变更流（Change Streams）允许应用程序实时监听 MongoDB 集合、数据库或部署的变更，类似于数据库触发器。

### 变更流特性

- ✅ **实时监听**：实时接收数据变更通知
- ✅ **可恢复**：支持断点续传
- ✅ **过滤**：可以过滤特定类型的变更
- ✅ **事务支持**：支持副本集和分片集群

### 适用场景

- 实时数据同步
- 缓存失效
- 审计日志
- 事件驱动架构
- 数据复制

## 19.2 基本使用

### 监听集合变更

```javascript
// MongoDB Shell
const changeStream = db.users.watch();

changeStream.on('change', (change) => {
  printjson(change);
});
```

### Node.js 示例

```javascript
const { MongoClient } = require('mongodb');

async function watchCollection() {
  const client = new MongoClient(uri);
  await client.connect();
  
  const db = client.db('mydb');
  const collection = db.collection('users');
  
  const changeStream = collection.watch();
  
  changeStream.on('change', (change) => {
    console.log('变更:', change);
  });
  
  changeStream.on('error', (error) => {
    console.error('变更流错误:', error);
  });
}
```

### Mongoose 示例

```typescript
import mongoose from 'mongoose';

async function watchUsers() {
  const changeStream = User.watch();
  
  changeStream.on('change', (change) => {
    console.log('变更类型:', change.operationType);
    console.log('变更文档:', change.fullDocument);
    console.log('文档ID:', change.documentKey);
  });
}
```

## 19.3 变更事件类型

### 变更事件结构

```javascript
{
  _id: { ... },                    // 变更流标识符
  operationType: "insert",         // 操作类型
  fullDocument: { ... },           // 完整文档（insert/replace）
  documentKey: { _id: ... },       // 文档主键
  updateDescription: { ... },      // 更新描述（update）
  ns: { db: "...", coll: "..." },  // 命名空间
  to: { ... },                     // 重命名目标（rename）
  clusterTime: Timestamp(...),     // 集群时间
  txnNumber: NumberLong(...),      // 事务号
  lsid: { ... }                    // 会话ID
}
```

### 操作类型

| 操作类型 | 说明 | fullDocument | updateDescription |
|---------|------|--------------|-------------------|
| `insert` | 插入文档 | ✅ 有 | ❌ 无 |
| `update` | 更新文档 | ⚠️ 可选 | ✅ 有 |
| `replace` | 替换文档 | ✅ 有 | ❌ 无 |
| `delete` | 删除文档 | ❌ 无 | ❌ 无 |
| `invalidate` | 变更流无效 | ❌ 无 | ❌ 无 |
| `drop` | 删除集合 | ❌ 无 | ❌ 无 |
| `dropDatabase` | 删除数据库 | ❌ 无 | ❌ 无 |
| `rename` | 重命名集合 | ❌ 无 | ❌ 无 |

### 处理不同操作类型

```typescript
changeStream.on('change', (change) => {
  switch (change.operationType) {
    case 'insert':
      console.log('插入:', change.fullDocument);
      handleInsert(change.fullDocument);
      break;
      
    case 'update':
      console.log('更新:', {
        id: change.documentKey._id,
        updatedFields: change.updateDescription?.updatedFields,
        removedFields: change.updateDescription?.removedFields
      });
      handleUpdate(change.documentKey._id, change.updateDescription);
      break;
      
    case 'replace':
      console.log('替换:', change.fullDocument);
      handleReplace(change.fullDocument);
      break;
      
    case 'delete':
      console.log('删除:', change.documentKey._id);
      handleDelete(change.documentKey._id);
      break;
      
    case 'invalidate':
      console.log('变更流无效，需要重新创建');
      recreateChangeStream();
      break;
  }
});
```

## 19.4 过滤变更

### 使用管道过滤

```javascript
// 只监听插入和更新操作
const changeStream = db.users.watch([
  {
    $match: {
      operationType: { $in: ['insert', 'update'] }
    }
  }
]);

// 只监听特定字段的更新
const changeStream = db.users.watch([
  {
    $match: {
      'updateDescription.updatedFields.status': { $exists: true }
    }
  }
]);

// 只监听特定条件的文档
const changeStream = db.users.watch([
  {
    $match: {
      'fullDocument.status': 'active'
    }
  }
]);
```

### 复杂过滤

```typescript
const changeStream = User.watch([
  {
    $match: {
      $or: [
        { operationType: 'insert' },
        {
          operationType: 'update',
          'updateDescription.updatedFields.email': { $exists: true }
        }
      ]
    }
  }
]);
```

## 19.5 恢复令牌（Resume Tokens）

### 使用恢复令牌

```typescript
let resumeToken: any = null;

const changeStream = User.watch([], {
  resumeAfter: resumeToken  // 从上次中断处恢复
});

changeStream.on('change', (change) => {
  // 保存恢复令牌
  resumeToken = change._id;
  
  // 处理变更
  handleChange(change);
});

// 应用重启后，使用保存的恢复令牌
function resumeChangeStream(savedToken: any) {
  const changeStream = User.watch([], {
    resumeAfter: savedToken
  });
  
  changeStream.on('change', (change) => {
    resumeToken = change._id;
    handleChange(change);
  });
}
```

### 存储恢复令牌

```typescript
import fs from 'fs';

// 保存恢复令牌
function saveResumeToken(token: any) {
  fs.writeFileSync('resumeToken.json', JSON.stringify(token));
}

// 加载恢复令牌
function loadResumeToken(): any | null {
  try {
    const data = fs.readFileSync('resumeToken.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// 使用
const savedToken = loadResumeToken();
const changeStream = User.watch([], {
  resumeAfter: savedToken || undefined
});

changeStream.on('change', (change) => {
  saveResumeToken(change._id);
  handleChange(change);
});
```

## 19.6 实际应用场景

### 场景 1：实时数据同步

```typescript
// 同步用户数据到缓存
async function syncToCache() {
  const changeStream = User.watch();
  
  changeStream.on('change', async (change) => {
    if (change.operationType === 'insert' || change.operationType === 'replace') {
      // 更新缓存
      await cache.set(`user:${change.fullDocument._id}`, change.fullDocument);
    } else if (change.operationType === 'update') {
      // 获取更新后的完整文档
      const user = await User.findById(change.documentKey._id);
      if (user) {
        await cache.set(`user:${user._id}`, user);
      }
    } else if (change.operationType === 'delete') {
      // 删除缓存
      await cache.del(`user:${change.documentKey._id}`);
    }
  });
}
```

### 场景 2：审计日志

```typescript
// 记录所有数据变更
async function auditLog() {
  const changeStream = db.watch();  // 监听整个数据库
  
  changeStream.on('change', async (change) => {
    await AuditLog.create({
      operation: change.operationType,
      collection: change.ns.coll,
      documentId: change.documentKey._id,
      changes: change.updateDescription,
      timestamp: new Date(),
      user: getCurrentUser()
    });
  });
}
```

### 场景 3：事件通知

```typescript
// 订单状态变更通知
async function orderStatusNotification() {
  const changeStream = Order.watch([
    {
      $match: {
        operationType: 'update',
        'updateDescription.updatedFields.status': { $exists: true }
      }
    }
  ]);
  
  changeStream.on('change', async (change) => {
    const order = await Order.findById(change.documentKey._id);
    if (order) {
      // 发送通知
      await sendNotification(order.userId, {
        type: 'order_status_changed',
        orderId: order._id,
        status: order.status
      });
    }
  });
}
```

### 场景 4：数据复制

```typescript
// 复制数据到另一个数据库
async function replicateData() {
  const sourceStream = SourceCollection.watch();
  const targetClient = new MongoClient(targetUri);
  await targetClient.connect();
  const targetCollection = targetClient.db('target').collection('data');
  
  sourceStream.on('change', async (change) => {
    try {
      switch (change.operationType) {
        case 'insert':
        case 'replace':
          await targetCollection.replaceOne(
            { _id: change.fullDocument._id },
            change.fullDocument,
            { upsert: true }
          );
          break;
          
        case 'update':
          await targetCollection.updateOne(
            { _id: change.documentKey._id },
            change.updateDescription
          );
          break;
          
        case 'delete':
          await targetCollection.deleteOne({
            _id: change.documentKey._id
          });
          break;
      }
    } catch (error) {
      console.error('复制失败:', error);
    }
  });
}
```

## 19.7 错误处理

### 处理错误

```typescript
const changeStream = User.watch();

changeStream.on('error', (error) => {
  console.error('变更流错误:', error);
  
  // 根据错误类型处理
  if (error.code === 280) {
    // 变更流无效，需要重新创建
    recreateChangeStream();
  } else if (error.code === 40587) {
    // 恢复令牌无效
    changeStream.close();
    createNewChangeStream();
  }
});
```

### 重连机制

```typescript
let changeStream: ChangeStream | null = null;

function createChangeStream() {
  changeStream = User.watch();
  
  changeStream.on('change', handleChange);
  
  changeStream.on('error', (error) => {
    console.error('变更流错误:', error);
    changeStream?.close();
    
    // 5秒后重连
    setTimeout(() => {
      createChangeStream();
    }, 5000);
  });
}

// 启动
createChangeStream();
```

## 19.8 性能优化

### 1. 使用投影减少数据传输

```typescript
// ❌ 差：返回完整文档
const changeStream = User.watch();

// ✅ 好：只返回需要的字段
const changeStream = User.watch([], {
  fullDocument: 'updateLookup'  // 只在需要时获取完整文档
});
```

### 2. 过滤不需要的变更

```typescript
// ✅ 好：只监听需要的变更
const changeStream = User.watch([
  {
    $match: {
      operationType: { $in: ['insert', 'update'] }
    }
  }
]);
```

### 3. 批量处理

```typescript
let changeBuffer: any[] = [];
const BATCH_SIZE = 100;
const BATCH_TIMEOUT = 1000; // 1秒

const changeStream = User.watch();

changeStream.on('change', (change) => {
  changeBuffer.push(change);
  
  if (changeBuffer.length >= BATCH_SIZE) {
    processBatch(changeBuffer);
    changeBuffer = [];
  }
});

// 定时处理
setInterval(() => {
  if (changeBuffer.length > 0) {
    processBatch(changeBuffer);
    changeBuffer = [];
  }
}, BATCH_TIMEOUT);
```

## 19.9 最佳实践

### 1. 使用恢复令牌

```typescript
// ✅ 好：保存恢复令牌，支持断点续传
let resumeToken: any = null;

const changeStream = User.watch([], {
  resumeAfter: resumeToken
});

changeStream.on('change', (change) => {
  resumeToken = change._id;
  // 定期保存到持久化存储
  saveResumeToken(resumeToken);
});
```

### 2. 错误处理

```typescript
// ✅ 好：完整的错误处理
changeStream.on('error', (error) => {
  logger.error('变更流错误', { error });
  
  if (error.code === 280) {
    // 重新创建变更流
    recreateChangeStream();
  }
});
```

### 3. 资源清理

```typescript
// ✅ 好：正确关闭变更流
process.on('SIGINT', () => {
  changeStream?.close();
  process.exit(0);
});
```

查看 `examples/19-change-streams.js` 了解完整的变更流示例。

