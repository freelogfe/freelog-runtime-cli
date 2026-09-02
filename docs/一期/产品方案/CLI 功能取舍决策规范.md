# CLI 功能取舍决策规范

> **文档角色**:明确 Freelog Runtime CLI 与 Console 的功能边界和取舍原则  
> **适用对象**:产品经理、架构师、开发者  
> 最后更新：2026-09-02

---

## 📋 **一、核心设计原则**

### **1. 定位差异**

| 维度 | Console | CLI |
|------|---------|-----|
| **目标用户** | 所有资源发布者（含付费场景） | 开发者/AI/CICD（免费优先） |
| **交互方式** | 图形界面 + 微前端组件 | TTY/命令行 |
| **支付能力** | ✅ 完整集成第三方支付 | ❌ 仅免费策略签约 |
| **自动化程度** | 手动引导式流程 | ⭐ 完全自动化/可脚本化 |
| **复杂度容忍** | 高（可接受复杂 UI） | 低（追求简洁高效） |

### **2. 取舍总纲**

```typescript
/**
 * CLI 功能决策矩阵
 * 
 * 优先级：P0(必须实现) > P1(尽力实现) > P2(可选简化) > P3(不实现)
 * 
 * P0: 核心发行流程 + 免费策略
 * P1: 辅助功能但必要
 * P2: 增强体验但有替代方案
 * P3: 超出 CLI 边界或过于复杂
 */
interface CLIFeatureDecision {
  feature: string;           // 功能名称
  consoleComplexity: number; // Console 实现复杂度 (1-10)
  cliPriority: 'P0'|'P1'|'P2'|'P3';
  decision: 'support'|'simplified'|'not_supported';
  rationale: string;         // 决策理由
}
```

---

## 🎯 **二、功能取舍详细清单**

### **F1 - 创建单个资源**

#### **Step1: 创建资源壳**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 资源类型选择 | 下拉菜单 + 预览卡片 | ✅ 完整支持 | 简单枚举类型 |
| 填写基础信息 | 表单输入框 | ✅ 完整支持 | 必填字段少 |
| 创建提交 | POST API | ✅ 完整支持 | 核心流程 |

#### **Step2: 上传资源与属性配置** ⭐最复杂
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| **文件上传** | 4 种入口 (本地/云端/Markdown/代码编辑器) | ✅ 仅 localUpload | CLI 专注本地文件 |
| **视频封面上传** | `FUploadCover` 组件 | ❌ 暂不支持 | 非核心功能 |
| **编辑按钮** | 打开 Markdown 编辑器 Drawer | ❌ 暂不支持 | CLI 无需编辑 |
| **下载按钮** | 触发浏览器下载 | ❌ 暂不支持 | CLI 已有文件操作 |
| **删除按钮** | Modal 确认后删除 | ⚠️ 简化版 | CLI 提供 delete 命令 |
| **补充属性弹窗** | `fResourcePropertyEditor3` (key/name/description/value) | ⚠️ 简化版 | CLI 通过 YAML 配置 |
| **可选配置弹窗** | `fResourceOptionEditor` (input/select/switch) | ⚠️ 简化版 | CLI 通过模板自动生成 |
| **依赖授权管理** | `FMicroAPP_Authorization` 微前端组件 | ⚠️ 简化版 | **仅免费策略签约** |
| Draft 自动保存 | LocalStorage+ 定时同步 | ✅ Checkpoint 恢复 | Ctrl+C 保存状态 |

**关键差异说明**:
- Console 的 `FMicroAPP_Authorization` 处理所有依赖场景 (含付费)
- CLI 的 `dep auth` 仅对**不包含 TransactionEvent 的策略**签约
- 检测到付费策略时拒绝并提示使用 Console

#### **Step3: 配置授权策略**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 策略模板选择 | 3 种模板 (免费/商业/自定义) | ⚠️ 仅免费模板 | 付费需支付流程 |
| 参数输入 | 动态表单渲染 | ⚠️ 简化版 | CLI 预定义参数集 |
| 策略编译验证 | `DynamicPolicyCompiler` → 字节码 | ✅ 完整支持 | 核心安全机制 |
| 预览渲染 | 模拟执行效果 | ❌ 暂不支持 | TTY 中难以呈现 |

#### **Step4: 完善 Listing**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 封面图片上传 | 多格式支持 +AI 优化 | ✅ 完整支持 | 核心展示要素 |
| 标签输入 | TagInput 自动去重 | ✅ 完整支持 | 简单文本处理 |
| 发布选项 | Checkbox(自动上架/仅审核) | ✅ 完整支持 | 二元选择 |
| 提交流单 | 聚合所有数据 POST | ✅ 完整支持 | 最终动作 |

