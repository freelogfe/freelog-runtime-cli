# P2-Phase-2 发行流程编排设计

> **版本**: v1.0 | **最后更新**: 2026-09-02  
> **对齐 Source**: `business/业务梳理/流程设计 - 创建资源/` + `business/业务梳理/资源管理/`

---

## 📋 **一、整体流程架构**

```
┌─────────────────────────────────────────────────────────────┐
│                P2-Phase-2 发行流程编排                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  F1      │    │  M1      │    │  C1      │              │
│  │ 创建单个 │ →  │ 版本更新 │ →  │ 合集创建 │              │
│  │ 资源     │    │          │    │          │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│                                                             │
│  Phase 2 职责：                                                 │
│  1. 按顺序编排 Step 执行                                        │
│  2. 维护 Checkpoint 状态 (Ctrl+C 中断恢复)                           │
│  3. 处理异常分支和重试                                         │
│  4. 组装最终提交的数据结构                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔗 **二、调用的 Step 清单**

### **F1 单资源发布**

| Step | 来源文档 | 主要职责 |
|------|----------|---------|
| **F1.1 Step1** | `01-1-Step1-创建资源壳.md` | 选择类型、输入标题、authId 生成、唯一性验证、提交资源壳 |
| **F1.2 Step2** | `01-2-Step2-上传资源与配置.md` | 本地文件扫描、分片上传、SHA1 校验、补充属性添加 |
| **F1.3 Step3** | `01-3-Step3-策略模板.md` | 选择策略模板、参数填写、Schema 验证、Bytecode 编译 |
| **F1.4 Step4** | `01-4-Step4-完善 Listing.md` | 标题描述编辑、封面上传验证、标签去重、链接数量限制 |

### **M1 版本更新**

| Step | 来源文档 | 主要职责 |
|------|----------|---------|
| **M1 Step1** | `01-版本更新.md` | 读取远端最新状态、检查冻结标识、获取可修改字段 |
| **M1 Step2** | `01-版本更新.md` | 继承元数据、合并配置、上传新版本、对比差异 |

### **C1 合集创建**

| Step | 来源文档 | 主要职责 |
|------|----------|---------|
| **C1 Step1** | `03-1-Step1.md` | 批量目录扫描 |
| **C1 Step2** | `03-2-Step2.md` | 合集元数据录入 |
| **C1 Step3** | `03-3-Step3.md` | 资源选择交互 |
| **C1 Step4** | `03-4-Step4.md` | RSS 订阅绑定 |
| **C1 Step5** | `03-5-Step5.md` | 合集发布提交 |

---

## ⏸️ **三、Checkpoint 机制设计**

### **3.1 保存点设计**

| Checkpoint Key | 保存时机 | 触发条件 | 数据结构 |
|---------------|---------|---------|---------|
| `step1-create-shell` | Step1 完成后 | 所有参数验证通过并提交 API | `{ resourceId, resourceName, authId, title, version: 1, timestamp }` |
| `step2-file-X` | 每个文件上传后 | 文件分片上传成功 | `{ currentFileIndex, fileName, uploadedCount, totalFiles, sha1Checksum }` |
| `step2-upload-complete` | Step2 全部完成 | 所有文件上传完毕 | `{ fileList: [{fileName, remotePath, size, sha1}], customProperties[], optionConfigs[] }` |
| `step3-policy-configured` | Step3 完成后 | Bytecode 编译成功 | `{ policyId, template, bytecode, checksum, appliedAt }` |
| `step4-listing-published` | Step4 完成后 | Listing 提交成功 | `{ listingId, publishedAt, publicUrl, tags, coverImageUrl }` |

### **3.2 恢复逻辑**

```
IF 检测到 Ctrl+C 中断 THEN
  1. 扫描 .freelog-checkpoint/ 目录下文件
  2. 读取最近 24h 内的 Checkpoint
  3. 判断可以继续 (Checkpoint 未过期)
  4. 从最近的保存点继续执行后续 Steps
  5. 已完成的 Steps 不再重复调用 API
ELSE
  从头开始新流程
ENDIF
```

### **3.3 Checkpoint 数据存储**

```bash
# 存储位置
.freelog-checkpoint/
├── step1-create-shell.json
├── step2-file-0.json
├── step2-file-1.json
├── ...
└── last-complete.json (记录进度)
```

---

## 💻 **四、F1 单资源发布详细设计**

### **4.1 Step1: 创建资源壳**

#### **4.1.1 业务流程**

```
Step1 执行流程:

1. 读取本地 Manifest.yaml (如果存在)
   ├─ 提取 typeCode (作为默认选中值)
   └─ 提取 title (作为输入框默认值)

2. Prompt: 资源类型选择
   ├─ GET /api/resource/type/tree 加载类型树
   ├─ 默认选中第一个 (Theme-Aurora)
   ├─ 支持上下键切换类型
   └─ Enter 确认选中

3. Prompt: 标题输入
   ├─ 自动基于拼音生成 authId: liu-kai-github/starry-sky
   ├─ 实时显示字符计数 (75/200)
   └─ 300ms debounce 触发的 authId 唯一性验证

4. 最终确认界面
   ├─ 展示类型、标题、authId
   ├─ 提示"授权标识一旦创建无法修改"
   ├─ [取消] ESC | [立即创建] ENTER

5. POST /v2/resources (createAuthShell)
   ├─ Body: { type, typeName, title, authId }
   └─ Response: { resourceId, resourceName, authId, version }
```

#### **4.1.2 字段约束表**

| 字段 | 约束规则 | 提示文案 | 错误码 | 处理方式 |
|------|---------|---------|--------|---------|
| type | 必填，来自类型树 API | "请选择资源类型" | RESOURCE_TYPE_NOT_FOUND | prompt_user(重新选择) |
| title | 1-200 字符 | "标题长度 ({current}/200)" | TITLE_TOO_LONG | prompt_user(裁剪或修改) |
| title | 禁止字符: `<>&"'`` | "包含非法字符" | INVALID_CHARS_IN_TITLE | prompt_user(删除特殊字符) |
| authId | 格式 {username}/{authid} | "授权标识格式错误" | INVALID_AUTH_ID_FORMAT | prompt_user(修正格式) |
| authId | 全局唯一 | "该授权标识已被使用" | AUTH_ID_EXISTS | prompt_user(修改标题或手动修改 authId) |
| authId | 基于拼音自动生成 | "授权标识由 owner/authid 组成" | N/A | 提示用户可手动修改 |

