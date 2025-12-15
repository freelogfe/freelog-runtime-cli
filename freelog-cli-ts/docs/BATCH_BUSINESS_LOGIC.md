# 批量管理业务逻辑梳理

## 一、数据结构设计

### 1. 配置结构

```typescript
BatchResourceConfig {
  defaults: {
    resourceType: string[]        // 必填：资源类型
    resourceTypeCode: string      // 必填：资源类型代码
    version?: string              // 可选：默认版本号
    description?: string          // 可选：默认版本描述
    intro?: string               // 可选：默认资源介绍
    coverImages?: string[]       // 可选：默认封面图
    tags?: string[]              // 可选：默认标签
    filePath?: string            // 可选：默认文件路径
  },
  resources: [
    {
      name: string               // 必填：资源唯一标识
      resourceName?: string      // 可选：资源名称（默认使用 name）
      resourceTitle?: string     // 可选：资源标题
      intro?: string             // 可选：资源介绍（覆盖 defaults）
      coverImages?: string[]     // 可选：封面图（覆盖 defaults）
      tags?: string[]            // 可选：标签（覆盖 defaults）
      filePath: string           // 必填：文件路径
      resourceId?: string        // 可选：资源ID（创建后填充）
      version?: string           // 可选：版本号（覆盖 defaults）
      description?: string       // 可选：版本描述（覆盖 defaults）
      resourceType?: string[]    // 可选：资源类型（覆盖 defaults）
      resourceTypeCode?: string  // 可选：资源类型代码（覆盖 defaults）
      versionId?: string         // 可选：版本ID（发布后填充）
      fileSha1?: string          // 可选：文件SHA1（发布后填充）
      skip?: boolean             // 可选：是否跳过
    }
  ]
}
```

### 2. 资源状态判断

| 状态 | 条件 | 说明 |
|------|------|------|
| **跳过** | `skip === true` | 标记为跳过，所有操作都会忽略 |
| **未创建** | `!resourceId` | 资源尚未创建，需要先执行 `batch create` |
| **未发布** | `resourceId && !versionId` | 资源已创建但未发布版本，可以执行 `batch publish` |
| **已发布** | `resourceId && versionId` | 资源已创建并发布版本 |

---

## 二、核心业务流程

### 流程一：初始化 → 创建 → 发布

```
1. batch init
   ↓
   生成配置文件（包含 defaults 和 resources）
   ↓
2. batch create
   ↓
   过滤条件：!skip && !resourceId
   ↓
   批量创建资源 → 更新 resourceId
   ↓
3. batch publish
   ↓
   过滤条件：!skip && resourceId && !versionId
   ↓
   批量发布版本 → 更新 versionId 和 fileSha1
```

**业务逻辑正确性**：✅
- 创建前检查 `!resourceId`，避免重复创建
- 发布前检查 `resourceId`，确保资源已创建
- 发布前检查 `!versionId`，避免重复发布

---

### 流程二：逐个新增资源

```
1. batch add [filePath]
   ↓
   添加资源项到配置（resourceId 为空）
   ↓
2. batch create
   ↓
   只创建新添加的资源（!resourceId）
   ↓
3. batch publish-one <resourceName>
   ↓
   单独发布某个资源
```

**业务逻辑正确性**：✅
- `batch add` 添加的资源项初始状态为未创建
- `batch create` 会自动跳过已有 `resourceId` 的资源
- `batch publish-one` 可以单独处理某个资源

---

### 流程三：更新资源信息

```
1. batch update [resourceNames]
   ↓
   过滤条件：!skip && resourceId
   ↓
   更新资源信息（intro、coverImages、tags、status）
   ↓
   更新本地配置（保留 resourceId 和 versionId）
```

**业务逻辑正确性**：✅
- 只更新已创建的资源（需要 `resourceId`）
- 更新服务器信息后同步到本地配置
- 不会影响 `resourceId` 和 `versionId`

---

### 流程四：更新版本信息

```
1. batch update-version [resourceNames]
   ↓
   过滤条件：!skip（不需要 resourceId）
   ↓
   更新版本信息（version、description、filePath）
   ↓
   只更新本地配置（不发布）
```

**业务逻辑正确性**：✅
- 可以更新未创建资源的版本信息（为后续发布做准备）
- 只更新本地配置，不调用 API
- 更新后需要手动执行 `batch publish` 发布

---

### 流程五：更新版本信息并发布

```
1. batch update-and-publish [resourceNames]
   ↓
   过滤条件：!skip && resourceId
   ↓
   更新版本信息（version、description、filePath）
   ↓
   立即发布版本
   ↓
   更新 versionId 和 fileSha1
```

**业务逻辑正确性**：✅
- 需要资源已创建（需要 `resourceId`）
- 一次性完成更新和发布
- 更新配置后立即发布，避免配置不一致

---

### 流程六：同步服务器信息

```
1. batch sync [resourceNames]
   ↓
   过滤条件：!skip && resourceId
   ↓
   从服务器获取资源信息
   ↓
   更新本地配置（resourceName、resourceTitle、intro、coverImages、tags）
```

**业务逻辑正确性**：✅
- 只同步已创建的资源（需要 `resourceId`）
- 同步资源信息，不覆盖 `resourceId` 和 `versionId`
- 用于从服务器恢复配置或同步最新信息

