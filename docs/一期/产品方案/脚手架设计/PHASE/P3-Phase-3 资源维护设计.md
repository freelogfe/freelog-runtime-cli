# P3-Phase-3 资源维护详细设计

> **版本**: v1.0 | **最后更新**: 2026-09-02  
> **对齐 Source**: `business/业务梳理/资源管理/`

---

## 📋 **一、Phase 职责**

P3-Phase-3 负责**所有资源维护相关操作**,包括属性更新、策略管理、状态变更:

```
┌─────────────────────────────────────────────────────────────┐
│                P3-Phase-3 资源维护                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  M2      │    │  M3      │    │  M4      │              │
│  │ 属性更新 │ →  │ 策略更新 │ →  │ 状态变更 │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│  ↓                                                           │
│  ┌──────────┐                                               │
│  │  M5      │                                               │
│  │ 下架/上架│                                               │
│  └──────────┘                                               │
│                                                             │
│  Phase 3 职责：                                                 │
│  1. 继承远端状态 + 本地修改                                    │
│  2. 字段约束验证                                              │
│  3. API 调用编排                                                │
│  4. Checkpoint 保存                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔗 **二、调用的 Step 清单**

| 编号 | Step 名称 | 来源文档 | 主要职责 |
|------|----------|---------|---------|
| **M2** | `业务梳理/资源管理/02-属性与描述更新.md` | 标题/描述/标签更新 |
| **M3** | `业务梳理/资源管理/03-授权策略管理.md` | 策略模板选择 + 签约 |
| **M4** | `业务梳理/资源管理/04-冻结与解冻.md` | 状态变更 + 原因记录 |
| **M5** | `业务梳理/资源管理/05-下架与上架.md` | Listing 状态切换 |

---

## ⏸️ **三、Checkpoint 机制 (复用 P2)**

**Checkpoint Key 定义:**

| Checkpoint Key | 保存时机 | 数据结构 |
|---------------|---------|---------|
| `m2-update-complete` | M2 完成后 | `{ resourceId, updatedFields[] }` |
| `m3-policy-configured` | M3 完成后 | `{ policyId, template, signedAt }` |
| `m4-status-changed` | M4 完成后 | `{ newStatus, frozenReason?, updatedAt }` |
| `m5-listing-updated` | M5 完成后 | `{ listingStatus, publishedAt? }` |

---

## 💻 **四、M2 属性与描述更新详细设计**

### **4.1 业务流程**

```
M2 属性更新流程:

Step 1/3: 读取当前属性
├─ GET /v2/resources/{resourceId}
├─ 获取 metadata: {title, description, tags[]}
└─ 展示可编辑字段列表

Step 2/3: 输入修改内容
├─ Prompt 编辑:
│  ├─ title: 当前值 / 新值 (可选修改)
│  ├─ description: 当前值 / 新值 (必填验证 50-1000 字符)
│  └─ tags: [current_tags] [+添加标签] [-删除标签]
├─ Validation:
│  ├─ title: 1-200 字符
│  ├─ description: 50-1000 字符
│  └─ tags: 最多 20 个
└─ HTML 标签验证: <br/> <p> <a> (最多 3 个<a>)

Step 3/3: 提交更新
├─ PUT /v2/resources/{resourceId}
│  ├─ Body: { resourceTitle?, intro?, tags? }
│  └─ Response: { resourceId, updatedFields[], updatedAt }
└─ ✅ 更新成功
```

### **4.2 字段约束表**

| 字段 | 约束规则 | 提示文案 | 错误码 | 处理方式 |
|------|---------|---------|--------|---------|
| title | 1-200 字符 | "标题长度 ({current}/200)" | TITLE_INVALID_LENGTH | prompt_user |
| description | 50-1000 字符 | "描述长度 ({current}/1000)" | DESCRIPTION_TOO_SHORT | prompt_correction |
| description | HTML 标签限制 | "只允许<br/><p><a>" | INVALID_HTML_TAGS | auto_fix |
| tags | 最多 20 个 | "最多 20 个标签" | TAGS_LIMIT_EXCEEDED | truncate_or_prompt |
| tags | 去重转小写 | "标签已自动去重" | N/A | auto_process |

### **4.3 API 调用详情**

**请求**: `PUT /v2/resources/{resourceId}`  
**Request Body:**
```json
{
  "resourceTitle": "星空之美",          // 可选，仅当修改时
  "intro": "<p>一款精美的 Aurora 主题</p>", // 必填，HTML 格式
  "tags": ["theme", "aurora", "night"]   // 可选，替换原有标签
}
```

**Success Response:**
```json
{
  "resourceId": "res_abc123",
  "updatedFields": ["title", "description", "tags"],
  "updatedAt": "2026-09-02T16:00:00Z",
  "version": 1
}
```

---

## 💻 **五、M3 授权策略管理详细设计**

### **5.1 业务流程**

```
M3 策略更新流程:

