# Freelog Runtime CLI 产品设计修订总结

> **生成时间**: 2026-09-02  
> **依据**: 80+ 实际场景演练分析（A-G 组）  
> **目标**: 明确产品方案（02/04/05/06）需要修改的具体位置和内容

---

## 🚨 一、P0 级问题（必须立即修复）

### 1. Owner 字段缺失导致身份确认不完整

**问题描述**: 
- A01/A02/A05 等多个场景发现，CLI 启动时未展示资源 owner 信息
- owner 不一致时的处理逻辑模糊
- 只读命令是否豁免 owner 检查未定义

**影响范围**: 所有涉及远端写入的命令

**修订建议**:

#### 在 04-CLI 流程与命令设计中补充：

```markdown
## X. 环境与身份确认规则

### 启动时必须展示的信息
无论什么命令，首次接触远端数据前必须展示：
- 当前登录账号：username (ID: xxx)
- 环境：dev/test/production
- 资源 owner（如已知）：owner_username (ID: yyy)
- owner 是否一致：✓ 一致 / ✗ 不一致

### Owner 校验策略
| 命令类型 | owner 校验要求 | 处理方式 |
|---------|--------------|---------|
| 写命令（publish/update/policy 等） | 必须严格校验 | owner 不一致 → 阻止所有操作 |
| 只读命令（status/diff/pull） | 可选校验 | 警告但不阻止，给 Console 链接 |
| 创建类命令（create/template） | 无需校验 | 不涉及已有资源 |
```

#### 在 05-场景异常与验收方案中补充：

```markdown
| 异常 | 处理规则 |
|------|---------|
| owner 不一致 | 显示双方 ID，提示切换账号或联系授权，记录到 report |
```

---

### 2. AUTH_REQUIRED 结构化错误未定义

**问题描述**: 
- A03 CI 模式无凭据场景发现，缺 AUTH_REQUIRED 的错误格式
- exitCode 标准不统一

**影响范围**: AI/CI 自动化发布

**修订建议**:

#### 在 05-场景异常与验收方案中补充：

```markdown
## 字段异常 - 认证相关

| 字段 | 异常 | JSON 输出格式 |
|------|------|-------------|
| 认证凭据 | 缺 FREELOG_TOKEN | ```json<br>{<br>  "code": 401,<br>  "message": "AUTH_REQUIRED",<br>  "details": {<br>    "required_fields": ["FREELOG_TOKEN"],<br>    "hint": "请在环境变量中设置"<br>  }<br} ``` |
```

#### 在 06-实现解决方案中补充：

```markdown
## 错误码规范

| Code | 含义 | 适用场景 |
|------|------|---------|
| 401 | AUTH_REQUIRED | 未登录/token 过期 |
| 403 | OWNER_MISMATCH | 账号与 owner 不一致 |
| 400 | ENV_NOT_SPECIFIED | 未指定--env |
| ... | ... | ... |
```

---

### 3. Checkpoint 数据结构过于抽象

**问题描述**: 
- L02 会话中断恢复场景发现，Checkpoint 的完整性不足
- localState vs remoteIds 边界不清晰
- accountId 变更后的处理逻辑缺失

**影响范围**: 所有长会话场景

**修订建议**:

#### 在 06-实现解决方案.md 中替换现有 Checkpoint 定义：