---

### **M1-M5 - 资源管理**

#### **M1: 版本更新**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 远端状态读取 | GET /resource/info | ✅ 完整支持 | 继承逻辑必需 |
| 冻结检测 | status.isFrozen 检查 | ✅ 完整支持 | 业务规则强约束 |
| 文件对比 | SHA1 比较 +可视化 diff | ⚠️ 简化版 | CLI 仅检测是否相同 |
| 继承决策 | 弹窗选择 (是/否) | ✅ TTY 确认 | 简单二选一 |
| 可选配置继承 | 逐项勾选继承 | ⚠️ 简化版 | CLI 全量继承 |
| 依赖重新授权 | 微前端复选 | ⚠️ 简化版 | CLI 仅免费策略 |
| 策略继承 | 单选框 (继承/重新配置) | ✅ 完整支持 | 明确决策分支 |
| 版本号自动递增 | SemVer 算法 | ✅ 完整支持 | 确定性强规则 |
| 变更日志验证 | 长度 + 格式检查 | ✅ 完整支持 | 必填校验 |

**继承决策逻辑**:
```typescript
// CLI 简化版继承逻辑
async function promptFileInheritance(oldFile, newFile) {
  const choice = await promptSelect({
    message: '选择文件处理方式',
    choices: [
      { value: 'inherit', label: '继承旧文件' },
      { value: 'upload-new', label: '上传新文件' }
    ]
  });
  return choice.value === 'inherit' ? { useOldFileID: true } : { uploadNew: true };
}
```

#### **M2: 属性与描述更新**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 标题修改 | Input 输入框 (≤200 字符) | ✅ 完整支持 | 简单校验 |
| 描述修改 | TextArea(50-1000 字符) | ✅ 完整支持 | 必改字段 |
| 封面更换 | 保持现有/重新上传 | ✅ 完整支持 | 二元选择 |
| 标签编辑 | TagInput 逗号分隔 | ✅ 完整支持 | 自动去重 |
| 相似标签检测 | Plural 识别算法 | ⚠️ 简化版 | CLI 仅去重不提示 |

#### **M3: 授权策略管理**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 模板加载器 | 缓存机制 (TTL 30min) | ✅ 完整支持 | 性能优化 |
| 策略编译器 | Bytecode+SHA256 校验 | ✅ 完整支持 | 核心安全 |
| 预览渲染器 | TestScenario 模拟 | ❌ 暂不支持 | TTY 难以展示 |
| 变更记录 | HistorySnapshot 存储 | ❌ 暂不支持 | Console 特有 |
| 回滚操作 | RollbackAPI 调用 | ⚠️ 简化版 | CLI 需提供 rollback 命令 |

#### **M4: 封面图片管理**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 上传封面 | 拖拽 + 裁剪工具 | ❌ 简化版 | CLI 仅上传 |
| 替换封面 | Modal 确认对话框 | ⚠️ 简化版 | CLI 直接覆盖 |
| 删除封面 | 二次确认 | ✅ 完整支持 | 安全考虑 |

#### **M5: 依赖管理** ⭐CLI 已有完整实现
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 添加依赖 | `dep add` 命令 | ✅ 完整支持 | 已有实现 |
| 删除依赖 | `dep remove` 命令 | ✅ 完整支持 | 已有实现 |
| 列表查询 | `dep list` 命令 | ✅ 完整支持 | 已有实现 |
| 更新依赖 | `dep update` 命令 | ✅ 完整支持 | 已有实现 |
| 批量签约 | `dep auth --policy-map` | ✅ 完整支持 | **免费策略限定** |
| 初始化模板 | `dep init-auth-map` | ✅ 完整支持 | CLI 特有 |

**免费策略边界**:
```typescript
// depAuthService.ts L346-378
for (const entry of map.contracts) {
  for (const policyId of entry.policyIds) {
    // 检测付费策略
    if (isPaymentPolicy(policyText)) {
      throw new Error(`❌ 策略包含付费内容 (TransactionEvent),CLI 不支持签约`);
    }
    
    // 免费策略签约流程
    await FServiceAPI.Contract.batchCreateContracts(...);
    await FServiceAPI.Resource.batchSetContracts(...);
  }
}
```

---

### **C1 - 合集创建**

