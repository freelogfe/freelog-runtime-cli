# CLI 脚手架设计 - 质量改进迭代计划 (Week 3)

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **目标**: 系统性地完善 M0/C0/H0 三个 PHASE 文档，对标 F0/M1质量标准

---

## 🎯 **本次迭代目标**

| 指标 | 当前值 | 目标值 | 说明 |
|------|--------|--------|------|
| TEMPLATE 合规率 (M0) | 7/10 | 10/10 | 增加异常处理矩阵和测试用例 |
| TEMPLATE 合规率 (C0) | 7/10 | 10/10 | 补充 Console 源码证据引用 |
| TEMPLATE 合规率 (H0) | 7/10 | 10/10 | 增强字段约束溯源完整性 |
| FIELD CONSTRAINTS | 缺行号引用 | 100% 引用 | 每个字段标注 P*-Phase*.md 来源 |
| EXCEPTION MATRIX | 覆盖率 65% | 95%+ | 添加更多 HTTP Codes 和业务错误 |
| TEST CASES | 平均 8 个 | 14+ | Happy/Error/Boundary各增加 |

---

## 📋 **优先级排序**

### **Priority 1: M0-VersionUpdate.md (最高优先级)** ⭐⭐⭐

**原因**: 
- 使用频率最高的场景之一
- 现有质量问题最明显 (异常处理缺失)
- 代码实现依赖度最高

**具体任务**:

#### **Task M0-001: 增强异常处理矩阵**
```markdown
添加以下错误场景:
- RESOURCE_FROZEN (403) - 资源被冻结无法更新
- VERSION_CONFLICT (409) - 版本号与远端冲突
- FILE_NOT_FOUND (404) - 新版本文件不存在
- POLICY_COMPILE_FAILED (400) - 策略编译失败
- INVALID_CHECKPOINT (500) - Checkpoint 损坏
```

**预计工作量**: 2 小时

#### **Task M0-002: 补充 Console 源码引用**
```markdown
从 P3-M0 Version Update 业务梳理中提取:
- 状态查询 API 源码位置
- version 继承逻辑的代码证据
- latestVersion 对比算法的行号引用
```

**预计工作量**: 1.5 小时

#### **Task M0-003: 增加测试用例**
```markdown
新增至少 6 个测试用例:
- Happy Path: 2 个 (同文件升版 + 新文件发布)
- Error Scenario: 2 个 (版本冲突、资源冻结)
- Boundary Condition: 2 个 (version 格式边界、fileSha1 长度)
```

**预计工作量**: 1.5 小时

**总计**: 5 小时

---

### **Priority 2: H0-BatchResourcePublish.md (中优先级)** ⭐⭐

**原因**:
- 批量操作场景重要但复杂度较高
- COMMANDS 映射不完整
- 幂等键生成策略需更详细说明

**具体任务**:

#### **Task H0-001: 补充 COMMANDS 映射**
```markdown
在 COMMANDS.md 中添加:
- batch-publish command interface
- --parallel flag details
- report generation flow
```

**预计工作量**: 1.5 小时

#### **Task H0-002: 增强异常处理**
```markdown
添加批量特定错误场景:
- BATCH_PARTIAL_SUCCESS (207 Multi-Status)
- RATE_LIMIT_REACHED (429)
- IDEMPOTENCY_KEY_CONFLICT (409)
- REPORT_GENERATION_FAILED (500)
```

**预计工作量**: 1.5 小时

#### **Task H0-003: 补充测试用例**
```markdown
新增测试用例覆盖批量场景:
- Happy Path: 3 个 (小批量/中批量/大批量)
- Error Scenario: 3 个 (幂等键冲突、网络中断恢复、报告生成失败)
- Boundary Condition: 2 个 (100 items limit, empty batch handling)
```

**预计工作量**: 2 小时

**总计**: 5 小时

---

### **Priority 3: C0-CollectionCreation.md (低优先级)** ⭐

**原因**:
- 已有较好基础
- 主要问题是缺少详细的 Console 源码对齐
- 目录指纹机制需要更多技术细节

**具体任务**:

#### **Task C0-001: 补充 Console 源码对齐**
```markdown
从 P2-C0 Collection Creation 业务梳理中提取:
- Step1-5 每一步的源码文件路径和行号
- display.catalogueProperty 的数据结构定义
- fingerprint 计算算法的代码证据
```

