# M0 - 版本更新完整流程设计

> **版本**: v1.0 | **最后更新**: 2026-09-03  
> **对齐业务梳理**: P0-M0-VersionUpdate.md + Console creator/StepUpdate.tsx  
> **关键发现**: reuse-version复用文件、继承资源策略模板选择

---

## 📋 **一、功能需求清单**

| 功能 ID | 功能名称 | 功能描述 | 复用模块 | 来源 |
|--------|---------|---------|---------|------|
| M0-F1 | 资源识别与绑定 | 通过 resourceId 或 scan 当前目录 | - | P0-M0 |
| M0-F2 | 版本继承逻辑 | 复用 latestVersion 的文件/描述/属性/依赖 | FRAMEWORK | P0-M0 |
| M0-F3 | 新版本号建议 | patch + 1 (维护期) 或指定 SemVer | - | P0-M0 |
| M0-F4 | 同文件升版 | --reuse-version 复用已发版 fileSha1/filename | - | Console L150 |
| M0-F5 | 部分字段可维护 | description/inputAttrs 可更新 | - | Platform API |
| M0-F6 | 封面上传 | version edit 不允许修改 videoCover | CLIONLY | DESIGN.md |
| M0-F7 | Checkpoint 恢复 | Ctrl+C中断后恢复更新进度 | G3-CHECKPOINT | 全局 |

---

## 🔄 **二、Step 编排流程**

```
[开始 freelog version update] 
        ↓ checkpoint.init()
     [Step1: 识别资源并加载状态]
        ├─ 读取 local resourceId (from state.json)
        ├─ 验证 owner 一致性
        └─ 查询 platform latestVersion
        ↓ checkpoint.save(step=1)
     [Step2: 版本继承决策]
        ├─ 继承 latestVersion 的文件/描述/属性/依赖
        ├─ 用户确认或手动修改
        └─ 决定新版本号 (patch+1 or explicit)
        ↓ checkpoint.save(step=2)
     [Step3: 准备新版本文件][可选分支]
        ├─ 同文件升版 (--reuse-version)
        │   → 复用 existing fileSha1/filename
        └─ 新文件发布
            → 调用 FRAMEWORK 压缩工具 → G2-UPLOAD
        ↓ checkpoint.save(step=3) OR skip if reuse
     [Step4: 完善信息并发布]
        ├─ 修改 description/inputAttrs
        ├─ 更新策略（新增/启停）
        └─ PUT /v2/resources/{id}/versions
        ↓ checkpoint.save(step=4)
    [成功 ✔ → Dashboard]
```

---

## 📊 **三、每个 Step 的详细设计**

### **Step1: 识别资源并加载状态**

#### **TTY Interactive Flow (ASCII Diagram)**

```bash
$ freelog version update

┌─ Step1/4: 识别资源 ───────────────────┐
│                                        │
│ ▶ 自动检测当前工程                     │
│   ResourceID: FL-20231015-abc123       │
│   Owner: liu-kai-github                │
│   Latest Version: 1.0.0                │
│                                        │
│ ⚙️ 平台状态同步                        │
│   ✓ Checking platform status...        │
│   ✓ Online versions: 3                 │
│   ✓ Frozen status: false               │
│   ✓ Policies: 1 active                 │
│                                        │
│ [下一步] ENTER | [取消手动 ID] C         │
└────────────────────────────────────────┘
```

#### **业务规则伪代码**

```
IF CLI provides --resource-id flag THEN
  resourceId = CLI_resource_id
  
  # 验证绑定关系
  state = loadStateFromFile(resourceId)
  
  IF state.owner.userId != currentLoginUserId THEN
    throwError(ERR_OWNER_MISMATCH, "当前登录账号不是该资源的所有者")
  END IF
  
ELSE IF cwd contains .freelog/state.json THEN
  # 自动从本地 state 读取
  state = loadStateFromCurrentProject()
  resourceId = state.resourceId
  
  confirmResource(state)
  
ELSE
  promptUserForManualResourceId()
END IF

# 查询平台最新状态
platform_status = queryPlatformResource(resourceId)

IF platform_status.frozen THEN
  showWarning("资源已被冻结，需 Console 解冻后操作")
  exitCode = ERR_RESOURCE_FROZEN
END IF

IF platform_status.online_versions.isEmpty THEN
  # 首次升级，不存在 latestVersion
  inherit_from = null
ELSE
  latest_version = platform_status.latestVersion
  
  # 检查是否有同文件升版的需求
  IF CLI provides --reuse-version flag THEN
    checkSameFileUpgradeConsistency(latest_version)
  END IF
END IF
```

---

### **Step2: 版本继承决策**

#### **TTY Interactive Flow**

```bash
┌─ Step2/4: 版本继承决策 ──────────────┐
│                                       │
│ ▼ 继承选项                            │
│                                       │
│ ├── 继承 latestVersion 的内容            │
│ │   ✓ File: index.zip (SHA1: a1b2c...)  │
│ │   ✓ Description: 星空之美主题 v1.0.0  │
│ │   ✓ Attributes: {version: 1.0.0}      │
│ │   ✓ Dependencies: theme-base@^2.0.0 │
│ │   ✓ Policy: free-open-source          │
│ │                                   │
│ ├── 修改版本号为                      │
│ │   [1.0.1▼]  (建议值：latest.patch+1)│
│ │                                     │
│ └── 自定义版本号                     │
│     [输入：_______]                  │
│                                       │
│ ⚠️ 提示：同文件升版将复用现有文件      │
│ [下一步] ENTER | [跳过修改] N          │
└───────────────────────────────────────┘
```

