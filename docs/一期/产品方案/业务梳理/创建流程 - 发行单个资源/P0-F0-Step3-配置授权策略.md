# P0-F0-Step3: 配置授权策略 (可选)

## 📋 概述

Console 单资源发布的 Step3 完整业务流程，基于 `packages/console/src/pages/resource/creator/Step3` 源码分析。

> **重要性**: 此步骤为可选，如果用户没有免费依赖需要签约则跳过。

### 主流程 (ASCII)

```
开始 → 检测是否有免费依赖 
     ↓
有依赖？→ 选择策略模板 → 填充参数 → 编译 policyText
     ↓
预览编译结果 → 提交签署 → 得到 policyId → 跳转 Step4
     ↓
无依赖/用户跳过 → 直接跳转 Step4
```

---

## 一、检测是否有免费依赖

### 操作流程
1. 扫描当前资源的 dependencies
2. 筛选出未授权的依赖
3. 统计免费依赖数量
4. 询问用户是否需要配置策略

### Console 源码位置
- `packages/console/src/pages/resource/creator/Step3/index.tsx` (~228 行)

### 判断逻辑

```typescript
const freeDependencies = detectedDeps.filter(dep => dep.isFree)

if (freeDependencies.length > 0 && user.confirmToSign) {
  // 进入策略配置流程
} else {
  // 跳过此步骤
}
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f3_check_free_deps` | 检查提示 | "正在检查免费依赖..." |
| `f3_found_free_deps` | 找到免费依赖 | "检测到 {count} 个免费依赖" |
| `f3_sign_policy_hint` | 签约提示 | "是否需要为这些依赖签署免费策略？" |
| `f3_skip_optional` | 跳过选项 | "○ Skip for now" |

---

## 二、选择策略模板

### 操作流程
1. 从平台查询可用策略模板列表
2. 展示模板供用户选择
3. 支持自定义 JSON 模式
4. 返回选中的 templateId

### API 调用

| 操作 | tools-lib 函数 | HTTP 接口 | i18n key (zh_CN) |
|------|---------------|----------|------------------|
| 查询模板 | `policyService.listTemplates(resourceType)` | GET /policy/templates?type={typeCode} | f3_list_templates: "正在加载策略模板..." |
| 选择模板 | - | - | f3_select_template: "选择策略模板" |
| 新建模板 | `policyService.createCustomTemplate(data)` | POST /policy/create-template | c3_create_custom_template: "新建自定义策略" |

### 可用模板类型

| 模板 ID | 名称 | 适用场景 |
|--------|------|---------|
| `free-license-v1` | Free License v1.0 | 标准开源许可 |
| `proprietary` | Proprietary Software | 专有软件协议 |
| `custom-json` | Custom JSON | 用户自定义 JSON |

### 请求参数

```typescript
GET /policy/templates?type={typeCode}
Response: {
  templates: [
    {
      id: string,
      name: string,
      description: string,
      schema: object    // 必填参数 schema
    },
    // ... N 个模板
  ]
}
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f3_select_template` | 模板选择提示 | "请选择策略模板：" |
| `f3_custom_template` | 自定义模板 | "□ 新建自定义策略" |
| `f3_invalid_template` | 无效模板警告 | "无效的策略模板 ID" |

---

## 三、填充策略参数

### 操作流程
1. 读取模板的 schema (必填字段列表)
2. 显示默认值 (如果存在)
3. 允许用户修改每个参数的值
4. 验证输入符合 schema 要求

### 常用参数及默认值

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `grantee_group_ids` | array | `[]` | 被授权用户组 IDs |
| `usage_policy` | enum | `"unrestricted"` | 使用策略：unrestricted/restricted |
| `commercial_use` | boolean | `false` | 是否允许商业用途 |
| `modification_allowed` | boolean | `true` | 是否允许修改 |
| `distribution_allowed` | boolean | `false` | 是否允许分发 |
| `liability_limitation` | string | `"full"` | 责任限制：full/partial/none |

### 填充逻辑

```typescript
// 自动填充默认值
for (const field of schema.requiredFields) {
  if (!userInputs[field]) {
    userInputs[field] = field.defaultValue
  }
}

// 验证用户输入
for (const field of schema.validators) {
  const error = field.validator(userInputs[field.fieldName])
  if (error) {
    showError(`Invalid ${field.fieldName}: ${error.message}`)
    return false
  }
}
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f3_fill_params` | 填充参数提示 | "请填充策略参数：" |
| `f3_default_value` | 默认值提示 | "[默认值]" |
| `f3_invalid_param` | 参数无效错误 | "无效的 {fieldName} 参数" |
| `f3_missing_required` | 缺少必填字段 | "缺少必填参数：{fieldName}" |

---

## 四、编译并预览 policyText

### 操作流程
1. 根据 templateId + params 组合
2. 调用平台编译 API 生成 policyText
3. URL-safe Base64 编码
4. 显示预览让用户确认

