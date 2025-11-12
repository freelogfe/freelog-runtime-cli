/**
 * 初始化命令 - 主入口
 * 根据类型选择路由到不同的初始化逻辑
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import { CommandOptions } from '../types';
import { executeInitTemplate, TYPE_THEME, TYPE_WIDGET, TYPE_PACKAGE } from './initTemplate';
import { executeInitResource } from './initResource';

// 资源类型常量
const TYPE_OTHER = 'other';

/**
 * 获取初始化类型
 */
async function getInitType(): Promise<string> {
  const { type } = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: '请选择初始化类型',
      choices: [
        { name: '主题', value: TYPE_THEME },
        { name: '插件', value: TYPE_WIDGET },
        { name: '前端库', value: TYPE_PACKAGE },
        { name: '其余资源', value: TYPE_OTHER },
      ],
      default: TYPE_THEME,
    },
  ]);
  return type;
}

/**
 * 检查目录状态并询问是否继续
 */
async function checkDirectory(options: CommandOptions): Promise<boolean> {
  // 检查当前目录是否为空
  let fileList = fs.readdirSync(process.cwd());
  fileList = fileList.filter(
    (file) => ['node_modules', '.git', '.DS_Store'].indexOf(file) < 0
  );

  if (fileList.length > 0) {
    const { continueWhenDirNotEmpty } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueWhenDirNotEmpty',
        message: '当前文件夹不为空，是否继续创建?',
        default: false,
      },
    ]);

    if (!continueWhenDirNotEmpty) {
      return false;
    }
  }

  // 如果指定了 force 选项，询问是否清空目录
  if (options.force) {
    const { confirmEmptyDir } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmEmptyDir',
        message: '是否确认清空当前目录下的文件?',
        default: false,
      },
    ]);

    if (confirmEmptyDir) {
      fs.emptyDirSync(process.cwd());
    }
  }

  return true;
}

/**
 * 获取项目名称
 */
async function getProjectName(defaultName?: string): Promise<string> {
  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: '请输入项目名称',
      default: defaultName || 'my-freelog-project',
      validate: (input: string) => (input.trim() ? true : '项目名称不能为空'),
    },
  ]);
  return name.trim();
}

/**
 * 执行初始化命令
 */
export async function executeInit(
  name?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 初始化 Freelog 项目 ===\n'));

    // 检查目录状态
    const canContinue = await checkDirectory(options);
    if (!canContinue) {
      console.log(chalk.blue('ℹ️  创建项目已取消'));
      return;
    }

    // 获取初始化类型
    const initType = await getInitType();

    // 根据类型路由到不同的初始化逻辑
    if (initType === TYPE_OTHER) {
      // 其余资源类型：简单初始化，创建 JSON 配置（不需要登录）
      const projectName = name || await getProjectName(name);
      await executeInitResource(projectName);
    } else {
      // 主题/插件/前端库：模板初始化（需要登录，在 executeInitTemplate 内部验证）
      await executeInitTemplate(initType);
    }

  } catch (err: any) {
    console.log(chalk.red('✖ ') + `初始化失败: ${err.message}`);
    if (options.debug) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}