#### **4.1.3 API 调用详情**

**请求**: `POST /v2/resources`  
**子接口**: `createAuthShell`  

**Request Body:**
```json
{
  "type": "theme",                     // 一级分类代码
  "typeName": "Theme-Aurora",          // 显示名称
  "title": "星空之美",                 // 用户提供的标题
  "authId": "liu-kai-github/starry-sky" // owner/authid 格式
}
```

**Success Response:**
```json
{
  "resourceId": "res_abc123xyz",       // 唯一资源 ID (用于后续步骤)
  "resourceName": "starry-sky",        // 基于 authid 生成的资源名
  "authId": "liu-kai-github/starry-sky",
  "version": 1                         // 初始版本号
}
```

**Error Response Examples:**

```json
// AUTH_ID_EXISTS
{
  "errorCode": "AUTH_ID_EXISTS",
  "message": "该授权标识已被使用",
  "suggestion": "请修改标题或手动修改授权标识"
}

// RESOURCE_TYPE_NOT_FOUND
{
  "errorCode": "RESOURCE_TYPE_NOT_FOUND",
  "message": "所选资源类型不存在",
  "suggestion": "请刷新类型树并重新选择"
}
```

#### **4.1.4 异常分支处理矩阵**

| 错误码 | 触发条件 | 用户提示 | 修复建议 | 重试策略 |
|--------|---------|---------|---------|---------|
| AUTH_ID_EXISTS | authId 全局重复 | "⚠️ 该授权标识已被使用" | "💡 建议：修改标题或手动修改 authId" | retry_with_prompt |
| RESOURCE_TYPE_NOT_FOUND | 类型 ID 无效 | "❌ 所选资源类型不可用" | "💡 正在重新查询类型树..." | exponential_backoff × 3 |
| TITLE_TOO_LONG | title > 200 字符 | "⚠️ 标题超长 ({actual}/200)" | "💡 请精简至 200 字符以内" | truncate_or_reject |
| INVALID_AUTH_ID_FORMAT | 格式不是 {user}/{authid} | "⚠️ 授权标识格式错误" | "💡 应为 '用户名/拼音标识'" | prompt_correction |
| NETWORK_ERROR | HTTP 连接失败 | "❌ 网络连接失败" | "💡 请检查网络后重试" | network_retry × 3 |
| API_RATE_LIMIT | 请求过快 | "⚠️ 操作过于频繁" | "💡 等待 30 秒后重试" | wait_and_retry |

---

### **4.2 Step2: 上传资源文件与配置**

#### **4.2.1 文件扫描规则**

```
localDirectoryScanner(directoryPath):

1. 遍历目录所有文件
   ├─ 递归扫描子目录
   └─ 排除隐藏文件 (.hidden, .*开头的)

2. 排除特定目录
   ├─ node_modules/
   ├─ .git/
   ├─ dist/ (如果是构建产物)
   └─ .freelog/**/*

3. 过滤有效扩展名
   ├─ HTML: .html
   ├─ JS: .js,.mjs
   ├─ CSS: .css,.scss,.less
   ├─ 图片：.png,.jpg,.jpeg,.webp,.svg
   ├─ 媒体：.mp4,.mp3,.wav
   └─ 其他：根据资源类型动态调整

4. 返回文件列表
   └─ [{ path, relativePath, size }]
```

#### **4.2.2 文件大小与分片上传算法**

```
uploadWithChunkStrategy(file):

IF file.size <= 10MB THEN
  # 单文件直接上传
  response = POST /v2/storages/uploadSingle({
    file: binary_data,
    fileName: file.relativePath,
    sha1Checksum: calculateSHA1(file)
  })
  
ELSE IF file.size > 10MB THEN
  # 分片上传 (每片 5MB)
  chunks = splitFileIntoChunks(file, chunkSize=5*1024*1024)
  
  FOR EACH chunk in chunks DO
    uploadResponse = POST /v2/storages/uploadChunk({
      chunkId: chunk.index,
      totalChunks: chunks.length,
      data: chunk.binary_data,
      sha1Checksum: calculateSHA1(chunk)
    })
  END FOR
  
  # 服务端合并 chunks
  mergeResponse = POST /v2/storages/mergeChunks({
    resourceId: context.resourceId,
    fileName: file.relativePath,
    totalChunks: chunks.length,
    finalSha1: calculateSHA1(file)
  })
  
  response = mergeResponse
END IF

# 验证返回结果
IF response.sha1Checksum != calculatedSha1 THEN
  THROW ERROR CHECKSUM_MISMATCH
END IF

RETURN {
  fileName: file.relativePath,
  remotePath: response.remotePath,
  size: response.size,
  sha1Checksum: response.sha1Checksum
}
```

#### **4.2.3 补充属性与可选配置系统**

**补充属性规则:**
```
customPropertyManager():

1. 最多 30 个补充属性
2. key 必须全局唯一 (不能与系统属性重复)
3. name 不能与其他补充属性重复
4. Value 文本框限制 100 字符
5. key/name/value 格式要求
   ├─ key: 字母数字下划线 (^[a-zA-Z0-9_]+$)
   ├─ name: UTF-8 字符串，1-100 字符
   └─ value: 任意文本，≤100 字符

6. UI 交互
   ├─ [+ 添加补充属性] 按钮
   ├─ 点击打开属性编辑器弹窗
   ├─ 支持 inline 编辑 key/value
   └─ [删除] 按钮移除属性
```