Step 1/4: 查看当前策略
├─ 显示当前生效的策略信息
│  ├─ 模板 ID: commercial-use
│  ├─ 模板名称：商业使用
│  └─ 生效时间：2026-09-01
└─ 询问是否修改

Step 2/4: 选择策略模板
├─ 展示可用模板列表:
│  ├─ free-use: 免费使用
│  ├─ commercial-use: 商业使用  
│  └─ custom: 完全自定义
├─ Prompt: 选择新模板 ID
└─ 加载对应 JSON Schema

Step 3/4: 填写策略参数
├─ 根据 Schema 生成表单:
│  ├─ licenseUrl (string, URL 格式)
│  ├─ termsOfUse (textarea, 最多 500 字符)
│  └─ attribution (boolean)
├─ Schema 验证
└─ Bytecode 编译预览

Step 4/4: 提交新策略
├─ POST /v2/resources/policy/update
│  ├─ Body: { templateId, parameters[] }
│  └─ Response: { policyId, bytecode, checksum }
└─ ✅ 策略更新完成
```

### **5.2 策略模板选项**

| 模板 ID | 名称 | 适用场景 | 必选参数 | 示例 |
|--------|------|---------|---------|------|
| free-use | 免费使用 | 可自由复制分发 | licenseUrl (可选) | "本作品可免费用于个人和商业项目" |
| commercial-use | 商业使用 | 需购买许可证 | licenseUrl, termsOfUse | "商业使用需购买 PRO License" |
| custom | 完全自定义 | 用户自定义条款 | policyText | 用户输入的任意文本 |

### **5.3 Schema 验证规则**

```typescript
interface PolicySchemaValidator {
  validate(templateId: string, params: Record<string, any>): ValidationResult;
}

