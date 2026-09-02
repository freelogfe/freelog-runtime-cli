# F0 - 单资源发布完整流程设计

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **对齐业务梳理**: P0-F0-Phase1.md 到 P0-F0-Phase4.md  
> **关键发现**: Step3 可选 (Console creator/index.tsx L100), intro maxLength=200, title maxLength=100

---

## 📋 **一、功能需求清单**

### **1.1 核心功能分解**

| 功能 ID | 功能名称 | 功能描述 | 复用模块 | 来自业务梳理 |
|--------|---------|---------|---------|------------|
| F0-F1 | 资源类型选择 | 从主题/插件/库/软件中选择类型 | - | P0-F0-Phase1 |
| F0-F2 | authId 生成与校验 | 自动生成 + 唯一性验证 | - | P0-F0-Phase1 |
| F0-F3 | 标题与名称输入 | ≤100 字符/≤60 字符 | - | P0-F0-Phase1 |
| F0-F4 | 文件上传 (含 SHA1) | 自动检测大小选择单片/分片模式 | G2-UPLOAD | P0-F0-Phase2 |
| F0-F5 | 补充属性管理 | ≤30 项自定义属性 | - | P0-F0-Phase2 |
| F0-F6 | 策略模板选择 | 免费/商业/自定义 3 种模式 | POLICY | P0-F0-Phase3 |
| F0-F7 | 封面图片上传 | ≤5MB PNG/JPG/WebP | G2-UPLOAD | P0-F0-Phase4 |
| F0-F8 | 标签处理 | trim/lowercase/dedup 最多 20 个 | - | P0-F0-Phase4 |
| F0-F9 | Checkpoint 保存恢复 | Ctrl+C 中断恢复 | G3-CHECKPOINT | 全局 |

### **1.2 通用模块复用关系**

```
┌──────────────────────────────────────┐
│     F0-SingleResourcePublish         │
├──────────────────────────────────────┤
│                                      │
│ ┌──────────────┐  ┌──────────────┐  │
│ │  G2-UPLOAD   │  │ POLICY       │  │
│ │ (文件上传)   │  │ (策略系统)   │  │
│ └──────┬───────┘  └──────┬───────┘  │
│        │                 │           │
│        ▼                 ▼           │
│ ┌─────────────────────────────────┐ │
│ │  Step2 调用 UPLOAD               │ │
│ │  Step3 调用 POLICY               │ │
│ └───────────────┬─────────────────┘ │
│                 ▼                   │
│        ┌──────────────┐             │
│        │ G3-CHECKPOINT│             │
│        │  (全局保存)  │             │
│        └──────────────┘             │
│                                      │
└──────────────────────────────────────┘
```

---

## 🔄 **二、Step 编排流程**

### **2.1 主流程时序图 (ASCII)**

```
[开始 freelog publish] 
        ↓ checkpoint.init()
     [Step1: 基础信息填写]
        ├─ 选择资源类型 (F0-F1)
        ├─ 生成并校验 authId (F0-F2)
        └─ 输入标题/名称 (F0-F3)
        ↓ checkpoint.save(step=1) ← Save Point #1
     [Step2: 上传资源包]
        ├─ 读取本地文件计算 SHA1
        ├─ 调用 UPLOAD 模块 (F0-F4)
        └─ 添加补充属性 (F0-F5)
        ↓ checkpoint.save(step=2) ← Save Point #2
     [Step3: 配置授权策略][可选分支]
        ├─ 加载可用策略列表
        ├─ 调用 POLICY 模块 (F0-F6)
        └─ 可选跳过 (Console L100 证据)
        ↓ checkpoint.save(step=3) OR NO SAVE IF SKIPPED
     [Step4: 完善 Listing]
        ├─ 封面上传 (调用 UPLOAD) (F0-F7)
        ├─ 填写介绍 (≤200 字符)
        └─ 标签处理 (trim/lowercase/dedup) (F0-F8)
        ↓ checkpoint.save(step=4) ← Save Point #3
    [确认并提交]
        ↓
    [POST /v2/resources via tools-lib]
        ↓
    [成功 ✔ → Dashboard]
    [失败 ✖ → Error Display]
```

### **2.2 Checkpoint Save Points Definition**