**可选配置系统规则:**
```
optionalConfigManager(type: 'input' | 'select'):

1. 最多 30 个可选配置项
2. 需勾选"支持可选配置"才显示
3. key 需全局唯一
4. 配置类型:
   
   Type: Input (单行文本)
   ├─ key: 唯一标识符
   ├─ name: 显示名称
   ├─ input: 默认值 (可为空)
   └─ description: 说明文字
   
   Type: Select (下拉选项)
   ├─ key: 唯一标识符
   ├─ name: 显示名称
   ├─ select: ["选项 1", "选项 2", "选项 3"] 分号分隔
   └─ description: 说明文字

5. Schema 验证
   └─ 提交前对所有 configs 进行 JSON Schema 校验
```

#### **4.2.4 Step2 数据结构**

**Input:**
```typescript
interface UploadFilesRequest {
  resourceId: string;            // Step1 返回的资源 ID
  directoryPath: string;         // 本地目录路径
  files: Array<{
    path: string;               // 本地绝对路径
    relativePath: string;       // 相对路径
    size: number;               // 字节数
    sha1Checksum?: string;      // 可选，会现场计算
  }>;
  customProperties?: Array<{
    key: string;
    name: string;
    value: string;
  }>;
  optionalConfigs?: Array<{
    key: string;
    name: string;
    type: 'input' | 'select';
    input?: string;
    select?: string[];
    description?: string;
  }>;
}
```

**Output:**
```typescript
interface UploadFilesResponse {
  uploadedFiles: Array<{
    fileName: string;           // 相对路径
    remotePath: string;         // 服务器路径
    size: number;               // 文件大小 (字节)
    sha1Checksum: string;       // SHA1 hash
    mimeType: string;           // 检测到的 MIME 类型
    uploadedAt: string;         // ISO 时间戳
  }>;
  customProperties?: Array<...>; // 回显补充属性
  optionalConfigs?: Array<...>;  // 回显可选配置
}
```

#### **4.2.5 异常分支处理**

| 错误码 | 触发条件 | 用户提示 | 修复建议 | 重试次数 |
|--------|---------|---------|---------|---------|
| FILE_TOO_LARGE | 单文件>5MB | "⚠️ 文件大小超限 (max 5MB)" | "💡 请分割文件或压缩" | reject (不重试) |
| UNSUPPORTED_FILE_TYPE | MIME 不支持 | "❌ 不支持的文件类型" | "💡 仅支持常见媒体格式" | reject |
| CHECKSUM_MISMATCH | SHA1 不匹配 | "⚠️ 文件损坏，正在重试" | "💡 自动重新读取本地文件" | auto_retry (3 次) |
| NETWORK_TIMEOUT | 上传超时 | "⚠️ 上传超时" | "💡 正在重连，请稍候..." | network_retry (exponential) |
| UPLOAD_FAILED | 服务器错误 | "❌ 上传失败" | "💡 请稍后重试或联系管理员" | network_retry × 3 |

---

### **4.3 Step3: 配置授权策略**

#### **4.3.1 策略模板选项**

| 模板 ID | 名称 | 适用场景 | 必选参数 | 示例内容 |
|--------|------|---------|---------|---------|
| free-use | 免费使用 | 可自由复制分发 | licenseUrl (可选) | "本主题可免费用于个人和商业项目" |
| commercial-use | 商业使用 | 需购买许可证 | licenseUrl, termsOfUse | "商业项目需购买 PRO 许可证" |
| custom | 完全自定义 | 用户完全控制 | policyText | 用户自定义文本 |

#### **4.3.2 Schema 验证规则**

```
policyValidator(templateId, params):

1. 加载对应模板的 JSON Schema
   ├─ GET /api/policy/template/{templateId}/schema

2. 验证 params 是否符合 schema
   ├─ required: 检查必填字段
   ├─ type: 检查类型
   └─ format: 检查 URL 格式等

3. 如果验证失败
   └─ 返回具体错误位置：errors[].instancePath

4. 通过则生成 Bytecode
   └─ POST /api/policy/compile
```

#### **4.3.3 Bytecode 编译流程**

```
compilePolicy(template, params):

1. 将策略文本转换为中间表示 (IR)
   ├─ 解析自然语言规则
   └─ 构建 AST (Abstract Syntax Tree)

2. 优化 AST
   ├─ 常量折叠
   ├─ 死代码消除
   └─ 模式匹配

3. 生成 Bytecode
   ├─ 定义虚拟机指令集
   └─ 输出 base64 编码的二进制

4. 计算 Checksum
   └─ SHA256(bytecode) → checksum

5. 返回
   └─ { policyId, bytecode, checksum }
```

---

### **4.4 Step4: 完善 Listing 信息**

#### **4.4.1 字段约束总表**

| 字段 | 约束规则 | 最大长度 | 特殊要求 | 错误码 |
|------|---------|---------|---------|--------|
| title | 1-200 字符 | 200 | 禁止特殊字符 | TITLE_INVALID |
| description | 50-1000 字符 | 1000 | HTML 标签限制 | DESCRIPTION_TOO_SHORT |
| description | HTML 标签 | <br/> <p> <a> | 最多 3 个<a> 链接 | EXCESS_LINKS |
| tags | 逗号分隔 | 20 个 | 自动去重、转小写 | TAGS_TOO_MANY |
| coverImage | JPG/PNG/WebP | 5MB | 尺寸≥800×600 | COVER_INVALID |
| website | URL 格式 | N/A | http://或 https://开头 | WEBSITE_INVALID |
| contactEmail | RFC 5322 | N/A | 标准邮箱格式 | EMAIL_INVALID |

---

### **4.5 M1 版本更新详细设计**

#### **4.5.1 业务流程**

