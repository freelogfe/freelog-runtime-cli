/**
 * 初始化命令
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { CommandOptions, FreelogConfig } from '../types';
import { saveConfig } from '../core/config';

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
        name: 'version',
        message: '初始版本:',
        default: '1.0.0',
        validate: (input: string) => /^\d+\.\d+\.\d+$/.test(input) ? true : '版本号格式应为 x.y.z'
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
      
      // 创建 freelog.json
      const config: FreelogConfig = {
        name: answers.projectName,
        version: answers.version,
        intro: answers.description,
        dependencies: [],
        resourceType: []
      };
      
      await fs.writeJson(path.join(projectDir, 'freelog.json'), config, { spaces: 2 });
      
      // 创建 README.md
      const readme = `# ${answers.projectName}

${answers.description}

## 开发

\`\`\`bash
# 安装依赖
npm install

# 开发
npm run dev

# 构建
npm run build
\`\`\`

## 发布

\`\`\`bash
freelog-cli publish
\`\`\`
`;
      
      await fs.writeFile(path.join(projectDir, 'README.md'), readme);
      
      spinner.succeed('项目创建成功!');
      
      console.log(chalk.green('\n✔ ') + `项目已创建: ${chalk.cyan(projectDir)}`);
      console.log(chalk.blue('\nℹ ') + '下一步:');
      console.log(`  ${chalk.gray('$')} cd ${answers.projectName}`);
      console.log(`  ${chalk.gray('$')} freelog-cli login`);
      console.log(`  ${chalk.gray('$')} freelog-cli add <resource>\n`);
      
    } catch (err: any) {
      spinner.fail('项目创建失败');
      throw err;
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `初始化失败: ${err.message}`);
    process.exit(1);
  }
}