#### **Step1: 扫描本地目录**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 递归扫描 | readdirRecursive | ✅ 完整支持 | Node.js 原生能力 |
| GUID 验证 | 必填字段检查 | ✅ 完整支持 | 业务规则 |
| 类型识别 | Podcast/VideoSeries判断 | ✅ 完整支持 | 基于 feed.xml 存在性 |
| 错误清单 | invalidEpisodes 数组 | ✅ 完整支持 | 透明化失败原因 |

#### **Step2: 填写合集信息**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| package.json 自动填充 | pkg.name/pkg.description | ✅ 完整支持 | 标准 JSON 解析 |
| 标题输入 | Input  maxLength=200 | ✅ 完整支持 | 简单校验 |
| 描述输入 | TextArea minLength=50 | ✅ 完整支持 | 必改字段 |
| 封面上传 | CoverUpload 组件 | ✅ 完整支持 | 格式/大小校验 |

#### **Step3: 选择资源并排序**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 多选器 | Checkbox 全选/反选 | ⚠️ 简化版 | CLI 通过配置文件指定 |
| 键盘拖拽 | SortableList DnD 交互 | ❌ 暂不支持 | 无法在 TTY 实现 |
| GUID 去重 | Map 查重算法 | ✅ 完整支持 | 确定性强逻辑 |

**CLI 替代方案**:
```bash
# 通过 YAML 配置文件指定条目顺序
$ freelog collection-create ./my-podcast/ --config ep-order.yaml

# ep-order.yaml
episodes:
  - guid: "episode-001"
    sortOrder: 1
  - guid: "episode-002"
    sortOrder: 2
```

#### **Step4: 配置收录规则** ⭐复杂功能
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| RSS 绑定 | FeedURL 验证 | ⚠️ 简化版 | CLI 仅验证格式 |
| 验证码处理 | 图像渲染 +6 位输入 | ❌ 暂不支持 | TTY 中 ASCII 艺术太复杂 |
| GUID 差异检测 | diff 计算算法 | ✅ 完整支持 | 核心业务规则 |
| 锁定字段定义 | LockableField[] | ✅ 完整支持 | 元数据存储 |
| 数量限制 | maxEpisodesPerSync=50 | ✅ 完整支持 | 硬约束 |

#### **Step5: 完善 Listing 并上架**
| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 策略模板选择 | PolicySelector 组件 | ⚠️ 仅免费模板 | 同 M3 付费边界 |
| 标签输入 | TagInput 自动去重 | ✅ 完整支持 | 简单文本处理 |
| 提交选项 | AutoPublishCheckbox | ✅ 完整支持 | 二元选择 |

---

### **F2 - 批量发布**

| 功能点 | Console 实现 | CLI 决策 | 理由 |
|--------|------------|---------|------|
| 目录扫描 | BatchScanner 递归遍历 | ✅ 完整支持 | Node.js 原生能力 |
| package.json 识别 | JSON.parse 校验 | ✅ 完整支持 | 标准解析 |
| artifact 查找 | findArtifact() 算法 | ✅ 完整支持 | 扩展名匹配 |
| 批量验证 | 并行校验每个资源 | ⚠️ 简化版 | CLI 串行处理更安全 |
| 发布进度 | ProgressBar 实时反馈 | ✅ 完整支持 | TTY 友好 |
| 错误容忍 | 独立处理不影响整体 | ✅ 完整支持 | 核心容错机制 |

---

## 🔍 **三、Console 特有复杂组件总结**

以下 Console 特有的复杂组件**CLI 完全不实现**,仅保留简化对照:

### **1. 微前端组件族**
| 组件名 | 作用 | CLI 决策 |
|--------|------|---------|
| `FMicroAPP_Authorization` | 依赖授权微前端 (含付费签约) | ❌ 不支持 |
| `MicroApp` | qiankun 宿主容器 | ❌ 不支持 |
| `Authorization` 微应用 | 授权面板子应用 | ❌ 不支持 |

**原因**: CLI 无微前端框架，且我们只支持免费策略。

### **2. 富交互组件**
| 组件名 | 作用 | CLI 决策 |
|--------|------|---------|
| `SortableList` | 拖拽排序列表 | ❌ 不支持 |
| `FStorageSpace` | 云端存储选择器 | ⚠️ 简化版 |
| `FResourceMarkdown` | Markdown 在线编辑器 | ❌ 不支持 |
| `FUploadCover` | 视频封面上传 + 裁剪 | ❌ 不支持 |

**原因**: TTY 中无法实现流畅的拖拽/可视化编辑体验。

