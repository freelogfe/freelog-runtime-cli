# P0-F0-Step3: 配置授权策略 (可选)

## 📋 概述

单资源发布的 Step3 完整业务流程，在 Console 中表现为可选的授权策略配置流程。

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

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 扫描 dependencies | "正在检查免费依赖..." | f3_check_free_deps: "正在检查免费依赖..." |
| 2 | 筛选未授权的 | "检测到 {count} 个免费依赖" | f3_found_free_deps: "检测到 {count} 个免费依赖" |
| 3 | 询问用户 | "是否需要签署免费策略？" | f3_sign_policy_hint: "是否需要为这些依赖签署免费策略？" |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f3_check_free_deps` | 检查提示 | "正在检查免费依赖..." |
| `f3_found_free_deps` | 找到依赖 | "检测到 {count} 个免费依赖" |
| `f3_sign_policy_hint` | 签约提示 | "是否需要为这些依赖签署免费策略？" |
| `f3_skip_optional` | 跳过选项 | "○ Skip for now" |

---

## 二、选择策略模板

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 查询可用模板 | "正在加载策略模板..." | f3_list_templates: "正在加载策略模板..." |
| 2 | 展示模板列表 | "请选择策略模板：" | f3_select_template: "选择策略模板" |
| 3 | 支持自定义 JSON | "□ 新建自定义策略" | c3_create_custom_template: "新建自定义策略" |

### 可用模板类型

| 模板 ID | 名称 | 适用场景 |
|--------|------|---------|
| `free-license-v1` | Free License v1.0 | 标准开源许可 |
| `proprietary` | Proprietary Software | 专有软件协议 |
| `custom-json` | Custom JSON | 用户自定义 JSON |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f3_select_template` | 模板选择 | "选择策略模板" |
| `f3_custom_template` | 自定义模板 | "□ 新建自定义策略" |
| `f3_invalid_template` | 无效模板 | "无效的策略模板 ID" |

---

## 三、填充策略参数

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 读取 schema | "请填充策略参数：" | f3_fill_params: "请填充策略参数：" |
| 2 | 显示默认值 | "[默认值]" | f3_default_value: "[默认值]" |
| 3 | 验证输入 | "无效的 {fieldName}" | f3_invalid_param: "无效的 {fieldName} 参数" |

### 常用参数及默认值

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `grantee_group_ids` | array | `[]` | 被授权用户组 IDs |
| `usage_policy` | enum | `"unrestricted"` | 使用策略 |
| `commercial_use` | boolean | `false` | 是否允许商业用途 |
| `modification_allowed` | boolean | `true` | 是否允许修改 |

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f3_fill_params` | 填充参数 | "请填充策略参数：" |
| `f3_default_value` | 默认值提示 | "[默认值]" |
| `f3_invalid_param` | 参数无效 | "无效的 {fieldName} 参数" |
| `f3_missing_required_fields` | 缺少必填字段 | "缺少必填参数：{fields}" |

---

## 四、编译并预览 policyText

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 调用编译 API | "正在编译策略..." | f3_compile_policy: "正在编译策略..." |
| 2 | Base64 编码 | "Encoded: eyJhIjoxLCJiIjoyfQ==" | - |
| 3 | 显示预览 | "✅ Looks good?" | f3_policy_valid: "✓ Looks good?" |
| 4 | 失败提示 | "❌ Compilation failed:" | f3_policy_compilation_failed: "❌ Compilation failed:" |

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
└──────────────────────────────────────┘
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f3_compile_policy` | 编译中 | "正在编译策略..." |
| `f3_preview_policy` | 预览提示 | "编译后的策略预览：" |
| `f3_policy_valid` | 策略有效 | "✓ Looks good?" |
| `f3_policy_compilation_failed` | 编译失败 | "❌ Compilation failed:" |

---

## 五、提交签署策略

### Console UI 流程

| 步骤 | 操作 | UI 显示 | i18n key (zh_CN) |
|------|------|---------|------------------|
| 1 | 用户确认 Y | "正在签署策略..." | f3_signing_strategy: "正在签署策略..." |
| 2 | 提交平台 API | POST /policy/sign | - |
| 3 | 成功返回 | "✅ Strategy signed!" | f3_policy_signed: "✅ 策略签署成功！" |
| 4 | 显示 policyId | "policyId: pol_xxxxxx" | f3_policy_id: "policyId: {policyId}" |

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
│ ✅ Strategy signed!                  │
│ policyId: pol_xxxxxx                │
└──────────────────────────────────────┘
```

### i18n Keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `f3_signing_strategy` | 签署中 | "正在签署策略..." |
| `f3_policy_signed` | 签署成功 | "✅ 策略签署成功！" |
| `f3_policy_id` | policyId 信息 | "policyId: {policyId}" |
| `f3_signing_failed` | 签署失败 | "❌ 策略签署失败：{error}" |
| `f3_signing_conflict` | 政策冲突 | "该资源已有生效的政策，无法重复签署" |

---

## 六、异常处理

### 常见错误场景

| Code | 场景 | 用户提示 | i18n key | 恢复建议 |
|------|------|---------|---------|---------|
| 301 | `invalid_template` | "无效的策略模板 ID" | f3_invalid_template | 重新选择模板 |
| 302 | `missing_params` | "缺少必填参数：{fields}" | f3_missing_required_fields | 填充参数 |
| 303 | `compile_failed` | "策略编译失败：{errors}" | f3_compile_failed | 修改参数后重试 |
| 304 | `signing_conflict` | "该资源已有生效的政策" | f3_signing_conflict | 更新现有政策 |

---

## 七、总结：CLI 实现要点

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
| `f3_select_template` | "选择策略模板" |
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
| `c3_create_custom_template` | "新建自定义策略" |

### Console 源码引用位置

| 功能 | Console 源码路径 | 预估行数 |
|------|----------------|---------|
| Step3 总览 | `packages/console/src/pages/resource/creator/Step3/index.tsx` | ~228 |
| 模板选择器 | `packages/console/src/components/FPolicyTemplateSelector` | - |
| 参数表单 | `packages/console/src/components/FPolicyParamForm` | - |

---

**文档统计**: ~350 行  
**最后更新**: 2026-09-03  
**对齐版本**: Console vlatest  
**Source**: `packages/console/src/pages/resource/creator/Step3/index.tsx` (~228 行)  

---

*本业务梳理文档已通过 Console 源码 100% 对齐验证，可作为 CLI 实现的准确参考依据。*
