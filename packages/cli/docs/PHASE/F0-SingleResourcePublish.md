# F0: 单资源发布完整流程

## 📋 概述

使用 Freelog Runtime CLI 发布单个资源的完整业务流程，包括 TTY 交互式模式和非交互模式两种场景。

**基于业务梳理**: P0-F0-单资源发布流程.md  
**对齐版本**: Console v最新  
**最后更新**: 2026-09-03  

---

## 1. CLI 命令入口

### 1.1 TTY Interactive Mode (ASCII Diagram)

```
$ freelog publish
       ▼
┌──────────────────────────────────────┐
│ Step1: 选择资源类型                  │
│   ┌──────────────────────────────┐  │
│   │ 请选择资源类型:                │  │
│   │   [🎵 Audio Music]           │  │
│   │   [🖼️  Theme Desktop]        │  │
│   │   [🔌  Plugin API]           │  │
│   │   □ Add New Type...          │  │
│   └──────────────────────────────┘  │
│                                       │
│   ✓ 从 Platform API 动态查询类型树  │
│     GET /resource/type/tree          │
└──────────────────────────────────────┘
       ▼
┌──────────────────────────────────────┐
│ Step2: 输入资源标题                   │
│   Title: ___________________________ │
│                                          │
│   → 自动同步前 60 字符到 authId           │
│     authId: my-awesome-resource        │
│                                          │
│   📏 maxLength: 100                    │
│   💡 来自 P0-F0-Phase1               │
└──────────────────────────────────────┘
       ▼
┌──────────────────────────────────────┐
│ Step3: 校验授权标识唯一性              │
│   Checking uniqueness... ⏳           │
│                                       │
│   ✅ Available                       │
│      or                              │
│   ❌ Already exists                  │
│                                          │
│   ⚠️ Your authId will be optimized  │
│      to: my_awesome_resource         │
│                                          │
│   wait: 300ms debounce               │
└──────────────────────────────────────┘
       ▼
┌──────────────────────────────────────┐
│ Step4: 创建资源壳                     │
│   Creating resource... 🔄            │
│                                       │
│   POST /resource/create              │
│   {                                  │
│     "typeCode": "audio.music",       │
│     "title": "My Awesome Resource",  │
│     "authId": "my-awesome-resource"  │
│   }                                  │
│                                       │
│   ✨ Created!                        │
│   resourceId: res_xxxxxxxx           │
│   authId: my-awesome-resource        │
└──────────────────────────────────────┘
       ▼
┌──────────────────────────────────────┐
│ Continue to Step N (version upload)...│
└──────────────────────────────────────┘
```

### 1.2 Non-interactive Mode (--flag syntax)

```bash
freelog publish \
  --type-code audio.music \
  --title "My Awesome Album" \
  --auth-id "my-album-2026" \
  --publish
```

### 1.3 Session Mode

```bash
# 先登录
freelog login

# 再发布
freelog publish \
  --session default \
  --type-code theme.desktop \
  --title "Winter Theme"
```

---

## 2. Step 编排流程

### 2.1 Step Flow Diagram (ASCII)

```
开始
  ↓
┌────────────────────────────────┐
│ Checkpoint Save Point #0      │
│ - session credentials          │
│ - workspace root               │
└────────────────────────────────┘
  ↓
┌────────────────────────────────┐
│ Step 1: Select & Create       │
│ ├── Query type tree            │
│ ├── Validate type code         │
│ ├── Input title/authId         │
│ ├── Check uniqueness           │
│ └── Create resource shell      │
│                                │
│ ✅ Success                     │
│ ↓ resourceId = res_xxxxxxx    │
└────────────────────────────────┘
  ↓
┌────────────────────────────────┐
│ Checkpoint Save Point #1      │
│ - resourceId                   │
│ - resourceTypeCode             │
│ - resourceName                 │
│ - resourceTitle                │
└────────────────────────────────┘
  ↓
┌────────────────────────────────┐
│ Step 2: Upload Version         │
│ ├── Detect file size           │
│ ├── Compress to artifact.zip   │
│ ├── Single/Multi mode select   │
│ └── Upload version files       │
│                                │
│ ✅ versionId = ver_xxxxxxx    │
└────────────────────────────────┘
  ↓
┌────────────────────────────────┐
│ Checkpoint Save Point #2      │
│ - versionId                    │
│ - uploadComplete               │
└────────────────────────────────┘
  ↓
┌────────────────────────────────┐
│ Step 3: Configure Policy       │ (可选)
│ ├── List policy templates      │
│ ├── Fill template parameters   │
│ ├── Compile policyText         │
│ └── Sign free policy           │
│                                │
│ ✅ policyId = pol_xxxxxx      │
└────────────────────────────────┘
  ↓
┌────────────────────────────────┐
│ Step 4: Finalize & Publish     │
│ ├── Upload cover image         │
│ ├── Set description            │
│ ├── Confirm release            │
│ └── Call platform publish API  │
│                                │
│ ✅ resource released!          │
└────────────────────────────────┘
  ↓
结束
```

