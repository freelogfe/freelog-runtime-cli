# POLICY - 授权策略系统设计

> **版本**: v1.0 | **最后更新**: 2026-09-02  
> **对齐 Source**: `business/业务梳理/流程设计 - 创建资源/01-3-Step3-策略模板.md` + Console 源码策略管理部分  
> **定位**: 📦 **通用模块** - F1/M1/C3/F2.1 等所有 Phase 都复用此功能

---

## 📋 **一、整体架构**

```
┌──────────────────────────────────────────────────────────────┐
│                    POLICY 授权策略系统                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              CLI 命令行工具                              │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │                                                         │ │
│  │  freelog-cli policy                                   │ │
│  │   ├─ template-list          # 列出可用策略模板        │ │
│  │   ├─ select <templateId>    # 选择模板               │ │
│  │   ├─ params                 # 填写参数                │ │
│  │   └─ compile                # Bytecode 编译            │ │
│  │                                                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                       ▼                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              三层处理逻辑                                │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │                                                         │ │
│  │  Layer 1: 模板选择层                                    │ │
│  │  ├─ GET /v2/policies/templates                         │ │
│  │  ├─ Filter by category (free/commercial/custom)       │ │
│  │  └─ Prompt user selection                             │ │
│  │                                                         │ │
│  │  Layer 2: Schema 验证层                                 │ │
│  │  ├─ Load JSON Schema from selected template           │ │
│  │  ├─ Generate CLI form input                           │ │
│  │  ├─ Validate user input against Schema                │ │
│  │  └─ Auto-calculate defaults                           │ │
│  │                                                         │ │
│  │  Layer 3: Bytecode 编译层                               │ │
│  │  ├─ NLP→IR transformation                            │ │
│  │  ├─ IR→AST optimization                              │ │
│  │  ├─ AST→Bytecode generation                          │ │
│  │  ├─ SHA256 checksum calculation                      │ │
│  │  └─ POST /v2/policies/compile                         │ │
│  │                                                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔗 **二、调用的 API 与依赖**

| 调用来源 | Step | 用途 | 是否必填 |
|---------|------|------|---------|
| F1 单资源发布 | Step3 | 配置资源的授权策略 | ✅ Yes |
| M1 版本更新 | Step3 | 继承或重新配置策略 | ⚠️ Optional |
| C3 合集 CRUD | Policy Inheritance | 设置合集内资源的策略优先级 | ⚠️ Optional |
| F2.1 批量发布 | Parallel F1 | 复用 F1 的策略配置逻辑 | ✅ Yes |

---

## 💻 **三、F1 Step3: 策略配置详细设计**

### **3.1 业务流程图**

```
F1 Step3: 策略配置

Step 1: 加载策略模板列表
├─ GET /api/policies/templates
├─ 返回：[{ id, name, category, schema }]
└─ Prompt: 选择模板 ID
   ├─ [1] free-use: 免费使用
   ├─ [2] commercial-use: 商业使用
   └─ [3] custom: 完全自定义

Step 2: 填充默认值
├─ 基于选中的模板加载 JSON Schema
├─ 自动填充可计算字段:
│  ├─ attribution: true (默认需要署名)
│  ├─ licenseUrl: "https://freelog.dev"
│  └─ termsOfUse: "[模板名称] 标准条款"
└─ 允许用户修改不可变字段

Step 3: Schema 验证
├─ FOR EACH parameter IN userParams DO
│  ├─ IF !Schema.validate(parameter) THEN
│  │  ├─ 显示错误："⚠️ ${field} 不符合要求"
│  │  └─ Prompt: "💡 请修正后再提交"
│  │  └─ retry_with_prompt
│  │
│  └─ ELSE IF parameter.format == 'url' THEN
│     ├─ URL 格式验证
│     └─ reject if invalid
│
│  └─ ELSE IF parameter.type == 'textarea' AND length > max THEN
│     ├─ 超出最大长度
│     └─ truncate_or_reject
│
│  END FOR
└─ RETURN validParams[]

