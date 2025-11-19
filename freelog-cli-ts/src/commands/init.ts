/**
 * 初始化命令 - 主入口
 * 根据类型选择路由到不同的初始化逻辑
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { CommandOptions } from '../types';
import { executeInitTemplate, TYPE_THEME, TYPE_WIDGET, TYPE_PACKAGE } from './initTemplate';
import { executeInitResource } from './initResource';
import { handleErrorAndExit } from '../utils/errorHandler';

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
 * 验证项目名称（只能包含英文、数字、下划线、横杠）
 */
function validateProjectName(name: string): boolean {
  // 只允许：英文字母、数字、下划线、横杠
  const pattern = /^[a-zA-Z0-9_-]+$/;
  return pattern.test(name);
}

/**
 * 获取项目名称（带验证）
 */
async function getProjectNameForTemplate(defaultName?: string): Promise<string> {
  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: '请输入项目名称',
      default: defaultName || 'my-freelog-project',
      validate: (input: string) => {
        const trimmed = input.trim();
        if (!trimmed) {
          return '项目名称不能为空';
        }
        if (!validateProjectName(trimmed)) {
          return '项目名称只能包含英文字母、数字、下划线和横杠';
        }
        return true;
      },
    },
  ]);
  return name.trim();
}

/**
 * 检查并创建项目目录
 */
async function prepareProjectDirectory(projectName: string, options: CommandOptions): Promise<string> {
  const currentDir = process.cwd();
  const targetPath = path.join(currentDir, projectName);

  // 检查目录是否已存在
  if (fs.existsSync(targetPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `目录 ${projectName} 已存在，是否覆盖?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      throw new Error('操作已取消');
    }

    // 如果指定了 force 选项，直接清空
    if (options.force) {
      fs.removeSync(targetPath);
    } else {
      // 否则询问是否清空
      const { confirmEmpty } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmEmpty',
          message: `是否确认清空目录 ${projectName}?`,
          default: false,
        },
      ]);

      if (confirmEmpty) {
        fs.removeSync(targetPath);
      } else {
        throw new Error('操作已取消');
      }
    }
  }

  // 创建目录
  fs.ensureDirSync(targetPath);
  return targetPath;
}

/**
 * 获取项目名称（用于其他资源类型）
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

    // 获取初始化类型
    const initType = await getInitType();

    // 根据类型路由到不同的初始化逻辑
    if (initType === TYPE_OTHER) {
      // 其余资源类型：简单初始化，创建 JSON 配置
      // 在当前目录创建配置文件，不需要项目名称，直接询问资源名称
      await executeInitResource();
    } else {
      // 主题/插件/前端库：模板初始化
      // 1. 获取项目名称（带验证）
      const projectName = name || await getProjectNameForTemplate(name);
      
      // 2. 创建项目目录
      const targetPath = await prepareProjectDirectory(projectName, options);
      
      // 3. 切换到目标目录并初始化模板
      const originalCwd = process.cwd();
      process.chdir(targetPath);
      
      try {
        await executeInitTemplate(initType, projectName);
        console.log(chalk.green(`\n✔ 项目已创建在: ${chalk.cyan(targetPath)}`));
      } finally {
        // 恢复原始工作目录
        process.chdir(originalCwd);
      }
    }

  } catch (err: any) {
    handleErrorAndExit(err, '初始化失败', options.debug);
  }
}
