# PHASE - 业务场景编排设计层

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **用途**: 每个 PHASE 文档描述一个完整业务流程的 CLI 实现规范

---

## 🎯 **设计原则**

### **核心目标**
PHASE 文档必须让开发者**无需查看代码**就能完整理解功能：
1. ✅ TTY ASCII Diagram 展示每个输入框和交互细节
2. ✅ 字段约束精确到字符级（来自业务梳理验证）
3. ✅ tools-lib API 调用明确列出方法名、参数、返回值
4. ✅ 异常分支矩阵覆盖所有错误场景
5. ✅ Checkpoint save points 定义清晰

### **文档结构标准**

每个 PHASE 文档必须包含以下章节：

```markdown
# F0 - 单资源发布完整流程

## 1. CLI 命令与 TTY 交互设计
   1.1 TTY Interactive Mode (ASCII Diagram)
   1.2 Non-interactive Mode (--flag syntax)

## 2. Step 编排流程
   2.1 Step Flow Diagram (ASCII)
   2.2 Checkpoint Save Points Definition
   2.3 Ctrl+C Recovery Logic

## 3. 每个 Step 的详细设计
   ### Step1: [步骤名称]
   #### 3.1 TTY 交互流程 (ASCII Diagram)
   #### 3.2 字段约束表 (来自业务梳理)
   #### 3.3 tools-lib API 调用表
   #### 3.4 业务规则伪代码 (If-then-else)
   #### 3.5 异常处理矩阵
   
   ### Step2: [步骤名称] (同上结构)
   ...

## 4. 验收标准测试用例
   4.1 Happy Path Test Cases
   4.2 Error Scenario Test Cases
   4.3 Boundary Condition Tests

## 5. 交叉引用
   5.1 被引用的通用模块 (G2/G3/POLICY)
   5.2 引用的业务梳理文档
```

---

## 📚 **当前文档列表**

| 编号 | 功能域 | 文档名称 | 状态 | 复用模块 |
|------|--------|---------|------|---------|
| F0 | 单资源发布 | [01-F0-SingleResourcePublish.md](./01-F0-SingleResourcePublish.md) | ⏳ TODO | G2, G3, POLICY |
| M0 | 版本更新 | TBD | ⏳ PENDING | G2, G3 |
| C0 | 合集创建 | TBD | ⏳ PENDING | G2, G3 |

### **通用模块库**

| 编号 | 模块名 | 文档名称 | 状态 | 用途 |
|------|--------|---------|------|------|
| G2 | UPLOAD | ../REUSE/G2-FileUploadService.md | ⏳ PENDING | 文件上传服务 |
| G3 | CHECKPOINT | ../REUSE/G3-BreakpointResume.md | ⏳ PENDING | 断点续传机制 |
| POLICY | STRATEGY | ../POLICY/POLICY-StrategySystem-Design.md | ✅ Complete | 策略系统 |

---

## 🔗 **与 ARCHITECTURE 的关系**

```
┌──────────────────────────────────────┐
│     ARCHITECTURE (框架层)              │
│   基础能力定义（已确定）               │
│                                      │
│ - 账号管理 Session/Studio             │
│ - 资源类型 Theme/Plugin/Template      │
│ - 压缩打包 artifact.zip               │
└──────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────┐
│       PHASE (业务编排层)               │
│   调用框架能力的组合使用方式           │
│                                      │
│ - Step1 → 资源类型选择                 │
│ - Step2 → 压缩打包 + 上传              │
│ - Step3 → 策略签约                    │
│ - Step4 → Listing 完善                │
└──────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────┐
│    REUSE LIBS (能力抽象)               │
│   从多个 PHASE 提取的公共模块            │
│                                      │
│ - G2-UPLOAD: 文件上传服务              │
│ - G3-CHECKPOINT: 断点续传              │
│ - POLICY: 策略系统                    │
└──────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────┐
│       IMPLEMENTATION (代码实现)        │
│                                      │
│ └─ tools-lib/src / packages/cli/src  │
└──────────────────────────────────────┘
```

---

## 📖 **开发者的阅读路径**

### **场景 1: 实现新功能**
1. 先看 **ARCHITECTURE/** 了解技术约束
2. 再看 **PHASE/** 学习业务流程编排
3. 参考 **业务梳理/** 获取 Console 源码证据
4. 最后看 **REUSE/** 复用公共模块

### **场景 2: 理解现有功能**
1. 打开对应 PHASE 文档（如 F0）
2. 阅读 Step 编排流程图
3. 查看每个 Step 的详细设计
4. 对照工具库 API 调用表实现代码

---

## ✅ **编写清单**

编写新的 PHASE 文档时，确保：

- [ ] 所有字段约束来自业务梳理文档（P0-F0-Phase1.md 等）
- [ ] TTY ASCII Diagram 详细到每个输入框
- [ ] tools-lib API 调用明确列出方法名
- [ ] 异常分支矩阵覆盖所有错误场景
- [ ] Checkpoint save points 定义清晰
- [ ] 业务规则用 If-then-else 伪代码描述（无具体代码）
- [ ] 验收测试用例可直接转换为自动化测试
- [ ] 全文全程使用中文（不出现英文注释）

---

## 🔄 **下一步行动**

1. **F0-SingleResourcePublish.md** - 基于业务梳理 P0-F0 Phase1-4 完整编写
2. **M0-VersionUpdate.md** - 基于业务梳理 M0-1 编写
3. **C0-CollectionCreation.md** - 基于业务梳理 C0-Phase1-5 编写
4. **REUSE/G2-G3.md** - 提取公共模块独立设计

---

**📌 关键原则**：PHASE 文档必须是**完全的产品设计规格书**，开发者直接对照文档编码即可，无需查阅源代码！