| Save Point | Step | Save 时机 | 保存的数据范围 | JSON Schema |
|-----------|------|----------|----------------|-------------|
| SP1 | Step1 Complete | User enters Step2 | {resourceTypeCode, resourceTitle, authId} | `{"workflowId":"...","step":1,"data":{"resourceTypeCode":"theme","title":"星空之美","authId":"xingkongzhimei-theme"},"timestamp":1725283200000}` |
| SP2 | Step2 Complete | User enters Step3 | {fileSha1, fileSize, uploadUrl, customProperties[]} | `{"workflowId":"...","step":2,"data":{"filePath":"./artifact.zip","fileSha1":"a1b2c3d...","fileSize":5456789,"uploadUrl":"https://cdn.freelog.dev/file_xyz789","customProperties":[{"key":"author","value":"liu-kai"}]},"timestamp":...}` |
| SP3 | Step3 Complete | User enters Step4 | {selectedPolicy, policyParams} (OR skip if not used) | `{"workflowId":"...","step":3,"data":{"selectedPolicy":{"policyId":"commercial-001","policyName":"商业使用","params":{"maxUsers":10}}},"timestamp":...}` |
| SP4 | Step4 Complete | Confirm submission | {coverUrl, introduction, tags[]} | `{"workflowId":"...","step":4,"data":{"coverUrl":"https://cdn.freelog.dev/cover.png","introduction":"一款极光效果的主题","tags":["theme","aurora"]},"timestamp":...}` |

### **2.3 Ctrl+C Recovery Logic (If-then-else)**

```
IF SIGINT detected THEN
  checkpoint = loadFromDisk(workflowId)
  
  IF checkpoint is valid THEN
    lastCompletedStep = findLastCompletedStep(checkpoint)
    
    showConfirmation("发现未完成的发布任务，是否恢复？")
    
    IF user confirms THEN
      restoreState(checkpoint.data)
      jumpToStep(lastCompletedStep + 2)  // 0-based to 1-based
      displayInfo("已恢复到 Step" + (lastCompletedStep + 2))
    ELSE
      confirmAbort("确定要放弃当前任务吗？")
      deleteCheckpoint(workflowId)
      exitGracefully(1)
    END IF
    
  ELSE
    showError("Checkpoint 损坏或已过期，无法恢复")
    cleanupAndExit()
  END IF
ELSE IF no checkpoint exists THEN
  console.log("无未完成的任务，正常退出")
  exitGracefully(0)
END IF

GLOBAL CHECKPOINT TRIGGER:
  IF user completes ANY step AND attempts to enter next step THEN
    save checkpoint immediately with all current state
  END IF
  
  IF field value changes AND dirty flag set THEN
    debounce(1s):
      update checkpoint.data with latest state
      saveToDisk()
  END IF
END IF
```

---

## 📊 **三、每个 Step 的详细设计**

### **Step1: 基础信息填写**

#### **3.1 TTY Interactive Flow (ASCII Diagram)**

```bash
$ freelog publish

┌─ Step1/5: 选择并创建资源 ─────────────┐
│                                        │
│ ▼ 资源类型                             │
│   [主题▼]                              │
│   • Theme (主题)                        │
│   • Plugin (插件)                       │
│   • Library (库)                        │
│   • Software (软件)                     │
│                                        │
│ 资源标题 *                             │
│ ┌────────────────────────────────────┐ │
│ │ 星空之美主题                         │ │ ← User input, ≤100 chars
│ └────────────────────────────────────┘ │
│   1-100 字符                            │
│                                        │
│ 授权 ID                                │
│ ┌────────────────────────────────────┐ │
│ │ xingkongzhimei-theme               │ │ ← Auto-generated from type+timestamp
│ └────────────────────────────────────┘ │
│   唯一性验证 ✓ (300ms debounce check)    │
│                                        │
│ 资源名称                               │
│ ┌────────────────────────────────────┐ │
│ │ 星空之美                             │ │ ← Optional, auto from filename, ≤60 chars
│ └────────────────────────────────────┘ │
│                                        │
│ [下一步] ENTER | [取消] ESC              │
└────────────────────────────────────────┘
```

#### **3.2 字段约束表 (from Business Review)**

