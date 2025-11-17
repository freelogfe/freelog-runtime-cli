# 配置文件拆分架构方案

## 📋 概述

将原来单一的 `freelog.config` 拆分为两个独立的配置文件：
- **`freelog.resource.config`** - 资源信息（对应资源实体）
- **`freelog.version.config`** - 版本信息（对应资源版本）

## 🎯 设计理念

### 数据源映射

| 配置文件 | API 响应类型 | API 请求类型 | 说明 |
|---------|------------|------------|------|
| `freelog.resource.config` | `ResourceDetailResponse` | `CreateResourceBody` / `UpdateResourceBody` | 资源基本信息 |
| `freelog.version.config` | `ResourceVersionDetailResponse` | `CreateResourceVersionBody` | 版本详细信息 |

### 字段分配

#### freelog.resource.config (资源配置)

```typescript
{
  resourceId: string;          // 资源ID
  resourceName?: string;       // 资源名称（可选，用于可读性）
  resourceType: string[];      // 资源类型
  intro?: string;              // 资源介绍
  coverImages?: string[];      // 封面图
}
```

**数据来源：** `getResourceInfo()` 返回的 `ResourceDetailResponse`

**用途：** 
- 创建资源: `createResource()`
- 更新资源: `updateResource()`

#### freelog.version.config (版本配置)

```typescript
{
  version: string;                              // 版本号
  fileSha1: string;                            // 文件SHA1
  filename: string;                            // 文件名
  description?: string;                        // 版本描述
  
  // 文件处理相关
  resourceType?: string;                       // 资源类型（判断上传方式）
  buildPath?: string;                          // 构建路径
  fileTarget?: string;                         // 文件目标
  
  // 依赖和配置
  dependencies?: Dependency[];                 // 依赖列表
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  baseUpcastResources?: BaseUpcastResource[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: InputAttr[];
  authExcludedItems?: AuthExcludedItem[];
}
```

**数据来源：** `getResourceVersionInfo()` 返回的 `ResourceVersionDetailResponse`

**用途：**
- 创建版本: `createResourceVersion()`
- 保存草稿: `saveResourceVersionDraft()`

## 📁 文件结构

### 配置文件命名规范

```
项目根目录/
├── freelog.resource.config.ts    # TypeScript 项目
├── freelog.version.config.ts
或
├── freelog.resource.config.js    # JavaScript 项目
├── freelog.version.config.js
或
├── freelog.resource.config.json  # 其他资源
├── freelog.version.config.json
```

### 模板文件

```
public/template/
├── freelog.resource.config.template.ts
├── freelog.resource.config.template.js
├── freelog.resource.config.template.json
├── freelog.version.config.template.ts
├── freelog.version.config.template.js
└── freelog.version.config.template.json
```

### 类型定义文件

```
public/
├── freelog.resource.ts    # ResourceConfig 类型定义
└── freelog.version.ts     # VersionConfig 类型定义
```

## 🔧 新增命令

### 1. `create` 命令

**功能：** 创建 Freelog 资源

**使用：**
```bash
freelog-cli create [name]
  -c, --config <path>    指定资源配置文件路径
  --debug                调试模式
```

**流程：**
1. 读取 `freelog.resource.config`
2. 验证配置（resourceName, resourceType 必填）
3. 调用 `createResource()` API
4. 更新 `freelog.resource.config` 中的 `resourceId`
5. 显示创建结果

**配置要求：**
- 必须有 `resourceName`
- 必须有 `resourceType`（非空数组）

### 2. `update` 命令（新增资源更新）

**功能：** 更新 Freelog 资源信息

**使用：**
```bash
freelog-cli update [resource]
  -c, --config <path>    指定资源配置文件路径
  --intro <text>         更新资源介绍
  --cover <urls>         更新封面图（逗号分隔）
  --debug                调试模式
```

**流程：**
1. 读取 `freelog.resource.config`
2. 获取要更新的字段（从选项或交互式输入）
3. 调用 `updateResource()` API
4. 更新本地 `freelog.resource.config`
5. 显示更新结果