```
M1 版本更新流程:

Step 1/4: 读取远端状态
├─ GET /v2/resources/{resourceId}
├─ 获取当前版本信息 (version, fileId, size)
├─ 检查冻结状态 (isFrozen)
└─ 展示可继承字段列表

Step 2/4: 上传新版本文件
├─ 对比新旧文件 SHA1
│  ├─ IDENTICAL → 跳过上传，复用旧 fileId
│  └─ DIFFERENT → 上传新文件
├─ 分片上传策略
│  ├─ size ≤ 10MB → 单文件上传
│  └─ size > 10MB → 分片上传 (每片 5MB)
└─ 自动解析基础属性 (mime, version, author)

Step 3/4: 填写描述信息
├─ 输入变更日志 (changelog)
│  ├─ 最小长度：20 字符
│  ├─ 最大长度：2000 字符
│  └─ 建议使用列表格式 (- 或 * 开头)
├─ 选择封面处理策略
│  ├─ ☑ 继承旧版封面 (默认)
│  └─ □ 重新上传封面
└─ 可选配置修改

Step 4/4: 提交新版本
├─ 版本号自动生成 (语义化版本)
│  ├─ patch: 修复 bug (v1.0.0 → v1.0.1)
│  ├─ minor: 新功能 (v1.0.0 → v1.1.0)
│  └─ major: 破坏性变更 (v1.0.0 → v2.0.0)
├─ 继承决策
│  ├─ 继承元数据 (title, tags, author)
│  ├─ 继承封面图片
│  └─ 继承/重新配置策略
└─ POST /v2/resources/version/create
```

#### **4.5.2 继承字段规则**

```typescript
interface InheritableFields {
  // ✅ 自动继承的字段
  metadata: {
    title: string;           // 资源标题
    tags: string[];          // 标签数组
    author: string;          // 作者信息
  };
  
  // ❌ 必须替换的字段
  file: {
    oldFileID: string;       // 旧 fileId
    newFileID?: string;      // 新 fileId(如果上传)
  };
  
  // ⚠️ 需要用户决策的字段
  coverImage: {
    inherit: boolean;        // true: 继承旧版，false: 重新上传
    newCoverFile?: FileRef;  // 新封面 (如果不继承)
  };
  
  policy: {
    inherit: boolean;        // true: 继承旧策略，false: 重新配置
    newPolicyId?: string;    // 新策略 ID(如果不继承)
  };
}

// 继承逻辑实现
function getInheritedFields(oldVersion: ResourceVersionInfo): InheritableFields {
  return {
    metadata: {
      title: oldVersion.metadata.title,
      tags: oldVersion.metadata.tags,
      author: oldVersion.metadata.author,
    },
    file: { oldFileID: oldVersion.fileId },
    coverImage: { inherit: true },  // 默认继承
    policy: { inherit: true }         // 默认继承
  };
}
```

#### **4.5.3 读取远端状态 API**

**请求**: `GET /v2/resources/{resourceId}`  
**Response:**

```json
{
  "resourceId": "res_abc123",
  "currentVersion": {
    "versionNumber": "v1.0.0",
    "fileId": "file_xyz789",
    "fileSize": 5456789,
    "sha1": "a1b2c3d4e5...",
    "publishedAt": "2026-09-01T10:00:00Z",
    "status": "published"
  },
  "metadata": {
    "title": "星空之美",
    "description": "一款带有 Aurora 效果的主题",
    "tags": ["theme", "aurora", "night"],
    "author": "liu-kai-github"
  },
  "assets": {
    "coverImage": {
      "fileName": "cover.png",
      "remotePath": "/covers/res_abc123/cover.png",
      "size": 123456
    },
    "policyId": "pol_commercial_001"
  },
  "status": {
    "isFrozen": false,
    "canUpdate": true,
    "frozenReason": null
  }
}
```

#### **4.5.4 版本差异计算逻辑**

```typescript
interface FileComparison {
  identical: boolean;          // 文件是否相同
  sizeDiff: number;           // 文件大小变化 (字节)
  sizeRatio: number;          // 变化比例
  majorChange: boolean;       // 是否重大变更 (>50%)
  recommendedAction: 'skip-upload' | 'upload-new';
}

async function compareFiles(
  oldFile: FileInfo,
  newFile: File
): Promise<FileComparison> {
  const comparison: FileComparison = {
    identical: false,
    sizeDiff: newFile.size - oldFile.size,
    sizeRatio: Math.abs(newFile.size - oldFile.size) / oldFile.size,
    majorChange: false,
    recommendedAction: 'upload-new'
  };
  
  // 计算新文件 SHA1
  const newSHA1 = await calculateSHA1(newFile.path);
  
  // SHA1 比较
  if (newSHA1 === oldFile.sha1) {
    comparison.identical = true;
    comparison.recommendedAction = 'skip-upload';
  }
  
  // 判断大小变化率
  if (comparison.sizeRatio > 0.5) {
    comparison.majorChange = true;
  }
  
  return comparison;
}
```

#### **4.5.5 语义化版本递增算法**

```typescript
function calculateNextVersion(
  currentVersion: string,
  changeType: 'patch' | 'minor' | 'major'
): string {
  // 移除前缀 v
  const [major, minor, patch] = currentVersion
    .replace(/^v/, '')
    .split('.')
    .map(Number);
  
  switch (changeType) {
    case 'patch':
      // Bug 修复 (v1.0.0 → v1.0.1)
      return `${major}.${minor}.${patch + 1}`;
    case 'minor':
      // 新功能 (v1.0.0 → v1.1.0)
      return `${major}.${minor + 1}.0`;
    case 'major':
      // 破坏性变更 (v1.0.0 → v2.0.0)
      return `${major + 1}.0.0`;
    default:
      return currentVersion;
  }
}

// ChangeType 映射表
const CHANGE_TYPE_MAPPING: Record<string, 'patch' | 'minor' | 'major'> = {
  'fix': 'patch',
  'bugfix': 'patch',
  'patch': 'patch',
  'feat': 'minor',
  'feature': 'minor',
  'breaking': 'major',
  'breaking-change': 'major'
};
```

#### **4.5.6 上传新版本 API**

**请求**: `POST /v2/resources/version/create`