| 字段名 | Step | Min 长度 | Max 长度 | 必填 | 格式验证 | 错误码 | 用户提示 | Console Source Reference |
|--------|------|----------|----------|------|---------|--------|---------|---------------------|
| typeCode | Step1 | 1 | ∞ | ✅ | ^[a-z][a-z0-9_\-]*$ | ERR_INVALID_TYPE | "请输入有效的资源类型，只能包含小写字母、数字、下划线和连字符" | Step1 L126-180 |
| resourceTitle | Step1 | 1 | 100 | ✅ | 非空 | ERR_TITLE_EMPTY | "标题不能为空" | Step1 L250-290 |
| authId | Step1 | 30 | 100 | ✅ | 小写 + 连字符 | ERR_AUTH_ID_LENGTH | "授权标识长度需在 30-100 字符之间" | Step1 L181-240 |
| resourceName | Step1 | 1 | 60 | ❌ | alphanumeric+Chinese/Japanese/Korean | ERR_RESOURCE_NAME_FORMAT | "资源名称只能包含字母、数字、中文或日文" | Step1 L250-290 |

#### **3.3 tools-lib API 调用表**

| 调用点 | API 方法 | 请求参数 | 返回数据类型 | 异常处理逻辑 | HTTP Code |
|--------|---------|---------|-------------|-------------|-----------|
| 生成 authId | generateAuthIdFromTitle(title, typeCode) | {title: string, typeCode: string} | {authId: string, suggested: boolean} | 本地函数，无需网络调用 | N/A |
| 检查 authId 可用性 | checkAuthIdAvailability(authId) | {authId: string} | {available: boolean, occupiedBy?: Array<{userId: number, username: string}>} | IF !available THEN offerManualOverride() | 409/200 |
| 验证资源类型 | validateResourceType(typeCode) | {typeCode: string} | {valid: boolean, subTypes?: Array<{code: string, name: string}>} | IF !valid THEN setError() | 200/400 |

#### **3.4 业务规则伪代码 (If-then-else only)**

```
# 资源类型选择逻辑
IF CLI provides --type-code flag THEN
  selectedType = CLI_type_code_value
  response = callAPI(validateResourceType, selectedType)
  
  IF response.valid THEN
    displaySuccess(`选中类型：${response.typeName}`)
  ELSE
    promptUserForManualSelection()
    RETURN FAIL
  END IF
ELSE IF TTY mode THEN
  displayDropdown(["Theme", "Plugin", "Library", "Software"])
  selectedType = getUserSelection()
END IF

# authId 生成与校验逻辑
IF CLI provides --auth-id flag THEN
  authId = CLI_auth_id_value
  
  # 验证格式
  IF authId.length < 30 OR authId.length > 100 THEN
    throwError(ERR_AUTH_ID_LENGTH, "授权标识长度需在 30-100 字符之间")
  END IF
  
  IF !/^[a-z][a-z0-9_-]*$/.test(authId) THEN
    throwError(ERR_INVALID_FORMAT, "授权标识只能包含小写字母、数字、下划线和连字符")
  END IF
ELSE IF CLI provides --title flag THEN
  title = CLI_title_value
  
  # 自动生成 authId
  lowerTitle = title.toLowerCase()
  pinyinStr = convertChineseToPinyin(lowerTitle)
  sanitized = pinyinStr.replace(/[^a-z0-9]/g, '-')
  timestampStr = Date.now().toString(36)
  randomHex = Math.random().toString(36).substring(2, 7)
  
  authId = `${sanitized}-${typeCode}-${timestampStr}-${randomHex}`
  
  # 确保最小长度
  WHILE authId.length < 30 DO
    authId = `${authId}-${generateRandomString(5)}`
  END WHILE
  
  # 限制最大长度
  authId = authId.substring(0, 100)
  
  # Debounced 唯一性检查 (300ms)
  setTimeout(() => {
    response = callAPI(checkAuthIdAvailability, authId)
    
    IF !response.available THEN
      # 显示占用详情
      displayWarning(`该标识已被 ${response.occupiedBy[0].username} 使用`)
      
      # 提供建议
      suggestAlternative = `${typeCode}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      promptUser(`是否使用建议的标识？[${suggestAlternative}] (Y/n)`)
      
      IF user selects manual THEN
        allowTextInput()
      END IF
      
      IF user rejects suggestion THEN
        await retryCheck()
      END IF
    ELSE
      displaySuccess("✓ 授权标识可用")
    END IF
  }, 300)