**预计工作量**: 2 小时

#### **Task C0-002: 增强字段约束表**
```markdown
补充集合相关的字段约束:
- collectionName: min/max length, format validation
- cataloguedFingerprint: SHA256 format requirement
- merge flag: 0/1语义说明
```

**预计工作量**: 1 小时

**总计**: 3 小时

---

## 🔄 **执行时间表**

| 日期 | 时间段 | 任务 | 交付物 | 验收标准 |
|-----|--------|------|--------|---------|
| Day 1<br>(Sept 3) | Morning (9-11) | M0-001<br>异常处理矩阵 | M0-V2 Draft | 15+ errors covered |
| Day 1 | Afternoon (14-16) | M0-002<br>Console 引用 | M0-V2 Draft | 所有 Step 有行号 |
| Day 1 | Evening (16-17:30) | M0-003<br>测试用例 | M0 Final | 14+ test cases |
| Day 2<br>(Sept 4) | Morning (9-10:30) | H0-001<br>COMMANDS 映射 | COMMANDS.md update | All batch cmds doc'ed |
| Day 2 | Afternoon (14-15:30) | H0-002<br>异常处理 | H0-V2 Draft | 10+ batch errors |
| Day 2 | Evening (16-18) | H0-003<br>测试用例 | H0 Final | 8+ test cases |
| Day 3<br>(Sept 5) | Morning (9-11) | C0-001<br>Console 对齐 | C0-V2 Draft | Full source refs |
| Day 3 | Afternoon (14-15) | C0-002<br>字段约束 | C0 Final | Complete table |
| Day 3 | Afternoon (15-17) | Review & Commit | Final commit | All tasks done |

**总工时**: 13 小时

---

## ✅ **验收标准**

### **Quality Gates (必须全部通过)**

```markdown
## M0-VersionUpdate 验收清单

- [ ] Exception Matrix 包含 ≥12 个错误场景
- [ ] 每个 Step 至少有 3 处 Console 源码引用
- [ ] Test Cases ≥ 14 个 (Happy/Err/Boundary)
- [ ] Field constraints 全部标注 P*-Phase*.md 来源
- [ ] Checkpoint Save Points JSON Schema 完整

## H0-BatchResourcePublish 验收清单

- [ ] COMMANDS.md 包含 batch-publish 命令章节
- [ ] Exception Matrix ≥ 10 个批量特定错误
- [ ] Test Cases ≥ 8 个覆盖批量场景
- [ ] Idempotency key 生成策略详细说明
- [ ] Partial success 对账逻辑清晰

## C0-CollectionCreation 验收清单

- [ ] P2-C0 Phase1-5 都有源码行号引用
- [ ] Directory fingerprint 机制技术细节完整
- [ ] Field constraints 表格完整无遗漏
- [ ] 100 items/batch规则有代码证据
- [ ] Merge logic 流程图清晰
```

---

## 📊 **进度跟踪模板**

```markdown
## Week 3 Progress Report (YYYY-MM-DD)

### Completed Tasks
- [x] M0-001: Enhanced exception matrix ✅
- [ ] M0-002: Adding console references...
- [ ] M0-003: ...

### Blocked Issues
- ❓ None currently
- ⚠️ Need clarification on: TBD

### Next Steps
1. Continue M0 refinement
2. Start H0 task execution
3. Schedule review meeting for Thursday

### Quality Metrics Update
- Before: Template compliance M0=70%, C0=70%, H0=70%
- After: Target M0=100%, C0=100%, H0=100%
```

---

## 🎯 **成功定义**

**本周结束时的理想状态**:

```
✅ M0/C0/H0 三个 PHASE 文档完全达到 F0/M1 质量标准
✅ 所有字段约束追溯到业务梳理原文
✅ 异常处理矩阵覆盖率达到 95%+
✅ 测试用例完备性≥14 个 per PHASE
✅ COMMANDS.md 完成全部 5 个主命令章节
✅ Git commit 记录完整可追溯
```

---

**开始时间**: 2026-09-03 09:00  
**截止时间**: 2026-09-05 17:00  
**责任人**: AI Agent + Human Reviewer  

**记住**: 不满足验收标准绝不松手！