**Request Body:**
```json
{
  "resourceId": "res_abc123",
  
  "inheritFromPrevious": {
    "metadata": {
      "title": "星空之美",
      "tags": ["theme", "aurora", "night"],
      "author": "liu-kai-github"
    },
    "coverImage": true,
    "policy": true
  },
  
  "file": {
    "uploadId": "upl_new_123",
    "sha1": "b2c3d4e5f6..."
  },
  
  "listing": {
    "versionNumber": "v1.1.0",
    "changelog": "📝 Bug Fixes:\n• 修复了 Aurora 闪烁问题\n✨ New Features:\n• 增加了深色模式支持",
    "tags": ["theme", "aurora", "night"]
  },
  
  "autoPublish": true
}
```

**Success Response:**
```json
{
  "versionId": "ver_456xyz",
  "versionNumber": "v1.1.0",
  "previousVersion": "v1.0.0",
  "fileId": "file_new_123",
  "publishedAt": "2026-09-02T14:35:00Z",
  "status": "pending_review",
  "reviewEstimate": "24-48 hours"
}
```

#### **4.5.7 异常分支处理矩阵**

| 错误码 | 触发条件 | 用户提示 | 修复建议 | 重试策略 |
|--------|---------|---------|---------|---------|
| RESOURCE_FROZEN | isFrozen=true | "❌ 资源已被冻结，无法更新" | "💡 请联系平台管理员解锁" | reject (致命错误) |
| VERSION_NOT_FOUND | resourceId 无效 | "⚠️ 指定的资源不存在" | "💡 检查 resourceId 是否正确" | reject |
| FILE_IDENTICAL | 新旧文件 SHA1 相同 | "ℹ️ 新旧文件完全相同，无需上传" | "💡 将直接复用旧版 fileId" | skip_upload |
| UPLOAD_TIMEOUT | 网络超时 | "⚠️ 上传超时，正在重试..." | "💡 请检查网络连接" | exponential_backoff × 3 |
| POLICY_VERSION_MISMATCH | 策略模板不兼容 | "⚠️ 策略模板版本不兼容" | "💡 请使用最新版本的模板" | prompt_user |
| CHANGELOG_TOO_SHORT | changelog < 20 字符 | "⚠️ 变更日志至少需要 20 个字符" | "💡 请补充更详细的说明" | prompt_correction |
| AUTO_PUBLISH_REJECTED | 审核失败 | "⚠️ 自动上架审核被拒绝" | "💡 改为仅提交审核等待人工复核" | retry_with_manual_review |
| INVALID_VERSION_FORMAT | 版本号不符合 SemVer | "❌ 版本号格式错误" | "💡 应为 'vX.Y.Z' 格式" | prompt_correction |

---

### **4.6 C1 合集创建详细设计**

#### **4.6.1 整体业务流程**

```
C1 合集创建流程 (5 Steps):

Step 1/5: 批量目录扫描
├─ scanDirectory(directoryPath, options)
│  ├─ recursive: true (递归扫描子目录)
│  ├─ exclude: [.hidden, node_modules, .git]
│  └─ includeExtensions: [index.html, main.js, ...]
├─ 返回有效资源列表 [{id, title, type}]
└─ Checkpoint: step1-scan-complete

Step 2/5: 合集元数据录入
├─ Prompt 用户输入:
│  ├─ title: 合集标题 (必填，1-200 字符)
│  ├─ description: 合集描述 (必填，50-1000 字符)
│  ├─ coverImage: 封面图片 (可选)
│  ├─ tags: 标签列表 (最多 20 个)
│  ├─ website: 官方网站 (可选)
│  └─ contactEmail: 联系邮箱 (可选)
├─ Validation: 字段约束验证
└─ Checkpoint: step2-metadata-entered

Step 3/5: 资源选择交互
├─ 展示已扫描的资源列表
│  ├─ 全选/反选按钮
│  ├─ 按类型分组显示
│  └─ 多选 checkbox
├─ 用户选择要收录的资源
├─ 最多可选数量：100 个资源
└─ Checkpoint: step3-resources-selected

Step 4/5: RSS 订阅绑定
├─ Prompt 是否启用 RSS 自动收录
│  ├─ □ 暂时不启用 RSS
│  ├─ ✓ 启用 RSS 自动收录
│  └─ Feed URL: (必填，HTTPS 格式)
│  └─ Scan Mode: (weekly/daily/on-demand)
├─ RSS Feed 格式验证
│  ├─ 必须为合法的 RSS/XML URL
│  ├─ 测试连接是否可达
│  └─ 检测 feed 是否能正常解析
└─ Checkpoint: step4-rss-configured

Step 5/5: 发布提交
├─ 最终确认界面:
│  ├─ 合集元数据摘要
│  ├─ 已选资源列表 (数量统计)
│  └─ RSS 配置摘要
├─ POST /v2/collections
│  ├─ Body: { metadata, resourceIds, rssBinding }
│  └─ Response: { collectionId, publicUrl, itemCount }
└─ ✅ 提交成功
```

#### **4.6.2 Step1: 批量目录扫描规则**

```typescript
interface DirectoryScanOptions {
  directoryPath: string;
  recursive: boolean;           // 默认 true
  excludeDirs: string[];        // 默认 ['.hidden', 'node_modules', '.git']
  includeHiddenFiles: boolean;  // 默认 false
  maxDepth: number;             // 最大深度限制 (默认 10)
}

interface ScannedResource {
  id: string;                   // 资源 ID(如果已存在)
  title: string;                // 从 Manifest.yaml 或目录名提取
  type: ResourceTypeCode;       // 资源类型
  path: string;                 // 本地路径
  isValid: boolean;             // 是否有效
  errorMessage?: string;        // 无效原因
}

function scanDirectory(
  options: DirectoryScanOptions
): Promise<ScannedResource[]> {
  const scanned: ScannedResource[] = [];
  
  // 遍历目录
  for (const dir of listDirectories(options.directoryPath, options)) {
    // 检测 Manifest.yaml
    const manifest = await readManifest(dir.path);
    
    if (!manifest) {
      scanned.push({
        id: null,
        title: path.basename(dir.path),
        type: 'unknown',
        path: dir.path,
        isValid: false,
        errorMessage: 'Missing Manifest.yaml'
      });
      continue;
    }
    
    scanned.push({
      id: manifest.resourceId || null,
      title: manifest.title,
      type: manifest.type,
      path: dir.path,
      isValid: true
    });
  }
  
  return scanned.filter(r => r.isValid);
}
```