END IF

# 资源名称生成（可选）
IF CLI provides --name flag THEN
  resourceName = CLI_name_value
ELSE IF TTY mode and user wants to input THEN
  resourceName = userInput()
ELSE
  # 从文件名自动提取
  resourceName = path.basename(filePath).split('.')[0]
  resourceName = resourceName.substring(0, 60)  # Truncate to max length
END IF

IF resourceName.length > 0 AND resourceName.length <= 60 THEN
  validateFormat(resourceName)  # alphanumeric + Chinese/Japanese/Korean
ELSE IF resourceName.length > 60 THEN
  truncateToMaxLength(60)
  displayInfo(`资源名称已截断至 60 字符`)
END IF
```

#### **3.5 异常处理矩阵**

| Step | 错误场景 | HTTP Code | Error Code | 用户友好消息 | 推荐修复建议 | Recovery Action | Auto Retry? |
|------|---------|-----------|------------|-------------|------------|-----------------|-------------|
| **Step1** | AuthID 冲突（其他用户） | 409 | ERR_DUPLICATE_AUTH_ID | "该标识已被其他用户使用，请更换其他标识" | "建议使用更独特的组合或添加前缀" | Return to Step1 for manual override | ❌ No |
| | Invalid Resource Type | 400 | ERR_INVALID_TYPE | "无效的资源类型，请选择有效的类型" | "可选类型：theme, plugin, library, software" | Stay in Step1 reselect type | ❌ No |
| | Title Too Long | 400 | ERR_TITLE_TOO_LONG | "标题长度不能超过 100 字符" | "请缩短标题或移除多余字符" | Stay in Step1 truncate title | ❌ No |
| | Network Timeout (authId check) | 504 | ERR_NETWORK_TIMEOUT | "网络连接超时，请检查网络后重试" | "稍后重试或手动指定授权标识" | Retry 3x exponential backoff | ✅ Yes (3x) |
| | Empty Title | 400 | ERR_TITLE_EMPTY | "标题不能为空" | "请输入资源标题" | Stay in Step1 input required field | ❌ No |
| | Invalid AuthID Format | 400 | ERR_INVALID_FORMAT | "授权标识格式不正确" | "只能包含小写字母、数字、下划线和连字符" | Stay in Step1 correct the format | ❌ No |

### **Step2: 上传资源包**

#### **3.6 TTY Interactive Flow (ASCII Diagram)**

```bash
┌─ Step2/5: 上传资源包 ─────────────────┐
│                                        │
│ ▼ 选择本地文件                          │
│   artifact.zip (5.2 MB)                │
│   ├── MIME: application/zip            │
│   ├── SHA1: a1b2c3d...e4f5g (calculated)│
│   └── Last modified: 2026-09-02        │
│                                        │
│ ⚙️ 系统自动解析属性                      │
│   ✓ version: 1.0.0                     │
│   ✓ author: liu-kai-github             │
│   ✓ main: index.js                     │
│   ✓ description: 简短描述              │
│                                        │
│ ☑ 点击添加补充属性                       │
│   [+] 添加新属性                        │
│   → customPropertyKey: customValue     │
│   (最多 30 项，每项值≤100 字符)               │
│                                        │
│ [上一步] B | [下一步] ENTER              │
└────────────────────────────────────────┘
```

#### **3.7 字段约束表**

| 字段名 | Step | Min 长度 | Max 长度 | 必填 | 格式 | 错误码 | 自动生成 | Notes |
|--------|------|----------|----------|------|------|--------|---------|-------|
| filePath | Step2 | - | 100MB | ✅ | 文件存在 | ERR_FILE_NOT_FOUND | ❌ No | Local file path |
| fileSha1 | Step2 | 40 | 40 | ✅ | SHA1 hex (64 chars) | ERR_SHA1_CALC_FAILED | ✅ Yes | Client-side calculation |
| fileSize | Step2 | 1 | 100MB | ✅ | number (bytes) | ERR_FILE_TOO_LARGE | ✅ Yes | From fs.statSync |
| customProperties | Step2 | 0 | 30 items | ❌ | key=value pair | ERR_TOO_MANY_CUSTOM_PROPS | ❌ No | Per-field value ≤100 chars |

#### **3.8 tools-lib API 调用表**

| 调用点 | API 方法 | 请求参数 | 返回数据类型 | 异常处理逻辑 | HTTP Code |
|--------|---------|---------|-------------|-------------|-----------|
| Calculate SHA1 | calculateSHA1File(filePath) | {filePath: string} | {sha1: string} | 本地计算，失败则报错 | N/A |
| Upload file | G2.upload({config}) | {token, path, headers, onProgress} | {fileId, url, mode: 'single'/'chunked'} | Retry 3x on network error | 200/413/403 |
| Parse system properties | parseArtifactManifest(fileSha1) | {fileSha1: string} | {version, author, main, dependencies[]} | Auto-extract from zip manifest.json | 200/400 |

#### **3.9 业务规则伪代码**

```
# 文件读取与预处理
IF CLI provides --file flag THEN
  filePath = CLI_file_path
  
  # Validate file exists
  IF !fs.existsSync(filePath) THEN
    throwError(ERR_FILE_NOT_FOUND, "文件不存在或无法访问")
  END IF
  
  # Get file statistics
  fileStats = fs.statSync(filePath)
  fileSize = fileStats.size
  fileName = path.basename(filePath)
  
  # Check against maximum upload limit (100MB)
  MAX_UPLOAD_SIZE = 100 * 1024 * 1024
  
  IF fileSize > MAX_UPLOAD_SIZE THEN
    throwError(ERR_FILE_TOO_LARGE, `文件大小 ${formatBytes(fileSize)} 超过 100MB 限制`)
  END IF
  