// 验证逻辑
function validatePolicyParams(
  schema: JSONSchema,
  params: Record<string, any>
): ValidationResult {
  const errors: string[] = [];
  
  // Required fields
  for (const requiredField of schema.required || []) {
    if (!params[requiredField]) {
      errors.push(`Missing required field: ${requiredField}`);
    }
  }
  
  // Type validation
  for (const [key, value] of Object.entries(params)) {
    const expectedType = schema.properties[key]?.type;
    
    if (value !== undefined && typeof value !== expectedType) {
      errors.push(`Invalid type for ${key}: expected ${expectedType}`);
    }
  }
  
  // Format validation (URL, email, etc.)
  for (const [key, format] of Object.entries(schema.format)) {
    if (!isValidFormat(value, format)) {
      errors.push(`Invalid format for ${key}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

### **5.4 Bytecode 编译流程**

```typescript
async function compilePolicyBytecode(
  template: string,
  params: Record<string, any>
): Promise<{ policyId: string; bytecode: string; checksum: string }> {
  // 1. 将策略文本转换为 IR
  const ir = parseNaturalLanguageToIR(template, params);
  
  // 2. 优化 IR
  const optimizedIR = optimizeAST(ir);
  
  // 3. 生成 Bytecode
  const bytecode = generateBytecodeFromIR(optimizedIR);
  
  // 4. 计算 Checksum
  const checksum = await calculateSHA256(bytecode);
  
  // 5. 提交到服务器获取 policyId
  const response = await POST('/v2/policies/compile', {
    bytecode,
    checksum
  });
  
  return {
    policyId: response.policyId,
    bytecode,
    checksum
  };
}
```

---

## 💻 **六、M4 冻结与解冻详细设计**

### **6.1 业务流程**

```
M4 状态变更流程 (冻结/解冻):

Step 1: 确认操作类型
├─ Prompt: 选择操作
│  ├─ 冻结资源 (Freeze)
│  └─ 解冻资源 (Unfreeze)
└─ 如果是冻结，必须提供原因

Step 2: 输入原因 (仅冻结时)
├─ 预设原因下拉框:
│  ├─ 违反平台规范
│  ├─ 收到侵权投诉
│  ├─ 内容违规
│  └─ 其他原因 (自定义)
├─ 自定义原因文本框 (50-500 字符)
└─ Validation: 必填且符合长度

Step 3: 确认并提交
├─ 最终确认界面:
│  ├─ 资源 ID: res_abc123
│  ├─ 操作：冻结/解冻
│  ├─ 原因：xxx
│  └─ ☑ 确认执行此操作
└─ POST /v2/resources/freeze OR unfreeze

Step 4: 返回结果
├─ Success: { status, freezeReason?, unfrozenAt? }
└─ ✅ 状态已变更
```

### **6.2 字段约束**

| 字段 | 约束规则 | 提示文案 | 错误码 |
|------|---------|---------|--------|
| freezeReason | 冻结时必须，50-500 字符 | "冻结原因至少 50 字符" | REASON_TOO_SHORT |
| action | enum: 'freeze' | 'unfreeze' | 非法操作 | INVALID_ACTION |
| resourceId | 存在且属于当前用户 | "资源不存在或无权操作" | RESOURCE_NOT_FOUND |

### **6.3 API 调用**

**冻结**: `POST /v2/resources/{resourceId}/freeze`

**Request:**
```json
{
  "reason": "发现该资源违反了平台的版权政策..." // 50-500 字符
}
```

**解冻**: `POST /v2/resources/{resourceId}/unfreeze`

**Response (冻结或解冻):**
```json
{
  "resourceId": "res_abc123",
  "status": "frozen",  // or "online"
  "frozenReason": "违反平台规范",
  "updatedAt": "2026-09-02T17:00:00Z"
}
```

---

## 💻 **七、M5 下架与上架详细设计**

### **7.1 业务流程**

```
M5 下架/上架流程:

Step 1: 确认操作
├─ Prompt: 选择操作
│  ├─ 下架资源 (Delist)
│  └─ 上架资源 (Publish)
└─ 下架需要提供原因

Step 2: 选择下架原因 (仅下架时)
├─ 下拉框:
│  ├─ 暂时下架维护
│  ├─ 资源即将废弃
│  ├─ 需要重大更新
│  └─ 其他原因
└─ 可选：补充说明文本

Step 3: 最终确认
├─ 展示当前状态 → 目标状态
│  ├─ online → delisting (下架)
│  └─ delisting → online (上架)
├─ 确认 checkbox
└─ PUT /v2/resources/{resourceId}/status

Step 4: 返回结果
├─ Success: { status, updatedAt }
└─ ✅ 状态已切换
```

### **7.2 状态流转图**

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  draft  │ →   │ online  │ ← → │delisting│
└─────────┘     └─────────┘     └─────────┘
                   ↑                 │
                   │                 ↓
              ┌─────────┐
              │ frozen  │
              └─────────┘
```

**状态转换规则:**
- `draft → online`: 首次发布
- `online → delisting`: 下架申请
- `delisting → online`: 重新上架
- `online → frozen`: 平台冻结
- `frozen → online`: 解冻恢复

### **7.3 API 调用**

**请求**: `PUT /v2/resources/{resourceId}/status`

**Request Body:**
```json
{
  "status": "delisting",  // or "online"
  "reason": "暂时下架维护", // 仅 delisting 时
  "estimatedRepublishDate": "2026-09-10" // 可选
}
```

**Success Response:**
```json
{
  "resourceId": "res_abc123",
  "status": "delisting",
  "updatedAt": "2026-09-02T18:00:00Z"
}
```

---

## 🚨 **八、异常分支处理矩阵**

| 错误码 | 触发条件 | 用户提示 | 修复建议 | 重试策略 |
|--------|---------|---------|---------|---------|
| FIELD_VALIDATION_FAILED | 字段不符合约束 | "⚠️ 字段验证失败" | "💡 请检查输入格式" | prompt_correction |
| POLICY_COMPILE_ERROR | Bytecode 编译失败 | "❌ 策略编译失败" | "💡 请联系管理员" | reject |
| RESOURCE_FROZEN | 尝试修改冻结资源 | "❌ 资源已被冻结" | "💡 请先解冻资源" | reject |
| INSUFFICIENT_PERMISSIONS | 无权操作 | "❌ 没有权限执行此操作" | "💡 检查账号权限" | reject |
| API_RATE_LIMIT | 请求过快 | "⚠️ 操作过于频繁" | "💡 等待 30 秒后重试" | exponential_backoff |
| STATE_TRANSITION_INVALID | 状态转换非法 | "⚠️ 非法的状态转换" | "💡 请选择正确的操作" | reject |

---

## ✅ **九、验收标准**

### **功能验收项**
- [ ] M2 属性更新可执行 (title/description/tags)
- [ ] M3 策略模板选择正确
- [ ] M4 冻结/解冻状态转换正确
- [ ] M5 下架/上架状态切换正确
- [ ] Checkpoint 保存点正确
- [ ] 所有异常分支有处理

### **数据结构验收项**
- [ ] Input/Output 类型定义明确
- [ ] 字段约束准确
- [ ] API 请求响应一致

---

**📌 下一步**: [P4-Phase-4 合集管理](./P4-Phase-4%20 合集管理.md)
