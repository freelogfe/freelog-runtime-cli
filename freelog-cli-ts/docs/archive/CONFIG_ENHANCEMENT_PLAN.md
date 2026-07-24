# 配置文件增强计划

## 📋 问题分析

### 当前问题
1. 配置文件中的 `dependencies` 和 `baseUpcastResources` 只有 `resourceId`
2. 用户编辑时无法直观看到资源名称
3. 提交 API 时不需要 `resourceName`，会被忽略或报错

### 解决方案
在配置文件中保留 `resourceName` 字段，提交时自动过滤掉

---

## 🎯 实施方案

### 方案 A: 扩展配置类型（推荐）✅

在配置文件中允许包含 `resourceName`，但提交时过滤掉

#### 1. 更新类型定义

**freelog.ts - 扩展 Dependency**:
```typescript
/**
 * 依赖信息
 */
export interface Dependency {
  /** 依赖的资源 ID */
  resourceId: string;
  
  /** 依赖的资源名称（可选，仅用于配置文件可读性，不会提交到 API） */
  resourceName?: string;
  
  /** 依赖的资源版本范围 */
  versionRange: string;
}
```

**freelog.ts - 扩展 BaseUpcastResource**:
```typescript
/**
 * 基础上抛资源
 */
export interface BaseUpcastResource {
  /** 上抛的资源 ID */
  resourceId: string;
  
  /** 上抛的资源名称（可选，仅用于配置文件可读性，不会提交到 API） */
  resourceName?: string;
}
```

**freelog.ts - 扩展 FreelogConfig**:
```typescript
export interface FreelogConfig {
  /**
   * 资源 ID（必填）
   */
  resourceId: string;
  
  /**
   * 资源名称（可选，仅用于配置文件可读性，不会提交到 API）
   */
  resourceName?: string;
  
  // ... 其他字段
}
```

#### 2. 更新 configService.ts

**修改 `configToVersionBody` 函数**，过滤掉 `resourceName`:

```typescript
/**
 * 将 FreelogConfig 转换为 CreateResourceVersionBody
 * 移除 resourceId 和所有 resourceName 字段
 */
export function configToVersionBody(config: FreelogConfig): CreateResourceVersionBody {
  return {
    version: config.version,
    fileSha1: config.fileSha1,
    filename: config.filename,
    description: config.description,
    
    // 过滤 dependencies 中的 resourceName
    dependencies: config.dependencies?.map(dep => ({
      resourceId: dep.resourceId,
      versionRange: dep.versionRange,
      // resourceName 被过滤掉
    })),
    
    customPropertyDescriptors: config.customPropertyDescriptors,
    
    // 过滤 baseUpcastResources 中的 resourceName
    baseUpcastResources: config.baseUpcastResources?.map(resource => ({
      resourceId: resource.resourceId,
      // resourceName 被过滤掉
    })),
    
    batchSignContracts: config.batchSignContracts,
    inputAttrs: config.inputAttrs,
    authExcludedItems: config.authExcludedItems,
  };
}
```

#### 3. 更新模板文件

**freelog.config.template.ts**:
```typescript
const config: FreelogConfig = {
  resourceId: '',
  resourceName: '', // 可选，方便用户识别
  version: '1.0.0',
  fileSha1: '',
  filename: '',
  description: '',
  
  dependencies: [
    // 示例：
    // {
    //   resourceId: '5ef081b8fb172026e434e2fa',
    //   resourceName: 'my-dependency',  // 可选，方便识别
    //   versionRange: '^1.0.0',
    // }
  ],
  
  baseUpcastResources: [
    // 示例：
    // {
    //   resourceId: '5ef081b8fb172026e434e2fb',
    //   resourceName: 'base-resource',  // 可选，方便识别
    // }
  ],
};
```

#### 4. 更新 API dataType.ts

确保 API 请求类型不包含 `resourceName`:

```typescript
// src/api/dataType.ts

/**
 * API 依赖信息（不包含 resourceName）
 */
export interface ApiDependency {
  resourceId: string;
  versionRange: string;
}

/**
 * API 基础上抛资源（不包含 resourceName）
 */
export interface ApiBaseUpcastResource {
  resourceId: string;
}
```

---

### 方案 B: 严格模式（不推荐）❌

**问题**: 用户体验差，看不到资源名称

---

## 📊 对比分析

| 方案 | 优点 | 缺点 |
|------|------|------|
| **方案 A** | ✅ 配置文件可读性强<br>✅ 用户友好<br>✅ 自动过滤不需要的字段 | ⚠️ 需要手动维护 resourceName<br>⚠️ 可能不同步 |
| **方案 B** | ✅ 严格遵循 API 格式 | ❌ 配置文件难以阅读<br>❌ 用户体验差 |

**推荐**: 方案 A

---