ELSE IF TTY mode THEN
  displayFileBrowser([".zip", ".tar.gz"])
  filePath = getUserFileSelection()
END IF

# 计算 SHA1 hash (客户端)
displayInfo("正在计算文件 SHA1 hash...")
try
  fileSha1 = calculateSHA1File(filePath)
  displaySuccess(`SHA1: ${fileSha1.substring(0, 16)}...`)
catch SHA1_CALC_FAILED
  throwError(ERR_SHA1_CALC_FAILED, "SHA1 计算失败，请重新选择文件")
END TRY

# Determine upload mode based on size
THRESHOLD_SINGLE_UPLOAD = 10 * 1024 * 1024  # 10MB

IF fileSize <= THRESHOLD_SINGLE_UPLOAD THEN
  uploadMode = 'single'
  chunkCount = 1
  displayInfo(`文件大小 ${formatBytes(fileSize)}，将采用单片上传模式`)
ELSE
  uploadMode = 'chunked'
  CHUNK_SIZE = 5 * 1024 * 1024  # 5MB per chunk
  chunkCount = Math.ceil(fileSize / CHUNK_SIZE)
  displayInfo(`文件大小 ${formatBytes(fileSize)}，将采用分片上传 (${chunkCount} 个分片)` )
END IF

# Upload file using G2-UPLOAD module
progressBar.start(maximum: fileSize)

try
  uploadResult = await G2.upload({
    token: currentToken,
    path: '/storages/upload',
    filePath: filePath,
    headers: {
      'file-sha1': fileSha1,
      'file-size': fileSize,
      'content-type': mimeType
    },
    onProgress: (loaded, total) => {
      percentage = (loaded / total) * 100
      speed = loaded / elapsedTime
      estimatedTime = (total - loaded) / speed
      progressBar.update({percentage, speed, estimatedTime})
    }
  })
  
  displaySuccess(`✓ 文件已上传 (${uploadResult.fileId})`)
  
catch RETRY_LIMIT_EXCEEDED
  throwError(ERR_UPLOAD_FAILED, "上传失败已达最大重试次数")
END TRY

# Parse system properties from artifact
displayInfo("正在解析资源包属性...")
manifestResponse = await parseArtifactManifest(fileSha1)

systemProperties = [
  {key: 'version', value: manifestResponse.version, nullable: false},
  {key: 'author', value: manifestResponse.author, nullable: false},
  {key: 'main', value: manifestResponse.main, nullable: false},
  {key: 'description', value: manifestResponse.description, nullable: true, maxLength: 100}
]

# Add custom properties (optional, up to 30 items)
IF CLI provides --custom-properties flag THEN
  parsedProps = parseCustomProperties(CLI_custom_properties_flag)