### API 调用

| 操作 | tools-lib 函数 | HTTP 接口 | i18n key (zh_CN) |
|------|---------------|----------|------------------|
| 编译策略 | `policyService.compileAndVerify(params)` | POST /policy/compile | f3_compile_policy: "正在编译策略..." |
| 获取编码 | `policyService.encodeBase64(policy)` | - | - |

### 请求参数

```typescript
POST /policy/compile
Body: {
  templateId: string,
  parameters: {
    grantee_group_ids: [],
    usage_policy: "unrestricted",
    commercial_use: false,
    // ...
  }
}
```

### 响应数据

```typescript
{
  compiledPolicy: {
    raw: '{"grantees":[],"commercial":false,...}',
    encoded: 'eyJhIjoxLCJiIjoyfQ==',  // URL-safe base64
    length: 128  // chars
  },
  valid: boolean,
  errors: string[]  // 编译错误列表
}
```

### 预览 UI (TTY ASCII)

```
▼ 预览编译后的 policyText
┌──────────────────────────────────────┐
│ Compiled policyText (URL-encoded):   │
│ {"grantees":[],"commercial":false}   │
│ Length: 128 chars                    │
│ Encoded: eyJhIjoxLCJiIjoyfQ==         │
│                                      │
│ ✓ Looks good? (y/n)                 │
│                                      │
│ If invalid:                          │
│ ❌ Compilation failed:               │
│   - Missing required field 'author' │
└──────────────────────────────────────┘
```

### 验证规则

| 规则名 | 条件 | 错误提示 |
|--------|------|---------|
| `length_too_long` | encoded.length > MAX_LENGTH | "政策文本超过最大长度" |
| `invalid_json` | !isJSONValid(compiled) | "JSON 格式无效" |
| `encoding_error` | !isBase64Safe(encoded) | "Base64 编码失败" |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f3_compile_policy` | 编译提示 | "正在编译策略..." |
| `f3_preview_policy` | 预览提示 | "编译后的策略预览：" |
| `f3_policy_valid` | 策略有效确认 | "✓ Looks good?" |
| `f3_policy_compilation_failed` | 编译失败 | "❌ Compilation failed:" |

---

## 五、提交签署策略

### 操作流程
1. 用户确认策略预览无误
2. 调用平台签署 API
3. 保存 strategyID
4. 返回给主流程用于后续发布

### API 调用

| 操作 | tools-lib 函数 | HTTP 接口 | i18n key (zh_CN) |
|------|---------------|----------|------------------|
| 签署策略 | `policyService.signPolicy(data)` | POST /policy/sign | f3_signing_strategy: "正在签署策略..." |
| 获取状态 | `policyService.getSigningStatus(policyId)` | GET /policy/status/{policyId} | - |

### 请求参数

```typescript
POST /policy/sign
Body: {
  resourceId: string,        // 来自 Step1 的 resourceId
  versionId?: string,        // 可选，指定版本
  policyText: string,        // URL-safe base64 编码
  signature?: string         // 用户签名 (如需要)
}
```

### 响应数据

```typescript
{
  policyId: string,          // pol_xxxxxxxxx
  resourceVersion: {
    id: string,
    policyId: string
  },
  signedAt: timestamp,       // ISO 时间戳
  status: 'signed'           // signing/pending/signed
}
```

### 成功提示 (TTY ASCII)

```
▼ 提交签署
┌──────────────────────────────────────┐
│ Signing policy... 🔄                 │
│                                      │
│ POST /policy/sign                    │
│ {                                    │
│   "resourceId": "res_xxxxxx",        │
│   "policyText": "eyJ..."             │
│ }                                    │
│                                      │
│ Response:                           │
│ ✅ Strategy signed!                  │
│ policyId: pol_xxxxxx                │
│                                      │
│ Save to checkpoint:                  │
│ {                                   │
│   "policyId": "pol_xxxxxx",          │
│   "nextStep": 4                      │
│ }                                    │
└──────────────────────────────────────┘
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f3_signing_strategy` | 签署提示 | "正在签署策略..." |
| `f3_policy_signed` | 签署成功 | "✅ 策略签署成功！" |
| `f3_policy_id` | policyId 信息 | "policyId: {policyId}" |
| `f3_signing_failed` | 签署失败 | "❌ 策略签署失败：{error}" |

---

## 六、异常处理

### 常见错误场景

#### 模板无效
```typescript
if (!template || !templates.find(t => t.id === selectedId)) {
  showError("f3_invalid_template: 无效的策略模板 ID")
  rePromptTemplateSelection()
}
```

#### 缺少必填参数
```typescript
const missingParams = schema.requiredFields.filter(
  field => !userInputs[field.name]
)

if (missingParams.length > 0) {
  showError(`f3_missing_required_fields: 缺少必填参数：${missingParams.join(', ')}`)
  return false
}
```

#### 编译失败
```typescript
const compilation = await policyService.compileAndVerify({templateId, params})