#### **关键业务规则**

```
# 继承逻辑 (来自 DESIGN.md §Version Prep Defaults)
inherit_from_latest = true

IF inherit_from_latest THEN
  inherited_fields = {
    fileSha1: latest.fileSha1,
    filename: latest.filename,
    description: latest.description,
    inputAttrs: filterByDescriptor(latest.attrs),
    dependencies: latest.dependencies,
    baseUpcastResources: latest.baseResources,
    authExcludedItems: latest.authExclusions
  }
  
  displayInheritedFields(inherited_fields)
  
  user_override = promptUserForManualOverride()
  
  final_fields = merge(inherited_fields, user_override)
  
  # 过滤无效字段
  final_attrs = filterAttrsByPlatformDescriptor(final_attrs)
END IF

# 版本号计算
IF CLI provides --version flag THEN
  new_version = CLI_version
  validateSemVer(new_version)
ELSIF user_input_exists THEN
  new_version = user_input
ELSE
  # 建议值 = latest.patch + 1
  base_parts = split(latest_version, '.')
  patch = parseInt(base_parts[2]) + 1
  suggested_version = `${base_parts[0]}.${base_parts[1]}.${patch}`
  
  promptUser(`建议使用版本号：[${suggested_version}]`)
  new_version = getUserChoice(suggested_version)
END IF
```

---

### **Step3: 准备新版本文件**

#### **核心逻辑 If-then-else**

```
# 场景 A: 同文件升版 (--reuse-version)
IF CLI provides --reuse-version flag OR user_selects_reuse THEN
  showInfo("同文件升版：复用已发版的文件身份")
  
  reuse_fileSha1 = latest.fileSha1
  reuse_filename = latest.filename
  
  # 只变更其他字段 (deps/description/attrs/policy)
  new_version_payload = {
    version: new_version,
    fileSha1: reuse_fileSha1,  # same as latest
    filename: reuse_filename,  # same as latest
    description: updated_description,
    inputAttrs: updated_attrs,
    dependencies: updated_deps,
    policyId: selected_policy.id
  }
  
  goToFinalSubmit(new_version_payload)
  
# 场景 B: 新文件发布 (正常流程)
ELSE
  # 调用框架压缩工具
  compress_result = FRAMEWORK.compressDirectory(dir_path)
  
  # 上传到新文件
  upload_result = G2.upload({
    filePath: compress_result.path,
    sha1: compress_result.sha1,
    mode: detectUploadMode(compress_result.size)
  })
  
  new_version_payload = {
    version: new_version,
    fileSha1: upload_result.sha1,
    filename: upload_result.filename,
    ...updated_fields
  }
  
  goToFinalSubmit(new_version_payload)
END IF
```

**说明**:
- 代码块使用 If-then-else 伪代码表示
- 不使用真实语言语法（如 `?.` 操作符、解构等）

---

### **Step4: 完善信息并发布**

#### **异常处理矩阵**

| Step | 错误场景 | Error Code | 用户友好消息 | Recovery Action |
|------|---------|------------|-------------|-----------------|
| **Step1** | Resource Not Bound | ERR_NOT_BOUND | "当前目录未绑定任何平台资源" | Run freelog init bind first |
| | Owner Mismatch | ERR_OWNER_MISMATCH | "当前登录账号不是资源所有者" | Switch to correct account |
| | Resource Frozen | ERR_RESOURCE_FROZEN | "资源已被冻结，需 Console 解冻" | n/a |
| **Step2** | Invalid Version Format | ERR_INVALID_SEMVER | "版本号格式不正确 (需符合 SemVer)" | Enter valid version |
| **Step3** | No File Changes | ERR_NO_CHANGES | "检测到与上一版本完全相同" | Confirm no-op or cancel |
| **Step4** | Platform Update Failed | 400/500 | "版本更新失败：{error.message}" | Fix and retry |

---

## 🧪 **四、验收测试用例**

| Case ID | 测试场景 | 预期结果 | 对应 Step |
|---------|---------|---------|---------|
| M0-T1 | 同文件升版复用文件 | fileSha1不变，仅更新 attrs/deps | Step3-A |
| M0-T2 | 新版本文本覆盖继承值 | 手动输入优先级高于继承 | Step2 |
| M0-T3 | 跨 major 版本升级 | SemVer 校验通过 | Step2 |
| M0-T4 | 冻结资源拒绝更新 | exit code ERR_RESOURCE_FROZEN | Step1 |

---

## 🔗 **五、交叉引用**

- **被 ARCHITECTURE 引用**: FRAMEWORK.versionManagement
- **PHASE/F0 复用**: Step3 策略选择逻辑
- **对齐 Console**: versionCreator/StepUpdate.tsx L100-L200

---

**📌 使用说明**: 本文档指导开发者实现版本更新功能，需与设计原则中的"继承 latestVersion 文件"规则对齐。
