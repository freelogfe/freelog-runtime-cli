# 配置文件拆分 - 迁移指南

## ✅ 已完成的工作

### 核心架构 (100%)
- ✅ 类型定义文件
- ✅ 模板文件 (6个)
- ✅ ConfigService 重构
- ✅ DependencyService 创建

### 核心命令 (100%)
- ✅ `create` - 创建资源
- ✅ `update` - 更新资源信息
- ✅ `init` - 生成两个配置文件
- ✅ `sync` - 同步到两个配置
- ✅ `publish` - 从两个配置读取

### 依赖命令 (20%)
- ✅ `dep add` - 部分修改完成

## ⏳ 剩余工作

### 1. 完成其他 dep 命令修改

需要修改的文件：
- `src/commands/dependency/remove.ts`
- `src/commands/dependency/list.ts`
- `src/commands/dependency/update.ts`
- `src/commands/dependency/change.ts`
- `src/commands/dependency/sync.ts`

#### 修改模式（统一）

**步骤 1: 修改导入**

```typescript
// 旧的
import { loadConfig, saveConfig } from '../../services/configService';
import type { Dependency } from '../../../public/freelog';

// 新的
import { loadVersionConfig, saveVersionConfig } from '../../services/versionConfigService';
import { getAllDependencies, addDependency, removeDependency, updateDependencyVersion } from '../../services/dependencyService';
import type { Dependency } from '../../../public/freelog.version';
```

**步骤 2: 修改配置加载**

```typescript
// 旧的
const config = await loadConfig(options.config);
const dependencies = config.dependencies || [];

// 新的
const dependencies = await getAllDependencies(options.config);
```

**步骤 3: 修改配置保存**

```typescript
// 旧的
config.dependencies = newDependencies;
await saveConfig(config, options.config);

// 新的
await batchUpdateDependencies(newDependencies, options.config);
// 或单个
await addDependency(dependency, options.config);
await removeDependency(resourceId, options.config);
```

### 2. 清理旧文件

```bash
# 备份旧文件
cd freelog-cli-ts/src/services
mv configService.ts configService.old.ts
mv configService.new.ts configService.ts

# 删除旧的类型和模板
cd ../../public
rm freelog.config.ts
rm template/freelog.config.template.ts
rm template/freelog.config.template.js
rm template/freelog.config.template.json
```

### 3. 更新导出

确保 `configService.ts` 正确导出所有函数：

```typescript
// src/services/configService.ts
export * from './resourceConfigService';
export * from './versionConfigService';
export * from './dependencyService';
```

## 🔧 手动完成步骤

### Step 1: 修改 remove.ts

```bash
# 文件：src/commands/dependency/remove.ts
```

修改点：
1. 导入改为 `removeDependency`
2. 使用 `await removeDependency(resourceId, options.config)`

### Step 2: 修改 list.ts

```bash
# 文件：src/commands/dependency/list.ts
```

修改点：
1. 导入改为 `getAllDependencies`
2. 使用 `const dependencies = await getAllDependencies(options.config)`

### Step 3: 修改 update.ts

```bash
# 文件：src/commands/dependency/update.ts
```

修改点：
1. 导入改为 `updateDependencyVersion`
2. 使用 `await updateDependencyVersion(resourceId, versionRange, options.config)`

### Step 4: 修改 change.ts

```bash
# 文件：src/commands/dependency/change.ts
```

修改点：
1. 导入改为 `updateDependencyVersion`
2. 同 update.ts

### Step 5: 修改 sync.ts (dependency)

```bash
# 文件：src/commands/dependency/sync.ts
```

修改点：
1. 导入改为 `batchUpdateDependencies`
2. 使用 `await batchUpdateDependencies(newDeps, options.config)`

### Step 6: 清理和重命名

```bash
# 1. 重命名 configService
cd src/services
rm configService.ts  # 或 mv configService.ts configService.old.ts
mv configService.new.ts configService.ts

# 2. 删除旧的配置模板（可选，保留作为参考）
cd ../../public
# mkdir -p old
# mv freelog.config.ts old/
# mv template/freelog.config.template.* old/
```

## 📝 测试清单

完成修改后，测试以下命令：

```bash
# 1. 初始化
freelog-cli init my-test-project

# 2. 创建资源
freelog-cli create

# 3. 更新资源
freelog-cli update --intro "测试介绍"

# 4. 同步
freelog-cli sync

# 5. 添加依赖
freelog-cli dep add <resourceId>

# 6. 列出依赖
freelog-cli dep list

# 7. 移除依赖
freelog-cli dep remove <resourceId>

# 8. 发布
freelog-cli publish
```

## 🎯 验证点

- [ ] 两个配置文件都正确生成
- [ ] 资源信息同步到 resource.config
- [ ] 版本信息同步到 version.config
- [ ] 依赖只保存在 version.config
- [ ] publish 命令从两个文件读取
- [ ] 所有 dep 命令正常工作

## 💡 注意事项

1. **向后兼容**：旧的 `freelog.config.*` 文件不会自动迁移，需要手动执行 `sync` 命令
2. **配置格式一致**：两个配置文件必须使用相同格式（.ts, .js 或 .json）
3. **resourceId 必须一致**：确保两个配置文件的 resourceId 相同
4. **测试环境**：建议先在测试项目中验证

## 📚 相关文档

- `CONFIG_SPLIT_ARCHITECTURE.md` - 完整的架构设计文档
- `INIT_REFACTOR.md` - Init 命令重构文档
- `INIT_SIMPLIFICATION.md` - Init 简化文档

## 🆘 遇到问题？

1. 检查配置文件格式是否一致
2. 确认 resourceId 是否存在
3. 查看 linter 错误
4. 运行 `freelog-cli sync` 重新同步

## ✨ 新功能

1. **create 命令** - 创建 Freelog 资源
2. **update 命令** - 更新资源信息（intro, coverImages）
3. **分离的配置** - 资源信息和版本信息分开管理
4. **更清晰的职责** - 每个配置文件专注于自己的领域