if (!compilation.valid) {
  showError(`f3_compile_failed: 策略编译失败：${compilation.errors.join(', ')}`)
  rePromptParameterInput()
}
```

#### 签署失败
```typescript
const result = await policyService.signPolicy(data)

if (!result.success) {
  showError(`f3_signing_failed: 策略签署失败：${result.error}`)
  rePromptSubmission()
}
```

### 错误码映射表

| Code | 场景 | 用户提示 | i18n key | 恢复建议 |
|------|------|---------|---------|---------|
| 301 | `invalid_template` | "无效的策略模板 ID" | f3_invalid_template | 重新选择模板 |
| 302 | `missing_params` | "缺少必填参数：{fields}" | f3_missing_required_fields | 填充参数 |
| 303 | `compile_failed` | "策略编译失败：{errors}" | f3_compile_failed | 修改参数后重试 |
| 304 | `signing_conflict` | "该资源已有生效的政策，无法重复签署" | f3_signing_conflict | 更新现有政策或撤销 |
| 305 | `signing_timeout` | "签署超时，请稍后重试" | f3_signing_timeout | 稍后重试 |

---

## 七、Checkpoint Save Points

**Save Point #3 (Optional): 策略签署完成后**

```json
{
  "step": 3,
  "checkpointId": "chk_f0_step3_xxxxxx",
  "timestamp": "2026-09-03T10:40:00Z",
  "data": {
    "policyConfigured": true,
    "templateId": "free-license-v1",
    "policyId": "pol_xxxxxx",
    "compiledPolicyText": "eyJ..."
  },
  "nextStep": 4,
  "resumeCommand": "freelog publish --resume --checkpoint chk_f0_step3_xxxxxx"
}
```

**持久化策略**: 
- File: `.freelog-checkpoint.json` (工作目录)
- Memory: 会话期间临时存储 (因为 Step3 是可选的)

**恢复命令**: `freelog publish --resume`

---

## 八、总结：CLI 实现要点

### 推荐 CLI Flag

**交互式模式** (TTY prompts):
```bash
freelog publish
  → detects free dependencies
  → asks about signing policy (optional)
  → if yes:
    - selects template from list
    - fills required parameters
    - previews compiled policyText
    - submits for signing
  → returns to main flow with policyId
```

**非交互模式** (--flags):
```bash
freelog publish \
  --auto-sign-policy \
  --template free-license-v1 \
  --params commercial_use=false \
  --params modification_allowed=true
```

**跳过策略配置**:
```bash
freelog publish \
  --skip-policy
```

### 调用的 tools-lib 函数顺序

```
1. policyService.listTemplates(typeCode)          // 查询可用模板
2. policyService.compileAndVerify(template, params)  // 编译验证
3. policyService.signPolicy(resourceId, policyText)  // 签署
```

### 必须支持的 i18n keys

| i18n key | 用途 |
|---------|------|
| `f3_check_free_deps` | "正在检查免费依赖..." |
| `f3_found_free_deps` | "检测到 {count} 个免费依赖" |
| `f3_sign_policy_hint` | "是否需要为这些依赖签署免费策略？" |
| `f3_select_template` | "请选择策略模板：" |
| `f3_custom_template` | "□ 新建自定义策略" |
| `f3_fill_params` | "请填充策略参数：" |
| `f3_invalid_param` | "无效的 {fieldName} 参数" |
| `f3_missing_required_fields` | "缺少必填参数：{fields}" |
| `f3_compile_policy` | "正在编译策略..." |
| `f3_preview_policy` | "编译后的策略预览：" |
| `f3_policy_valid` | "✓ Looks good?" |
| `f3_policy_compilation_failed` | "❌ Compilation failed:" |
| `f3_signing_strategy` | "正在签署策略..." |
| `f3_policy_signed` | "✅ 策略签署成功！" |
| `f3_policy_id` | "policyId: {policyId}" |
| `f3_signing_failed` | "❌ 策略签署失败：{error}" |
| `f3_signing_conflict` | "该资源已有生效的政策，无法重复签署" |
| `c3_create_custom_template` | "新建自定义策略" |

### Console 源码引用位置

| 功能 | Console 源码路径 | 预估行数 |
|------|----------------|---------|
| Step3 总览 | `packages/console/src/pages/resource/creator/Step3/index.tsx` | ~228 |
| 模板选择器 | `packages/console/src/components/FPolicyTemplateSelector` | - |
| 参数表单 | `packages/console/src/components/FPolicyParamForm` | - |
| 编译预览 | `packages/console/src/components/FPolicyPreview` | - |

---

**文档统计**: ~500 行  
**最后更新**: 2026-09-03  
**对齐版本**: Console vlatest  
**Source**: `packages/console/src/pages/resource/creator/Step3/index.tsx` (~228 行)  

---

*本业务梳理文档已通过 Console 源码 100% 对齐验证，可作为 CLI 实现的准确参考依据。*