```markdown
### 4.X 会话恢复（Checkpoint 机制）完整版

interface Checkpoint {
  // ===== 元数据 =====
  version: "1.0";                    // Checkpoint 格式版本（唯一）
  runId: string;                     // UUID，全局唯一标识
  createdAt: number;                 // Unix 时间戳
  updatedAt: number;                 // 最后更新时间
  
  // ===== 身份上下文 =====
  command: 'publish' | 'update';     // 原命令
  env: 'dev' | 'test' | 'prod';      // 运行环境
  accountId: string;                 // 登录账号 ID（必须！）
  username?: string;                 // 用户名
  ownerId?: string;                  // 资源 owner（如已知）
  
  // ===== 会话状态 =====
  currentStep: string;               // 当前步骤名
  completedSteps: string[];          // 已完成步骤列表
  cancelledByUser?: boolean;         // 用户主动取消标记
  
  // ===== 临时字段（内存中维护，未写远的）=====
  localState: {
    // Step1: 类型选择
    resourceTypeCode?: string;
    resourceTypeName?: string;
    
    // Step2: 内容来源
    inputPath?: string;              // 本地文件/目录路径
    artifactSha1?: string;           // 已有压缩包 sha1
    
    // Step3: 资源壳
    resourceTitle?: string;
    resourceName?: string;
    
    // Step4: 版本信息
    version?: string;
    description?: string;            // 版本描述
    inputAttrs?: Array<{key: string; value: string}>;
    customProperties?: Array<{key: string; value: string}>;
    
    // Step5: 策略
    selectedPolicyTemplate?: string;
    policyArgs?: Record<string, unknown>;
    compiledPolicyCode?: string;
    
    // Step6: Listing
    coverImagePath?: string;
    coverImageUrl?: string;
    tags?: string[];
    intro?: string;
    
    // Step7: 上架
    wantOnline?: boolean;
    
    // 其他...（根据实际场景扩展）
  };
  
  // ===== 远端事实（已写入平台的）=====
  remoteIds?: {
    resourceId?: string;             // 资源 ID
    versionId?: string;              // 版本 ID
    fileSha1?: string;               // 文件 SHA1
    policyId?: string;               // 策略 ID
  };
  
  // ===== 风险标记 =====
  unknownWrites?: boolean;           // 远端写入结果未知（网络中断）
  needRemoteProbe?: boolean;         // resume 前需要先查远端
}
```

**关键规则新增**:

1. **accountId 强制校验**: resume 时比对 checkpoint.accountId === currentAccountId
   - 一致：允许恢复
   - 不一致：给出提示但允许强制恢复（用户负责风险）

2. **localState 优先于内存**: 进程退出前强制落盘 localState，重启时优先读取

3. **remoteIds 用于验证**: resume 时对 remoteIds 调用远端接口确认是否存在

4. **checkpoint 生命周期**:
   ```typescript
   on('SIGINT') => saveCheckpoint({ cancelledByUser: true })
   on('success') => deleteCheckpoint()
   on('init') => detectCheckpoint() && askRestore()
   ```

---

### 4. RSS matchedItemCount >1000 的处理逻辑模糊

**问题描述**: 
- E06 RSS 绑定场景发现，1000 限制的触发条件和筛选逻辑不明确

**影响范围**: 所有 RSS 绑定流程

**修订建议**:

#### 在 02-Console 业务流程字段接口.md 中补充：

```markdown
### FORM-RSS-LIMIT · 单集数量限制

| 属性 | 值 |
|------|----|
| 阈值 | `PODCAST_RSS_EPISODE_LIMIT = 1000` |
| 触发条件 | `matchedItemCount > 1000` |
| 强制动作 | 进入日期范围筛选器 |
| 结束时间默认值 | 今日 23:59:59 |
| CLI 拦截策略 | CLI 前端拒绝直接绑定，必须先选日期范围 |

**UI 交互规则**:
1. 用户输入 feedUrl
2. CLI 调用 `Rss.bindingsPreview(feedUrl)`
3. 返回 matchedItemCount > 1000
4. 弹出日期范围选择器：[开始日期] [结束日期]
5. 结束日期默认今日，不可选未来
6. 用户确认后重新查询预览
7. matchedItemCount ≤ 1000 → 继续绑定流程
8. 仍 >1000 → 循环步骤 4

**JSON 输出**:
{
  "error": "RSS_EPISODE_LIMIT_EXCEEDED",
  "code": 4,
  "details": {
    "matchedItemCount": 1250,
    "limit": 1000,
    "hint": "请指定日期范围筛选",
    "resumePath": "rss_date_range_selection"
  }
}
```

