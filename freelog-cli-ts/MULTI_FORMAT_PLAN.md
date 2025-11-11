# 多格式配置文件支持实施计划

## 📋 需求总结

### 1. 支持的格式
- ✅ `freelog.config.ts` (TypeScript)
- ✅ `freelog.config.js` (JavaScript)  
- ✅ `freelog.config.json` (JSON)

### 2. 优先级顺序
```
freelog.config.ts > freelog.config.js > freelog.config.json
```

### 3. 默认模板
在 `public/template/` 目录下提供默认模板文件

---

## 🎯 修改计划

### Phase 1: 创建模板目录和文件

#### 1.1 创建模板目录
```
public/
└── template/
    ├── freelog.config.template.ts
    ├── freelog.config.template.js
    └── freelog.config.template.json
```

#### 1.2 模板文件内容

**freelog.template.ts** (TypeScript 模板):
```typescript
import type { FreelogConfig } from '@freelog/cli';

const config: FreelogConfig = {
  // 资源 ID（必填）
  resourceId: '',
  
  // 版本号（必填）
  version: '1.0.0',
  
  // 文件 SHA1（必填）
  fileSha1: '',
  
  // 文件名（必填）
  filename: '',
  
  // 版本描述
  description: '',
  
  // 依赖列表
  dependencies: [],
  
  // 自定义属性描述符
  customPropertyDescriptors: [],
};

export default config;
```

**freelog.template.js** (JavaScript 模板):
```javascript
/**
 * @type {import('@freelog/cli').FreelogConfig}
 */
const config = {
  // 资源 ID（必填）
  resourceId: '',
  
  // 版本号（必填）
  version: '1.0.0',
  
  // 文件 SHA1（必填）
  fileSha1: '',
  
  // 文件名（必填）
  filename: '',
  
  // 版本描述
  description: '',
  
  // 依赖列表
  dependencies: [],
  
  // 自定义属性描述符
  customPropertyDescriptors: [],
};

module.exports = config;
```

**freelog.template.json** (JSON 模板):
```json
{
  "resourceId": "",
  "version": "1.0.0",
  "fileSha1": "",
  "filename": "",
  "description": "",
  "dependencies": [],
  "customPropertyDescriptors": []
}
```

---

### Phase 2: 更新 configService.ts

#### 2.1 修改 getConfigPath 函数

**当前代码**:
```typescript
const configFiles = [
  'freelog.config.ts',
  'freelog.config.js',
  'freelog.json5',
  'freelog.json',
];
```

**修改为**:
```typescript
const configFiles = [
  'freelog.config.ts',   // 最高优先级
  'freelog.config.js',   // 第二优先级
  'freelog.config.json', // 第三优先级
];
```

#### 2.2 修改 saveConfig 函数

**需要支持**:
- 保存 TypeScript 格式
- 保存 JavaScript 格式
- 保存 JSON 格式

**新增功能**:
- 根据原文件格式保存
- 如果是新文件，根据用户选择的格式保存
- 保持文件格式的注释和格式化

---

### Phase 3: 更新 init 命令

#### 3.1 修改 `src/commands/init.ts`

**当前**: 只生成 `freelog.config.ts`

**修改为**:
1. 自动判断项目类型（根据模板名称）
2. 从模板目录复制对应格式的模板
3. 填充用户输入的数据

**判断逻辑**:
```typescript
// 根据模板名称自动判断配置格式
function getConfigFormat(templateName: string): 'ts' | 'js' {
  // 如果模板名称包含 'ts'，使用 TypeScript
  if (templateName.toLowerCase().includes('ts')) {
    return 'ts';
  }
  // 否则使用 JavaScript
  return 'js';
}

// 使用示例
const templateName = options.template || 'default';
const configFormat = getConfigFormat(templateName);

// 根据格式复制模板
const templateFile = path.join(__dirname, '../../public/template', `freelog.config.template.${configFormat}`);
const configFile = path.join(projectPath, `freelog.config.${configFormat}`);
```

**规则**:
- 模板名包含 `ts` → 生成 `freelog.config.ts`
- 模板名不包含 `ts` → 生成 `freelog.config.js`
- 默认模板 → 生成 `freelog.config.js`

---

### Phase 4: 更新其他命令

#### 4.1 需要修改的命令文件

| 文件 | 修改内容 | 优先级 |
|------|---------|--------|
| `commands/init.ts` | 支持选择格式、复制模板 | 高 |
| `commands/publish.ts` | 无需修改（已使用 configService） | 低 |
| `commands/sync.ts` | 无需修改（已使用 configService） | 低 |
| `commands/dependency/*.ts` | 无需修改（已使用 configService） | 低 |

#### 4.2 验证点
- ✅ 所有命令都通过 `configService` 读取配置
- ✅ 不直接操作文件路径
- ✅ 使用统一的 API

---

### Phase 5: 更新 saveConfig 实现

#### 5.1 保存 TypeScript 格式

```typescript
async function saveAsTypeScript(config: FreelogConfig, filePath: string) {
  const content = `import type { FreelogConfig } from '@freelog/cli';

const config: FreelogConfig = ${JSON.stringify(config, null, 2)};

export default config;
`;
  await fs.writeFile(filePath, content, 'utf-8');
}
```

#### 5.2 保存 JavaScript 格式

```typescript
async function saveAsJavaScript(config: FreelogConfig, filePath: string) {
  const content = `/**
 * @type {import('@freelog/cli').FreelogConfig}
 */
