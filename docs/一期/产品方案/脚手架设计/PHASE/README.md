# PHASE - 业务场景编排文档

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **使用说明**: 每个文档描述一个完整业务流程的 CLI 实现规范

---

## 📋 **文档列表**

| 编号 | 功能域 | 文档名称 | 状态 | 复用模块 |
|------|--------|---------|------|---------|
| F0 | 单资源发布 | [01-F0-SingleResourcePublish.md](./01-F0-SingleResourcePublish.md) | ✅ Complete | G2, G3, POLICY |
| M0 | 版本更新 | TBD | ⏳ TODO | G2, G3 |
| C0 | 合集创建 | TBD | ⏳ TODO | G2, G3 |

### **通用模块库**

| 编号 | 模块名 | 文档名称 | 状态 | 用途 |
|------|--------|---------|------|------|
| G2 | UPLOAD | [02-G2-FileUploadService.md](./02-G2-FileUploadService.md) | ✅ Complete | 文件上传服务 |
| G3 | CHECKPOINT | TBD | ⏳ TODO | 断点续传机制 |
| POLICY | STRATEGY | ../POLICY/POLICY-StrategySystem-Design.md | ✅ Complete | 策略系统 |

---

## 🏗️ **文档结构标准**

每个 PHASE 文档必须包含以下章节:

1. **一、功能需求清单** - 功能分解 + 复用模块说明
2. **二、Step 编排流程** - ASCII flowchart + checkpoint save points
3. **三、字段约束数据库** - 来自业务梳理验证的 exact constraints
4. **四、业务规则算法** - If-then-else 伪代码格式 (NOT implementation!)
5. **五、异常处理矩阵** - Error codes + retry logic
6. **六、验收标准** - Acceptance criteria test cases
7. **七、交叉引用** - 被引用的通用模块和被引用的业务梳理文档

---

## 🔧 **与 ARCHITECTURE 的关系**

```
┌──────────────────────────────────────┐
│         PHASE Directory              │
│  (Business Logic Orchestration)      │
├──────────────────────────────────────┤
│                                      │
│  Each document:                      │
│  ├── Defines workflow steps           │
│  ├── Lists field constraints          │
│  ├── Describes algorithms             │
│  └── References ARCHITECTURE rules   │
│                                      │
└─────────────┬────────────────────────┘
              │
              ▼
┌──────────────────────────────────────┐
│       ARCHITECTURE Directory         │
│    (Technical Constraints Only)       │
├──────────────────────────────────────┤
│                                      │
│  README.md:                          │
│  ├── Four-layer architecture rules   │
│  ├── tools-lib reuse principle        │
│  ├── Checkpoint architecture         │
│  └── Error handling strategy         │
│                                      │
└──────────────────────────────────────┘
```

**关键原则**: 
- PHASE 写"做什么"(What)
- ARCHITECTURE 写"不能怎么做"(Constraints)

---

## 🔄 **与业务梳理的对齐关系**

| PHASE Step | 业务梳理文档来源 | 对齐方法 |
|-----------|----------------|---------|
| F0-Step1 | P0-F0-Phase1_基础信息填写.md | Field constraints from Console source |
| F0-Step2 | P0-F0-Phase2_文件上传预处理.md | Upload mode decision logic |
| F0-Step3 | P0-F0-Phase3_授权策略签约.md | Policy template selection |
| F0-Step4 | P0-F0-Phase4_资源信息与发布.md | Cover/tags validation rules |

**重要**: 所有字段约束必须来自已验证的业务梳理文档，不得重新发明！

---

## 📝 **附录：开发指南**

### **编写新 PHASE 文档步骤**

1. **阅读对应业务梳理文档** → 提取字段约束表
2. **确认复用模块** → 引用 G2/G3/POLICY
3. **绘制 Step 流程图** → ASCII Diagram format
4. **定义 Checkpoint Save Points** → After each step completion
5. **写业务规则伪代码** → IF-THEN-ELSE format only!
6. **列出错误码矩阵** → From business review exceptions
7. **添加验收测试用例** → Based on business scenarios

### **检查清单**

- [ ] 没有 TypeScript 代码实现 (仅 interface definition)
- [ ] 所有字段约束精确匹配业务梳理文档
- [ ] 复用的模块有明确说明
- [ ] Checkpoint save points 定义清晰
- [ ] 错误码覆盖所有异常分支
- [ ] ASCII diagrams 可读性强

---

**📌 下一步**: 继续阅读 [ARCHITECTURE/README.md](../ARCHITECTURE/README.md) 了解技术约束