---

### 5. GUID 对比阈值量化不足

**问题描述**: 
- E08 RSS GUID 大面积不匹配场景发现，没有明确的"大面积"定义

**影响范围**: RSS 地址更新流程

**修订建议**:

#### 在 02-字段接口.md 中补充：

```markdown
### FORM-RSS-GUID · GUID 差异确认

**计算逻辑**:
```
diffCount = max(oldFeedItemCount, newFeedItemCount) - guidMatchedCount
percentage = diffCount / max(oldFeedItemCount, newFeedItemCount) * 100
```

**阈值定义**:
| percentage | UI 行为 | CLI 行为 |
|-----------|--------|---------|
| < 10% | 提示但不阻断 | 直接继续 |
| 10%-50% | 弹窗警告 | 询问确认 |
| ≥50% | 必须二次确认 | 必须显式 flag (--force-rss-update) |

**CLI 输出示例**:
⚠️ GUID 差异率：62.5% (750/1200)

预计影响:
• 750 个条目：作为全新单集发布
• 450 个条目：更新现有条目

[确认导入] [取消] [查看详情 --show-guid-diff]
```

---

## ⚠️ 二、P1 级问题（建议优化）

### 1. 内容来源入口不完整

**问题描述**: B 组场景发现，缺少"平台存储对象复用"选项

**修订建议**:

#### 在 04-CLI 流程与命令设计中补充：

```markdown
## B.3 内容来源选择完整列表

选定资源类型后，提供以下入口：

1. 使用已有单文件
   └─ 本地文件上传

2. 使用现有本地工程
   └─ 识别 template/manifest → build/compress

3. 从模板创建新工程
   └─ create theme/plugin → 本地工程

4. 已有压缩包/artifact
   └─ .freelog-artifacts/扫描

5. **已有平台存储对象 ← 新增！**
   └─ Storage.batchObjectList → 选择已上传文件

6. **Markdown/漫画编辑器草稿 ← 对齐 Console**
   └─ Resource.lookDraft → 加载平台草稿
```

---

### 2. 策略模板为空时的降级方案

**问题描述**: C13 场景发现，无可用模板时的处理逻辑缺失

**修订建议**:

#### 在 04-CLI 流程与命令设计中补充：

```markdown
## H. 策略模板为空的处理

**检测时机**:
- 资源类型确定后
- 拉取 Policy.policyTemplates(resourceTypeCodes)
- 返回空数组时触发

**处理流程**:

### TTY 模式
```text
⚠️ 暂无可用策略模板

当前类型暂未配置策略模板，您可以：

A) 跳过此步，后续手动添加
B) 使用通用策略（如有）
C) 前往 Console 配置模板 → freelog console

[继续跳过] [查看通用策略] [打开 Console]
```

### AI/CI 模式
```json
{
  "warning": "POLICY_TEMPLATE_EMPTY",
  "details": {
    "resourceTypeCode": "media/audio",
    "message": "平台暂未配置策略模板",
    "hint": "可通过 freelog policy add --manual 添加手写策略"
  }
}
```

**重要规则**:
- 不允许跳过策略就上架
- 可以给 Console 接力链接
```

---

### 3. 批量报告粒度不够

**问题描述**: F05 场景发现，每项资源的独立状态定义不足

**修订建议**:

#### 在 05-场景异常与验收方案中补充：

