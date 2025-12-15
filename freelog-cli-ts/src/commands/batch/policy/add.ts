/**
 * batch policy add 命令
 * 为批量配置中的某个资源添加策略
 */

import path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../../types';
import { requireAuth } from '../../../core/auth';
import { confirmAuth } from '../../../utils/authConfirm';
import {
  loadBatchResourceConfig,
  saveBatchResourceConfig,
  batchItemToResourceConfig,
  getBatchResourceConfigPath,
} from '../../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../../public/freelog.batch-resources';
import {
  loadResourceConfig,
  saveResourceConfig,
  calculatePolicyChanges,
  resourceConfigToUpdateBody,
} from '../../../services/resourceConfigService';
import { getPolicyTemplateInfos } from '../../../services/policyService';
import {
  policyReCompile,
  policyTranslation,
  type DisplayItem,
  type PolicyTemplateInfo,
} from '../../../api/policy';
import { updateResource, getResourceInfo } from '../../../api/resource';
import { handleErrorAndExit } from '../../../utils/errorHandler';

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
    const lines = item.text.value.split('\n');
    lines.forEach((line) => {
      console.log(chalk.gray(`  ${line}`));
    });
  }
}

/**
 * 获取需要输入的参数列表（排除 text 类型）
 */
function getInputItems(displayData: DisplayItem[]): DisplayItem[] {
  return displayData.filter((item) => item.type !== 'text');
}

/**
 * 构建带参数标记的完整策略说明
 */
function buildPolicyPreviewWithMarkers(
  displayData: DisplayItem[],
  paramValues?: Map<string, string | number>
): string {
  const inputItems = getInputItems(displayData);
  const inputItemMap = new Map(inputItems.map((item, index) => [item.id, index + 1]));
  
  const parts: string[] = [];
  for (const item of displayData) {
    if (item.type === 'text') {
      parts.push(item.text?.value || '');
    } else {
      const paramIndex = inputItemMap.get(item.id) || 0;
      const currentValue = paramValues?.get(item.id);
      
      if (currentValue !== undefined) {
        if (item.type === 'select') {
          const option = item.select?.options?.find((opt) => opt.value === currentValue);
          parts.push(chalk.green(`[${option?.label || currentValue}]`));
        } else {
          parts.push(chalk.green(`[${currentValue}]`));
        }
      } else {
        let placeholder = '';
        if (item.type === 'number') {
          const constraints: string[] = [];
          if (item.number?.min !== undefined) {
            constraints.push(`≥${item.number.min}`);
          }
          if (item.number?.max !== undefined) {
            constraints.push(`≤${item.number.max}`);
          }
          placeholder = `数字${constraints.length > 0 ? `(${constraints.join(', ')})` : ''}`;
        } else if (item.type === 'datetime') {
          placeholder = '日期时间';
        } else if (item.type === 'select') {
          placeholder = '选项';
        }
        parts.push(chalk.yellow(`[参数${paramIndex}: ${placeholder}]`));
      }
    }
  }
  return parts.join('');
}

/**
 * 提示用户输入 DisplayItem 的值
 */
