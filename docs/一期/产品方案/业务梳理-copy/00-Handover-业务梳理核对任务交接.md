# 📋 业务梳理 vs Console 源码对齐检查 - 完整交接文档

> **交接时间**: 2026-09-02  
> **任务名称**: 系统性地逐一核对业务梳理下的所有文件与 Console 源码
> **当前进度**: 已核对 F0-1 Step1, M2 属性更新; 剩余 15 个文件待核对
> **紧急程度**: 🔴 CRITICAL (存在多处字段约束错误需要修正)

---

## 🎯 **一、任务核心目标**

### **主要任务:**
系统性地逐一核对 `docs/一期/产品方案/业务梳理/` 目录下的所有文件，确保它们 100% 对齐 Console 源码，没有遗漏或错误。

### **为什么重要:**
- ❌ 如果业务梳理有错误，PHASE 文档会继承这些错误
- ✅ 必须确保业务梳理作为"中间层"完全正确
- ⚠️ 已经发现多处严重错误影响整个流程

---

## ✅ **二、已完成的工作**

### **1. 创建检查报告**
- 📄 文件：[docs/一期/产品方案/业务梳理/业务梳理 vs Console 源码对齐检查报告.md](file://d:\appinside\freelog-runtime-cli\docs\一期\产品方案\业务梳理\业务梳理%20vs%20Console%20源码对齐检查报告.md)
- 用途：记录每个文件的核对状态和发现的错误

### **2. 已发现的重⼤错误**

#### ❌ **错误 1: M2-属性与描述更新.md**

**位置:** `docs/一期/产品方案/业务梳理/资源管理/02-属性与描述更新.md`

**错误内容:**
```markdown
L23: "✎ 标题 (最多 200 字符)"
L87: maxLength: 200
```

**Console 证据:**
`D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/sidebar/info/$id/index.tsx` L267:
```typescript
lengthLimit={100}  // ✅ 实际是 100 字符!
```

**修正需求:**
- 将文档中所有"200 字符"改为 **"100 字符"**

---

#### ❌ **错误 2: F0-1 Step1-创建资源壳.md**

**位置:** `docs/一期/产品方案/业务梳理/流程设计 - 创建资源/01-1-Step1-创建资源壳.md`

**错误内容:**
```markdown
L60: "最大长度：**200 字符**"
L54: "(75/200)"
L145: "标题长度为{actual}/200"
L192: "200 字符限制生效"
```

**Console 证据:**
`D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/creator/Step1/index.tsx` L128:
```typescript
lengthLimit={100}  // ✅ 实际是 100 字符!
```

**Additional Findings:**
- L139: 标题自动生成 authId 时截取前 **60 字符** (`value.substring(0, 60)`)
- L140: 禁止字符列表：`| / : * ? " < > | \s @ $ #` → 替换为 `_`
- L34: 300ms debounce (`wait: 300`)

**修正需求:**
- 将所有"200 字符"改为 **"100 字符"**
- 补充 authId 生成逻辑 (截取前 60 字符)
- 补充禁止字符列表
- 补充 300ms debounce 细节

---

#### ✅ **F0-2 Step2 已核对 (无错误)**
`creator/Step2/index.tsx` (~1063 行) - 已验证完整

#### ✅ **M0-1 版本更新已核对**
`versionCreator/$id/index.tsx` (~1239 行) - 已验证完整

---

## 📋 **三、待核对文件清单 (共 15 个)**

### **🔴 高优先级 (Critical)**

| # | 业务梳理文件 | Console 源码路径 | 预估行数 | 风险等级 |
|---|-------------|----------------|---------|---------|
| 1 | C0-2 Step2-填写合集信息 | collectionCreator/Step2/index.tsx | ~1505 | 🔴 高危 |
| 2 | M0-2 属性与描述更新 | sidebar/info/$id/index.tsx | ~492 | 🔴 已发现错误 |
| 3 | M0-3 授权策略管理 | sidebar/policy/$id/index.tsx | TBD | 🔴 待验证 |
| 4 | F1-1 批量发布总纲 | creatorBatch/Handle/Card.tsx, Finish.tsx | TBD | 🔴 待验证 |

### **🟡 中优先级 (High)**

| # | 业务梳理文件 | Console 源码路径 | 预估行数 | 备注 |
|---|-------------|----------------|---------|------|
| 5 | F0-3 Step3-配置授权策略 | creator/Step3/index.tsx | ~228 | 待验证 |
| 6 | F0-4 Step4-完善 Listing | creator/Step4/index.tsx | ~91 | 待验证 |
| 7 | C0-1 Step1-扫描本地目录 | collectionCreator/Step1/index.tsx | ~295 | 待验证 |
| 8 | C0-3 Step3-选择资源排序 | collectionCreator/Step3/index.tsx | ~145 | 待验证 |
| 9 | C0-4 Step4-收录规则 | collectionCreator/Step4/index.tsx | TBD | 待验证 |
| 10 | C0-5 Step5-完善 Listing | collectionCreator/Step5/index.tsx | TBD | 待验证 |

### **🟢 低优先级 (Medium)**

| # | 业务梳理文件 | Console 源码路径 | 备注 |
|---|-------------|----------------|------|
| 11-14 | C2-合集管理 (4 个文件) | collectionDetails/, collectionSidebar/* | 后续处理 |

---

## 🔧 **四、执行步骤 (新会话操作指南)**

### **Step 1: 立即读取并核对 C0-2 Step2**

**命令:**
```bash
Read file: D:\appinside\freelogfe-web-repos\packages\console\src\pages\resource\collectionCreator\Step2\index.tsx
```

**理由:** 
- 该文件有~1505 行，是最大的单个文件
- 可能存在大量遗漏和错误
- 优先级最高

**重点关注:**
1. 封面上传组件及验证规则
2. 合集标题/描述的字符限制
3. package.json 自动填充逻辑
4. 必填字段校验

---

### **Step 2: 逐个核对剩余的 14 个文件**

按上述表格顺序依次处理，每个文件的核对方法相同:

1. **Read** 业务梳理文件
2. **Read** 对应的 Console 源码
3. **对比字段约束** (字符限制、必填项、验证规则等)
4. **记录差异**到检查报告
5. **修正**业务梳理中的错误

---

### **Step 3: 统一修正所有错误**

当发现错误后，使用 `SearchReplace` 工具修正业务梳理文件。

**注意:**
- 保持原文档结构和风格
- 只修改错误的数值/字段
- 保留 Console 源码证据注释

---

### **Step 4: 最终汇总报告**

完成所有核对后，更新 [检查报告](file://d:\appinside\freelog-runtime-cli\docs\一期\产品方案\业务梳理\业务梳理%20vs%20Console%20源码对齐检查报告.md):

```markdown
## 📊 **最终核对结果**

✅ 已核对：X 个文件
❌ 发现错误：Y 个错误
📝 已修正：Z 处
```

---

## 💾 **五、关键 Console 源码索引**

### **创建资源流程**
```
D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/creator/
├── Step1/index.tsx    # F0-1, L128 lengthLimit={100}, L200 标题->authId 截取 60 字符
├── Step2/index.tsx    # F0-2, ~1063 行
├── Step3/index.tsx    # F0-3, ~228 行
└── Step4/index.tsx    # F0-4, ~91 行
```

### **版本更新流程**
```
D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/versionCreator/$id/
└── index.tsx          # M0-1, ~1239 行, value maxLength={140}
```

### **资源维护流程**
```
D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/sidebar/
├── info/$id/index.tsx        # M0-2, L267 lengthLimit={100}
├── policy/$id/index.tsx      # M0-3
└── dependency/$id/index.tsx  # 依赖管理
```

### **合集创建流程**
```
D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/collectionCreator/
├── Step1/index.tsx   # C0-1, ~295 行
├── Step2/index.tsx   # C0-2, ~1505 行 🔴 高危
├── Step3/index.tsx   # C0-3, ~145 行
├── Step4/index.tsx   # C0-4
└── Step5/index.tsx   # C0-5
```

### **批量发布流程**
```
D:/appinside/freelogfe-web-repos/packages/console/src/pages/resource/creatorBatch/
├── Handle/Card.tsx   # F1-1
├── Finish.tsx        # F1-1
└── ResourceType.tsx  # F1-1
```

---

## 🚨 **六、已知错误快速修复指引**

### **错误 A: M2 标题长度错误**

**文件:** `docs/一期/产品方案/业务梳理/资源管理/02-属性与描述更新.md`

**修复:**
```markdown
替换所有: "200 字符" → "100 字符"
```

**Console 证据:** `sidebar/info/$id/index.tsx` L267

---

### **错误 B: F0-1 Step1 标题长度错误**

**文件:** `docs/一期/产品方案/业务梳理/流程设计 - 创建资源/01-1-Step1-创建资源壳.md`

**修复:**
```markdown
L60, L145, L192: "200 字符" → "100 字符"
L54: "(75/200)" → "(75/100)"

补充 L55 之后的 authId 生成逻辑:
// 基于标题生成 authId 时截取前 60 字符
const name: string = value.substring(0, 60);

补充禁止字符列表:
禁止字符：| / : * ? " < > | \s @ $ # → 替换为 _

补充 L27-36 的 debounce:
wait: 300  // 300ms 防抖
```

**Console 证据:** `creator/Step1/index.tsx` L128, L139, L34

---

## 📝 **七、给新会话的明确指令**

### **指令模板:**
```
继续核对剩下的 15 个业务梳理文件。

按照以下优先级执行:
P0: C0-2 Step2(1505 行高危), M0-2, M0-3, F1-1
P1: F0-3, F0-4, C0-1, C0-3, C0-4, C0-5
P2: C2-合集管理 (4 个文件)

遇到错误立即记录并修正到检查报告。

所有核对完成后生成最终统计。
```

---

## ✅ **八、验收标准**

1. **完整性**: 17 个业务梳理文件全部核对完毕
2. **准确性**: 所有字段约束与 Console 源码一致
3. **可追溯性**: 每个文件都有 Console 源码证据
4. **无遗留错误**: PHASE 文档可以安全基于业务梳理编写

---

## 🎯 **九、下一步直接命令**

**复制这段命令到新会话即可继续:**

```
开始继续核对业务梳理文件。

优先处理 C0-2 Step2(collectionCreator/Step2/index.tsx 约 1505 行)。

读取 Console 源码后对比业务梳理文档，记录所有字段约束差异。

然后依次处理剩余的 14 个文件。
```

---

**交接人**: AI Assistant  
**交接状态**: ✅ 等待继续执行  

--- 

**End of Handover Document**