**注意：** 与 `dep update` 命令区分
- `update` - 更新资源信息
- `dep update` - 更新依赖版本

## 🔄 需要修改的命令

### 1. `init` 命令

**变更：** 所有类型都创建两个配置文件

#### 模板初始化（主题/插件/前端库）

```bash
freelog-cli init
? 请选择初始化类型 主题
? 请输入主题名称 my-theme
? 请输入版本号 1.0.0

✔ Freelog 资源创建成功: 60a...
✔ 配置文件创建成功
ℹ 资源配置: freelog.resource.config.js
ℹ 版本配置: freelog.version.config.js
```

**生成文件：**
- `freelog.resource.config.ts/js` - 包含 resourceId（API 返回）
- `freelog.version.config.ts/js` - 包含初始版本信息

#### 资源初始化（其他资源）

```bash
freelog-cli init
? 请选择初始化类型 其余资源
? 请输入项目名称 my-resource
? 请输入资源名称 My Resource

✔ 配置文件创建成功
ℹ 资源配置: freelog.resource.config.json
ℹ 版本配置: freelog.version.config.json
```

**生成文件：**
- `freelog.resource.config.json` - resourceId 为空
- `freelog.version.config.json` - 版本信息模板

### 2. `publish` 命令

**变更：** 读取两个配置文件

**流程：**
1. 读取 `freelog.resource.config` 获取 resourceId
2. 读取 `freelog.version.config` 获取版本信息
3. 处理文件上传（根据 `version.config` 中的 `resourceType`, `buildPath`, `fileTarget`）
4. 更新 `version.config` 的 `fileSha1` 和 `filename`
5. 调用 `createResourceVersion()` 发布版本
6. 保存更新后的 `version.config`

**配置依赖：**
- 需要 `resource.config.resourceId` （资源必须已创建）
- 需要 `version.config.version` 等版本信息

### 3. `sync` 命令

**变更：** 同步到两个配置文件

**新逻辑：**
```typescript
// 1. 获取资源信息
const resourceInfo = await getResourceInfo(resourceId);

// 2. 获取版本信息
const versionInfo = resourceInfo.latestVersionInfo || 
                    await getResourceVersionInfo(resourceId, version);

// 3. 更新资源配置
updateResourceConfig({
  resourceId: resourceInfo.resourceId,
  resourceName: resourceInfo.resourceName,
  resourceType: resourceInfo.resourceType,
  intro: resourceInfo.intro,
  coverImages: resourceInfo.coverImages,
});

// 4. 更新版本配置
updateVersionConfig({
  version: versionInfo.version,
  fileSha1: versionInfo.fileSha1,
  filename: versionInfo.filename,
  description: versionInfo.description,
  dependencies: versionInfo.dependencies,
  customPropertyDescriptors: versionInfo.customPropertyDescriptors,
  baseUpcastResources: versionInfo.baseUpcastResources || versionInfo.upcastResources,
  // 其他字段...
});
```

**新增选项：**
```bash
freelog-cli sync [resourceIdOrName]
  -v, --version <version>           指定版本号或 latest
  -c, --config <path>               指定配置文件目录
  --resource-only                   仅同步资源信息
  --version-only                    仅同步版本信息
```

### 4. `dep sync` 命令

**变更：** 只更新 `version.config` 的 dependencies

**流程：**
1. 读取 `version.config`
2. 获取依赖的最新版本信息
3. 更新 `version.config.dependencies`
4. 保存 `version.config`

### 5. `dep add/remove/update/change` 命令

**变更：** 操作 `version.config` 的 dependencies

**说明：** 依赖是版本级别的，所以只修改 `version.config`

## 📝 ConfigService 重构

### 原 configService.ts

**问题：** 单一配置文件，混合资源和版本信息

### 新架构

#### 1. resourceConfigService.ts