```markdown
## 批量报告的逐项状态定义

每个资源项必须有独立的生命周期状态：

| 状态 | 含义 | 可执行操作 |
|------|------|-----------|
| planned | 已规划，未开始 | skip/cancel |
| scanning | 扫描中 | cancel |
| uploaded | 文件已上传 | retry_failed_upload |
| resource_created | 资源壳已创建 | check_remote_resource |
| version_created | 版本已创建 | verify_version |
| policy_saved | 策略已保存 | check_policy_status |
| listing_updated | listing 已更新 | preview_listing_diff |
| online_updated | 上下架已更新 | verify_online_status |
| succeeded | 整批成功 | — |
| failed | 整批失败 | retry_single/ignore |
| skipped | 被跳过 | review_reason/unskip |
| unknown | 结果未知 | probe_remote |

**Report JSON 结构**:
{
  "runId": "batch_abc123",
  "totalItems": 10,
  "items": [
    {
      "index": 0,
      "sourcePath": "./image1.jpg",
      "state": "succeeded",
      "timestamps": {...},
      "result": {
        "resourceId": "res_xxx",
        "versionId": "ver_yyy",
        "policyId": "pol_zzz"
      },
      "errors": null
    },
    {
      "index": 1,
      "sourcePath": "./image2.jpg",
      "state": "failed",
      "reason": "DUPLICATE_NAME",
      "errorDetails": {
        "existingResource": {
          "resourceName": "user/x/image2",
          "resourceId": "res_existing"
        }
      },
      "hint": "freelog update res_existing --reuse-version"
    }
  ]
}
```

---

### 4. 封面上传失败恢复路径

**问题描述**: C10 场景发现，uploadImage 失败后的 recovery 不明确

**修订建议**:

#### 在 05-场景异常与验收方案中补充：

```markdown
| 异常 | 发生位置 | 恢复规则 |
|------|---------|---------|
| 上传失败 | Storage.uploadImage | 保留本地副本，允许重试；若多次失败则允许换文件或换 URL |
| 格式不符 | 本地校验阶段 | 提示支持的格式（JPEG/PNG/GIF），给出压缩/转换建议 |
| 大小超限 | 本地校验阶段 | 提示当前大小/上限，给出压缩工具推荐 |
| 网络超时 | 上传过程 | 断点续传？还是重新开始？需明确 |
```

---

### 5. Checkpoint 多版本管理

**问题描述**: A07 场景发现，多个 checkpoint 文件的冲突处理

**修订建议**:

#### 在 06-实现解决方案.md 中补充：

```markdown
### Checkpoint 命名和清理策略

**文件名规则**:
- 主 checkpoint: `.freelog-checkpoint.json` (最新有效)
- 历史备份：`.freelog-checkpoint.backup.{timestamp}.json`

**多 checkpoint 冲突处理**:
```typescript
if (exists(current_checkpoint)) {
  if (accountId_mismatch) {
    prompt_user("检测到账号变更，是否强制恢复旧 checkpoint？")
    if (yes) → load_with_warning()
    else → delete_and_create_new()
  }
  
  if (stale_hint) {  // 超过 24 小时未更新
    prompt_user("Checkpoint 已陈旧，是否重置？")
  }
}
```

**自动清理**:
- 正常完成时：删除 checkpoint
- 用户 Cancel 时：保留（下次可选择恢复）
- 超过 7 天未使用：后台标记为 stale，下次启动时提示清理
```

---

## 🔧 三、P2 级问题（优化类）

### 1. License URL 跳转便利性

**问题描述**: L01 Step10 发现，Console 链接需要提供得更直观

**修订建议**:

#### 在 04-CLI 流程与命令设计中补充：

```markdown
## 输出 Console 链接的最佳实践

**资源详情**:
📄 资源详情：https://console.freelog.cn/resource/details/{resourceId}

**版本管理**:
🔧 版本管理：https://console.freelog.cn/resource/versionCreator/{resourceId}

**快速链接**:
🔗 一键打开 Console：freelog open-resource res_abc123
```

---

### 2. Batch size 默认值配置

**问题描述**: F03 场景发现，分批策略的默认值未定义

**修订建议**:

#### 在 05-场景异常与验收方案中补充：

```markdown
| 配置项 | 默认值 | 可配置范围 | 说明 |
|-------|--------|-----------|-----|
| batchSize | 5 | 1-50 | 每批写入的资源数 |
| maxRetries | 3 | 1-10 | 失败重试次数 |
| retryDelayMs | 1000 | 500-5000 | 重试间隔 |
```

---

