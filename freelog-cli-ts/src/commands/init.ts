/**
 * 初始化命令
 * 创建项目并生成 freelog.config.ts 配置文件
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { CommandOptions } from '../types';
import type { FreelogConfig } from '../../public/freelog';

export async function executeInit(name?: string, options: CommandOptions = {}): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 初始化 Freelog 项目 ===\n'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: '项目名称:',
        default: name || 'my-freelog-project',
        validate: (input: string) => input.trim() ? true : '项目名称不能为空'
      },
      {
        type: 'input',
        name: 'resourceId',
        message: '资源 ID:',
        default: '',
        validate: (input: string) => {
          if (!input.trim()) return '资源 ID 不能为空';
          if (!/^[a-f0-9]{24}$/.test(input)) return '资源 ID 格式错误（应为 24 位十六进制字符）';
          return true;
        }
      },
      {
        type: 'input',
        name: 'version',
        message: '初始版本:',
        default: '1.0.0',
        validate: (input: string) => /^\d+\.\d+\.\d+$/.test(input) ? true : '版本号格式应为 x.y.z'
      },
      {
        type: 'input',
        name: 'filename',
        message: '文件名:',
        default: 'resource.zip',
        validate: (input: string) => input.trim() ? true : '文件名不能为空'
      },
      {
        type: 'input',
        name: 'fileSha1',
        message: '文件 SHA1 (可选，稍后可修改):',
        default: '',
        validate: (input: string) => {
          if (!input.trim()) return true; // 允许为空
          if (!/^[a-f0-9]{40}$/.test(input)) return 'SHA1 格式错误（应为 40 位十六进制字符）';
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: '项目描述:',
        default: ''
      }
    ]);
    
    const projectDir = path.join(process.cwd(), answers.projectName);
    
    if (fs.existsSync(projectDir)) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `目录 ${answers.projectName} 已存在，是否覆盖?`,
          default: false
        }
      ]);
      
      if (!overwrite) {
        console.log(chalk.yellow('⚠ ') + '操作已取消');
        return;
      }
      
      await fs.remove(projectDir);
    }
    
    const spinner = ora('正在创建项目...').start();
    
    try {
      // 创建目录
      await fs.ensureDir(projectDir);
      await fs.ensureDir(path.join(projectDir, 'src'));
      await fs.ensureDir(path.join(projectDir, 'dist'));
      
      // 创建 freelog.config.ts
      const configContent = `import type { FreelogConfig } from 'freelog-cli/types';

const config: FreelogConfig = {
  /**
   * 资源 ID（必填）
   * @example "5ef081b8fb172026e434e2fa"
   */
  resourceId: "${answers.resourceId}",
  
  /**
   * 版本号（必填）
   * 遵循语义化版本规范
   */
  version: "${answers.version}",
  
  /**
   * 文件 SHA1 值（必填）
   * 40位十六进制字符串
   */
  fileSha1: "${answers.fileSha1 || 'TODO: 填写文件SHA1'}",
  
  /**
   * 文件名或对象名（必填）
   */
  filename: "${answers.filename}",
  
  /**
   * 版本描述信息（可选）
   */
  description: "${answers.description || ''}",
  
  /**
   * 版本依赖信息（可选）
   * 定义当前资源版本依赖的其他资源
   */
  dependencies: [
    // {
    //   resourceId: "依赖的资源ID",
    //   versionRange: "^1.0.0"
    // }
  ],
  
  /**
   * 自定义属性定义（可选）
   */
  customPropertyDescriptors: [
    // {
    //   key: "theme",
    //   defaultValue: "light",
    //   type: "select",
    //   candidateItems: ["light", "dark"],
    //   remark: "主题设置"
    // }
  ],
  
  /**
   * 版本上抛信息（可选）
   * 第一个版本需要传递此参数
   */
  // baseUpcastResources: [],
  
  /**
   * 批量签约配置（可选）
   */
  // batchSignContracts: [],
};

export default config;
`;
      
      await fs.writeFile(path.join(projectDir, 'freelog.config.ts'), configContent);
      
      // 创建 README.md
      const readme = `# ${answers.projectName}

${answers.description || '一个 Freelog 资源项目'}

## 项目信息

- 资源 ID: \`${answers.resourceId}\`
- 版本号: \`${answers.version}\`
- 文件名: \`${answers.filename}\`

## 开发

\`\`\`bash
# 安装依赖
npm install

# 开发
npm run dev

# 构建
npm run build
\`\`\`

## Freelog CLI 命令

### 登录
\`\`\`bash
# 全局登录
freelog-cli login -g

# 工作空间登录
freelog-cli login
\`\`\`

### 发布
\`\`\`bash
# 发布正式版本
freelog-cli publish

# 发布草稿
freelog-cli publish --draft
\`\`\`

### 依赖管理
\`\`\`bash
# 添加依赖
freelog-cli add <resourceId>

# 查看依赖列表
freelog-cli list

# 更新依赖
freelog-cli update <resourceId>

# 移除依赖
freelog-cli remove <resourceId>
\`\`\`

### 同步
\`\`\`bash
# 同步资源信息
freelog-cli sync
\`\`\`

## 配置文件

配置文件位于项目根目录的 \`freelog.config.ts\`，包含：
- 资源 ID 和版本号
- 文件信息（SHA1、文件名）
- 依赖信息
- 自定义属性
- 上抛资源配置
- 批量签约配置

详细说明请参考 [Freelog 文档](https://doc.freelog.com/)
`;
      
      await fs.writeFile(path.join(projectDir, 'README.md'), readme);
      
      // 创建 .gitignore
      const gitignore = `node_modules/
dist/
*.log
.DS_Store
.env
.env.local
`;
      await fs.writeFile(path.join(projectDir, '.gitignore'), gitignore);
      
      spinner.succeed('项目创建成功!');
      
      console.log(chalk.green('\n✔ ') + `项目已创建: ${chalk.cyan(projectDir)}`);
      console.log(chalk.blue('\nℹ ') + '下一步:');
      console.log(`  ${chalk.gray('$')} cd ${answers.projectName}`);
      
      if (!answers.fileSha1) {
        console.log(chalk.yellow('\n💡 提示: 请在 freelog.config.ts 中填写文件 SHA1'));
      }
      
      console.log(chalk.blue('\nℹ ') + '常用命令:');
      console.log(`  ${chalk.gray('$')} freelog-cli login -g         ${chalk.gray('# 登录')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli add <resourceId>  ${chalk.gray('# 添加依赖')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli publish           ${chalk.gray('# 发布')}\n`);
      
    } catch (err: any) {
      spinner.fail('项目创建失败');
      throw err;
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `初始化失败: ${err.message}`);
    process.exit(1);
  }
}

