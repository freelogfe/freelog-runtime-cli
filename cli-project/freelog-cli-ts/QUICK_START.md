# 快速开始

## 📦 安装依赖

```bash
cd cli-project/freelog-cli-ts
pnpm install --ignore-workspace
```

## 🛠️ 开发

### 1. 开发模式（监听文件变化）
```bash
pnpm dev
```

### 2. 构建
```bash
pnpm build
```

### 3. 测试运行
```bash
node dist/index.js --help
node dist/index.js login
node dist/index.js init my-project
```

## 📝 添加新命令

### 示例: 添加登录命令

#### 1. 创建命令文件
```typescript
// src/commands/auth/login.ts
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import apiClient from '../../core/api';
import { saveAuth } from '../../core/auth';
import { CommandOptions } from '../../types';

export async function executeLogin(options: CommandOptions): Promise<void> {
  console.log(chalk.cyan('\n=== 用户登录 ===\n'));
  
  // 获取用户输入
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: '请输入用户名:',
      validate: (input) => !!input || '用户名不能为空'
    },
    {
      type: 'password',
      name: 'password',
      message: '请输入密码:',
      validate: (input) => !!input || '密码不能为空'
    }
  ]);
  
  // 调用登录 API
  const spinner = ora('正在登录...').start();
  
  try {
    const response = await apiClient.post('/v2/passport/login', {
      loginName: answers.username,
      password: answers.password
    });
    
    const token = response.headers.authorization || response.headers.get('authorization');
    
    if (!token) {
      throw new Error('登录失败: 未获取到 token');
    }
    
    // 保存认证信息
    saveAuth({
      token,
      userId: response.data.data.userId,
      username: response.data.data.username,
      scope: options.global ? 'global' : 'workspace'
    }, options.global);
    
    spinner.succeed('登录成功!');
    console.log(chalk.green('✔ ') + `欢迎, ${response.data.data.username}!`);
    
  } catch (error: any) {
    spinner.fail('登录失败');
    console.log(chalk.red('✖ ') + error.message);
    process.exit(1);
  }
}
```

#### 2. 在主入口注册命令
```typescript
// src/index.ts
import { executeLogin } from './commands/auth/login';

program
  .command('login')
  .description('用户登录')
  .option('-g, --global', '全局登录（保存到用户目录）')
  .action(executeLogin);
```

#### 3. 构建并测试
```bash
pnpm build
node dist/index.js login --help
node dist/index.js login
```

## 🚀 发布到 NPM

### 1. 更新版本号
```json
// package.json
{
  "version": "1.0.1"
}
```

### 2. 构建
```bash
pnpm build
```

### 3. 发布
```bash
npm login
npm publish --access public
```

### 4. 安装使用
```bash
npm install -g @freelog/cli
freelog-cli --help
```

## 📂 项目结构

```
freelog-cli-ts/
├── src/                    # 源代码
│   ├── bin/
│   │   └── index.ts       # CLI 入口
│   ├── commands/          # 命令实现
│   │   ├── auth/
│   │   │   ├── login.ts
│   │   │   ├── logout.ts
│   │   │   └── status.ts
│   │   └── dependency/
│   │       ├── add.ts
│   │       └── ...
│   ├── core/              # 核心模块
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   ├── config.ts
│   │   └── ...
│   ├── utils/             # 工具函数
│   ├── types/             # 类型定义
│   └── index.ts           # 主入口
├── dist/                  # 构建输出
├── package.json
├── tsconfig.json
└── .fatherrc.ts          # Father 配置
```

## 🎯 核心 API

### 认证模块
```typescript
import { saveAuth, getCurrentAuth, requireAuth, clearAuth } from './core/auth';

// 保存认证
saveAuth(authInfo, isGlobal);

// 获取当前认证
const auth = getCurrentAuth();

// 需要认证（未认证会抛出错误）
const auth = requireAuth();

// 清除认证
clearAuth(isGlobal);
```

### API 客户端
```typescript
import apiClient from './core/api';

// GET 请求
const response = await apiClient.get('/v2/resources/:id');

// POST 请求
const response = await apiClient.post('/v2/passport/login', { ... });
```

### 配置管理
```typescript
import { readConfig, saveConfig, updateConfig } from './core/config';

// 读取配置
const config = readConfig();

// 保存配置
saveConfig(config);

// 更新配置
updateConfig({ version: '1.0.1' });
```

## 💡 提示

1. **开发时使用 `pnpm dev`**: 自动监听文件变化
2. **发布前运行 `pnpm build`**: 确保构建成功
3. **使用 TypeScript**: 获得类型提示和编译时检查
4. **遵循现有代码风格**: 保持代码一致性

