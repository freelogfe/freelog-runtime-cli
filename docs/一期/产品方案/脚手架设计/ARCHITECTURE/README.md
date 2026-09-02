# ARCHITECTURE - 技术约束与设计决策总纲

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **使用说明**: 本目录定义 CLI 的技术架构约束和设计决策，**不包含具体代码实现**

---

## 📋 **一、架构分层原则**

### **1.1 四层架构模型 (强制约束)**

```
┌─────────────────────────────────────┐
│ Layer 4: TTY UI/UX                   │
│ - 命令行交互界面                      │
│ - ASCII Diagram + Progress Bars      │
│ - Error messages with suggestions   │
├─────────────────────────────────────┤
│ Layer 3: Step Orchestrator           │
│ - PHASE 编排引擎                     │
│ - Checkpoint save/restore            │
│ - Ctrl+C recovery logic             │
├─────────────────────────────────────┤
│ Layer 2: Business Logic (PHASE)      │
│ - F0/C0/M0等业务场景                 │
│ - 业务规则 if-then-else              │
│ - Error handling & retry             │
├─────────────────────────────────────┤
│ Layer 1: tools-lib API Client        │
│ - ✅ 复用 Console 同一套工具库          │
│ - ❌ 不允许在 CLI 重新实现 API         │
│ - ❌ 所有类型定义来自 tools-lib       │
└─────────────────────────────────────┘
```

**关键约束**:
1. **Layer 1**: 绝对禁止重新实现任何功能
2. **Layer 2**: 只写业务逻辑，不写代码实现细节
3. **Layer 3**: 只写编排流程，调用 Layer 2 的 API
4. **Layer 4**: 只负责用户交互展示

---

## 🎯 **二、API 层复用原则**

### **2.1 强制规则**

| 类别 | 规则 | 说明 |
|------|------|------|
| API 客户端 | 必须使用 `tools-lib` | 导入 `@freelog/tools-lib` |
| 错误码 | 直接复用 tools-lib 错误码 | 仅包装成 CLI 友好的消息 |
| 类型定义 | 导入自 tools-lib | 禁止本地重新定义 |
| HTTP 封装 | 使用 APIClient | 禁止手写 fetch/axios |

### **2.2 禁止行为**

```typescript
// ❌ 严禁在 CLI 中重写以下代码
import { APIClient, FreelogAPI } from '@freelog/tools-lib';

class MyAPIClient {
  // 这是重复造轮子！
}

// ❌ 严禁硬编码 URL
const API_URL = 'https://api.freelog.dev';

// ❌ 严禁本地重新定义类型
interface CLICredentials { ... }  // 应该从 tools-lib 导入
```

---

## 🔄 **三、Checkpoint 架构约束**

### **3.1 Save Point Definition**

| 阶段 | Save 时机 | 保存的数据范围 |
|------|---------|------------|
| Layer 4 (TTY) | User completes each input field | Input validation state |
| Layer 3 (Orchestrator) | After step completion | Step result data |
| Layer 2 (Business) | Before API call | Request payload snapshot |
| Global | On SIGINT (Ctrl+C) | Full checkpoint dump |

### **3.2 Recovery Logic Constraint**

```
IF interrupt_signal THEN
  1. Load checkpoint from disk
  2. Validate schema and expiry
  3. Restore state to memory
  4. Jump to appropriate step
  5. Continue execution
END IF
```

---

## ⚠️ **四、错误处理架构**

### **4.1 三层错误映射**

| Layer | 错误来源 | 处理方式 |
|-------|---------|---------|
| Layer 1 | tools-lib APIError | Throw to Layer 2 |
| Layer 2 | Business logic errors | Catch & retry logic |
| Layer 3 | Orchestrator failures | Rollback & cleanup |
| Layer 4 | UI/UX errors | Friendly messages |

### **4.2 重试策略约束**

```
retryable_errors = [
  'ERR_TIMEOUT',
  'ERR_NETWORK_ERROR',
  'ERR_SERVER_ERROR'
]

max_retries = 3
base_delay_ms = 1000

FOR EACH error DO
  IF error in retryable_errors AND attempts < max_retries THEN
    delay = base_delay * Math.pow(2, attempts)
    sleep(delay)
    retry()
  ELSE
    showPermanentFailure()
  END IF
END FOR
```

---

## 🔗 **五、模块依赖关系**

### **5.1 Dependency Graph**

```
┌──────────────────────────────────────┐
│          CLI Core Commands           │
├──────────────────────────────────────┤
│                                      │
│  ├── Step Orchestrator ─────► G3     │
│  │                              CHKPT│
│  │                                  │
│  ├── Business Logic ────────► F0,M0,C0│
│  │                                │  │
│  │                               ▼  ▼
│  │                    ┌──────────────────┐
│  │                    │  Layer 1 APIs    │
│  │                    │  tools-lib       │
│  │                    └──────────────────┘
│  │                           ▲
│  │                    ┌──────┴──────┐
│  │                    │ Upload(Single│
│  │                    │ Chunked)    │
│  │                    │ Policy      │
│  │                    └─────────────┘
│  │                                 
└──────────────────────────────────────┘
```

### **5.2 交叉引用矩阵**

| Module | Used By | Purpose | Constraint |
|--------|---------|---------|------------|
| **G2-UPLOAD** | F0-Step2, F0-Step4 | 文件上传服务 | 复用 tools-lib |
| **G3-CHECKPOINT** | All PHASE | 断点续传机制 | Local file only |
| **POLICY-STRATEGY** | F0-Step3 | 策略系统 | Import from tools-lib |

---

## 📝 **六、技术规范清单**

### **6.1 必须遵守的规则**

- [ ] 所有 API 调用通过 tools-lib
- [ ] 不使用任何第三方 HTTP 库 (axios/fetch)
- [ ] 类型定义同步到 CLI via npm
- [ ] 错误码统一包装一层
- [ ] Checkpoint 数据 schema versioning

### **6.2 禁止使用的模式**

- [ ] 硬编码 API URLs
- [ ] 本地重新定义接口类型
- [ ] 绕过 tools-lib 的直接网络请求
- [ ] 手动管理 token refresh
- [ ] 在 PHASE 文档中写具体代码实现

---

## 💡 **七、设计决策记录 (ADR)**

### **Decision #1: Why tools-lib Only?**

**Context**: Should we reuse Console's tools-lib or implement our own?

**Decision**: Use tools-lib exclusively

**Rationale**:
- DRY principle - avoid duplicate work
- Consistency across CLI and Console
- Maintenance burden reduction
- Faster iteration on API changes

**Consequences**:
- ✅ No need to maintain separate codebase
- ✅ Bug fixes automatically apply to both
- ❌ Dependent on tools-lib release cycle

---

### **Decision #2: Why Four-Layer Architecture?**

**Context**: How should we organize the codebase structure?

**Decision**: Implement four distinct layers with clear boundaries

**Rationale**:
- Separation of concerns
- Easy testing per layer
- Clear ownership boundaries
- Scalability for future features

**Consequences**:
- More files but easier navigation
- Dependencies flow one way only
- Layer constraints prevent circular dependencies

---

**📌 总结**: 本目录定义的是"不能做什么"和"应该怎么组织"，而不是具体的实现代码。