---

### 流程七：同步版本信息

```
1. batch sync-version [resourceNames]
   ↓
   过滤条件：!skip && resourceId
   ↓
   从服务器获取版本信息（latest 或指定版本）
   ↓
   更新本地配置（version、description、versionId、fileSha1）
```

**业务逻辑正确性**：✅
- 只同步已创建的资源（需要 `resourceId`）
- 可以同步 latest 或指定版本
- 更新版本相关字段，包括 `versionId` 和 `fileSha1`

---

## 三、潜在问题检查

### ✅ 问题一：重复创建资源

**检查**：`batch create` 过滤条件 `!resourceId`

**结论**：✅ 正确
- 已创建的资源（有 `resourceId`）会被自动跳过
- 不会重复创建资源

---

### ✅ 问题二：重复发布版本

**检查**：`batch publish` 过滤条件 `!versionId`

**结论**：✅ 正确
- 已发布的资源（有 `versionId`）会被自动跳过
- 不会重复发布版本

---

### ✅ 问题三：更新版本信息后是否需要重新发布

**检查**：`batch update-version` 只更新配置，不发布

**结论**：✅ 正确
- `batch update-version` 只更新本地配置
- 需要手动执行 `batch publish` 或使用 `batch update-and-publish`
- 设计合理，允许用户先更新配置再统一发布

---

### ✅ 问题四：跳过标记的资源处理

**检查**：所有命令都检查 `!skip`

**结论**：✅ 正确
- 所有批量操作都会跳过标记为 `skip` 的资源
- 可以临时禁用某个资源，不影响其他资源

---

### ⚠️ 问题五：更新版本信息时是否需要 resourceId

**检查**：`batch update-version` 不需要 `resourceId`

**结论**：✅ 正确，但需要注意
- 可以更新未创建资源的版本信息（为后续发布做准备）
- 但如果要发布，仍然需要先创建资源
- `batch update-and-publish` 需要 `resourceId`（正确）

---

### ✅ 问题六：同步操作的数据覆盖

**检查**：`batch sync` 和 `batch sync-version` 的更新字段

**结论**：✅ 正确
- `batch sync` 只更新资源信息字段，不覆盖 `resourceId` 和 `versionId`
- `batch sync-version` 只更新版本相关字段
- 不会丢失已创建的资源ID和版本ID

---

### ✅ 问题七：文件路径处理

**检查**：`filePath` 的处理逻辑

**结论**：✅ 正确
- `filePath` 使用相对路径（相对于配置文件）
- `batchItemToVersionConfig` 正确处理文件路径
- 支持目录和文件两种类型

---

## 四、数据流转图

```
初始化阶段：
  batch init → 生成配置（defaults + resources）
  
创建阶段：
  配置（!resourceId） → batch create → API创建资源 → 更新 resourceId
  
发布阶段：
  配置（resourceId && !versionId） → batch publish → API创建版本 → 更新 versionId + fileSha1
  
更新阶段：
  配置（resourceId） → batch update → API更新资源 → 更新本地配置（资源信息）
  配置（任意） → batch update-version → 更新本地配置（版本信息）
  
同步阶段：
  配置（resourceId） → batch sync → API获取资源信息 → 更新本地配置（资源信息）
  配置（resourceId） → batch sync-version → API获取版本信息 → 更新本地配置（版本信息）
```

---

## 五、业务逻辑总结

### ✅ 正确的设计

1. **状态管理清晰**：通过 `resourceId` 和 `versionId` 判断资源状态
2. **避免重复操作**：创建和发布都有状态检查
3. **配置覆盖机制**：资源项可以覆盖默认配置
4. **跳过机制**：支持临时禁用某个资源
5. **同步机制**：可以从服务器恢复配置

### ⚠️ 需要注意的点

1. **更新版本信息不自动发布**：
   - `batch update-version` 只更新配置，需要手动发布
   - 或使用 `batch update-and-publish` 一次性完成

2. **同步操作需要 resourceId**：
   - `batch sync` 和 `batch sync-version` 需要资源已创建
   - 未创建的资源无法同步

3. **文件路径处理**：
   - `filePath` 使用相对路径
   - 需要确保路径正确，否则发布会失败

---

## 六、建议改进（可选）

### 1. 增加状态检查命令

可以添加一个命令检查配置一致性：

```bash
batch check
# 检查：
# - 有 resourceId 但服务器上不存在的资源
# - 有 versionId 但服务器上不存在的版本
# - 文件路径不存在的资源
```

### 2. 增加批量删除功能

```bash
batch delete [resourceNames]
# 从配置中移除资源项
# 可选：同时删除服务器上的资源
```

### 3. 增加重试机制

对于批量操作失败的情况，可以添加重试功能：

```bash
batch retry [operation]
# 重试上次失败的操作
```

---

## 七、结论

**整体业务逻辑设计正确** ✅

- 数据结构合理
- 状态管理清晰
- 避免重复操作
- 支持灵活配置
- 同步机制完善

**需要注意的点**：
- 更新版本信息后需要手动发布
- 同步操作需要资源已创建
- 文件路径需要正确

**建议**：
- 可以添加状态检查命令
- 可以添加批量删除功能
- 可以添加重试机制

