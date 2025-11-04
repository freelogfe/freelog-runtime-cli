# CLI 项目 TypeScript 迁移指南

## ✅ 已完成

### 1. **项目结构**
```
freelog-cli-ts/
├── src/
│   ├── bin/          # CLI 入口
│   ├── core/         # 核心模块 (TS)
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   ├── config.ts
│   │   ├── constants.ts
│   │   └── errors.ts
│   ├── utils/        # 工具模块 (TS)
│   │   └── crypto.ts
│   ├── types/        # 类型定义
│   │   └── index.ts
│   └── index.ts      # 主入口
├── dist/             # 构建输出（father 自动生成）
├── package.json
├── tsconfig.json
└── .fatherrc.ts      # father 配置
```

### 2. **使用 Father 框架**
- ✅ 安装依赖: `father`, `typescript`, `@types/*`
- ✅ 配置 `.fatherrc.ts` (使用 CJS 模式)
- ✅ 配置 `tsconfig.json`
- ✅ 构建命令: `pnpm build`
- ✅ 开发命令: `pnpm dev`

### 3. **构建流程**
```bash
# 开发模式（监听文件变化）
pnpm dev

# 生产构建
pnpm build

# 发布前自动构建
pnpm prepublishOnly
```

### 4. **测试构建结果**
```bash
node dist/index.js --help
```

## 📝 下一步工作

### 需要迁移的命令 (从 cli-project/src/commands/)
1. **auth** 命令
   - login.js → commands/auth/login.ts
   - logout.js → commands/auth/logout.ts  
   - status.js → commands/auth/status.ts

2. **dependency** 命令
   - add.js → commands/dependency/add.ts
   - change.js → commands/dependency/change.ts
   - update.js → commands/dependency/update.ts
   - remove.js → commands/dependency/remove.ts
   - list.js → commands/dependency/list.ts

3. **其他命令**
   - init.js → commands/init.ts
   - publish.js → commands/publish.ts
   - sync.js → commands/sync.ts
   - analyze.js → commands/analyze.ts

### 迁移步骤

#### 1. 为每个命令创建 TS 文件
```typescript
// 示例: src/commands/auth/login.ts
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import apiClient from '../../core/api';
import { saveAuth } from '../../core/auth';
import { CommandOptions, AuthInfo } from '../../types';

export async function executeLogin(options: CommandOptions): Promise<void> {
  // 实现登录逻辑
}
```

#### 2. 在主入口注册命令
```typescript
// src/index.ts
import { executeLogin } from './commands/auth/login';

program
  .command('login')
  .description('用户登录')
  .option('-g, --global', '全局登录')
  .action(executeLogin);
```

#### 3. 构建并测试
```bash
pnpm build
node dist/index.js login --help
```

## 🚀 发布到 NPM

### 1. 登录 NPM
```bash
npm login
```

### 2. 发布
```bash
# 自动执行 prepublishOnly (构建)
npm publish
```

### 3. 发布流程
- `prepublishOnly` 钩子自动运行 `father build`
- 打包 `dist/` 目录
- 上传到 NPM registry

## 📦 Package.json 关键配置

```json
{
  "bin": {
    "freelog-cli": "./dist/bin/index.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "father build",
    "prepublishOnly": "father build"
  }
}
```

## 🎯 优势

1. **TypeScript 类型安全**
   - 编译时类型检查
   - 更好的 IDE 支持
   - 自动生成 `.d.ts` 类型声明

2. **Father 框架**
   - 专为 NPM 包设计
   - 自动处理 CommonJS/ESM
   - 内置类型定义生成
   - 开箱即用的构建配置

3. **开发体验**
   - `pnpm dev` 实时监听
   - Source map 支持
   - 快速增量构建

## ⚠️ 注意事项

1. 发布前必须运行 `pnpm build`
2. `dist/` 目录由 father 自动生成，不要手动修改
3. 所有业务代码放在 `src/` 目录
4. 类型定义统一放在 `src/types/`