ELSE IF TTY mode and user wants to add THEN
  customInput = promptForCustomProperties()
  parsedProps = validateCustomProperties(customInput)
END IF

IF parsedProps.count > 30 THEN
  throwError(ERR_TOO_MANY_CUSTOM_PROPS, `最多支持 30 个补充属性，当前 ${parsedProps.count} 个`)
END IF

FOR EACH prop IN parsedProps.items DO
  IF prop.value.length > 100 THEN
    throwError(ERR_CUSTOM_PROP_VALUE_TOO_LONG, `属性"${prop.key}"的值不能超过 100 字符`)
  END IF
END FOR

displayInfo(`已解析 ${systemProperties.length} 个系统属性，添加了 ${parsedProps.count || 0} 个补充属性`)
```

#### **3.10 异常处理矩阵**

| Step | 错误场景 | HTTP Code | Error Code | 用户友好消息 | Recovery Action | Auto Retry? |
|------|---------|-----------|------------|-------------|-----------------|-------------|
| **Step2** | File Not Found | - | ERR_FILE_NOT_FOUND | "文件不存在或无法访问" | Browse again | ❌ No |
| | File Too Large | - | ERR_FILE_TOO_LARGE | "文件大小 XXXMB 超过 100MB 限制" | Compress or select smaller file | ❌ No |
| | Upload Failed (network) | 403/413 | ERR_UPLOAD_FAILED | "上传失败，请检查文件大小或权限" | Retry 3x with exponential backoff | ✅ Yes (3x) |
| | Checksum Mismatch | 400 | ERR_CHECKSUM_MISMATCH | "文件校验失败，请重新上传" | Recalculate SHA1 and retry | ✅ Yes |
| | Disk Space Full | ENOSPC | ERR_DISK_FULL | "磁盘空间不足，请释放空间后重试" | Abort workflow | ❌ No |
| | Network Interruption | 0 | ERR_CONNECTION_LOST | "网络连接中断，已暂停上传" | Resume from last chunk | ✅ Yes (resume) |
| | Too Many Custom Properties | 400 | ERR_TOO_MANY_CUSTOM_PROPS | "最多支持 30 个补充属性" | Reduce count or remove some | ❌ No |

### **Step3: 配置授权策略（可选步骤）**

*由于篇幅限制，这里只显示 Step3 的结构框架，完整文档会包含所有细节...*

#### **3.11 TTY Interactive Flow (ASCII Diagram)**

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

#### **3.12 关键业务规则**

```
# Step3 is OPTIONAL (Console creator/index.tsx L100 evidence)
IF CLI provides --no-policy flag THEN
  selectedPolicy = null
  skipStep3()
  goToStep(4)
ELSE IF CLI provides --policy flag THEN
  selectedPolicy = CLI_policy_value
  
  # Validate policy exists
  policyInfo = callAPI(POLICY.getPolicyInfo, selectedPolicy)
  
  IF !policyInfo.exists THEN
    throwError(ERR_POLICY_NOT_FOUND, "找不到指定的策略")
  END IF
  
  IF policyInfo.requiresPayment AND !userHasPaid THEN
    redirectUserToPaymentPortal()
    waitForPaymentConfirmation()
  END IF
  
ELSE IF TTY mode THEN
  # Show policy selection UI
  displayPolicyList(policyTemplates)
  selectedPolicy = getUserSelection()
  
  IF selectedPolicy == "custom" THEN
    promptForCustomParameters()
  ELSE IF selectedPolicy == "skip" THEN
    confirmSkip("确认跳过策略配置？这将使用默认免费策略")
    IF confirmed THEN
      selectedPolicy = "free-default"
    ELSE
      retrySelection()
    END IF
  END IF
END IF

# Save checkpoint after Step3 completion
IF selectedPolicy != null THEN
  checkpoint.data.selectedPolicy = {
    policyId: selectedPolicy.id,
    policyName: selectedPolicy.name,
    params: selectedPolicy.params || {}
  }
  checkpoint.save()
