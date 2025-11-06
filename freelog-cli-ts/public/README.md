# Freelog 资源版本配置

## 📁 文件说明

- **`freelog.config.ts`** - TypeScript 配置模板（推荐使用）✨
- **`freelog.example.config.ts`** - 完整的配置示例
- **`freelog.ts`** - 类型定义文件
- **`freelog.schema.json`** - JSON Schema 定义（用于 JSON 格式验证）

## 🚀 快速开始

### 1. 复制配置文件模板

```bash
cp freelog.config.ts your-project/
```

### 2. 编辑配置文件

```typescript
import type { FreelogConfig } from './freelog';

const config: FreelogConfig = {
  // ✅ 有完整的类型检查和智能提示
  version: "1.0.0",
  fileSha1: "你的文件SHA1值",
  filename: "你的文件名.zip",
  
  // 可选字段...
};

export default config;
```

### 3. 使用配置

```typescript
import config from './freelog.config';

// 配置会被自动验证
// 类型错误会在编辑时就提示
```

## ✨ TypeScript 配置的优势

✅ **完整的类型检查** - 编辑时实时检查类型错误  
✅ **智能提示** - 输入时自动补全字段名  
✅ **注释支持** - 使用 `//` 或 `/* */` 注释  
✅ **重构友好** - 支持重命名、查找引用等  
✅ **编译时验证** - 确保配置正确  
✅ **IDE 完美支持** - Cursor/VS Code 原生支持

## 📖 配置字段说明

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | `string` | 版本号（语义化版本） |
| `fileSha1` | `string` | 文件 SHA1 值（40位） |
| `filename` | `string` | 文件名或对象名 |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `description` | `string` | 版本描述信息 |
| `dependencies` | `Dependency[]` | 版本依赖信息 |
| `customPropertyDescriptors` | `CustomPropertyDescriptor[]` | 自定义属性定义 |
| `baseUpcastResources` | `BaseUpcastResource[]` | 版本上抛信息 |
| `batchSignContracts` | `BatchSignContract[]` | 批量签约配置 |
| `inputAttrs` | `InputAttr[]` | 输入属性数组 |
| `authExcludedItems` | `AuthExcludedItem[]` | 授权排除项 |

## 💡 配置示例

### 添加依赖

```typescript
const config: FreelogConfig = {
  dependencies: [
    {
      resourceId: "5ef04fb1bfe6f11cb0424e50",
      versionRange: "^1.0.0",  // 兼容 1.x.x 版本
    },
  ],
};
```

### 添加自定义属性

```typescript
const config: FreelogConfig = {
  customPropertyDescriptors: [
    {
      key: "theme",
      defaultValue: "light",
      type: "select",  // 类型会被自动检查
      candidateItems: ["light", "dark", "auto"],
      remark: "主题选择",
    },
  ],
};
```

### 类型约束示例

```typescript
// ✅ 正确
type: "select"

// ❌ 错误 - 编辑器会提示错误
type: "invalid"  // Type '"invalid"' is not assignable to type 'CustomPropertyType'

// ✅ 自动补全
customPropertyDescriptors: [
  {
    type: "s"  // 输入 's' 会提示: select
  }
]
```

## 🛠️ 在代码中使用

### 加载配置

```typescript
import { loadFreelogConfig } from '@freelog/cli/utils/configLoader';

// 自动查找并加载配置文件（支持 .ts 格式）
const config = await loadFreelogConfig();
```

### 使用类型

```typescript
import type { FreelogConfig, CustomPropertyDescriptor } from './freelog';

// 在函数中使用类型
function processConfig(config: FreelogConfig) {
  console.log(config.version);  // ✅ 有类型提示
}

// 创建自定义属性
const prop: CustomPropertyDescriptor = {
  key: "theme",
  defaultValue: "light",
  type: "select",  // ✅ 类型检查
  candidateItems: ["light", "dark"],
};
```

## ❓ 常见问题

### Q: TypeScript 项目如何使用？

直接导入即可：

```typescript
import config from './freelog.config';
import { createResourceVersion } from '@freelog/cli';

await createResourceVersion(resourceId, config);
```

### Q: JavaScript 项目如何使用？

TypeScript 配置文件会编译成 JavaScript：

```javascript
// freelog.config.js (编译后)
const config = {
  version: "1.0.0",
  // ...
};

module.exports = config;
```

### Q: 如何获取文件 SHA1 值？

**Node.js:**
```typescript
import crypto from 'crypto';
import fs from 'fs';

const hash = crypto.createHash('sha1');
hash.update(fs.readFileSync('your-file.zip'));
const fileSha1 = hash.digest('hex');
```

**命令行:**
```bash
# Windows (PowerShell)
Get-FileHash -Algorithm SHA1 your-file.zip

# Mac/Linux
shasum -a 1 your-file.zip
```

### Q: 还想用 JSON5 怎么办？

JSON5 也支持，但没有 TypeScript 的类型检查优势。如果坚持使用 JSON5：

```bash
# 配置加载器也支持 JSON5 格式
npm install json5
```

然后创建 `freelog.json5` 文件即可。

## 📚 类型定义

查看 `freelog.ts` 文件获取完整的类型定义。

主要类型：
- `FreelogConfig` - 完整配置接口
- `CustomPropertyDescriptor` - 自定义属性描述器
- `Dependency` - 依赖信息
- `CustomPropertyType` - 自定义属性类型枚举

## 🎯 推荐工作流

1. **复制模板** → `cp freelog.config.ts your-project/`
2. **编辑配置** → 填写必填字段，添加需要的可选字段
3. **类型检查** → 编译时自动验证（`tsc --noEmit`）
4. **发布资源** → 使用 Freelog CLI 发布

## 参考文档

- [创建资源版本 API](https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html)
- [Freelog 官方文档](https://doc.freelog.com/)
- [TypeScript 文档](https://www.typescriptlang.org/)