```typescript
export function loadResourceConfig(configPath?: string): ResourceConfig | null
export function saveResourceConfig(config: ResourceConfig, configPath?: string): void
export function getResourceConfigPath(format?: 'ts' | 'js' | 'json'): string | null
export function validateResourceConfig(config: ResourceConfig): void
```

#### 2. versionConfigService.ts

```typescript
export function loadVersionConfig(configPath?: string): VersionConfig | null
export function saveVersionConfig(config: VersionConfig, configPath?: string): void
export function getVersionConfigPath(format?: 'ts' | 'js' | 'json'): string | null
export function validateVersionConfig(config: VersionConfig): void
export function versionConfigToVersionBody(config: VersionConfig): CreateResourceVersionBody
```

#### 3. configService.ts (统一入口)

```typescript
export function loadBothConfigs(basePath?: string): {
  resource: ResourceConfig | null;
  version: VersionConfig | null;
}

export function saveBothConfigs(
  resource: ResourceConfig,
  version: VersionConfig,
  basePath?: string
): void

export function getConfigFormat(): 'ts' | 'js' | 'json'
```

## 🔄 数据转换函数

### resourceConfigToCreateBody

```typescript
function resourceConfigToCreateBody(config: ResourceConfig): CreateResourceBody {
  return {
    resourceName: config.resourceName!,
    resourceType: config.resourceType,
    intro: config.intro,
    coverImages: config.coverImages,
  };
}
```

### resourceConfigToUpdateBody

```typescript
function resourceConfigToUpdateBody(config: ResourceConfig): UpdateResourceBody {
  return {
    intro: config.intro,
    coverImages: config.coverImages,
  };
}
```

### versionConfigToVersionBody

```typescript
function versionConfigToVersionBody(config: VersionConfig): CreateResourceVersionBody {
  const omitResourceName = <T extends { resourceName?: string }>(obj: T): Omit<T, 'resourceName'> => {
    const { resourceName, ...rest } = obj;
    return rest as Omit<T, 'resourceName'>;
  };

  return {
    version: config.version,
    fileSha1: config.fileSha1,
    filename: config.filename,
    description: config.description,
    dependencies: config.dependencies?.map(dep => omitResourceName(dep)),
    customPropertyDescriptors: config.customPropertyDescriptors,
    baseUpcastResources: config.baseUpcastResources?.map(resource => omitResourceName(resource)),
    batchSignContracts: config.batchSignContracts,
    inputAttrs: config.inputAttrs,
    authExcludedItems: config.authExcludedItems,
  };
}
```

### responseToResourceConfig

```typescript
function responseToResourceConfig(response: ResourceDetailResponse): ResourceConfig {
  return {
    resourceId: response.resourceId,
    resourceName: response.resourceName,
    resourceType: response.resourceType,
    intro: response.intro,
    coverImages: response.coverImages,
  };
}
```

### responseToVersionConfig

```typescript
function responseToVersionConfig(response: ResourceVersionDetailResponse): VersionConfig {
  return {
    version: response.version,
    fileSha1: response.fileSha1,
    filename: response.filename,
    description: response.description,
    dependencies: response.dependencies?.map(dep => ({
      resourceId: dep.resourceId,
      resourceName: dep.resourceName,
      versionRange: dep.versionRange,
    })),
    customPropertyDescriptors: response.customPropertyDescriptors,
    baseUpcastResources: (response.baseUpcastResources || response.upcastResources)?.map(resource => ({
      resourceId: resource.resourceId,
      resourceName: resource.resourceName,
    })),
  };
}
```

## 📊 命令优先级和依赖关系

### 实施顺序

1. **Phase 1: 基础架构** ✅
   - [x] 创建类型定义文件 (`freelog.resource.ts`, `freelog.version.ts`)
   - [x] 创建模板文件 (6个模板)
   - [ ] 创建 ConfigService (拆分为 3 个文件)

