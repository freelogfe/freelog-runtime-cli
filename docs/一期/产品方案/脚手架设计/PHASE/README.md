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

## 📚 **当前文档清单** (已完成)

### **核心业务流程 (PHASE)**

| 编号 | 功能域 | 文档名称 | 行数 | 复用模块 |
|------|--------|---------|------|---------|
| F0 | 单资源发布 | [01-F0-SingleResourcePublish.md](./01-F0-SingleResourcePublish.md) | ~630 | FRAMEWORK, G2-UPLOAD, G3-CHECKPOINT, POLICY |
| M0 | 版本更新 | [02-M0-VersionUpdate.md](./02-M0-VersionUpdate.md) | ~285 | FRAMEWORK, G2-UPLOAD, G3-CHECKPOINT |
| C0 | 合集创建 | [03-C0-CollectionCreation.md](./03-C0-CollectionCreation.md) | ~383 | FRAMEWORK, G2-UPLOAD, G3-CHECKPOINT |
| H0 | 批量发布 | [04-H0-BatchResourcePublish.md](./04-H0-BatchResourcePublish.md) | ~430 | FRAMEWORK, G2-UPLOAD, G3-CHECKPOINT |

**总计**: 4 个 PHASE 文档，~1728 行产品设计内容

### **通用模块库 (REUSE)**

| 编号 | 模块名 | 文档名称 | 行数 | 用途 |
|------|--------|---------|------|------|
| G2 | UPLOAD | [../REUSE/G2-FileUploadService.md](../REUSE/G2-FileUploadService.md) | 202 | 文件上传服务 (单片/分片模式) |
| G3 | CHECKPOINT | [../REUSE/G3-CheckpointService.md](../REUSE/G3-CheckpointService.md) | 237 | 断点续传机制 (内存 vs 磁盘存储) |
| POLICY | STRATEGY | [../REUSE/POLICY-StrategyTemplateSystem.md](../REUSE/POLICY-StrategyTemplateSystem.md) | 249 | 策略模板编译与 URL 编码系统 |

**总计**: 3 个 REUSE 模块，~688 行通用能力设计

---

## 🔗 **与 ARCHITECTURE 的关系**