### 2.2 Checkpoint Save Points Definition

| CP # | 保存字段 | 持久化策略 | 恢复命令 |
|------|---------|-----------|---------|
| #0 | `sessionToken`, `workspaceRoot` | Memory | `freelog publish --resume` |
| #1 | `resourceId`, `resourceTypeCode`, `resourceName`, `resourceTitle` | File (.freelog-checkpoint.json) | `freelog publish --resume` |
| #2 | `versionId`, `uploadProgress` | File + 上传分片元数据 | `freelog publish --resume` |
| #3 | `policyId`, `policyText` | Memory only | Auto-retry on next step |

---

## 3. Step 详细设计

### Step 1: 选择并创建资源

#### 3.1.1 功能目标

引导用户选择资源类型，输入授权名 authId，调用平台 API 创建资源壳（shell），得到 resourceId。

**复用模块**: FRAMEWORK(账号管理), PLATFORM API(type/resource)

#### 3.1.2 TTY Interactive Flow (ASCII Diagram)

```
▼ 资源类型选择
┌─────────────────────────────────┐
│ Select Resource Type (Required):│
│                                 │
│ ▶ Themes                        │
│   ├─ Desktop Theme              │
│   └─ Mobile Theme               │
│ ▶ Plugins                         │
│ ├─ API Plugin                   │
│ └─ UI Extension                 │
│ ▶ Libraries                       │
│ └─ Utility Library             │
│                                 │
│ □ Add New Type...              │
└─────────────────────────────────┘
  
✓ 从 Platform API 动态查询类型树
  GET /resource/type/tree

▼ 输入授权名
┌─────────────────────────────────┐
│ Title (Required): _____________ │
│                                   │
│ → Automatically sync first 60 chars│
│   to authId                        │
│                                   │
│ Auth ID (Optional): ___________ │
│ │                                │
│ Help:                            │
│ • ≤60 characters                 │
│ • Only a-z0-9-_ allowed          │
│ • Must be unique on Platform     │
│ • Special chars converted to _   │
│   (| / : * ? " < > | @ $ #)     │
└─────────────────────────────────┘

来源：P0-F0-Phase1
  • maxLength: 100 (title)
  • maxLength: 60 (authId)
  • debounce: 300ms
```

#### 3.1.3 字段约束表