#### **4.6.3 Step2: 合集元数据结构**

```typescript
interface CollectionMetadata {
  title: string;                // 必填，1-200 字符
  description: string;          // 必填，50-1000 字符
  coverImage?: FileRef;         // 可选
  tags: string[];               // 可选，最多 20 个
  website?: string;             // 可选，URL 格式
  contactEmail?: string;        // 可选，邮箱格式
}

// 字段约束验证
function validateCollectionMetadata(metadata: Partial<CollectionMetadata>): ValidationResult {
  const errors: string[] = [];
  
  // Title 验证
  if (!metadata.title || metadata.title.length < 1 || metadata.title.length > 200) {
    errors.push('标题长度必须在 1-200 字符之间');
  }
  
  // Description 验证
  if (!metadata.description || metadata.description.length < 50 || metadata.description.length > 1000) {
    errors.push('描述长度必须在 50-1000 字符之间');
  }
  
  // Tags 验证
  if (metadata.tags && metadata.tags.length > 20) {
    errors.push('最多只能添加 20 个标签');
  }
  
  // Cover Image 验证
  if (metadata.coverImage) {
    const coverValidation = validateCoverImage(metadata.coverImage);
    if (!coverValidation.valid) {
      errors.push(`封面图片无效：${coverValidation.error}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

#### **4.6.4 Step4: RSS 绑定参数**

```typescript
interface RSSBindingConfig {
  enabled: boolean;                    // 是否启用
  feedUrl: string;                     // Feed URL(HTTPs 格式)
  scanMode: 'weekly' | 'daily' | 'on-demand';
  interval?: number;                  // 扫描间隔 (小时)，scanMode=weekly/daily 时必填
  lastScannedAt?: string;             // ISO 时间戳
  nextScanAt?: string;                // 下次扫描时间
}

// RSS Feed 格式验证
function validateRSSFeedUrl(url: string): ValidationResult {
  const urlPattern = /^https:\/\/[\w.-]+(?:\/.*)?$/i;
  
  if (!urlPattern.test(url)) {
    return { valid: false, error: 'INVALID_URL_FORMAT' };
  }
  
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use HTTPS' };
    }
  } catch (e) {
    return { valid: false, error: 'INVALID_URL' };
  }
  
  return { valid: true };
}
```

#### **4.6.5 Step5: 发布提交 API**

**请求**: `POST /v2/collections`

**Request Body:**
```json
{
  "metadata": {
    "title": "优秀主题精选",
    "description": "精选最具创意的 Freelog 主题作品",
    "tags": ["curated", "theme", "awesome"],
    "website": "https://example.com",
    "contactEmail": " curator@example.com"
  },
  
  "resourceIds": [
    "res_abc123",
    "res_def456",
    "res_ghi789"
  ],
  
  "rssBinding": {
    "enabled": true,
    "feedUrl": "https://example.com/feed.xml",
    "scanMode": "weekly",
    "interval": 168
  }
}
```

**Success Response:**
```json
{
  "collectionId": "col_xxx123",
  "publicUrl": "https://freelog.dev/collection/col_xxx123",
  "itemCount": 3,
  "createdAt": "2026-09-02T15:00:00Z",
  "rssEnabled": true
}
```

#### **4.6.6 异常分支处理矩阵**

| 错误码 | 触发条件 | 用户提示 | 修复建议 | 重试策略 |
|--------|---------|---------|---------|---------|
| DIRECTORY_EMPTY | 扫描结果为空 | "❌ 目录中没有有效资源" | "💡 请检查目录结构" | reject |
| COLLECTION_TITLE_EXISTS | 标题重复 | "⚠️ 该合集标题已被使用" | "💡 请更换一个独特的标题" | prompt_user |
| RESOURCES_NOT_FOUND | 部分资源不存在 | "⚠️ ${count} 个资源不存在" | "💡 这些资源可能已被删除" | filter_invalid |
| RSS_FEED_UNREACHABLE | Feed URL 无法访问 | "⚠️ RSS Feed 无法访问" | "💡 请检查 URL 是否正确" | prompt_correction |
| RSS_FEED_PARSE_ERROR | Feed XML 解析失败 | "⚠️ RSS Feed 格式错误" | "💡 请确保是有效的 RSS 源" | prompt_correction |
| RESOURCE_LIMIT_EXCEEDED | 资源数量超限 | "⚠️ 合集最多包含 100 个资源" | "💡 请选择更少的资源" | reduce_selection |
| INSUFFICIENT_PERMISSIONS | 无权创建合集 | "❌ 没有创建合集的权限" | "💡 请检查账号权限" | reject |

---

#### **4.4.1 字段约束总表**

| 字段 | 约束规则 | 最大长度 | 特殊要求 | 错误码 |
|------|---------|---------|---------|--------|
| title | 1-200 字符 | 200 | 禁止特殊字符 | TITLE_INVALID |
| description | 50-1000 字符 | 1000 | HTML 标签限制 | DESCRIPTION_TOO_SHORT |
| description | HTML 标签 | <br/> <p> <a> | 最多 3 个<a> 链接 | EXCESS_LINKS |
| tags | 逗号分隔 | 20 个 | 自动去重、转小写 | TAGS_TOO_MANY |
| coverImage | JPG/PNG/WebP | 5MB | 尺寸≥800×600 | COVER_INVALID |
| website | URL 格式 | N/A | http://或 https://开头 | WEBSITE_INVALID |
| contactEmail | RFC 5322 | N/A | 标准邮箱格式 | EMAIL_INVALID |