```
┌──────────────────────────────────────┐
│     ARCHITECTURE (框架层)              │
│   基础能力定义（已确定）               │
│                                      │
│ 04-模板创建系统设计:                  │
│ - init/template命令交互流程            │
│ - manifest.yaml 生成规则               │
│ - 模板版本管理策略                    │
│                                      │
│ 05-压缩打包系统设计:                  │
│ - artifactMode 决策逻辑                │
│ - .freelogignore 机制                  │
│ - 字节级确定性保证                    │
│                                      │
│ ↕ 其他现有文件：                       │
│ - 账号管理与 Session/Studio 模式        │
│ - 接口契约设计                        │
│ - 错误码体系                          │
└──────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────┐
│       PHASE (业务编排层)               │
│   调用框架能力的组合使用方式           │
│                                      │
│ **F0 - 单资源发布**:                   │
│ - Step1 → 资源类型选择                 │
│ - Step2 → 压缩打包 + 上传              │
│ - Step3 → 策略签约 (可选)              │
│ - Step4 → Listing 完善                │
│                                      │
│ **M0 - 版本更新**:                     │
│ - Step1 → 识别资源并加载状态         │
│ - Step2 → 版本继承决策 (latest patch+1)|
│ - Step3 → 同文件升版 / 新文件发布    │
│ - Step4 → 完善信息并发布             │
│                                      │
│ **C0 - 合集创建**:                     │
│ - Step1 → 初始化合集工程             │
│ - Step2 → 添加条目入口 (本地/平台)   │
│ - Step3 → 批量处理条目 (100/批)       │
│ - Step4 → 完善展示配置               │
│ - Step5 → 发布合集 (fingerprint 检测)|
│                                      │
│ **H0 - 批量发布**:                     │
│ - Step1 → 扫描输入目录               │
│ - Step2 → 预处理验证                 │
│ - Step3 → 批量创建 (createBatch OR fallback)|
│ - Step4 → 生成报告 (.freelog/reports/)  |
└──────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────┐
│    REUSE LIBS (能力抽象)               │
│   从多个 PHASE 提取的公共模块            │
│                                      │
│ G2-UPLOAD:                            │
│ - 单片/分片自动切换                   │
│ - 进度条 / NDJSON事件流               │
│ - 断点续传集成                        │
│                                      │
│ G3-CHECKPOINT:                         │
│ - 内存 vs 磁盘存储策略                 │
│ - Checkpoint 生命周期管理              │
│ - 损坏检测与恢复                      │
│                                      │
│ POLICY:                               │
│ - 模板查询 + 参数引导                  │
│ - policyText URL 编码编译                │
│ - 重复检测机制                        │
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

### **场景 1: 从零实现新功能**
1. 先看 **ARCHITECTURE/** 了解技术约束
2. 再看 **PHASE/** 学习现有业务编排（如 F0）
3. 参考 **业务梳理/** 获取 Console 源码证据（P0-*Phase*.md）
4. 参考 **REUSE/** 复用公共模块（G2/G3/POLICY）
5. 对照 **DESIGN.md** 确认产品边界
6. 编写代码实现并补充单元测试

### **场景 2: 理解现有功能**
打开对应 PHASE 文档（如 F0-Step2），按以下顺序阅读：
1. Step Flow Diagram (整体流程)
2. TTY Interactive Flow (交互细节)
3. 字段约束表 (来源标注)
4. tools-lib API 调用表 (方法签名)
5. If-then-else 伪代码 (业务规则)
6. 异常处理矩阵 (错误场景)
7. Checkpoint Save Points (中断恢复点)

### **场景 2: 进行场景演练验证**
验证脚本位于 `test/run-all-scenarios.mjs`，执行步骤：

**前置条件**:
1. dev/test环境可达，准备测试账号
2. 测试夹具准备：
   - `test/fixtures/*.zip` - 主题/插件构建产物
   - `test/fixtures/media/*` - 封面图片、视频
   - `test/.freelog-test-credentials.local.json` - 测试凭据
   
**执行流程**:
1. 单场景运行：`node test/run-all-scenarios.mjs F0`
2. 全量运行：`node test/run-all-scenarios.mjs all`
3. 查看结果报告：`cat test/results/F0-YYYYMMDD.json`

**验收标准**:
- Happy Path: pass rate ≥ 95%
- Error Scenarios: 正确返回错误码和用户提示
- Boundary Conditions: 边界值正确处理
- 与 Console 业务结果一致

**常见问题**:
- 环境不可达 → 检查网络和环境配置
- 认证失败 → 更新测试凭据
- API 返回异常 → 对照 Console 源码分析

---

## 🔧 **设计文档的完整性检查清单**

每份 PHASE 文档必须满足：

- [ ] CLI 命令入口（TTY + Non-interactive 两种模式）
- [ ] Step 编排流程图（ASCII Diagram）
- [ ] Checkpoint Save Points 精确定义（保存时机、数据结构）
- [ ] 每个 Step 至少包含:
  - [ ] TTY ASCII Diagram（详细到每个输入框和按钮）
  - [ ] 字段约束表（来自业务梳理 P0-*-Phase*.md，标注来源）
  - [ ] tools-lib API 调用表（方法名、参数、返回值）
  - [ ] If-then-else 伪代码（无 TypeScript 代码片段）
  - [ ] 异常处理矩阵（Error Code + 用户提示 + Recovery Action）
- [ ] 验收测试用例（Happy Path + Error Scenario + Boundary Condition）
- [ ] 交叉引用（引用的 ARCHITECTURE/REUSE/业务梳理文档）

**注意**: 如果上述任何一项缺失，该文档无法用于场景演练验证！

---

## 🔄 **当前任务状态**

✅ **已完成** (2026-09-03):
1. ARCHITECTURE 框架能力设计
   - 04-模板创建系统设计.md
   - 05-压缩打包系统设计.md
2. PHASE 核心业务流程（F0/M0/C0/H0）
3. REUSE 通用模块库（G2/G3/POLICY）
4. PHASE/TEMPLATE.md 标准模板

⏳ **待验证**:
1. 场景演练验证（需准备 dev/test 环境和测试夹具）
2. 与 Console 源码对齐审查
3. DESIGN.md 一致性检查

📋 **下一步行动优先级**:
1. 🚨 **高** - 完成 ARCHITECTURE/02-账号与模式系统设计（当前缺失）
2. 🔍 **中** - 补充 Console 源码对齐证据（引用具体 Line Number）
3. ✅ **中** - 运行场景演练验证，记录通过率
4. 🔄 **低** - 根据验证反馈迭代优化 PHASE 文档

---

**📌 关键原则**：PHASE 文档必须是**完全的产品设计规格书**，开发者直接对照文档编码即可，无需查阅源代码！