### **3. 支付相关**
| 组件名 | 作用 | CLI 决策 |
|--------|------|---------|
| 支付 Dialog | 第三方收银台 | ❌ 不支持 |
| License 购买流程 | 商业许可证订购 | ❌ 不支持 |

**原因**: 超出 CLI 边界，需对接外部支付网关。

---

## 💡 **四、典型场景决策示例**

### **场景 1: 依赖授权流程**

**Console 完整路径**:
```
Creator Step2 → FMicroAPP_Authorization → 
  ├─ 免费策略：即时签约 ✓
  ├─ 付费策略：→ 打开支付 Dialog → 完成支付 → 签约 ✓
  └─ 混合策略：部分免费/部分付费 → 混合流程 ✓
```

**CLI 简化路径**:
```
freelog dep auth --policy-map auth-map.yaml
  ├─ 检测策略包含 TransactionEvent? → 拒绝 ✗
  └─ 否则：batchCreateContracts + batchSetContracts → 签约 ✓
```

**决策理由**:
- CLI 目标用户为开发者/AI，偏好自动化而非交互式支付
- 付费策略需人工介入，应引导至 Console

### **场景 2: 合集 RSS 绑定**

**Console 完整路径**:
```
Collection Creator Step4 → RSSBindingFlow →
  ├─ Feed URL 验证
  ├─ 验证码检测 → 如有 → 图像渲染 → 用户输入 6 位
  ├─ GUID 差异警告
  ├─ 数量限制检查
  └─ 保存绑定配置 ✓
```

**CLI 简化路径**:
```
freelog collection-create ./podcast/ --rss-feed-url xxx
  ├─ Feed URL 格式验证
  ├─ 跳过验证码 (需手动先绑定)
  ├─ GUID 差异警告
  ├─ 数量限制检查
  └─ 保存绑定配置 ✓
```

**决策理由**:
- TTY 中验证码显示需要 ASCII Art，用户体验差
- 建议先用 Console 绑定一次，后续 CLI 只需提供 Feed URL

---

## 🎯 **五、核心边界红线**

以下功能**绝对不在 CLI 范围内**,如用户提出需明确告知:

| 功能 | 原因 | 替代方案 |
|------|------|---------|
| **所有付费流程** | 需对接第三方支付网关 | 使用 Console |
| **微前端交互** | CLI 无 qiankun 等框架 | 使用 Console |
| **复杂可视化编辑** | TTY 无法呈现富交互 | 使用 Console |
| **多人协作审批** | CLI 无团队权限概念 | 使用 Console |
| **统计报表生成** | 数据量大需图表展示 | Console Web 端 |

---

## ✅ **六、验收标准**

### **CLI 功能完整性检查清单**

- [ ] 所有 P0 级功能已实现并通过测试
- [ ] P1 级功能至少有基础版本可用
- [ ] P2 级功能提供简化替代方案
- [ ] P3 级功能明确标注"暂不支持"并给出替代方案
- [ ] 免费策略签约流程完整闭环
- [ ] Checkpoint 恢复机制正常工作
- [ ] 错误提示清晰可操作
- [ ] 文档中标注了 Console 源码证据

---

## 🔗 **七、相关文档索引**

| 文档 | 说明 | 路径 |
|------|------|------|
| [产品方案设计原则](./03-CLI 环境差异与产品原则.md) | CLI vs Console 的核心差异 | 产品方案根目录 |
| [M1-版本更新](./资源管理/01-版本更新.md) | 继承逻辑详细实现 | 资源管理 |
| [M5-依赖管理](./资源管理/05-依赖管理.md) | 免费策略签约完整流程 | 资源管理 |
| [C1-合集创建](./流程设计 - 创建合集/03-创建合集总纲.md) | RSS 绑定简化版说明 | 流程设计 |

---

## 📝 **八、版本修订记录**

| 版本 | 日期 | 修订内容 | 负责人 |
|------|------|---------|--------|
| v1.0 | 2026-09-02 | 初始版本，覆盖 F1/M1-C1/F2 全流程 | AI Agent |
| v1.1 | TBD | 补充批量发布细节 | TBD |
| v1.2 | TBD | 根据实际使用情况调整优先级 | TBD |

---

**总结**:本文档明确了 CLI 与 Console 的边界，核心原则是"**Console 全覆盖，CLI 聚焦免费策略 + 核心自动化**",确保 CLI 保持简洁高效的同时，不影响用户在需要复杂功能时使用 Console。