Step 4: Bytecode 编译
├─ 构建策略文本：policyText = formatTemplate(templateId, params)
│
├─ 编译步骤：
│  ├─ 1. Parse natural language → Intermediate Representation (IR)
│  │   └─ IR = { conditions: [...], actions: [...] }
│  │
│  ├─ 2. Optimize IR → Abstract Syntax Tree (AST)
│  │   └─ AST = optimizeIR(IR)
│  │
│  ├─ 3. Generate bytecode from AST
│  │   └─ bytecode = generateBytecode(AST)
│  │
│  └─ 4. Calculate checksum
│      └─ checksum = SHA256(bytecode)
│
├─ 提交服务器验证：
│  ├─ POST /v2/policies/compile
│  ├─ Body: { bytecode, checksum }
│  └─ Response: { policyId, verified: true/false }
│
└─ RETURN { policyId, bytecode, checksum }
```

### **3.2 策略模板选项表**

| 模板 ID | 名称 | Category | 适用场景 | 必选参数 | 可选参数 | 示例 |
|--------|------|----------|---------|---------|---------|------|
| `free-use` | 免费使用 | Free | 可自由复制分发 | licenseUrl (可选) | attribution | "本作品可免费用于个人和商业项目，但需保留原作者署名" |
| `commercial-use` | 商业使用 | Commercial | 需购买许可证才能商用 | licenseUrl, termsOfUse | attribution, warranty | "商业使用需购买 PRO License，详情见 https://example.com/license" |
| `custom` | 完全自定义 | Custom | 用户完全自定义条款 | policyText | N/A | 用户输入的任意文本 |

### **3.3 JSON Schema 验证规则**

```typescript
interface PolicyParameterSchema {
  key: string;
  name: string;                  // 显示名称
  type: 'string' | 'boolean' | 'number';
  format?: 'url' | 'email';     // 格式约束
  minLength?: number;
  maxLength?: number;
  required: boolean;
  default?: any;
  description: string;
}