const config = ${JSON.stringify(config, null, 2)};

module.exports = config;
`;
  await fs.writeFile(filePath, content, 'utf-8');
}
```

#### 5.3 保存 JSON 格式

```typescript
async function saveAsJSON(config: FreelogConfig, filePath: string) {
  await fs.writeJson(filePath, config, { spaces: 2 });
}
```

---

### Phase 6: 更新类型导出

#### 6.1 修改 package.json

**添加类型导出**:
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./types": "./public/freelog.d.ts"
  },
  "types": "./public/freelog.d.ts"
}
```

#### 6.2 创建 freelog.d.ts

将 `public/freelog.ts` 的类型定义导出为 `.d.ts` 文件：

```typescript
// public/freelog.d.ts
export interface FreelogConfig {
  resourceId: string;
  version: string;
  fileSha1: string;
  filename: string;
  description?: string;
  dependencies?: Dependency[];
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  // ... 其他字段
}

export interface Dependency {
  resourceId: string;
  versionRange: string;
}

// ... 其他类型定义
```

---

## 📝 实施步骤

### Step 1: 创建模板文件 ✅
1. 创建 `public/template/` 目录
2. 创建三个模板文件：
   - `freelog.template.ts`
   - `freelog.template.js`
   - `freelog.template.json`

### Step 2: 更新 configService.ts ✅
1. 修改 `getConfigPath` - 更新优先级顺序
2. 保留 `loadConfig` - 已支持多格式
3. 增强 `saveConfig` - 支持保存多种格式

### Step 3: 更新 init 命令 ✅
1. 添加格式选择交互
2. 从模板复制文件
3. 填充用户数据

### Step 4: 创建类型定义文件 ✅
1. 创建 `freelog.d.ts`
2. 更新 `package.json` 导出

### Step 5: 测试验证 ✅
1. 测试三种格式的创建
2. 测试三种格式的读取
3. 测试三种格式的保存
4. 测试优先级顺序

---

## 🔍 测试计划

### 测试用例 1: 格式优先级
```bash
# 同时存在多个格式时
freelog.config.ts + freelog.config.js + freelog.config.json
→ 应该加载 freelog.config.ts

freelog.config.js + freelog.config.json
→ 应该加载 freelog.config.js

freelog.config.json
→ 应该加载 freelog.config.json
```

### 测试用例 2: init 命令
```bash
# 使用包含 ts 的模板名
freelog-cli init my-widget-ts
→ 自动生成 freelog.config.ts

# 使用不包含 ts 的模板名
freelog-cli init my-widget
→ 自动生成 freelog.config.js

# 使用默认模板
freelog-cli init
→ 自动生成 freelog.config.js（默认）
```

### 测试用例 3: 其他命令
```bash
# publish 命令应该能读取所有格式
freelog-cli publish  # 使用 freelog.config.ts
freelog-cli publish  # 使用 freelog.config.js
freelog-cli publish  # 使用 freelog.config.json

# sync 命令应该能保存所有格式
freelog-cli sync
→ 保持原格式不变
```

---

## 📊 影响评估

### 需要修改的文件

| 文件 | 修改类型 | 工作量 |
|------|---------|--------|
| `public/template/freelog.config.template.ts` | 新建 | 小 |
| `public/template/freelog.config.template.js` | 新建 | 小 |
| `public/template/freelog.config.template.json` | 新建 | 小 |
| `public/freelog.d.ts` | 新建 | 中 |
| `src/services/configService.ts` | 修改 | 中 |
| `src/commands/init.ts` | 修改 | 中 |
| `package.json` | 修改 | 小 |

**总工作量**: 约 2-3 小时

### 向后兼容性

✅ **完全兼容**:
- 保留对 `freelog.config.ts` 和 `freelog.config.js` 的支持
- 现有项目无需修改
- 新项目可以选择格式

---

## 🚀 建议的实施顺序

### 阶段 1: 准备工作（30分钟）
1. ✅ 创建 `public/template/` 目录
2. ✅ 创建三个模板文件
3. ✅ 创建 `freelog.d.ts` 类型定义

### 阶段 2: 核心功能（60分钟）
4. ✅ 更新 `configService.ts`:
   - 修改优先级顺序
   - 增强 `saveConfig` 函数
5. ✅ 更新 `init` 命令:
   - 添加格式选择
   - 实现模板复制

### 阶段 3: 测试和完善（30分钟）
6. ✅ 手动测试各种格式
7. ✅ 测试优先级顺序
8. ✅ 更新文档

---

## 💡 注意事项

### 1. TypeScript 动态导入
- 使用 `import()` 动态导入 .ts/.js 文件
- 需要清除 require 缓存（如果有）

### 2. JSON 格式限制
- 不支持注释
- 不支持计算属性
- 但格式简单，易于编辑

### 3. 类型提示
- TypeScript: 原生类型支持
- JavaScript: 通过 JSDoc 提供类型
- JSON: 无类型提示（但可通过 JSON Schema）

### 4. 保存格式
- 默认保持原格式
- 如果原格式不存在，默认使用 TypeScript

---

## ✅ 验收标准

1. ✅ 支持三种格式的配置文件
2. ✅ 优先级顺序正确
3. ✅ init 命令可以选择格式
4. ✅ 所有命令都能正确读取三种格式
5. ✅ sync 等命令能正确保存三种格式
6. ✅ 保持向后兼容
7. ✅ 类型定义完整
8. ✅ 文档更新

---

**准备完成，可以开始实施！** 🚀