2. **Phase 2: 核心命令**
   - [ ] `create` 命令 - 创建资源
   - [ ] `update` 命令 - 更新资源
   - [ ] 修改 `init` 命令 - 生成两个配置文件

3. **Phase 3: 同步和发布**
   - [ ] 修改 `sync` 命令 - 同步到两个配置
   - [ ] 修改 `publish` 命令 - 从两个配置读取

4. **Phase 4: 依赖管理**
   - [ ] 修改 `dep add/remove/update/change/list` - 操作 version.config
   - [ ] 修改 `dep sync` - 同步 version.config 的依赖

5. **Phase 5: 清理和文档**
   - [ ] 删除旧的配置文件和模板
   - [ ] 更新文档
   - [ ] 更新测试

## ⚠️ 注意事项

### 1. 向后兼容性

**问题：** 旧项目使用单一的 `freelog.config`

**方案：**
- 检测旧配置文件
- 提示用户迁移
- 提供迁移命令: `freelog-cli migrate`

```bash
freelog-cli migrate
✔ 检测到旧版配置文件
✔ 拆分为 freelog.resource.config 和 freelog.version.config
✔ 迁移完成
```

### 2. 配置文件格式统一

**规则：** 两个配置文件必须使用相同格式

```
✅ 正确:
- freelog.resource.config.ts
- freelog.version.config.ts

❌ 错误:
- freelog.resource.config.ts
- freelog.version.config.js
```

### 3. resourceId 必须一致

**验证：** 在读取配置时验证两个文件的关联性

```typescript
function validateConfigs(resource: ResourceConfig, version: VersionConfig) {
  // 如果 version.config 中有 resourceId，必须与 resource.config 一致
  if (version.resourceId && version.resourceId !== resource.resourceId) {
    throw new Error('资源配置和版本配置的 resourceId 不一致');
  }
}
```

### 4. 命令行参数调整

**新参数：**
```bash
-c, --config <path>              # 配置文件目录（包含两个config）
--resource-config <path>         # 指定资源配置文件
--version-config <path>          # 指定版本配置文件
```

## 🎯 优势

1. **职责清晰** - 资源信息和版本信息分离
2. **易于管理** - 更新资源不影响版本，发布版本不影响资源
3. **符合 API 设计** - 直接映射到 API 的请求和响应
4. **便于协作** - 团队成员可以独立修改资源信息和版本信息
5. **扩展性好** - 未来添加新字段更清晰

## 📈 工作流程示例

### 典型开发流程

```bash
# 1. 初始化项目（自动创建资源和两个配置文件）
freelog-cli init
? 请选择初始化类型 主题
? 请输入主题名称 my-theme
? 请输入版本号 1.0.0
✔ Freelog 资源创建成功
✔ 配置文件创建成功

# 2. 开发...

# 3. 添加依赖（修改 version.config）
freelog-cli dep add <resourceId>

# 4. 发布版本（读取两个 config）
freelog-cli publish

# 5. 更新资源介绍（修改 resource.config）
freelog-cli update --intro "新的介绍"

# 6. 同步最新信息（更新两个 config）
freelog-cli sync
```

### 从零开始手动流程

```bash
# 1. 初始化（仅创建配置文件）
freelog-cli init
? 请选择初始化类型 其余资源
✔ 配置文件创建成功

# 2. 手动编辑 freelog.resource.config.json
{
  "resourceId": "",
  "resourceName": "My Resource",
  "resourceType": ["图片"],
  "intro": "这是一个图片资源"
}

# 3. 创建资源
freelog-cli create
✔ Freelog 资源创建成功
✔ resourceId 已更新到配置文件

# 4. 编辑 freelog.version.config.json
# ... 填写版本信息 ...

# 5. 发布版本
freelog-cli publish
```

## 📚 总结

这次重构将配置文件拆分为资源配置和版本配置，使得：
- 命令职责更清晰
- 配置管理更合理
- 与 API 设计更匹配
- 代码更易维护

需要修改的文件较多，但架构更合理，长期收益明显。

