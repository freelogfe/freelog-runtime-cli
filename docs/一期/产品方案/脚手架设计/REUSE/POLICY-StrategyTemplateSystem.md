# REUSE/POLICY - 策略模板编译系统设计

> **版本**: v1.0 | **最后更新**: 2026-09-03

---

## 📋 **一、设计目标**

将用户友好的策略参数编译为平台可用的 policyText，并提供策略模板查询和管理能力。

### **1.1 核心职责**

```
┌──────────────────────────────────────┐
│   POLICY Service                      │
│   ─────────────                         │
│   · 策略模板查询 (free/commercial/custom) |
│   · 交互式参数引导                      │
│   · policyText URL 编码编译               │
│   · 重复检测 (避免重复创建)              │
└──────────────────────────────────────┘
           ↓ 调用
┌──────────────────────────────────────┐
│   tools-lib Policy API                │
│   (平台策略管理接口)                   │
└──────────────────────────────────────┘
```

---

## 🔧 **二、接口契约**

### **2.1 主要方法签名**

| 方法名 | 参数 | 返回值 | 说明 |
|--------|------|--------|------|
| `listTemplates()` | `resourceType: string, env: string` | `PolicyTemplate[]` | 查询可用策略模板 |
| `getTemplateDetail()` | `templateId: string` | `PolicyTemplateDetail` | 获取模板详情和参数定义 |
| `compilePolicyText()` | `templateId, params: object` | `{policyName, policyText, encodedUrl}` | 编译策略正文 |
| `checkDuplicate()` | `policyText: string, ownerId: number` | `{exists: boolean, policyId?: string}` | 检查是否已存在相同策略 |
| `signPolicy()` | `policyId, params` | `{policyId, status: 'active' \| 'inactive'}` | 签署并启用策略 |

### **2.2 PolicyTemplate 结构**

```typescript
interface PolicyTemplate {
  id: string;                 // 模板 ID (如 free-open-source)
  name: string;               // 模板名称 (如免费开源)
  description: string;        // 模板描述
  category: 'free' \| 'commercial' \| 'custom';
  requiresPayment: boolean;   // 是否需要付费
  parameters: ParameterDef[]; // 参数定义
}

interface ParameterDef {
  key: string;                // 参数键名 (如 maxUsers)
  type: 'number' \| 'boolean' \| 'text';
  required: boolean;
  defaultValue: any;
  validation?: {             // 可选的验证规则
    min?: number;
    max?: number;
    pattern?: string;
  };
}
```

---

## 🔧 **三、TTY Interactive Flow**

### **3.1 ASCII Diagram 示例**

```bash
┌─ Step3/5: 配置授权策略 ──────────────┐
│                                       │
│ ▼ 当前策略模板选择                      │
│                                       │
│ ├── free (免费开源)                    │
│ │   ├─ MIT License                    │
│ │   └─ 完全开放源代码                  │
│ │                                   │
│ ├── commercial (商业使用)               │
│ │   ├─ 需购买许可证                    │
│ │   └─ 商业项目需付费                  │
│ │     ⚠️ TransactionEvent required     │
│ │                                   │
│ └── custom (自定义)                    │
│     └─ 自定义条款参数                  │
│                                       │
│ ▼ 选中策略详情                         │
│   策略名称：commercial                 │
│   策略描述：商业项目需购买许可证         │
│   定价：¥99.00/年                     │
│                                       │
│ 🔧 策略参数配置                        │
│   ├─ maxUsers: [10▼]                 │
│   ├─ validDays: [365▼]                │
│   └─ enableSupport: [☑ True]          │
│                                       │
│ ⚠️ 提示：此步骤为可选                   │
│                                        │
│ [上一步] B | [跳过并继续] N              │
└───────────────────────────────────────┘
```

---

## 💻 **四、策略编译逻辑**

### **4.1 compilePolicyText If-then-else 伪代码**

