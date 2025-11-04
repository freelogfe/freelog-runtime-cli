# Freelog CLI TypeScript 迁移指南

## ✅ 已完成的工作

### 1. 项目结构搭建
- ✅ 使用 father 作为构建工具
- ✅ 完整的 TypeScript 配置
- ✅ package.json 配置（支持 ESM/CJS 双模式）

### 2. 核心模块 (src/core/)
- ✅ `constants.ts` - 常量配置，支持环境切换
- ✅ `errors.ts` - 自定义错误类型
- ✅ `auth.ts` - 认证模块（支持全局/工作空间，加密存储）
- ✅ `api.ts` - API 客户端（axios 封装，自动注入 token）
- ✅ `config.ts` - 配置文件管理
- ✅ `logger.ts` - 日志模块（winston）

### 3. 工具模块 (src/utils/)
- ✅ `crypto.ts` - 加密解密工具
- ✅ `validator.ts` - 验证工具（版本号、配置等）
- ✅ `file.ts` - 文件操作工具
- ✅ `output.ts` - 输出格式化（表格等）
- ✅ `version-selector.ts` - 交互式版本选择

### 4. 类型定义 (src/types/)
- ✅ `index.ts` - 完整的类型定义

### 5. 命令模块 (src/commands/)
- ✅ `auth.ts` - 认证命令（login, logout, status）

### 6. 主入口
- ✅ `src/index.ts` - CLI 主程序
- ✅ `src/bin/index.ts` - 可执行文件入口

## 📋 待完成的工作

### 1. 安装依赖并测试构建

```bash
# 删除 node_modules 重新安装
rm -rf node_modules package-lock.json
npm install

# 或使用 pnpm（确保不在 workspace 中）
pnpm install

# 测试构建
npm run build

# 构建成功后应该生成 dist 目录
```

### 2. 补充其他命令

需要创建以下命令文件（参考 cli-project/src/commands/）:

#### a. `src/commands/init.ts` - 初始化项目
- 模板选择和安装
- 创建 freelog.json

#### b. `src/commands/publish.ts` - 发布作品
- 文件打包（AdmZip）
- 上传到 Freelog
- 草稿/正式发布

#### c. `src/commands/sync.ts` - 信息同步
- 同步 freelog.json

#### d. `src/commands/analyze.ts` - 文件分析
- 分析项目文件

#### e. `src/commands/dependency/` - 依赖管理
- `add.ts` - 添加依赖
- `remove.ts` - 删除依赖
- `change.ts` - 修改依赖
- `update.ts` - 更新依赖
- `list.ts` - 列出依赖

### 3. 更新 src/index.ts

在主入口文件中注册所有命令：

```typescript
import { executeInit } from './commands/init';
import { executePublish } from './commands/publish';
// ... 导入其他命令

// 注册命令
program
  .command('init [name]')
  .description('初始化项目')
  .action(executeInit);

program
  .command('publish')
  .description('发布作品')
  .option('-d, --draft', '发布草稿')
  .action(executePublish);
  
// ...更多命令
```

### 4. 本地测试

```bash
# 链接到全局
npm link

# 测试命令
freelog-cli --help
freelog-cli login -t
freelog-cli status

# 取消链接
npm unlink -g @freelog/cli
```

### 5. 发布到 NPM

```bash
# 确保已登录 npm
npm login

# 发布（会自动执行 prepublishOnly 构建）
npm publish --access public

# 如果是测试版本
npm publish --tag beta
```

## 🔑 关键改进点

### 1. TypeScript 优势
- 完整的类型检查
- 更好的 IDE 支持
- 减少运行时错误

### 2. Father 构建优势
- 自动生成 .d.ts 类型声明
- 同时生成 ESM 和 CJS 格式
- 优化的打包体积
- 持久缓存支持

### 3. 代码组织
- 清晰的模块划分
- 统一的错误处理
- 类型安全的 API 调用

## 📦 构建输出

构建后的 `dist/` 目录结构：

```
dist/
├── index.js          # CJS 格式
├── index.mjs         # ESM 格式  
├── index.d.ts        # 类型定义
├── bin/
│   └── index.js      # CLI 入口
├── core/
│   ├── *.js
│   ├── *.mjs
│   └── *.d.ts
├── commands/
│   ├── *.js
│   ├── *.mjs
│   └── *.d.ts
└── utils/
    ├── *.js
    ├── *.mjs
    └── *.d.ts
```

## 🚀 下一步

1. **立即可做**: 安装依赖并测试基础认证功能
2. **短期目标**: 补充其他命令（publish, init, dependency 等）
3. **长期优化**: 添加单元测试、完善文档

## 💡 提示

- 所有 JS 代码都在 `cli-project/src/` 目录下，可以直接参考
- 转换时主要是添加类型标注和将 `require` 改为 `import`
- API 调用已统一为 `apiClient.get/post`，返回值需要通过 `response.data.data` 访问

## 🐛 常见问题

### Q: 安装依赖失败
A: 确保不在 pnpm workspace 中，使用 npm install 或在独立目录中使用 pnpm

### Q: 构建失败
A: 检查 TypeScript 类型错误，运行 `npx tsc --noEmit` 检查类型

### Q: father 配置问题
A: 参考 `.fatherrc.ts` 配置文件和 [father 文档](https://github.com/umijs/father)

