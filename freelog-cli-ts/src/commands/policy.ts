/**
 * policy 命令
 * 为资源添加策略
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../types';
import { requireAuth } from '../core/auth';
import {
  loadResourceConfig,
  saveResourceConfig,
} from '../services/resourceConfigService';
import { getPolicyTemplateInfos } from '../services/policyService';
import {
  policyReCompile,
  policyTranslation,
  type DisplayItem,
  type PolicyTemplateInfo,
} from '../api/policy';
import { handleErrorAndExit } from '../utils/errorHandler';
import { confirmAuth } from '../utils/authConfirm';

/**
 * 格式化策略翻译内容，用于显示
 */
function formatPolicyContent(content: string | undefined): string {
  if (!content) return '';
  return content;
}

/**
 * 显示 DisplayItem（用于 text 类型）
 */
function displayTextItem(item: DisplayItem): void {
  if (item.type === 'text' && item.text?.value) {
    // 处理换行
    const lines = item.text.value.split('\n');
    lines.forEach((line) => {
      console.log(chalk.gray(`  ${line}`));
    });
  }
}

/**
 * 提示用户输入 DisplayItem 的值
 */
async function promptDisplayItemValue(item: DisplayItem): Promise<string | number | null> {
  if (item.type === 'text') {
    // text 类型只显示，不输入
    displayTextItem(item);
    return null;
  }

  if (item.type === 'number') {
    const numberConfig = item.number;
    const message = `请输入数字${numberConfig?.min !== undefined || numberConfig?.max !== undefined 
      ? ` (${numberConfig?.min !== undefined ? `最小值: ${numberConfig.min}` : ''}${numberConfig?.min !== undefined && numberConfig?.max !== undefined ? ', ' : ''}${numberConfig?.max !== undefined ? `最大值: ${numberConfig.max}` : ''})`
      : ''}:`;
    
    const { value } = await inquirer.prompt([
      {
        type: 'number',
        name: 'value',
        message: message,
        default: numberConfig?.value,
        validate: (input: number) => {
          if (input === undefined || input === null || isNaN(input)) {
            return '请输入有效的数字';
          }
          if (numberConfig?.min !== undefined && input < numberConfig.min) {
            return `数字不能小于 ${numberConfig.min}`;
          }
          if (numberConfig?.max !== undefined && input > numberConfig.max) {
            return `数字不能大于 ${numberConfig.max}`;
          }
          return true;
        },
      },
    ]);
    return value;
  }

  if (item.type === 'datetime') {
    const datetimeConfig = item.datetime;
    const message = `请输入日期时间${datetimeConfig?.minDatetime || datetimeConfig?.maxDatetime
      ? ` (${datetimeConfig?.minDatetime ? `最早: ${datetimeConfig.minDatetime}` : ''}${datetimeConfig?.minDatetime && datetimeConfig?.maxDatetime ? ', ' : ''}${datetimeConfig?.maxDatetime ? `最晚: ${datetimeConfig.maxDatetime}` : ''})`
      : ''}，格式: YYYY-MM-DD HH:mm:`;
    
    const { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: message,
        default: datetimeConfig?.value,
        validate: (input: string) => {
          if (!input || !input.trim()) {
            return '请输入日期时间';
          }
          const trimmed = input.trim();
          // 验证格式
          if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) {
            return '日期时间格式不正确，应为: YYYY-MM-DD HH:mm';
          }
          // 验证范围（如果提供了）
          if (datetimeConfig?.minDatetime && trimmed < datetimeConfig.minDatetime) {
            return `日期时间不能早于 ${datetimeConfig.minDatetime}`;
          }
          if (datetimeConfig?.maxDatetime && trimmed > datetimeConfig.maxDatetime) {
            return `日期时间不能晚于 ${datetimeConfig.maxDatetime}`;
          }
          return true;
        },
      },
    ]);
    return value.trim();
  }

  if (item.type === 'select') {
    const selectConfig = item.select;
    const options = selectConfig?.options || [];
    if (options.length === 0) {
      throw new Error(`选择项 ${item.id} 没有可用选项`);
    }

    const { value } = await inquirer.prompt([
      {
        type: 'list',
        name: 'value',
        message: `请选择选项:`,
        choices: options.map((opt) => ({
          name: `${opt.label} (${opt.value})`,
          value: opt.value,
        })),
        default: selectConfig?.value,
      },
    ]);
    return value;
  }

  throw new Error(`不支持的 DisplayItem 类型: ${item.type}`);
}

/**
 * 收集所有需要输入的 DisplayItem 值
 */
async function collectDisplayItemValues(
  displayData: DisplayItem[]
): Promise<Array<{ name: string; value: string | number }>> {
  const fillArgs: Array<{ name: string; value: string | number }> = [];

  for (const item of displayData) {
    const value = await promptDisplayItemValue(item);
    if (value !== null && value !== undefined && value !== '') {
      fillArgs.push({
        name: item.id,
        value: value,
      });
    }
  }

  return fillArgs;
}