// Schema 验证器
class PolicySchemaValidator {
  validate(templateId: string, params: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    
    // 1. Required fields check
    for (const field of this.getRequiredFields(templateId)) {
      if (!params[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // 2. Type validation
    for (const [key, value] of Object.entries(params)) {
      const expectedType = this.getExpectedType(key);
      if (typeof value !== expectedType) {
        errors.push(`Invalid type for ${key}: expected ${expectedType}, got ${typeof value}`);
      }
    }
    
    // 3. Format validation (URL, email, etc.)
    for (const [key, format] of Object.entries(this.getFormats())) {
      const value = params[key];
      if (value && !this.isValidFormat(value, format)) {
        errors.push(`Invalid format for ${key}: expected ${format}`);
      }
    }
    
    // 4. Length constraints
    for (const [key, range] of Object.entries(this.getLengthConstraints())) {
      const value = params[key];
      if (value && (value.length < range.min || value.length > range.max)) {
        errors.push(`${key} must be between ${range.min} and ${range.max} characters`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  private isValidFormat(value: string, format: 'url' | 'email'): boolean {
    switch (format) {
      case 'url':
        return /^https?:\/\/[\w.-]+(?:\/.*)?$/i.test(value);
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      default:
        return true;
    }
  }
}
```

### **3.4 Bytecode 编译算法**

```typescript
interface CompileResult {
  policyId: string;
  bytecode: string;             // Base64 encoded binary
  checksum: string;             // SHA256 hash
  compiledAt: string;           // ISO timestamp
}

async function compilePolicyBytecode(
  template: string,
  parameters: Record<string, any>
): Promise<CompileResult> {
  // Step 1: Build natural language policy text
  const policyText = await buildNaturalLanguageTemplate(template, parameters);
  /*
  Example output:
  "本作品可免费用于商业和非商业项目，但必须保留原作者署名并声明修改情况。
   不得将本作品直接出售或作为付费内容的核心组成部分。"
  */

  // Step 2: Parse to Intermediate Representation (IR)
  // IR 结构示例：
  // {
  //   conditions: [
  //     { type: 'usage_type', op: 'in', values: ['personal', 'commercial'] },
  //     { type: 'attribution_required', value: true }
  //   ],
  //   actions: [
  //     { type: 'allow', scope: 'modification', condition: 'attribution_provided' },
  //     { type: 'deny', scope: 'resell', always: true }
  //   ]
  // }
  const ir = parseNaturalLanguageToIR(policyText);

  // Step 3: Optimize IR → Abstract Syntax Tree (AST)
  // 优化逻辑：
  // • 消除冗余条件
  // • 合并冲突规则
  // • 标准化表达式
  const ast = optimizeIR(ir);

  // Step 4: Generate bytecode from AST
  // Bytecode 格式定义：
  // [OpCode][OperandLength][Operand...]*
  const bytecode = generateBytecodeFromIR(ast);

  // Step 5: Calculate SHA256 checksum
  const checksum = await calculateSHA256(bytecode);

  // Step 6: Submit to server for verification
  const response = await POST('/v2/policies/compile', {
    bytecode: base64encode(bytecode),
    checksum
  });

  if (!response.verified) {
    throw new CompileError(`Server rejected policy compilation: ${response.reason}`);
  }

  return {
    policyId: response.policyId,
    bytecode: base64encode(bytecode),
    checksum,
    compiledAt: new Date().toISOString()
  };
}
```

### **3.5 CLI Prompt 交互流程**

```
┌─ 策略配置 (Step 3/4) ─────────────────────┐
│                                            │
│ ▼ 选择策略模板                             │
│   [1] free-use: 免费使用                   │
│   [2] commercial-use: 商业使用             │
│   [3] custom: 完全自定义                   │
│                                            │
│ 请选择策略模板 ID (输入数字): █____________ │
│                                            │
│ ▶ 下一步：ENTER | 上一步：BACKSPACE         │
└────────────────────────────────────────────┘


┌─ 策略参数配置 ────────────────────────────┐
│                                            │
│ ▼ 当前模板：commercial-use                 │
│                                            │
│ 必填参数：                                 │
│ ├── licenseUrl: [https://example.com/license] █
│ │   政策链接地址                          │
│ │                                          │
│ ├── termsOfUse: [商业使用需购买 PRO License] █
│ │   使用说明                              │
│ │                                          │
│ 可选参数：                                 │
│ ├─ ☑ attribution: true                     │
│ │   是否需要署名                          │
│ │                                          │
│ └─ ☐ warranty: false                       │
│     是否包含保修条款                      │
│                                            │
│ ⚠️ 提示：点击参数旁的按钮可以查看详细说明   │
│                                            │
│ ▶ 下一步：ENTER | 预览：P                 │
└────────────────────────────────────────────┘


┌─ Bytecode 编译结果 ────────────────────────┐
│                                            │
│ ✓ 策略已成功编译!                          │
│                                            │
│   模板 ID: commercial-use                  │
│   策略 ID: pol_commercial_001              │
│   Checksum: a1b2c3d4e5f6...                │
│   编译时间：2026-09-02 15:00:00Z           │
│                                            │
│ 策略摘要预览：                             │
│ 「商业使用需购买 PRO License」              │
│   • 允许范围：个人/非商业项目              │
│   • 限制范围：禁止直接出售                 │
│   • 特殊要求：需保留原作者署名             │
│                                            │
│ 下一步：ENTER | 重新编辑：E                │
└────────────────────────────────────────────┘
```

---

## 🚨 **四、异常分支处理矩阵**

| 错误码 | 触发条件 | 用户提示 | 修复建议 | 重试策略 |
|--------|---------|---------|---------|---------|
| INVALID_TEMPLATE_ID | 模板 ID 不存在 | "❌ 该策略模板不存在" | "💡 请重新选择有效的模板" | prompt_user |
| SCHEMA_VALIDATION_FAILED | 参数不符合 Schema | "⚠️ 参数验证失败" | "💡 请检查输入格式" | prompt_correction |
| MISSING_REQUIRED_FIELD | 缺少必填参数 | "⚠️ 以下字段为必填：${fields}" | "💡 请补充完整信息" | prompt_correction |
| BYTECODE_COMPILE_ERROR | Bytecode 编译失败 | "❌ 策略编译失败" | "💡 请联系管理员" | reject |
| SERVER_POLICY_REJECTED | 服务器拒绝策略 | "⚠️ 策略审核不通过" | "💡 请修改条款内容" | prompt_correction |
| RATE_LIMIT_EXCEEDED | 请求过快 | "⚠️ 操作过于频繁" | "💡 等待 30 秒后重试" | exponential_backoff × 3 |

---

## ✅ **五、CLI 特有边界**

### **5.1 付费策略签约限制**

```
❌ CLI 不支持付费策略签约!
原因：CLI 无法处理支付流程，这是 Console 的核心能力之一

✅ CLI 只能实现免费策略签约!
限制:
  1. 检测策略是否包含 TransactionEvent → 如果是则拒绝签约
  2. 仅支持免费策略模板 (free-use 和部分 commercial-use without payment)
  3. 如果检测到付费需求 → 提供 ConsoleURL 引导用户到 Console 完成
```

**ConsoleURL 生成示例:**
```typescript
function provideConsoleFallback(policyId: string): string {
  const consoleUrl = `https://freelog.dev/resource/${resourceId}/policy/${policyId}`;
  console.log(`\n⚠️ 此策略需要付费签约，请在浏览器中完成:`);
  console.log(`👉 ${consoleUrl}\n`);
  return consoleUrl;
}
```

### **5.2 CLI 简化版 Schema 表单**

Console 使用复杂的前端组件库 (Ant Design)，而 CLI 必须简化为纯命令行输入:

```typescript
// Console 实现：React Form Components
<ANT_DESIGN_FORM>
  <Input placeholder="License URL"/>
  <TextArea placeholder="Terms of Use"/>
  <Checkbox checked={attribution}/>
</ANT_DESIGN_FORM>

// CLI 实现：cli-prompts
await promptInput({
  message: 'License URL',
  initialValue: 'https://freelog.dev',
  validate: (value) => isValidURL(value)
});

await promptInput({
  message: 'Terms of Use',
  multiline: true,
  validate: (value) => value.length <= 500
});

await promptToggle({
  message: 'Need attribution?',
  defaultValue: true
});
```

---

## ✅ **六、验收标准**

### **功能验收项**

- [ ] 能正确列出所有可用策略模板
- [ ] Template 选择正确，默认选中第一项
- [ ] Schema 验证逻辑正确 (required/type/format/length)
- [ ] Bytecode 编译流程完整 (NLP→IR→AST→Bytecode)
- [ ] SHA256 checksum 计算正确
- [ ] POST /v2/policies/compile API 调用成功
- [ ] 免费策略签约工作正常
- [ ] 付费策略检测并提供 ConsoleURL 引导

### **数据结构验收项**

- [ ] PolicyParameterSchema 类型定义明确
- [ ] CompileRequest/Response 接口完整
- [ ] IR/AST 中间数据结构清晰

### **异常分支验收项**

- [ ] 所有错误码都有对应处理
- [ ] 用户提示清晰且有修复建议
- [ ] Retry 策略合理 (prompt_correction, exponential_backoff)

---

**📌 下一步**: [F1-SingleResource-Publish-Design.md](../F1-SingleResource-Publish-Design.md) | [M1-VersionUpdate-Design.md](../M1-VersionUpdate-Design.md)