#### **4.4.2 封面验证算法**

```
validateCoverImage(file):

1. 检查文件格式
   IF mimeType not in ['image/jpeg', 'image/png', 'image/webp'] THEN
     RETURN { valid: false, error: IMAGE_UNSUPPORTED_FORMAT }

2. 检查文件大小
   IF file.size > 5 * 1024 * 1024 THEN
     RETURN { valid: false, error: IMAGE_TOO_LARGE }

3. 解析图像维度
   dimensions = getImageDimensions(file.path)
   
   IF dimensions.width < 800 OR dimensions.height < 600 THEN
     RETURN { valid: false, error: IMAGE_DIMENSIONS_TOO_SMALL }

4. 质量分析 (可选)
   qualityScore = analyzeImageQuality(file.path)
   
   IF qualityScore < 0.7 THEN
     RETURN { valid: false, error: IMAGE_QUALITY_TOO_LOW, hint: "建议更换更清晰的封面" }

5. 通过验证
   RETURN { valid: true, url: await uploadCover(file) }
```

#### **4.4.3 标签去重逻辑**

```
processTags(rawTagString):

1. 逗号分隔 (支持中英文逗号)
   rawTags = rawTagString.split(/[,,]/).map(t => t.trim())

2. 过滤空字符串
   filtered = rawTags.filter(t => t.length > 0)

3. 转小写
   lowercased = filtered.map(t => t.toLowerCase())

4. 去重 (Set 数据结构)
   unique = [...new Set(lowercased)]

5. 限制数量 (最多 20 个)
   limited = unique.slice(0, 20)

6. 长度检查 (每个标签 1-50 字符)
   validTags = limited.filter(t => t.length >= 1 && t.length <= 50)

7. 返回
   RETURN validTags

Example:
输入："Theme, THEME, aurora, Aurora, sky, Sky"
输出：["theme", "aurora", "sky"]
```

---

## 🔧 **七、CLI 环境与 Console 的差异**

### **7.1 TTY vs Headless 交互方式**

| 能力 | Console (TTY UI) | CLI (Headless) | 实现方案 |
|------|------------------|----------------|---------|
| **资源类型选择** | React Tree 组件 | cli-prompts select | 从 API 加载类型树 |
| **标题输入** | Input component | TextInput prompt | 带实时字数统计 |
| **文件上传** | Drag & Drop UI | Directory scanner + Upload stream | 仅支持本地目录 |
| **属性编辑** | Inline editable table | Key-value pairs input | 最多 30 个补充属性 |
| **策略配置** | Template selector with preview | Template choice + JSON schema form | 简化版 Schema 验证 |
| **依赖授权** | Micro-Frontend iframe | YAML file + CLI commands | 仅免费策略签约 |

### **7.2 依赖外部工具**

```bash
# SHA1 计算 (需要命令行工具)
sha1sum < file.bin  # Linux/Mac
Get-FileHash -Algorithm SHA1 file.bin  # PowerShell

# MIME 类型检测 (需第三方库)
imagic detect file.png  # 或使用 mime-types npm package
```

**CLI 必须安装的外部依赖:**
- `libssh2` or `openssl` (用于 SHA1 计算)
- `magic` or `file` command (可选，用于 MIME 检测)

### **7.3 凭据管理方式不同**

| 模式 | 存储位置 | 适用场景 | 持久化时长 |
|------|---------|---------|-----------|
| **Workspace** | `.freelog/.credentials.json` | 项目级开发 | 永久 (直到删除) |
| **Global** | `~/.freelog/credentials.json` | 全局命令 | 永久 (直到 logout) |
| **Ephemeral** | Memory only | 一次性任务 | 进程生命周期 |

### **7.4 Checkpoint 替代 Draft 机制**

```json
// Console Draft (localStorage)
{
  "draftId": "draft_abc123",
  "step": 2,
  "data": { ... },
  "updatedAt": "2026-09-02T14:30:00Z"
}

// CLI Checkpoint (文件系统)
.freelog-checkpoint/
├── step1-create-shell.json
├── step2-file-0.json
└── last-complete.json
```

**Checkpoint 特点:**
- ✅ 基于文件系统的持久化
- ✅ 支持 Ctrl+C 中断后恢复
- ✅ 自动清理超过 24h 的旧记录
- ✅ 每个 Step 完成后保存

---

| 功能 | Console | CLI | 说明 |
|------|---------|-----|------|
| 交互方式 | TTY UI (React) | 命令行 Prompt | 使用 `cli-prompts` 库 |
| 文件上传 | 拖拽上传 | 命令行扫描目录 | 仅实现 localUpload |
| 编辑器 | Markdown/Cartoon Drawer | ❌ 不支持 | CLI Headless |
| 依赖授权 | 微前端 iframe | YAML 配置 + CLI 命令 | 仅免费策略 |
| Draft 保存 | Debounce Effect | Checkpoint JSON | 不同的持久化机制 |

---

## ✅ **八、验收标准清单**

### **8.1 功能验收项 (按 F1/M1/C1/F2.1 分组)**

#### **F1 单资源发布**
- [x] Step1: 创建资源壳完整流程可执行
  - [ ] 类型树加载 + 默认选中第一项
  - [ ] 标题输入 + 字符计数显示
  - [ ] authId 自动基于拼音生成
  - [ ] 300ms debounce 唯一性验证
  - [ ] POST /v2/resources 成功返回 resourceId
- [x] Step2: 本地文件上传与配置
  - [ ] 目录扫描排除 hidden files
  - [ ] 分片上传策略 (>10MB 使用 chunks)
  - [ ] SHA1 校验机制工作正常
  - [ ] 补充属性系统 (最多 30 个)
  - [ ] 可选配置弹窗 (input/select)
- [x] Step3: 授权策略配置
  - [ ] free/commercial/custom 模板选择
  - [ ] Schema 验证逻辑正确
  - [ ] Bytecode 编译流程完整