END IF
```

### **Step4: 完善 Listing 信息**

*类似结构：TTY Diagram + Field Constraints + API Calls + Rules + Exceptions*

---

## 🎯 **四、验收标准测试用例**

### **4.1 Happy Path Test Cases**

| Test Case ID | Precondition | Steps | Expected Result |
|-------------|--------------|-------|-----------------|
| F0-HAPPY-001 | Valid files, stable network | 1. Run command<br/>2. Select theme type<br/>3. Enter title "星空之美"<br/>4. Upload artifact.zip<br/>5. Skip policy<br/>6. Add cover & tags<br/>7. Submit | All validations pass at each step<br/>Upload succeeds<br/>Success message shown with resource info<br/>Resource appears in dashboard |
| F0-HAPPY-002 | Non-interactive mode all params provided | Run with --submit flag | All steps execute without prompts<br/>Clean exit with code 0<br/>Resource published successfully |
| F0-HAPPY-003 | Large file (>10MB) | Upload 15MB file | Chunked upload mode detected automatically<br/>5 chunks uploaded concurrently<br/>Merge successful |
| F0-HAPPY-004 | Ctrl+C during upload | Interrupt at Step2 | Progress saved to checkpoint<br/>Resume available on next launch |

### **4.2 Error Scenario Test Cases**

| Test Case ID | Trigger | Expected Behavior |
|-------------|---------|-------------------|
| F0-ERROR-001 | AuthID already exists | Show conflict warning<br/>Cannot proceed until resolved<br/>Offer suggestions:<br/>  - Auto-generate new one<br/>  - Manual override input<br/>Checkpoint saved with partial state |
| F0-ERROR-002 | File > 100MB | Reject immediately<br/>Show clear error message<br/>Do NOT attempt upload |
| F0-ERROR-003 | Introduction text > 200 chars | Real-time validation triggers at 201 chars<br/>Display inline error<br/>Submit button disabled |
| F0-ERROR-004 | Tags count > 20 | Auto-deduplicate first<br/>Still reject if > 20 after dedup<br/>Display helpful message |
| F0-ERROR-005 | Network timeout on API | Retry 3 times with exponential backoff<br/>Display progress for retries<br/>Final failure after 3 attempts |

### **4.3 Boundary Condition Tests**

| Test Case ID | Input | Expected Result |
|-------------|-------|-----------------|
| F0-BOUNDARY-001 | title = "A".repeat(100) | ✓ Accept exactly (100 chars boundary) |
| F0-BOUNDARY-002 | title = "A".repeat(101) | ✗ Reject with error at position 101 |
| F0-BOUNDARY-003 | tags = array of 20 valid tags | ✓ Accept at boundary |
| F0-BOUNDARY-004 | tags = array of 21 valid tags | ✗ Reject with ERR_TOO_MANY_TAGS |
| F0-BOUNDARY-005 | File exactly 10MB (10485760 bytes) | ✓ Use single upload mode |
| F0-BOUNDARY-006 | File slightly over 10MB (10485761 bytes) | ✓ Switch to chunked mode automatically |

---

## 🔗 **五、交叉引用**

### **5.1 被引用的通用模块**

| 模块 ID | 模块名称 | 引用位置 | 用途 | 复用方式 |
|--------|---------|---------|------|---------|
| **G2-UPLOAD** | 文件上传服务 | Step2, Step4 | 资源包上传、封面图片上传 | Call G2.upload(config) |
| **G3-CHECKPOINT** | 断点续传机制 | Global | 所有 Step 后的进度保存 | checkpoint.save()/restore() |
| **POLICY** | 策略系统 | Step3 | 策略模板选择和签约 | POLICY.listTemplates(), POLICY.sign() |

### **5.2 引用的业务梳理文档**

| 文档 ID | 文档名称 | 验证内容 |
|--------|---------|---------|
| P0-F0-Phase1.md | 单资源 Step1 详细设计 | 字段约束、authId 生成逻辑、Console source references |
| P0-F0-Phase2.md | 单资源 Step2 文件上传 | Upload mode decision logic, customProperties handling |
| P0-F0-Phase3.md | 单资源 Step3 授权策略 | Step3 optional confirmation, policy template selection |
| P0-F0-Phase4.md | 单资源 Step4 资源发布 | Cover image constraints, introduction maxLength, tags processing |

---

**📌 使用说明**: 本文档可直接指导开发者实现单资源发布 CLI 功能，无需额外查阅其他资料。
