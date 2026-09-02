# TEMPLATE - PHASE 设计文档标准模板

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **使用说明**: PHASE 文档必须是 CLI 命令行的**交互式流程 UI、TTY ASCII Diagram、字段约束规则**,不得包含具体代码实现！

---

## 📋 **PHASE 文档核心要求**

### ✅ **必须包含的内容**

1. **CLI 命令规格** (TTY + Non-interactive mode)
   - TTY Interactive Flow (ASCII diagrams for each step)
   - Command-line flags (`--flag syntax`)
   - Field constraint tables (min/max/validation/rules)

2. **Step Orchestration** (Check point save points only)
   - Step flow chart with checkpoint save locations
   - Checkpoint data structure TypeScript Interface (定义 ONLY, 无实现!)

3. **ASCII UI Flow** (详细到每个输入框)
   - Each step has complete interactive flow diagram
   - No code implementation details

4. **Business Rules** (If-then-else pseudocode ONLY)
   - NOT actual TypeScript code!
   - Example: `IF file.size <= 10MB THEN single upload ELSE chunked`

5. **Exception Handling Matrix** (Error codes → User messages)
   - All possible errors with recovery actions

### ❌ **禁止内容**

1. **NO TypeScript Implementation Code** - Only interface definitions
2. **NO Tool-specific API Details** - tools-lib already provides these
3. **NO Business Logic Implementation** - Only algorithm description in pseudocode
4. **NO Archive/Template Function Redesign** - tools-lib has them!

---

## 📝 **Example Structure**

```markdown
# F0 - 单资源发布完整流程

## 1. CLI Commands & Interaction Flow

### 1.1 TTY Interactive Mode
$ freelog publish

[ASCII Diagram showing each step...]

### 1.2 Non-interactive Mode
$ freelog publish --type-code theme --title "..." --file ./...

### 1.3 Field Constraint Table
| Parameter | Required | Max Length | Format | Error Code |
|-----------|----------|------------|--------|------------|

## 2. Step Orchestration

### 2.1 Step Flow Diagram (ASCII)
[开始] → Step1 [checkpoint.save] → Step2 → ...

### 2.2 Checkpoint Data Structure (TypeScript Interface)
interface CheckpointData {
  workflowId: string;
  step: number;
  data: {...};
}

## 3. Field Constraints (from business review docs)
Table from P0-F0-Phase1.md

## 4. Business Rules (Pseudocode Only)
IF condition THEN action ELSE alternative END IF

## 5. Exception Matrix
| Error Scenario | HTTP Code | Error Code | Recovery Action |
|----------------|-----------|------------|-----------------|

## 6. Acceptance Criteria
Test cases from business review
```

---

## 🔧 **Key Principles**

1. **Field constraints must match Console source exactly** (maxLength=100 not "limited")
2. **No implementation code** - tools-lib handles the heavy lifting!
3. **Checkpoint save points defined clearly** (after which steps)
4. **ASCII diagrams complete and readable**
5. **Error codes map to Console exceptions**

---

**📌 重要**: 所有字段约束和业务流程都来自业务梳理文档，不要自己重新发明！