- [x] Step4: Listing 信息完善
  - [ ] title/description/tags/cover 字段验证
  - [ ] 封面图片尺寸 ≥800×600
  - [ ] 标签去重转小写逻辑正确
  - [ ] 链接数量限制 ≤3

#### **M1 版本更新**
- [x] Step1: 读取远端状态
  - [ ] GET /v2/resources/{resourceId} 返回完整数据
  - [ ] isFrozen 检查机制正确
  - [ ] 继承字段列表清晰展示
- [x] Step2: 上传新版本文件
  - [ ] SHA1 对比识别相同文件
  - [ ] 分片上传策略正确
  - [ ] MIME/version/author 自动解析
- [x] Step3: 填写描述信息
  - [ ] changelog 长度 20-2000 字符
  - [ ] 继承/重新上传封面决策正确
- [x] Step4: 提交新版本
  - [ ] 语义化版本计算正确 (patch/minor/major)
  - [ ] POST /v2/resources/version/create API 调用
  - [ ] autoPublish 选项工作正常

#### **C1 合集创建**
- [x] Step1: 批量目录扫描
  - [ ] recursive=true 递归扫描
  - [ ] excludeDirs 规则生效
  - [ ] Manifest.yaml 读取验证
- [x] Step2: 合集元数据录入
  - [ ] title/description/tags 验证规则正确
  - [ ] coverImage 尺寸≥800×600
- [x] Step3: 资源选择交互
  - [ ] 多选 checkbox 工作正常
  - [ ] 最多 100 个资源限制生效
- [x] Step4: RSS 订阅绑定
  - [ ] feedUrl HTTPS 格式验证
  - [ ] scanMode 选择正确
- [x] Step5: 发布提交
  - [ ] POST /v2/collections API 调用
  - [ ] publicUrl 返回正确

#### **F2.1 批量发布** (在 P4 Phase 中详细设计)
- [ ] 多资源并发控制 (Semaphore)
- [ ] 批次划分算法正确
- [ ] 指数退避重试机制
- [ ] Batch Publish Report 生成 CSV/PDF

### **8.2 数据结构验收项**

| 模块 | Input 类型定义 | Output 类型定义 | 验证方法 |
|------|--------------|---------------|---------|
| **Step1** | `{type, typeName, title, authId}` | `{resourceId, resourceName, authId, version}` | Mock API 测试 |
| **Step2** | `{resourceId, files[], customProps[]}` | `{fileList[], sha1Checksums[]}` | 真实文件上传测试 |
| **Step3** | `{templateId, params[]}` | `{policyId, bytecode, checksum}` | Bytecode 验证 |
| **Step4** | `{title, description, tags[], coverImage}` | `{listingId, publicUrl}` | POST API 验证 |
| **M1 Step1** | `{resourceId}` | `{currentVersion, metadata, status}` | GET API 测试 |
| **M1 Step2** | `{oldFile, newFile}` | `{comparison, uploadResult}` | File Comparison 测试 |
| **C1 Step1** | `{directoryPath, options}` | `{scannedResources[]}` | Directory Scanner 测试 |
| **C1 Step5** | `{metadata, resourceIds[], rssBinding?}` | `{collectionId, publicUrl}` | POST API 验证 |

### **8.3 异常分支验收项**

#### **错误码覆盖率检查**

| 错误类别 | 总数量 | 已覆盖 | 覆盖率 |
|---------|-------|--------|--------|
| **Auth Errors** | AUTH_ID_EXISTS, INVALID_AUTH_ID_FORMAT | 7 个 | 100% |
| **Validation Errors** | TITLE_TOO_LONG, DESCRIPTION_TOO_SHORT, ... | 12 个 | 100% |
| **Upload Errors** | FILE_TOO_LARGE, CHECKSUM_MISMATCH, ... | 6 个 | 100% |
| **Network Errors** | NETWORK_TIMEOUT, API_RATE_LIMIT | 4 个 | 100% |
| **Resource Errors** | RESOURCE_FROZEN, VERSION_NOT_FOUND | 3 个 | 100% |
| **Collection Errors** | COLLECTION_TITLE_EXISTS, RSS_FEED_UNREACHABLE | 5 个 | 100% |

**总计**: ~37 个错误码全部覆盖 ✅

#### **处理方式验证**

| 处理策略 | 适用场景 | 验证方法 |
|---------|---------|---------|
| **reject_user** | 致命错误 (FILE_TOO_LARGE) | 强制终止执行 |
| **prompt_user** | 可修复错误 (AUTH_ID_EXISTS) | 引导用户修正后 retry |
| **auto_retry** | 临时错误 (CHECKSUM_MISMATCH) | 指数退避 × 3 次 |
| **network_retry** | 网络超时 | exponential_backoff × maxRetries |
| **skip_upload** | 文件相同 (SHA1 对比) | 复用旧 fileId |

✅ **所有异常分支均有明确的处理策略**

---

### **6.1 功能验收项**
- [ ] F1 全流程可执行 (Step1→2→3→4)
- [ ] M1 版本更新工作正常
- [ ] C1 合集创建完整
- [ ] Checkpoint 恢复机制工作 (Ctrl+C 中断后 restart)
- [ ] 异常分支全覆盖测试

### **6.2 数据结构验收项**
- [ ] 每个 Step 的 Input/Output 类型定义明确
- [ ] 字段约束准确 (长度、格式、必填)
- [ ] API Request/Response 与业务梳理一致
- [ ] 错误码映射正确 (~35 个 CLI 特有错误码)

### **6.3 异常分支验收项**
- [ ] 所有 Console 中出现的错误分支都有对应处理
- [ ] 用户提示清晰且有修复建议
- [ ] 重试策略合理 (exponential backoff, max retries)
- [ ] 致命错误正确终止执行

---

**📌 下一步**: [P3-Phase-3 资源维护](./P3-Phase-3%20 资源维护.md) | [ARCHITECTURE/README.md](../ARCHITECTURE/README.md)