## 🔧 实施步骤

### Step 1: 更新类型定义 ✅

1. 修改 `public/freelog.ts`:
   - 在 `Dependency` 中添加可选的 `resourceName`
   - 在 `BaseUpcastResource` 中添加可选的 `resourceName`  
   - 在 `FreelogConfig` 中添加可选的 `resourceName`

### Step 2: 更新 configService.ts ✅

2. 修改 `configToVersionBody` 函数:
   - 过滤 `dependencies` 中的 `resourceName`
   - 过滤 `baseUpcastResources` 中的 `resourceName`
   - 确保提交的数据符合 API 要求

### Step 3: 更新模板文件 ✅

3. 更新三个模板文件:
   - 添加 `resourceName` 字段示例
   - 添加注释说明用途
   - 在 dependencies 和 baseUpcastResources 示例中包含 `resourceName`

### Step 4: 更新 sync 命令 ✅

4. 修改 `commands/sync.ts`:
   - 从 API 获取资源信息时，同时获取 `resourceName`
   - 保存到配置文件时包含 `resourceName`

### Step 5: 更新 dependency 命令 ✅

5. 修改 `commands/dependency/add.ts`:
   - 添加依赖时，获取资源名称
   - 同时保存 `resourceId` 和 `resourceName`

---

## 📝 详细实现

### 1. 更新 freelog.ts

```typescript
/**
 * 依赖信息
 */
export interface Dependency {
  /** 依赖的资源 ID（必填） */
  resourceId: string;
  
  /**
   * 依赖的资源名称（可选）
   * 仅用于配置文件的可读性，方便用户识别
   * 提交到 API 时会被自动过滤掉
   */
  resourceName?: string;
  
  /** 依赖的资源版本范围（必填） */
  versionRange: string;
}

/**
 * 基础上抛资源
 */
export interface BaseUpcastResource {
  /** 上抛的资源 ID（必填） */
  resourceId: string;
  
  /**
   * 上抛的资源名称（可选）
   * 仅用于配置文件的可读性，方便用户识别
   * 提交到 API 时会被自动过滤掉
   */
  resourceName?: string;
}

/**
 * Freelog 资源版本配置
 */
export interface FreelogConfig {
  /** 资源 ID（必填） */
  resourceId: string;
  
  /**
   * 资源名称（可选）
   * 仅用于配置文件的可读性，方便用户识别
   * 提交到 API 时会被自动过滤掉
   */
  resourceName?: string;
  
  // ... 其他字段保持不变
}
```

### 2. 更新 configService.ts

```typescript
/**
 * 将 FreelogConfig 转换为 CreateResourceVersionBody
 * 自动过滤掉所有 resourceName 字段
 */
export function configToVersionBody(config: FreelogConfig): CreateResourceVersionBody {
  // 辅助函数：过滤对象中的 resourceName
  const omitResourceName = <T extends object>(obj: T): Omit<T, 'resourceName'> => {
    const { resourceName, ...rest } = obj as any;
    return rest;
  };
  
  return {
    version: config.version,
    fileSha1: config.fileSha1,
    filename: config.filename,
    description: config.description,
    
    // 过滤 dependencies 中的 resourceName
    dependencies: config.dependencies?.map(dep => omitResourceName(dep)),
    
    customPropertyDescriptors: config.customPropertyDescriptors,
    
    // 过滤 baseUpcastResources 中的 resourceName
    baseUpcastResources: config.baseUpcastResources?.map(resource => omitResourceName(resource)),
    
    batchSignContracts: config.batchSignContracts,
    inputAttrs: config.inputAttrs,
    authExcludedItems: config.authExcludedItems,
  };
}
```

---

## ✅ 验收标准

1. ✅ 配置文件中可以包含 `resourceName` 字段
2. ✅ `resourceName` 是可选的，不影响必填验证
3. ✅ 提交到 API 时自动过滤掉所有 `resourceName`
4. ✅ sync 命令从 API 获取时自动填充 `resourceName`
5. ✅ dependency add 命令自动获取并保存 `resourceName`
6. ✅ 配置文件更易读，用户体验更好

---

## 🎯 优势总结

### 用户体验

**之前**:
```typescript
dependencies: [
  {
    resourceId: '5ef081b8fb172026e434e2fa',  // 这是什么资源？
    versionRange: '^1.0.0',
  }
]
```

**之后**:
```typescript
dependencies: [
  {
    resourceId: '5ef081b8fb172026e434e2fa',
    resourceName: 'my-awesome-widget',  // 😊 一目了然！
    versionRange: '^1.0.0',
  }
]
```

### API 兼容性

✅ 提交时自动过滤，完全符合 API 要求  
✅ 不会因为额外字段导致错误  
✅ 向后兼容，旧配置仍然有效

---

**准备实施！** 🚀