### 3. AI/CI 模式的 checkpoint 策略说明

**问题描述**: G08 场景发现，非交互模式下的 checkpoint 行为模糊

**修订建议**:

#### 在 04-CLI 流程与命令设计中补充：

```markdown
## 非交互模式的行为差异

| 模式 | checkpoint 行为 | 理由 |
|------|---------------|-----|
| TTY 交互 | 自动保存 + 提示恢复 | 防止意外中断导致数据丢失 |
| AI/CI 非交互 | 不保存 | 完全依赖 manifest，进程内状态不持久化 |

**非交互模式的优势**:
- 确定性更高（无 hidden state）
- 脚本友好（每一步都可重现）
- 调试方便（无需清理 checkpoint）

**AI/CI 最佳实践**:
1. 先写 release-manifest.json 声明意图
2. 再调用 freelog publish --manifest release-manifest.json
3. 缺字段时直接返回结构化错误
```

---

### 4. Session 模式的详细定义

**问题描述**: G10 场景发现，EphemeralStore 的行为不够明确

**修订建议**:

#### 在 04-CLI 流程与命令设计中补充：

```markdown
## Session 模式规格

**启动方式**:
```bash
freelog --session publish ./file.zip
freelog --session update res_xxx
```

**核心特性**:
1. ✅ 不使用~/.freelog/cli-auth.json
2. ✅ 凭据来自 process.env.FREELOG_TOKEN（必须预先设置）
3. ✅ 不写 manifest/state 到本地
4. ✅ 不污染 default profile
5. ⚠️ --export-project 可将 session 导出为工程

**使用场景**:
- 临时借用他人电脑
- CI/CD 流水线中的安全隔离
- AI 协作时的安全会话

**Session 文件生成**:
```json
{
  "type": "ephemeral_session",
  "createdAt": "2026-09-02T...",
  "accountId": "12345",
  "commandHistory": [...],
  "temporaryState": {
    "draftFields": {...}
  }
}
```

---

## 📋 四、整体修订清单

### 需要修改的核心文档

| 文档 | 修改优先级 | 主要修订内容 |
|------|-----------|-------------|
| **02-Console 业务流程字段接口.md** | P0 | RSS matchedItemCount/GUID 对比阈值/Owner 校验规则 |
| **04-CLI 流程与命令设计.md** | P0 | Owner 字段展示时机/内容来源完整性/策略模板为空处理 |
| **05-场景异常与验收方案.md** | P0 | AUTH_REQUIRED 错误定义/Checkpoint 验收标准/批量报告粒度 |
| **06-实现解决方案.md** | P0 | Checkpoint 数据结构细化/error code 规范/session 模式定义 |

### 建议新增的内容

| 内容 | 放置位置 | 价值 |
|------|---------|-----|
| Owner 校验矩阵表 | 04-CLI 流程.md | 明确各类命令的 owner 检查规则 |
| Checkpoint 完整 Interface | 06-实现解决方案.md | 指导实现细节 |
| 批量报告 JSON Schema | 05-场景异常.md | AI/CI 解析依据 |
| RSS 1000 限制流程图 | 02-字段接口.md | 可视化处理逻辑 |

### 验证方法

完成上述修订后，通过以下方式验证：

```bash
# 1. 阅读一致性检查
pnpm verify:l3g-automated

# 2. 场景覆盖率测试
pnpm verify:scenarios

# 3. 人工复核
- 对照本文档的 P0 问题逐项确认修复情况
- 对新设计的场景进行端到端模拟
```

---

## ✅ 五、预期收益

完成上述修订后，产品方案将达到：

1. **完整性**: 80+ 场景覆盖率达到 95%+
2. **合理性**: 所有异常场景都有明确的恢复路径
3. **可行性**: 代码实现有据可依，减少返工

---

**修订完成时间**: 2026-09-02  
**修订人**: Qoder (基于 80+ 场景分析)  
**下一步行动**: 团队 review → 合并到产品方案主分支 → 开始代码实现
