# 批量命令与单独资源命令对比

## 依赖管理命令对比

| 命令 | 单独资源 | 批量资源 | 状态 |
|------|---------|---------|------|
| 添加依赖 | `dependency/add.ts` | `batch/dep/add.ts` | ✅ 已有 |
| 查看依赖列表 | `dependency/list.ts` | `batch/dep/list.ts` | ✅ 已有 |
| 移除依赖 | `dependency/remove.ts` | `batch/dep/remove.ts` | ❌ **缺失** |
| 更新依赖版本 | `dependency/update.ts` | `batch/dep/update.ts` | ❌ **缺失** |
| 修改依赖版本 | `dependency/change.ts` | `batch/dep/change.ts` | ❌ **缺失**（update的别名） |
| 同步依赖 | `dependency/sync.ts` | `batch/dep/sync.ts` | ❌ **缺失** |

## 策略管理命令对比

| 命令 | 单独资源 | 批量资源 | 状态 |
|------|---------|---------|------|
| 添加策略 | `policy.ts` (add) | `batch/policy/add.ts` | ❌ **缺失** |
| 查看策略列表 | `policy/list.ts` | `batch/policy/list.ts` | ✅ 已有 |

## 缺失的命令

### 1. batch/dep/remove.ts
**功能**: 为批量配置中的某个资源移除依赖

**命令格式**:
```bash
freelog-cli batch dep remove <resourceName> <dependencyId>
```

### 2. batch/dep/update.ts
**功能**: 为批量配置中的某个资源更新依赖的版本范围

**命令格式**:
```bash
freelog-cli batch dep update <resourceName> <dependencyId> [versionRange]
```

### 3. batch/dep/change.ts
**功能**: 修改依赖版本（update 的别名）

**命令格式**:
```bash
freelog-cli batch dep change <resourceName> <dependencyId> [versionRange]
```

### 4. batch/dep/sync.ts
**功能**: 为批量配置中的某个资源同步依赖（检查更新、更新到最新版本等）

**命令格式**:
```bash
freelog-cli batch dep sync <resourceName> [targetVersion]
```

### 5. batch/policy/add.ts
**功能**: 为批量配置中的某个资源添加策略

**命令格式**:
```bash
freelog-cli batch policy add <resourceName>
```

## 实现建议

所有缺失的命令都应该：
1. 复用单独资源命令的服务函数
2. 针对批量配置中的单个资源操作
3. 需要指定资源名称（交互式选择或命令行参数）
4. 操作完成后更新批量配置