/**
 * 执行 policy 命令
 */
export async function executePolicy(options: CommandOptions = {}): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 添加授权策略 ===\n'));

    // 1. 验证登录并确认用户信息
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载资源配置
    const spinner = ora('正在加载资源配置...').start();
    let resourceConfig;
    try {
      resourceConfig = await loadResourceConfig(options.config);
      spinner.succeed('资源配置加载成功');
    } catch (err: any) {
      spinner.fail('加载资源配置失败');
      throw err;
    }

    // 3. 获取策略模板列表
    const templateSpinner = ora('正在获取策略模板列表...').start();
    let templateInfos: PolicyTemplateInfo[];
    try {
      templateInfos = await getPolicyTemplateInfos();
      templateSpinner.succeed(`找到 ${templateInfos.length} 个策略模板`);
    } catch (err: any) {
      templateSpinner.fail('获取策略模板列表失败');
      throw err;
    }

    if (templateInfos.length === 0) {
      console.log(chalk.yellow('⚠️  未找到可用的策略模板'));
      return;
    }

    // 4. 让用户选择策略模板
    const { selectedTemplate } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedTemplate',
        message: '请选择策略模板:',
        choices: templateInfos.map((template, index) => ({
          name: `${index + 1}. ${template.title}`,
          value: template,
          short: template.title,
        })),
      },
    ]);

    console.log(chalk.blue(`\n已选择策略模板: ${selectedTemplate.title}`));
    console.log(chalk.gray(`策略说明: ${formatPolicyContent(selectedTemplate.translation)}\n`));

    // 5. 输入策略名称（使用默认值，但用户可以修改）
    const { policyName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'policyName',
        message: '请输入策略名称:',
        default: selectedTemplate.title,
        validate: (input: string) => {
          if (!input || !input.trim()) {
            return '策略名称不能为空';
          }
          if (input.trim().length < 2) {
            return '策略名称至少需要2个字符';
          }
          // 检查是否已存在同名策略
          const existingPolicies = resourceConfig.policies || [];
          if (existingPolicies.some((p) => p.policyName === input.trim())) {
            return '策略名称已存在';
          }
          return true;
        },
      },
    ]);

    // 6. 显示并收集 DisplayItem 值
    console.log(chalk.cyan('\n请填写策略参数:\n'));
    
    const fillArgs = await collectDisplayItemValues(selectedTemplate.displayData);

    // 7. 重新编译策略
    const compileSpinner = ora('正在编译策略...').start();
    let compiledPolicy: string;
    try {
      const compileResult = await policyReCompile({
        _id: selectedTemplate.id,
        fillArgs: fillArgs,
      });
      compiledPolicy = compileResult.contractNew;
      compileSpinner.succeed('策略编译成功');
    } catch (err: any) {
      compileSpinner.fail('策略编译失败');
      throw err;
    }

    // 8. 可选：翻译策略用于预览
    const { showPreview } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'showPreview',
        message: '是否预览策略翻译?',
        default: true,
      },
    ]);

    if (showPreview) {
      try {
        const policyCodeEncoded = compiledPolicy.replace(/(\t|\r)/g, ' ');
        const policyCodeBase64 = Buffer.from(policyCodeEncoded, 'utf-8').toString('base64');
        const translationResult = await policyTranslation({
          contract: policyCodeBase64,
        });
        console.log(chalk.cyan('\n策略翻译预览:'));
        console.log(chalk.gray(formatPolicyContent(translationResult.data)));
        console.log();
      } catch (err: any) {
        console.log(chalk.yellow(`⚠️  策略翻译失败: ${err.message}`));
      }
    }

    // 9. 确认添加策略
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '确认添加此策略到资源配置?',
        default: true,
      },
    ]);

    if (!confirm) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 10. 添加到资源配置
    if (!resourceConfig.policies) {
      resourceConfig.policies = [];
    }

    // 检查策略代码是否已存在
    const existingPolicyTexts = resourceConfig.policies
      .map((p) => p.policyText)
      .filter((text): text is string => !!text);
    
    if (existingPolicyTexts.includes(compiledPolicy)) {
      console.log(chalk.yellow('⚠️  策略代码已存在，跳过添加'));
      return;
    }

    resourceConfig.policies.push({
      policyName: policyName.trim(),
      policyText: compiledPolicy,
      status: 1, // 默认启用
    });

    // 11. 保存配置文件
    const saveSpinner = ora('正在保存配置文件...').start();
    try {
      await saveResourceConfig(resourceConfig, options.config);
      saveSpinner.succeed('配置文件保存成功');
    } catch (err: any) {
      saveSpinner.fail('保存配置文件失败');
      throw err;
    }

    console.log(chalk.green('\n✅ 策略添加成功！'));
    console.log(chalk.blue(`策略名称: ${policyName.trim()}`));
    console.log(chalk.gray(`策略代码已保存到配置文件`));
  } catch (error) {
    handleErrorAndExit(error);
  }
}

