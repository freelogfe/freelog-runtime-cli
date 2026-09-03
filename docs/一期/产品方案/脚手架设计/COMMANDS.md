# CLI 命令设计体系

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **定位**: 定义 CLI 暴露给用户的命令接口、参数规范、交互流程  
> **关系**: PHASE 产品设计层通过调用这些命令来实现业务场景

---

## 📋 **核心命令列表**

### **发布类命令**

| 命令 | 功能描述 | 复用 PHASE |
|------|---------|-----------|
| `freelog publish` | 单资源发布主命令 | F0-SingleResourcePublish |
| `freelog update` | 版本更新命令 | M0-VersionUpdate |
| `freolog batch-publish` | 批量发布命令 | H0-BatchResourcePublish |

### **合集类命令**

| 命令 | 功能描述 | 复用 PHASE |
|------|---------|-----------|
| `freelog collection create` | 新建合集 | C0-CollectionCreation |
| `freelog collection add` | 添加条目到合集 | C0-CollectionCreation |

### **工具类命令**

| 命令 | 功能描述 | 复用模块 |
|------|---------|---------|
| `freelog build` | 压缩打包工具 | FRAMEWORK(压缩打包) |
| `freelog template init` | 模板初始化 | ARCHITECTURE(模板创建) |

---

## 🔧 **详细命令设计**

### **命令 1: `freelog publish`**

#### **1.1 Command Interface**

```bash
freelog publish <directory> [options]
```

#### **1.2 Parameters**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `<directory>` | string | ✅ Yes | - | 要发布的目录路径 |
| `--type <code>` | string | ✅ Yes | - | 资源类型代码（如 theme, plugin） |
| `--title <text>` | string | ✅ Yes | - | 资源标题（≤100 字符） |
| `--auth-id <id>` | string | ❌ No | auto-generated | 授权标识（30-100 字符） |
| `--name <text>` | string | ❌ No | auto from filename | 资源名称（≤60 字符） |
| `--file <path>` | string | ❌ No | auto compress | 预压缩包路径（跳过 build 步骤） |
| `--policy <id>` | string | ❌ No | auto-select default | 策略模板 ID |
| `--intro <text>` | string | ❌ No | "" | 介绍文字（≤200 字符） |
| `--description <text>` | string | ❌ No | "" | 简短描述（≤200 字符） |
| `--labels <tag1,tag2>` | array | ❌ No | [] | 标签列表（最多 20 个） |
| `--custom-props <k:v,...>` | array | ❌ No | [] | 补充属性（最多 30 项） |
| `--no-checkpoint` | flag | ❌ No | false | 禁用 Checkpoint 断点续传 |
| `--force` | flag | ❌ No | false | 跳过确认直接提交 |

#### **1.3 TTY Interactive Flow**

```bash
$ freelog publish ./my-theme

▶ Step 1: 基础信息
  资源类型：[主题▼] ← User selects from dropdown
  资源标题：星空之美主题 ← User enters text
  授权 ID: xingkongzhimei-theme-abc123 ← Auto-generated or manual input
  资源名称：星空之美 ← Optional input
  
  [下一步] ENTER | [取消] ESC

▶ Step 2: 资源包处理
  📦 压缩中... → artifact.zip
    Size: 5.4MB | SHA1: a1b2c3d...e4f5g
    
  ⚙️ 系统属性解析:
    ✓ version: 1.0.0
    ✓ author: liu-kai-github
    
  ☑ 补充属性配置:
    [+] custom_key = custom_value
    
  ⬆️ 上传进度条 ████████░░░░ 65%
  
  [上一步] B | [下一步] N

▶ Step 3: 策略配置 [可选]
  ✓ free-open-source (免费开源协议)
  
  [保持] K | [更换] C | [跳过] S

▶ Step 4: Listing 完善
  介绍文字：一款极光效果的主题 ✨
  简短描述：支持动态极光动画
  标签：theme aurora dynamic
  
  [上一步] B | [确认提交] C

✔ 资源发布成功！
  Resource ID: xingkongzhimei-theme-abc123
  View in dashboard: https://console.freelog.dev/resource/xxx
```

#### **1.4 Validation Rules**

| Field | Rule | Error Code | User Message |
|-------|------|------------|--------------|
| type | Regex `^[a-z][a-z0-9_\-]*$` | ERR_INVALID_TYPE | "无效的资源类型" |
| title | Max 100 chars | ERR_TITLE_TOO_LONG | "标题长度不能超过 100 字符" |
| authId | Min 30 chars, alphanumeric+hyphen | ERR_AUTH_ID_LENGTH | "授权标识长度需在 30-100 字符之间" |
| authId | Must be unique | ERR_DUPLICATE_AUTH_ID | "该标识已被其他用户使用" |
| file | Max 100MB | ERR_FILE_TOO_LARGE | "文件大小超过 100MB 限制" |
| intro | Max 200 chars | ERR_INTRO_TOO_LONG | "介绍文字不超过 200 个字符" |
| labels | Max 20 items, dedup first | ERR_TOO_MANY_TAGS | "最多支持 20 个标签" |

