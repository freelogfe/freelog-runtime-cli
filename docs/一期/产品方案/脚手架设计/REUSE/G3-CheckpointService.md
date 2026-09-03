# REUSE/G3 - 断点续传服务设计

> **版本**: v1.0 | **最后更新**: 2026-09-03

---

## 📋 **一、服务目标**

提供通用的断点保存/恢复能力，不绑定具体业务场景。

### **1.1 核心职责**

```
┌──────────────────────────────────────┐
│   G3-CHECKPOINT Service               │
│   ─────────────────────               │
│   · 通用断点存储抽象                  │
│   · 内存模式 (会话) vs 落盘模式 (工程)    │
│   · Checkpoint 生命周期管理             │
│   · 损坏检测与修复                      │
└──────────────────────────────────────┘
           ↓ 被调用
┌──────────────────────────────────────┐
│   G2-UPLOAD / PHASE/F0-M0-C0-H0       │
│   (任何需要中断恢复的场景)              │
└──────────────────────────────────────┘
```

---

## 🔧 **二、接口契约**

### **2.1 主要方法签名**

| 方法名 | 参数 | 返回值 | 说明 |
|--------|------|--------|------|
| `saveCheckpoint()` | `key: string`, `state: CheckpointState` | `void` | 保存当前状态 |
| `restoreCheckpoint()` | `key: string` | `CheckpointState\|null` | 恢复到上次断点 |
| `clearCheckpoint()` | `key: string` | `void` | 清理已完成阶段的断点 |
| `listCheckpoints()` | `none` | `string[]` | 列出所有待恢复的 checkpoint |
| `validateCheckpoint()` | `key: string` | `boolean` | 验证文件完整性 |

### **2.2 CheckpointState 结构**

```typescript
interface CheckpointState {
  // 元数据
  workflowId: string;      // 工作流 ID
  step: number;            // Step 编号 (1-based)
  timestamp: number;       // Unix timestamp (ms)
  
  // 业务数据 (根据不同场景填充)
  data: {
    // G2-UPLOAD 示例
    phase?: 'init' \| 'uploading';
    currentChunk?: number;
    totalChunks?: number;
    percentage?: number;
    
    // F0-Publish 示例
    resourceTypeCode?: string;
    authId?: string;
    fileSha1?: string;
    selectedPolicy?: PolicyInfo;
  };
  
  // 完整性校验
  checksum?: string;       // SHA256 of state data
}
```

---

## 💾 **三、存储策略**

### **3.1 存储位置选择**

```
伪代码：
IF CLI mode === 'session' THEN
  # 会话模式：内存存储
  storage = MemoryStore()
  lifetime = 'process-lifetime'
  
ELSE IF CLI mode === 'studio' OR '工程模式' THEN
  # 工程模式：落盘存储
  storage = FileSystemStore('.freelog/checkpoints/')
  cleanup_policy = 'after_success'
  
ELSE IF command has --no-checkpoint flag THEN
  # 明确禁用
  storage = NullStore()
END IF

# 持久化路径
checkpoint_path = `${project_root}/.freelog/checkpoints/${key}.json`
```

### **3.2 落盘文件格式**

```json
{
  "schemaVersion": "1",
  "workflowId": "WF-20260903-abc123",
  "step": 2,
  "timestamp": 1725283200000,
  "data": {
    "phase": "uploading",
    "currentChunk": 3,
    "totalChunks": 5,
    "percentage": 60,
    "metadata": {
      "filePath": "./artifact.zip",
      "fileSize": 5456789,
      "sha1": "a1b2c3d...e4f5g"
    }
  },
  "checksum": "sha256:e3b0c44298fc1c149af..."
}
```

---

## 🔁 **四、生命周期管理**

### **4.1 Checkpoint 创建流程**

```
伪代码：
# Step N 开始时初始化 checkpoint
checkpoint_key = `${PHASE_NAME}-Step${N}-${workflowId}`

initial_state = {
  workflowId: current_workflow_id,
  step: N,
  timestamp: Date.now(),
  data: {}
}

G3.saveCheckpoint(checkpoint_key, initial_state)

# Step N 执行过程中持续更新
WHILE executing_step_N DO
  progress = getProgress()
  
  new_state = {
    ...current_state,
    data: merge(current_state.data, progress),
    timestamp: Date.now()
  }
  
  G3.saveCheckpoint(checkpoint_key, new_state)
END WHILE

# Step N 成功完成后清理
IF execution_success THEN
  G3.clearCheckpoint(checkpoint_key)
ELSE
  # 失败时保留 checkpoint 供恢复
  log(`Step ${N} 失败，checkpoint 已保存`)
END IF
```

### **4.2 恢复触发条件**

```
伪代码：
# 进程启动时扫描残留 checkpoints
if_command_start() THEN
  remaining_checkpoints = G3.listCheckpoints()
  
  IF len(remaining_checkpoints) > 0 THEN
    showWarning("检测到未完成的发布任务")
    
    FOR EACH key IN remaining_checkpoints DO
      state = G3.restoreCheckpoint(key)
      
      # 验证检查点有效性
      IF NOT G3.validateCheckpoint(key) THEN
        showError(`Checkpoint ${key} 损坏，将删除`)
        G3.clearCheckpoint(key)
        CONTINUE
      END IF
      
      # 显示恢复选项
      displayRecoveryOption(state)
      
      user_choice = promptUser("是否恢复？(Y/n/c)")
      
      IF user_choice == 'y' THEN
        jumpToStep(state.step + 1)
        BREAK
      ELSE IF user_choice == 'c' THEN
        confirmAbort()
        G3.clearAllCheckpoints()
        exitGracefully()
      END IF
    END FOR
  END IF
END IF
```

---

## ⚠️ **五、异常处理矩阵**

| 错误场景 | Error Code | 用户友好消息 | Recovery Action |
|---------|-----------|-------------|-----------------|
| Disk Full | G3-301 | "磁盘空间不足，无法保存 checkpoint" | Abort workflow |
| Checksum Mismatch | G3-302 | "Checkpoint 文件已损坏，将无法恢复" | Delete corrupted file |
| Permission Denied | EACCES | "没有权限写入.checkpoint 目录" | Fix permissions |
| Invalid JSON Format | G3-303 | "Checkpoint 格式错误，JSON 解析失败" | Regenerate from scratch |
| Timeout on Save | ETIMEDOUT | "保存 checkpoint 超时" | Retry with backoff |

---

## 🧪 **六、验收测试用例**

| Case ID | 测试场景 | 预期结果 | 对应功能 |
|---------|---------|---------|---------|
| G3-T1 | 正常保存和恢复 | 内存/磁盘存储正确，数据完整 | 4.1 Create Flow |
| G3-T2 | Ctrl+C 中断后重启 | Checkpoint 自动扫描并提示恢复 | 4.2 Recovery Trigger |
| G3-T3 | Checkpoint 文件损坏 | 自动检测并删除，不影响主流程 | 5. Exception Handling |
| G3-T4 | 多 Step 并发保存 | 每个 Step 有独立的 checkpoint key | 3. Storage Strategy |
| G3-T5 | 工程模式 vs 会话模式 | 存储位置和生命周期符合预期 | 3.1 Position Selection |

---

## 🔗 **七、交叉引用**

- **被 G2-UPLOAD 引用**: 分片上传进度保存
- **被 PHASE/F0/M0/C0/H0 引用**: 各 Step 间的状态持久化
- **对齐 Console**: versionCreator 的隐式草稿机制

---

**📌 使用说明**: 本文档指导开发者实现断点续传基础服务，PHASE 层只需声明需要的 checkpoint key 即可。