```
IF CLI provides --policy-file flag THEN
  # 高级/AI/迁移场景：直接读取 policyText 文件
  policyText = readFile(config.policyFilePath)
  
  # 解码并解析现有策略
  decodedText = urlDecode(policyText)
  parsedParams = parsePolicyParams(decodedText)
  
  policyName = extracted_name(parsedParams)
  
ELSE IF user_selects_template THEN
  template = getTemplateDetail(selected_template_id)
  
  # 交互式收集参数
  params = {}
  FOR EACH param_def IN template.parameters DO
    IF param_def.required THEN
      params[param_def.key] = promptUserRequired(param_def.key)
    ELSE IF user_wants_to_set_optional THEN
      params[param_def.key] = promptUserOptional(param_def.key)
    ELSE
      params[param_def.key] = param_def.defaultValue
    END IF
    
    # 验证参数值
    IF param_def.validation EXISTS THEN
      validated = validateValue(params[param_def.key], param_def.validation)
      
      IF NOT validated.valid THEN
        showError(`"${param_def.key}"不合法：${validated.error_message}`)
        retryInput()
      END IF
    END IF
  END FOR
  
  # 生成策略正文（未编码）
  raw_policy_text = generatePolicyText(template.templateFormat, params)
  
  # URL 编码
  policyText = encodeURIComponent(raw_policy_text)
  
  # 生成策略名称
  policyName = `${template.name}-${generateUniqueSuffix(params)}`
  
ELSE IF CLI provides --policy flag THEN
  # 声明式输入
  policyName = CLI_policy_name
  policyText = CLI_policy_text
  
  # 必须已经过 URL 编码
END IF

# 检查重复
duplicate_check = checkDuplicate(policyText, current_user_id)

IF duplicate_check.exists THEN
  showInfo(`该策略已存在 (PolicyID: ${duplicate_check.policyId})`)
  confirmUseExisting()
  
  IF confirms THEN
    returned_policy_id = duplicate_check.policyId
    action = 'use_existing'
  ELSE
    allowNewCreation()
  END IF
ELSE
  # 新策略创建
  result = signPolicy(new_params)
  returned_policy_id = result.policyId
  action = 'created_new'
END IF

RETURN {
  policyId: returned_policy_id,
  policyName: policyName,
  policyText: policyText,
  action: action
}
```

### **4.2 URL 编码规范**

**要求**: 遵循 RFC 3986 标准，对政策正文进行安全编码。

```
示例：
原始文本：
{
  "type": "commercial",
  "maxUsers": 10,
  "validDays": 365,
  "description": "商业项目使用许可"
}

URL 编码后:
%7B%22type%22%3A%22commercial%22%2C%22maxUsers%22%3A10%2C%22validDays%22%3A365%2C%22description%22%3A%22%E5%95%86%E4%B8%9A%E9%A1%B9%E7%9B%AE%E4%BD%BF%E7%94%A8%E8%AE%B8%E5%8F%AF%22%7D

CLI 内部只保存未编码的原始文本和用户友好的展示，仅在提交到平台时才进行 URL 编码。
```

---

## ⚠️ **五、异常处理矩阵**

| 错误场景 | Error Code | 用户友好消息 | Recovery Action |
|---------|-----------|-------------|-----------------|
| Template Not Found | POLICY-401 | "找不到指定的策略模板" | Rerun with valid template ID |
| Invalid Parameter Value | POLICY-402 | "参数${key}的值不合法" | Re-enter valid value |
| Duplicate Policy Exists | POLICY-403 | "该策略正文已存在" | 使用现有或修改内容后新建 |
| Payment Required | POLICY-404 | "此策略需要付费签约" | 跳转 Console 支付页面 |
| Network Timeout | POLICY-405 | "查询策略模板超时" | Retry with backoff |
| Server Error (5xx) | POLICY-406 | "策略服务暂时不可用" | Abort and retry later |

---

## 🧪 **六、验收测试用例**

| Case ID | 测试场景 | 预期结果 | 对应功能 |
|---------|---------|---------|---------|
| POLICY-T1 | 选择免费开源模板 | 自动生成 MIT 协议正文 | 4.1 Compile Logic |
| POLICY-T2 | 商业模板填写参数 | 参数验证成功，生成可签约策略 | 4.1 Param Validation |
| POLICY-T3 | 重复策略检测 | 识别已存在策略，提供复用选项 | 4.1 Duplicate Check |
| POLICY-T4 | URL 编码正确性 | 服务端解码后与原始意图一致 | 4.2 Encoding Spec |
| POLICY-T5 | 跳过策略配置 | Step3 可选分支正常执行 | F0-Step3 Optional |

---

## 🔗 **七、交叉引用**

- **被 PHASE/F0 引用**: Step3 策略选择流程
- **被 PHASE/M0 引用**: 版本更新时策略维护
- **对齐 Platform API**: Resource.update.addPolicies endpoint

---

**📌 使用说明**: 本文档指导开发者实现策略模板编译系统，PHASE 层只需声明需要哪些策略模板即可。