#### **1.5 Implementation Details**

**AuthId Generation Algorithm**:
```
1. Extract pinyin from title (if Chinese)
2. Sanitize: remove non-alphanumeric characters except hyphen
3. Append: `-typeCode-timestamp(random)-hexRandom(5chars)`
4. Enforce min length ≥30 by padding if necessary
5. Debounced API check (300ms delay) for uniqueness
```

**Checkpoint Save Points**:
- SP1: After Step1 complete → `{resourceTypeCode, title, authId}`
- SP2: After Step2 upload → `{fileSha1, fileSize, uploadUrl}`
- SP3: After Step3 policy select → `{selectedPolicyId}`
- SP4: After Step4 submit → `{finalResourceId}`

**Recovery Logic**:
```
On startup:
  IF checkpoints exist THEN
    Show recovery prompt: "发现未完成的发布任务，是否恢复？(Y/n/c)"
    
    IF user selects Y THEN
      Restore last checkpoint state
      Jump to next step
    ELSE IF user selects c THEN
      Delete checkpoint and exit
    END IF
  END IF
```

#### **1.6 Exit Codes**

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User cancelled |
| 2 | Validation error |
| 3 | Network/API failure |
| 4 | Checkpoint corrupted |

---

### **命令 2: `freelog update`**

#### **2.1 Command Interface**

```bash
freelog update <resourceId> [options]
```

#### **2.2 Key Features**

- **同文件升版**: `--reuse-version` flag 复用已发版的 fileSha1
- **继承逻辑**: 自动继承 latestVersion 的描述、属性、依赖
- **版本计算**: 建议 patch+1 (如 1.0.0 → 1.0.1)

#### **2.3 Interaction Flow**

```bash
$ freelog update my-theme-v2 --reuse-version

▶ Loading latest version info...
  Current: v1.0.0 (fileSha1: abc123...)
  
  Inherited fields:
    ✓ description: "一款极光效果的主题"
    ✓ dependencies: [...automatically inherited...]
    ✓ inputAttrs: {...}

▶ Enter new version number: 1.0.1
▶ Enter new file path: ./dist/theme.zip
▶ Verify fileSha1 matches previous upload? YES/NO

✔ Version 1.0.1 published successfully!
```

---

### **命令 3: `freelog collection create`**

#### **3.1 Command Interface**

```bash
freelog collection create [options]
```

#### **3.2 Options**

| Flag | Required | Description |
|------|----------|-------------|
| `--name <text>` | ✅ Yes | 合集名称 |
| `--items <id1,id2,...>` | ✅ Yes | 资源 ID 列表（分批提交，单次最多 100 个） |
| `--display-name <text>` | ❌ No | 展示名称 |
| `--description <text>` | ❌ No | 合集描述 |

#### **3.3 Directory Fingerprint Mechanism**

```
Local fingerprint = computeSHA1(current_draft_catalogue_files)
Platform fingerprint = queryPlatformCatalogueFingerprint(collectionId)

IF local_fingerprint == platform_fingerprint THEN
  merge_flag = 0  # No directory changes
ELSE
  merge_flag = 1  # Merge directory changes
END IF
```

---

## 🔗 **与 PHASE 的关系**

```
┌──────────────────────────────────────┐
│  PHASE (F0/M0/C0/H0)                  │
│   ─────────────────                    │
│   业务流程编排                         │
│   ↓                                    │
│   调用命令完成各 Step                 │
└──────────────────────────────────────┘
              ↓ 黑盒调用
┌──────────────────────────────────────┐
│  COMMAND DESIGN (本文档)              │
│   ───────────────────                  │
│   命令接口规范 + 参数约束             │
│   TTY 交互流程                         │
│   异常处理和错误码映射                │
└──────────────────────────────────────┘
              ↓ 内部实现
┌──────────────────────────────────────┐
│  FRAMEWORK / REUSE                     │
│   ──────────────────                   │
│   压缩打包工具                        │
│   文件上传服务 G2                      │
│   Checkpoint 断点续传 G3                │
│   Policy 策略编译系统                   │
└──────────────────────────────────────┘
```

**关键原则**:
- ✅ PHASE **只声明**调用哪个命令，用什么参数
- ✅ PHASE **不展开**命令内部的实现细节
- ✅ COMMAND DESIGN **完整定义**接口契约和交互规范
- ✅ COMMAND DESIGN **指导**开发者实现命令

---

## 📝 **扩展新命令的指南**

当你需要添加新命令时，请遵循此模板：

1. **Command Interface**: `freelog <command> [args] [options]`
2. **Parameters Table**: 列出所有 flags 和 requirements
3. **TTY Flow Diagram**: ASCII art 展示交互过程
4. **Validation Rules**: 字段约束表和错误码
5. **Implementation Notes**: 关键算法或逻辑说明
6. **Exit Codes**: 可能的退出码含义
7. **Cross References**: 关联的 PHASE 文档

---

**文档统计**: ~500+ lines  
**维护者**: CLI Design Team  
**对齐版本**: Console CLI Integration Specification