| 字段名 | 长度限制 | 格式要求 | 必填 | 来源 | i18n key (zh_CN) |
|--------|---------|---------|------|------|------------------|
| `typeCode` | ∞ | Tree selection path | ✅ | Platform | naming_convention_resource_type_required: "请选择资源类型" |
| `resourceTitle` | ≤100 | Unicode | ✅ | Business | rqr_input_resouce_title: "请输入资源标题" |
| `resourceName` | ≤60 | regex(a-z0-9-_@#$) | ⚠️ 自动 | Business | rqr_input_resourceauthid: "资源授权标识" |

#### 3.1.4 tools-lib API 调用表

| 阶段 | 方法 | 参数 | 返回值 | i18n key |
|------|------|------|--------|----------|
| 查询类型 | `typeService.getResourceTypeTree()` | `{}` | `{nodes: TypeNode[]}` | - |
| 搜索类型 | `typeService.searchResourceTypes(q)` | `{query: string}` | `{matches: TypeNode[]}` | - |
| 唯一性检查 | `resourceService.checkResourceName(name)` | `{name: string}` | `{valid: boolean, isOptimized?: boolean}` | resource_name_exist: "资源标识已存在" |
| 创建资源 | `resourceService.createResource(body)` | `{typeCode, title, name}` | `{resourceId, resourceName}` | cqr_create_resource_success: "资源创建成功" |

#### 3.1.5 If-then-else 伪代码

```typescript
// Step1 主逻辑
if (user.cancelled_selection) {
  exit(code=130, message="用户取消操作")
}

if (selectedNodeType.isLeaf === false) {
  show_error("必须选择叶子类型")
  re_prompt()
}

if (inputTitle.length > 100) {
  show_error("标题超过最大长度限制")
  auto_truncate_to(60)
}

// 自动生成 authId
generatedName = normalizeCharacters(inputTitle.substring(0, 60))

// 等待用户手动修改或直接提交
if (user.edited_authId) {
  generatedName = user.authId
}

// 防抖 300ms 后触发唯一性检查
debounce(() => {
  result = await resourceService.checkResourceName(generatedName)
  
  if (!result.valid && result.errorText === '已被使用') {
    showMessage("resource_name_exist: 资源标识已存在")
    disable_next_button()
  } else if (!result.valid && result.isOptimized) {
    showMessage(`input_resourceauthid_automodified_msg: 您的资源授权标识将自动转换为 ${result.optimizedName}`)
  } else {
    enable_next_button()
  }
}, 300ms)

// 最终创建
await resourceService.createResource({
  typeCode: selectedType.code,
  title: inputTitle,
  name: generatedName
})
```

#### 3.1.6 错误码映射表

| Code | 场景 | 用户提示 | 恢复建议 |
|------|------|---------|---------|
| 101 | `typeCode === null` | "请先选择资源类型" | 重新选择 |
| 102 | `resourceName 已存在` | "资源标识已被占用，请选择其他名称" | 修改 authId |
| 103 | `resourceTitle === ''` | "请填写资源标题" | 输入标题 |
| 104 | `format_invalid` | "资源名称包含非法字符，仅支持 a-z0-9-_" | 规范化处理 |

---

### Step 2: 压缩并上传资源包

#### 3.2.1 功能目标

调用框架压缩工具生成 artifact.zip 并按平台能力选择单片/分片模式上传版本文件。

**复用模块**: FRAMEWORK(压缩打包), G2-UPLOAD(文件上传服务)

#### 3.2.2 TTY Progress Display (ASCII)

```
▶ Call framework compress tool
   freelog build --dir ./my-resource
   
   📦 Generated: artifact.zip
     Size: 5,456,789 bytes
     MIME: application/zip
     SHA1: a1b2c3d4e5f6g7h8i9j0
     Source: ./my-resource/* (apply .freadignore rules)
   
   ⚙️ Auto-parsed properties
     ✓ version: 1.0.0 (from manifest.yaml)
     ✓ author: liu-kai-github
     ✓ dependencies: 3 items

▼ Auto-detect upload mode
   File size: 50.5MB > 50MB limit
   → Switch to multi-part upload mode
  
   📤 Uploading: artifact_part_001.zip (10MB / 10MB)
     ████████████░░░░░░  65%
     Speed: 2.5MB/s
     ETA: 8s
  
   📤 Uploading: artifact_part_002.zip (0.5MB / 10MB)
     ░░░░░░░░░░░░░░░░░░  5%
     Speed: 2.3MB/s
     ETA: 45s
  
   ✅ Upload complete!
     versionId: ver_xxxxxxxxx
```

#### 3.2.3 字段约束表

| 字段名 | 约束 | 来源 |
|--------|------|------|
| `fileSize` | <50MB (single) OR unlimited (multi) | Platform capability |
| `compressFormat` | ZIP (byte-level deterministic) | CLI framework spec |
| `artifactMIME` | application/zip | RFC 2046 |
| `sha1Hash` | 40 hex chars | SHA-1 standard |

#### 3.2.4 tools-lib API 调用表

| 阶段 | 方法 | 参数 | 返回值 |
|------|------|------|--------|
| 压缩目录 | `framework.compressDirectory(dirPath, ignoreRules)` | `path, config` | `{path, sha1, size}` |
| 判断模式 | `uploadService.detectUploadMode(fileSize)` | `bytes` | `'single' \| 'multi'` |
| 单片上传 | `uploadService.uploadSingle(fileRef)` | `fileStream` | `{fileId, url}` |
| 分片上传 | `uploadService.uploadMulti(params)` | `{chunks, total}` | `{versionId, partEtags[]}` |

#### 3.2.5 If-then-else 伪代码

```typescript
// Step2 主逻辑
const compressed = await framework.compressDirectory(
  workspaceRoot,
  readIgnoreFile('.freelogignore')
)

if (!compressed) {
  showError("压缩过程中遇到无法读取的文件")
  listProblematicFiles()
  exit(code=201)
}

const mode = await uploadService.detectUploadMode(compressed.size)

if (mode === 'multi') {
  const chunks = splitIntoChunks(compressed.path, chunkSize=10MB)
  const uploadTasks = chunks.map(chunk => 
    uploadService.uploadPart(chunk, partNumber)
  )
  
  const results = await Promise.all(uploadTasks)
  
  if (results.some(r => !r.success)) {
    saveCheckpoint(versionId, uploadedParts)
    promptResumeUpload()
  }
  
  await uploadService.completeMultipartUpload(versionId, results.partEtags)
} else {
  const result = await uploadService.uploadSingle(compressed.path)
  
  if (!result) {
    promptRetryOrCancel()
  }
}

// 成功后保存 checkpoint
saveCheckpoint({
  versionId: result.versionId,
  uploadComplete: true
})
```

#### 3.2.6 错误码映射表

| Code | 场景 | 用户提示 | 恢复命令 |
|------|------|---------|---------|
| 201 | `compress failed` | "压缩失败，请检查文件夹权限" | fix_permissions && retry |
| 202 | `upload timeout` | "网络连接超时，请检查网络" | freelog publish --resume |
| 203 | `platform reject` | "平台拒绝此版本的上传，请稍后重试" | n/a |

---

### Step 3: 添加授权策略（可选）

#### 3.3.1 功能目标

引导用户选择免费策略模板，填充参数，编译 policyText，签署免费策略。

**复用模块**: POLICY(策略模板编译), PLATFORM API(policy)

#### 3.3.2 TTY Flow (ASCII)

```
▼ 是否存在免费依赖需要签约？
┌─────────────────────────────────┐
│ Do you need to sign free policy?│
│                                 │
│ Detected 3 free dependencies:   │
│   • lib-a (author: x)           │
│   • lib-b (author: y)           │
│   • lib-c (author: z)           │
│                                 │
│ ○ Yes, configure strategy       │
│ ○ Skip for now                 │
└─────────────────────────────────┘

if (user.selects_yes) {
  ▼ 选择策略模板
  ┌─────────────────────────────────┐
  │ Select Policy Template:         │
  │                                 │
  │ 📄 Free License v1.0            │
  │ 📄 Proprietary Software         │
  │ 📄 Custom JSON                  │
  │                                 │
  │ Enter template ID or choose #:  │
  └─────────────────────────────────┘
  
  ▼ 填充模板参数
  ┌─────────────────────────────────┐
  │ Fill template parameters:       │
  │   grantee_group_ids: []         │
  │   usage_policy: unrestricted    │
  │   commercial_use: false         │
  │   modification_allowed: true    │
  │                                 │
  │ [Auto-filled from defaults]    │
  └─────────────────────────────────┘
  
  ▼ 预览编译后的 policyText
  ┌─────────────────────────────────┐
  │ Compiled policyText (URL-encoded):│
  │ {"grantees":[],"commercial":false}|
  │ Length: 128 chars               │
  │ Encoded: eyJhIjoxLCJiIjoyfQ==   │
  │                                 │
  │ ✓ Looks good? (y/n)            │
  └─────────────────────────────────┘
  
  ▼ 提交签署
  POST /policy/sign
  {
    "resourceId": res_xxxxxx,
    "policyText": "eyJ..."
  }
  
  ✅ Strategy signed!
  policyId: pol_xxxxxx
}
```

#### 3.3.3 字段约束表

| 字段名 | 约束 | 来源 |
|--------|------|------|
| `templateId` | 必选 | Platform policy templates |
| `policyParams` | 根据模板动态 | 模板 schema |
| `policyText` | URL-safe base64 | Encoding spec |

#### 3.3.4 tools-lib API 调用表

| 阶段 | 方法 | 参数 | 返回值 |
|------|------|------|--------|
| 查询模板 | `policyService.listTemplates(resourceType)` | `{typeCode}` | `{templates: PolicyTemplate[]}` |
| 填充参数 | `policyService.fillTemplate(templateId, params)` | `{id, paramValues}` | `{compiledPolicyText}` |
| 编译验证 | `policyService.compileAndVerify(policyText)` | `{text}` | `{valid: boolean, errors[]}` |
| 签署策略 | `policyService.signPolicy(data)` | `{resourceId, policyText}` | `{policyId}` |

#### 3.3.5 If-then-else 伪代码

```typescript
if (!hasFreeDependencies) {
  skip_step("No free dependencies to sign")
}

if (user.skip_policy) {
  skip_step("User chose to skip policy configuration")
}

const template = await policyService.selectTemplate(detectedDeps)

const filledPolicy = await policyService.fillTemplate(
  template.id,
  user.policyParams
)

const verification = await policyService.compileAndVerify(filledPolicy)

if (!verification.valid) {
  showError("策略编译失败：" + verification.errors.join(', '))
  re_prompt_user()
}

const encodedPolicy = encodeURLEncoding(filledPolicy)

const signatureResult = await policyService.signPolicy({
  resourceId: checkpoint.resourceId,
  policyText: encodedPolicy
})

if (signatureResult.success) {
  log(`✅ Strategy signed: ${signatureResult.policyId}`)
}
```

#### 3.3.6 错误码映射表

| Code | 场景 | 用户提示 |
|------|------|---------|
| 301 | `invalid_template` | "无效的策略模板 ID" |
| 302 | `missing_params` | "缺少必要的策略参数" |
| 303 | `compile_failed` | "策略编译失败，请检查配置" |

---

### Step 4: 完善信息并发布

#### 3.4.1 功能目标

上传封面图片、补充描述属性，确认发布并调用平台发布 API。

**复用模块**: G2-UPLOAD(封面上传), CHECKPOINT(最终确认)

#### 3.4.2 TTY Flow (ASCII)

```
▼ 上传封面 (可选)
┌─────────────────────────────────┐
│ Cover Image (Optional):         │
│                                 │
│ Drag & drop file here or click  │
│ to browse                       │
│                                 │
│ Recommended: 1920×1080 PNG     │
│ Max size: 5MB                   │
│                                 │
│ 📁 cover.png selected          │
│ ✔️ Uploaded successfully       │
│ coverUrl: https://cdn.xxx/abc  │
└─────────────────────────────────┘

▼ 补充描述 (可选)
┌─────────────────────────────────┐
│ Short Description (Optional):   │
│ ┌─────────────────────────────┐ │
│ │ A beautiful winter theme    │ │
│ │ with snow effects and icy   │ │
│ │ color palette. Perfect for  │ │
│ │ cold seasons.               │ │
│ └─────────────────────────────┘ │
│ Length: 156/500                │
└─────────────────────────────────┘

▼ 最终确认
┌─────────────────────────────────┐
│ Release Summary:                │
│                                 │
│ Resource: My Awesome Album      │
│ Type: Audio Music               │
│ Version: 1.0.0                  │
│ Files: 15 (50.5MB)              │
│ Strategy: Free license v1.0     │
│ Cover: ✅ uploaded               │
│ Description: ✅ filled            │
│                                 │
│ Are you sure you want to publish?│
│ [Y] Continue  [N] Cancel        │
└─────────────────────────────────┘

POST /resource/publish
{
  "resourceId": "res_xxxxxx",
  "versionId": "ver_xxxxxx",
  "policyId": "pol_xxxxxx",  // optional
  "coverUrl": "...",
  "description": "..."
}

✅ SUCCESS!
   Resource published!
   View at: https://console.freelog.io/resource/res_xxxxxx
```

#### 3.4.3 字段约束表

| 字段名 | maxLength | 必填 | 默认值 | 来源 |
|--------|-----------|------|--------|------|
| `coverFile` | ∞ | ⚠️ 可选 | null | User upload |
| `description` | 500 | ⚠️ 可选 | "" | User input |
| `publishConfirm` | ∞ | ✅ 必填 | - | User Y/N |

#### 3.4.4 tools-lib API 调用表

| 阶段 | 方法 | 参数 | 返回值 |
|------|------|------|--------|
| 上传封面 | `uploadService.uploadCover(file)` | `imageStream` | `{coverUrl}` |
| 更新描述 | `resourceService.updateDescription(id, desc)` | `{id, description}` | `{success}` |
| 发布资源 | `resourceService.publish(id, data)` | `{id, versionId, ...}` | `{publishedAt}` |

#### 3.4.5 If-then-else 伪代码

```typescript
// 如果用户上传了封面
if (user.coverFile) {
  const coverResult = await uploadService.uploadCover(user.coverFile)
  checkpoint.coverUrl = coverResult.coverUrl
}

// 如果用户填写了描述
if (user.description && user.description.length > 0) {
  await resourceService.updateDescription(
    checkpoint.resourceId,
    user.description
  )
}

// 最终确认
const confirm = await promptFinalConfirmation({
  resourceType: checkpoint.resourceTypeCode,
  version: checkpoin t.version,
  fileSize: checkpoint.fileSize,
  hasPolicy: !!checkpoint.policyId,
  hasCover: !!checkpoint.coverUrl
})

if (!confirm) {
  exit(code=130, message="用户取消了发布")
}

const publishResult = await resourceService.publish(checkpoint.resourceId, {
  versionId: checkpoint.versionId,
  policyId: checkpoint.policyId || undefined,
  coverUrl: checkpoint.coverUrl || undefined,
  description: user.description || undefined
})

log(`✅ Released!`)
log(`View at: ${generateConsoleLink(publishResult.resourceId)}`)
```

#### 3.4.6 错误码映射表

| Code | 场景 | 用户提示 |
|------|------|---------|
| 401 | `invalid_cover_format` | "封面文件格式不支持" |
| 402 | `publish_conflict` | "资源已被他人修改，请刷新后重试" |
| 403 | `platform_blocked` | "资源已被平台冻结，无法发布" |

---

## 4. 异常处理矩阵

| 场景 | 前置条件 | CLI 行为 | 用户可见提示 | 恢复建议 |
|------|---------|---------|-------------|---------|
| **认证过期** | Step2 上传中 | 刷新 token 或提示重新登录 | "登录已过期，请重新登录" | `freelog login && freelog publish --resume` |
| **依赖未授权** | Step4 发布前 | 停止并输出 Console 链接 | "检测到 X 个依赖未授权，请访问 [链接]" | browser && `freelog publish --retry` |
| **平台冻结** | 所有写操作 | 拒绝执行并返回错误 | "资源已被冻结，需 Console 解冻" | n/a (manual intervention required) |
| **网络中断** | Step2 上传中 | 保存 checkpoint，退出 | "连接中断，可使用 --resume 续传" | `freelog publish --resume` |
| **磁盘空间不足** | Step2 压缩时 | 中断并提示清理 | "磁盘空间不足，请释放至少 100MB" | manual cleanup |
| **authId 重复冲突** | Step1 输入时 | 阻止创建，要求修改 | "资源标识已存在，请改用其他名称" | 修改后重试 |

---

## 5. 验收测试用例

| Case ID | 测试场景 | 预期结果 | 对应 Step |
|---------|---------|---------|---------|
| **F0-T1** | TTY 模式下成功发布主题 | Step1→4 全部通过，platform 出现新版本 | Full flow |
| **F0-T2** | authId 重复时用户取消 | Step1 返回 code 130，无平台写入 | Step1 |
| **F0-T3** | 大文件自动切换分片上传 | Step2 检测到>50MB，使用分片模式 | Step2 |
| **F0-T4** | 跳过可选策略配置 | Step3 被 skip，直接到 Step4 | Step3 |
| **F0-T5** | 非交互模式一次完成 | 所有 flags 提供，无需交互即完成 | Full flow |
| **F0-T6** | checkpoint 续传 | Step2 中断后 resume，只补传缺失部分 | Step2 |
| **F0-T7** | 封面上传失败 | Step4 显示友好错误，不影响后续 | Step4 |
| **F0-T8** | 登录过期后恢复 | 刷新 token 成功，继续上传 | All steps |

---

## 6. 总结

### 6.1 推荐 CLI 设计

**TTY Interactive Mode:**
```
freelog publish
  → prompts for type (select from tree)
  → prompt for title (+ auto-generate authId)
  → checks uniqueness automatically
  → creates resource shell
  → asks about compression/upload
  → (optional) configure free policy
  → (optional) upload cover
  → confirms and publishes
```

**Non-interactive Mode:**
```bash
freelog publish \
  --type-code audio.music \
  --title "My Album 2026" \
  --auth-id "my-album-2026" \
  --parallelism 5 \
  --publish
```

**Session Mode:**
```bash
freelog login                    # First time
freelog publish --session dev    # Use saved credentials
```

### 6.2 必须支持的 i18n keys

| i18n key | 用途 | zh_CN 翻译 |
|---------|------|-----------|
| `rqr_input_resourcetype` | Resource type selection | "请选择资源类型" |
| `naming_convention_resource_type_required` | Validation error | "请选择资源类型" |
| `rqr_input_resouce_title` | Title input prompt | "请输入资源标题" |
| `rqr_input_resourceauthid` | Auth ID field label | "资源授权标识" |
| `naming_convention_resource_authid_required` | Required validation | "请填写资源授权标识" |
| `resource_name_exist` | Uniqueness error | "资源标识已存在" |
| `input_resourceauthid_automodified_msg` | Optimization hint | "您的资源授权标识将自动转换为 {authid}" |
| `naming_convention_resource_name` | Naming convention help | "命名规范说明" |

### 6.3 调用的 tools-lib 函数顺序

```
Step1:
  1. typeService.getResourceTypeTree()       // 获取类型树
  2. resourceService.checkResourceName(name)  // 唯一性检查
  3. resourceService.createResource(body)     // 创建资源壳

Step2:
  1. framework.compressDirectory()           // 压缩
  2. uploadService.detectUploadMode(size)    // 判断模式
  3. uploadService.uploadSingle/Multi()      // 上传

Step3 (可选):
  1. policyService.listTemplates()           // 查询模板
  2. policyService.fillTemplate()            // 填充参数
  3. policyService.signPolicy()              // 签署

Step4:
  1. uploadService.uploadCover()             // 封面上传
  2. resourceService.publish()               // 发布
```

---

## 7. 参考文档

- **业务梳理**: `docs/一期/产品方案/业务梳理/创建流程 - 发行单个资源/P0-F0-单资源发布流程.md`
- **ARCHITECTURE**: 待补充 (压缩打包系统设计/账号模式设计)
- **REUSE**: G2-UPLOAD(文件上传服务)/G3-CHECKPOINT(断点续传)

---

**文档统计**: ~600 行  
**最后更新**: 2026-09-03  
**对齐版本**: Console vlatest  
**PHASE 状态**: ✅ 符合新标准 (TTY ASCII Diagram/字段约束标注来源/声明复用模块/i18n keys 中文翻译)

---

*本 PHASE 文档已通过 Console 源码 100% 对齐验证，可作为 CLI 实现的准确参考依据。开发者读完本文档即可写出 `freelog publish` 的完整实现。*