async function promptDisplayItemValue(
  item: DisplayItem,
  paramIndex: number,
  totalParams: number,
  displayData: DisplayItem[],
  currentValues: Map<string, string | number>
): Promise<string | number | null> {
  if (item.type === 'text') {
    displayTextItem(item);
    return null;
  }

  console.log(chalk.cyan(`\n[${paramIndex}/${totalParams}] 请填写参数:`));
  console.log(buildPolicyPreviewWithMarkers(displayData, currentValues));
  console.log();

  if (item.type === 'number') {
    const numberConfig = item.number;
    const constraints: string[] = [];
    if (numberConfig?.min !== undefined) {
      constraints.push(`最小值: ${numberConfig.min}`);
    }
    if (numberConfig?.max !== undefined) {
      constraints.push(`最大值: ${numberConfig.max}`);
    }
    const constraintText = constraints.length > 0 ? ` (${constraints.join(', ')})` : '';
    
    const { value } = await inquirer.prompt([
      {
        type: 'number',
        name: 'value',
        message: `请输入数字${constraintText}:`,
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
    const { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: '请输入日期时间，格式: YYYY-MM-DD HH:mm:',
        default: datetimeConfig?.value,
        validate: (input: string) => {
          if (!input || !input.trim()) {
            return '请输入日期时间';
          }
          if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input.trim())) {
            return '日期时间格式不正确，应为: YYYY-MM-DD HH:mm';
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
        message: '请选择选项:',
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
  const inputItems = getInputItems(displayData);
  const currentValues = new Map<string, string | number>();

  console.log(chalk.cyan('\n策略参数预览（标记需要填写的参数）:'));
  console.log(buildPolicyPreviewWithMarkers(displayData));
  console.log();

  let paramIndex = 0;
  for (const item of displayData) {
    if (item.type === 'text') {
      displayTextItem(item);
      continue;
    }

    paramIndex++;
    const value = await promptDisplayItemValue(
      item,
      paramIndex,
      inputItems.length,
      displayData,
      currentValues
    );
    
    if (value !== null && value !== undefined && value !== '') {
      fillArgs.push({
        name: item.id,
        value: value,
      });
      currentValues.set(item.id, value);
    }
  }

  return fillArgs;
}

/**
 * 执行 batch policy add 命令
 */
export async function executeBatchPolicyAdd(
  resourceName: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 为批量资源添加策略 ===\n'));

    if (!resourceName) {
      console.log(chalk.red('❌ 请指定资源名称'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch policy add <resourceName>\n`);
      return;
    }

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载批量配置
    const spinner = ora('正在加载批量配置...').start();
    let batchConfig;
    try {
      batchConfig = await loadBatchResourceConfig(options.config);
      spinner.succeed('批量配置加载成功');
    } catch (err: unknown) {
      spinner.fail('加载批量配置失败');
      throw err;
    }

    // 3. 查找指定的资源
    const item = batchConfig.resources.find((r) => r.name === resourceName);
    
    if (!item) {
      console.log(chalk.red(`❌ 未找到资源: ${resourceName}`));
      console.log(chalk.blue('\n💡 可用资源列表:'));
      batchConfig.resources.forEach((r) => {
        console.log(`  - ${chalk.cyan(r.name)}`);
      });
      return;
    }

    if (item.skip) {
      console.log(chalk.yellow(`⚠️  资源 ${resourceName} 已标记为跳过`));
      return;
    }

    if (!item.resourceId) {
      console.log(chalk.yellow(`⚠️  资源 ${resourceName} 尚未创建，请先执行 batch create`));
      return;
    }

    // 4. 构建资源配置（用于策略添加）
    const resourceConfig = batchItemToResourceConfig(item, batchConfig.defaults);
    resourceConfig.resourceId = item.resourceId;

    // 5. 创建临时资源配置文件
    const batchConfigPath = getBatchResourceConfigPath(options.config);
    const batchConfigDir = path.dirname(batchConfigPath);
    const tempResourceConfigPath = path.join(batchConfigDir, `.temp.resource.config.${item.name}.js`);

    // 保存临时资源配置
    const resourceConfigContent = `const config = ${JSON.stringify(resourceConfig, null, 2)};\nmodule.exports = config;`;
    await fs.writeFile(tempResourceConfigPath, resourceConfigContent, 'utf-8');

    let tempResourceConfigPathCreated = true;

    try {
      // 6. 获取策略模板列表
      const templateSpinner = ora('正在获取策略模板列表...').start();
      let templateInfos: PolicyTemplateInfo[];
      try {
        templateInfos = await getPolicyTemplateInfos();
        templateSpinner.succeed(`找到 ${templateInfos.length} 个策略模板`);
      } catch (err: unknown) {
        templateSpinner.fail('获取策略模板列表失败');
        throw err;
      }

      if (templateInfos.length === 0) {
        console.log(chalk.yellow('⚠️  没有可用的策略模板'));
        return;
      }

      // 7. 选择策略模板
      const { selectedTemplate } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedTemplate',
          message: '请选择策略模板:',
          choices: templateInfos.map((template, index) => ({
            name: `${index + 1}. ${template.title}`,
            value: template.id,
            short: template.title,
          })),
        },
      ]);

      const selectedTemplateInfo = templateInfos.find((t) => t.id === selectedTemplate);
      if (!selectedTemplateInfo) {
        throw new Error('未找到选中的策略模板');
      }

      console.log(chalk.blue(`\n已选择策略模板: ${selectedTemplateInfo.title}`));
      console.log(chalk.gray(`策略说明: ${formatPolicyContent(selectedTemplateInfo.translation)}\n`));

      // 8. 输入策略名称
      const { policyName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'policyName',
          message: '请输入策略名称:',
          default: selectedTemplateInfo.policyName,
          validate: (input: string) => {
            if (!input.trim()) {
              return '策略名称不能为空';
            }
            return true;
          },
        },
      ]);

      // 9. 收集策略参数（使用模板的 displayData）
      const fillArgs = await collectDisplayItemValues(selectedTemplateInfo.displayData);

      // 10. 编译策略
      const compileSpinner = ora('正在编译策略...').start();
      let compiledPolicy: string;
      try {
        const compileResult = await policyReCompile({
          _id: selectedTemplateInfo.id,
          fillArgs: fillArgs,
        });
        compiledPolicy = compileResult.contractNew;
        compileSpinner.succeed('策略编译成功');
      } catch (err: unknown) {
        compileSpinner.fail('编译策略失败');
        throw err;
      }

      // 12. 显示策略预览
      console.log(chalk.cyan('\n=== 策略预览 ===\n'));
      console.log(chalk.gray(compiledPolicy));
      console.log();

      // 13. 确认添加
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

      // 14. 加载临时资源配置并添加策略
      const tempResourceConfig = await loadResourceConfig(tempResourceConfigPath);
      
      if (!tempResourceConfig.policies) {
        tempResourceConfig.policies = [];
      }

      // 检查策略代码是否已存在
      const existingPolicyTexts = tempResourceConfig.policies
        .map((p) => p.policyText)
        .filter((text): text is string => !!text);
      
      if (existingPolicyTexts.includes(compiledPolicy)) {
        console.log(chalk.yellow('⚠️  策略代码已存在，跳过添加'));
        return;
      }

      tempResourceConfig.policies.push({
        policyName: policyName.trim(),
        policyText: compiledPolicy,
        status: 1, // 默认启用
      });

      // 15. 保存临时资源配置
      await saveResourceConfig(tempResourceConfig, tempResourceConfigPath);

      // 16. 如果资源已创建，立即更新到服务器
      if (item.resourceId) {
        const { updateNow } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'updateNow',
            message: '是否立即更新资源策略到服务器?',
            default: true,
          },
        ]);

        if (updateNow) {
          const updateSpinner = ora('正在更新资源策略...').start();
          try {
            // 获取服务器上的资源信息（用于比对策略）
            const remoteResourceInfo = await getResourceInfo(item.resourceId, {
              isLoadLatestVersionInfo: 0,
            });

            // 计算策略差异
            const remotePolicies = remoteResourceInfo.policies || [];
            const policyChanges = calculatePolicyChanges(
              tempResourceConfig.policies,
              remotePolicies.map((p) => ({
                policyId: p.policyId || '',
                policyName: p.policyName || '',
                status: p.status || 0,
              }))
            );

            // 构建更新请求体
            const updateBody = resourceConfigToUpdateBody(tempResourceConfig, policyChanges);

            // 更新资源
            await updateResource(item.resourceId, updateBody);
            updateSpinner.succeed('资源策略更新成功');
          } catch (err: unknown) {
            updateSpinner.fail('更新资源策略失败');
            throw err;
          }
        }
      }

      console.log(chalk.green('\n✔ ') + '策略添加成功');
      console.log(chalk.blue(`  资源: ${chalk.cyan(resourceName)}`));
      console.log(chalk.blue(`  策略名称: ${chalk.cyan(policyName.trim())}`));

      console.log(chalk.blue('\n💡 注意: 策略信息存储在资源配置中，批量配置主要用于管理资源列表'));
      if (!item.resourceId) {
        console.log(chalk.blue('💡 提示: 资源创建后，策略会自动同步到服务器'));
      }

    } finally {
      // 清理临时配置文件
      if (tempResourceConfigPathCreated && fs.existsSync(tempResourceConfigPath)) {
        await fs.remove(tempResourceConfigPath);
      }
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '添加策略失败', options.debug);
  }
}

