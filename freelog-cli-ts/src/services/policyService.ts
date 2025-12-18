/**
 * 策略管理服务
 * 统一处理单独资源、合集资源和批量资源的策略管理
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import type { ResourceConfig } from '../../public/freelog.resource';
import type { PolicyInfo, ResourceDetailResponse } from '../api/types';
import type { UpdateResourceBody } from '../api/resource';
import { getResourceInfo, updateResource } from '../api/resource';
import { calculatePolicyChanges, resourceConfigToUpdateBody } from './resourceConfigService';
import { policyTemplates, policyTranslation, policyReCompile, type PolicyTemplateInfo, type DisplayItem } from '../api/policy';
import { CommandOptions } from '../types';
import { handleErrorAndExit } from '../utils/errorHandler';

/**
 * 策略变更信息（与 calculatePolicyChanges 返回类型一致）
 */
export interface PolicyChangeInfo {
  addPolicies: Array<{ policyName: string; policyText: string; status?: number }>;
  updatePolicies: Array<{ policyId: string; status: number }>;
}

/**
 * 策略配置类型（所有配置类型都应该有这个结构）
 */
export interface PolicyConfig {
  policies?: Array<{ policyName: string; policyText?: string; policyId?: string; status?: number }>;
  resourceId?: string;
}

/**
 * 配置操作接口（用于支持不同类型的配置：ResourceConfig、CollectionConfig 等）
 */
export interface PolicyConfigOperations<TConfig extends PolicyConfig> {
  loadConfig: (configPath?: string) => Promise<TConfig>;
  saveConfig: (config: TConfig, configPath?: string) => Promise<void>;
  calculatePolicyChanges: (
    localPolicies: TConfig['policies'],
    remotePolicies: Array<{ policyId: string; policyName: string; status: number }>
  ) => PolicyChangeInfo;
  configToUpdateBody: (config: TConfig, policyChanges?: PolicyChangeInfo) => UpdateResourceBody;
  updatePolicyIdsFromResponse: (config: TConfig, response: ResourceDetailResponse) => TConfig;
  getResourceId: (config: TConfig) => string | undefined;
}

/**
 * 计算策略变更
 * @param localPolicies 本地配置的策略列表
 * @param remotePolicies 服务器上的策略列表
 * @returns 策略变更信息
 */
export function getPolicyChanges(
  localPolicies: ResourceConfig['policies'] = [],
  remotePolicies: PolicyInfo[] = []
): PolicyChangeInfo {
  return calculatePolicyChanges(
    localPolicies,
    remotePolicies.map(p => ({
      policyId: p.policyId || '',
      policyName: p.policyName || '',
      status: p.status || 0,
    }))
  );
}

/**
 * 构建策略更新请求体
 * @param resourceConfig 资源配置
 * @param policyChanges 策略变更信息
 * @returns 更新请求体
 */
export function buildPolicyUpdateBody(
  resourceConfig: ResourceConfig,
  policyChanges: PolicyChangeInfo
): UpdateResourceBody {
  return resourceConfigToUpdateBody(resourceConfig, policyChanges);
}

/**
 * 更新单个策略的状态
 * @param policies 策略列表
 * @param policyId 策略ID
 * @param status 新状态（1: 启用, 0: 停用）
 * @returns 更新后的策略列表
 */
export function updatePolicyStatus(
  policies: PolicyInfo[],
  policyId: string,
  status: number
): PolicyInfo[] {
  return policies.map(p => {
    if (p.policyId === policyId) {
      return { ...p, status };
    }
    return p;
  });
}

/**
 * 批量更新策略状态
 * @param policies 策略列表
 * @param policyIds 要更新的策略ID列表
 * @param status 新状态（1: 启用, 0: 停用）
 * @returns 更新后的策略列表
 */
export function batchUpdatePolicyStatus(
  policies: PolicyInfo[],
  policyIds: string[],
  status: number
): PolicyInfo[] {
  return policies.map(p => {
    if (p.policyId && policyIds.includes(p.policyId)) {
      return { ...p, status };
    }
    return p;
  });
}

/**
 * 更新所有策略状态
 * @param policies 策略列表
 * @param status 新状态（1: 启用, 0: 停用）
 * @returns 更新后的策略列表
 */
export function updateAllPolicyStatus(
  policies: PolicyInfo[],
  status: number
): PolicyInfo[] {
  return policies.map(p => ({ ...p, status }));
}

/**
 * 获取策略模板信息列表
 * 从 API 获取策略模板，并转换为包含 displayData 的格式
 */
export async function getPolicyTemplateInfos(): Promise<PolicyTemplateInfo[]> {
  const templates = await policyTemplates();
  
  const templateInfos: PolicyTemplateInfo[] = [];
  
  for (const template of templates) {
    try {
      // 翻译策略模板以获取 displayData
      const policyCodeEncoded = template.template.replace(/(\t|\r)/g, ' ');
      const policyCodeBase64 = Buffer.from(policyCodeEncoded, 'utf-8').toString('base64');
      
      const translationResult = await policyTranslation({
        contract: policyCodeBase64,
      });
      
      // translationResult 是一个字符串，需要解析为 DisplayItem[]
      // 根据 API 文档，翻译结果应该包含 displayData
      // 这里假设 translationResult 是一个 JSON 字符串，包含 displayData 字段
      let displayData: DisplayItem[] = [];
      let translation = '';
      
      try {
        // 尝试解析为 JSON
        const parsed = typeof translationResult === 'string' 
          ? JSON.parse(translationResult) 
          : translationResult;
        
        if (parsed && parsed.displayData && Array.isArray(parsed.displayData)) {
          displayData = parsed.displayData;
          translation = parsed.translation || parsed.content || translationResult;
        } else {
          // 如果不是 JSON，则作为纯文本处理
          translation = typeof translationResult === 'string' 
            ? translationResult 
            : JSON.stringify(translationResult);
        }
      } catch {
        // 解析失败，作为纯文本处理
        translation = typeof translationResult === 'string' 
          ? translationResult 
          : JSON.stringify(translationResult);
      }
      
      // 如果没有 displayData，尝试从 reportUiTemplate 构建
      if (displayData.length === 0 && template.reportUiTemplate) {
        displayData = template.reportUiTemplate.map((uiTemplate, index) => {
          const item: DisplayItem = {
            id: uiTemplate.id || `param_${index}`,
            type: uiTemplate.uiSectionType === 'select' ? 'select' : 'number',
          };
          
          if (uiTemplate.uiSectionType === 'select') {
            item.select = {
              value: '',
              options: uiTemplate.selectOptions || [],
            };
          } else {
            item.number = {
              value: typeof uiTemplate.uiSectionDefaultValue === 'number' 
                ? uiTemplate.uiSectionDefaultValue 
                : 0,
            };
          }
          
          return item;
        });
      }
      
      templateInfos.push({
        id: template._id,
        title: template.title,
        code: template.template,
        translation: translation,
        displayData: displayData,
      });
    } catch (err) {
      // 如果翻译失败，仍然添加模板，但 displayData 为空
      console.warn(`策略模板 ${template.title} 翻译失败:`, err);
      templateInfos.push({
        id: template._id,
        title: template.title,
        code: template.template,
        translation: template.reportTranslate || '',
        displayData: [],
      });
    }
  }
  
  return templateInfos;
}

/**
 * 格式化策略翻译内容，用于显示
 */
export function formatPolicyContent(content: string | undefined): string {
  if (!content) return '';
  return content;
}

/**
 * 显示 DisplayItem（用于 text 类型）
 */
export function displayTextItem(item: DisplayItem): void {
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
export function getInputItems(displayData: DisplayItem[]): DisplayItem[] {
  return displayData.filter((item) => item.type !== 'text');
}

/**
 * 构建带参数标记的完整策略说明
 */
export function buildPolicyPreviewWithMarkers(
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
 * 获取当前参数前后的文本内容
 */
function getContextAroundParam(
  displayData: DisplayItem[],
  paramId: string
): { before: string; after: string } {
  const paramIndex = displayData.findIndex((item) => item.id === paramId);
  if (paramIndex === -1) {
    return { before: '', after: '' };
  }

  let before = '';
  let after = '';

  // 获取参数前的文本
  for (let i = paramIndex - 1; i >= 0; i--) {
    if (displayData[i].type === 'text') {
      before = (displayData[i].text?.value || '') + before;
    } else {
      break;
    }
  }

  // 获取参数后的文本
  for (let i = paramIndex + 1; i < displayData.length; i++) {
    if (displayData[i].type === 'text') {
      after += displayData[i].text?.value || '';
    } else {
      break;
    }
  }

  return { before: before.trim(), after: after.trim() };
}

/**
 * 提示用户输入 DisplayItem 的值
 */
export async function promptDisplayItemValue(
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

  // 获取当前参数前后的文本内容
  const context = getContextAroundParam(displayData, item.id);

  console.log(chalk.cyan(`\n[${paramIndex}/${totalParams}] 请填写参数:`));
  
  // 显示参数上下文
  if (context.before || context.after) {
    const contextParts: string[] = [];
    if (context.before) {
      contextParts.push(chalk.gray(context.before));
    }
    contextParts.push(chalk.yellow(`[参数${paramIndex}]`));
    if (context.after) {
      contextParts.push(chalk.gray(context.after));
    }
    console.log('  ' + contextParts.join(' '));
    console.log();
  }

  // 显示完整的策略预览
  console.log(chalk.gray('完整策略预览:'));
  console.log('  ' + buildPolicyPreviewWithMarkers(displayData, currentValues));
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
    if (numberConfig?.precision !== undefined) {
      constraints.push(`小数位数: ${numberConfig.precision}`);
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
    const constraints: string[] = [];
    if (datetimeConfig?.minDatetime) {
      constraints.push(`最早: ${datetimeConfig.minDatetime}`);
    }
    if (datetimeConfig?.maxDatetime) {
      constraints.push(`最晚: ${datetimeConfig.maxDatetime}`);
    }
    const constraintText = constraints.length > 0 ? ` (${constraints.join(', ')})` : '';
    
    const { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: `请输入日期时间${constraintText}，格式: YYYY-MM-DD HH:mm:`,
        default: datetimeConfig?.value,
        validate: (input: string) => {
          if (!input || !input.trim()) {
            return '请输入日期时间';
          }
          const trimmed = input.trim();
          if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) {
            return '日期时间格式不正确，应为: YYYY-MM-DD HH:mm';
          }
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
export async function collectDisplayItemValues(
  displayData: DisplayItem[]
): Promise<Array<{ name: string; value: string | number }>> {
  const fillArgs: Array<{ name: string; value: string | number }> = [];
  const inputItems = getInputItems(displayData);
  const currentValues = new Map<string, string | number>();
  let paramIndex = 0;

  console.log(chalk.cyan('\n策略参数预览（标记需要填写的参数）:'));
  console.log(buildPolicyPreviewWithMarkers(displayData));
  console.log();

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
 * 通用的策略添加函数
 * 支持单独资源、合集资源和批量资源
 */
export async function addPolicy<TConfig extends PolicyConfig>(
  options: CommandOptions,
  configOps: PolicyConfigOperations<TConfig>,
  resourceType: 'resource' | 'collection' | 'batch' = 'resource'
): Promise<void> {
  try {
    console.log(chalk.cyan(`\n=== 添加授权策略 ===\n`));

    // 1. 加载配置
    const spinner = ora('正在加载配置...').start();
    let config: TConfig;
    try {
      config = await configOps.loadConfig(options.config);
      spinner.succeed('配置加载成功');
    } catch (err: any) {
      spinner.fail('加载配置失败');
      throw err;
    }

    // 2. 获取策略模板列表
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

    // 3. 让用户选择策略模板
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

    // 4. 输入策略名称
    const existingPolicies = config.policies || [];
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
          if (existingPolicies.some((p) => p.policyName === input.trim())) {
            return '策略名称已存在';
          }
          return true;
        },
      },
    ]);

    // 5. 显示并收集 DisplayItem 值
    console.log(chalk.cyan('\n请填写策略参数:\n'));
    const fillArgs = await collectDisplayItemValues(selectedTemplate.displayData);

    // 6. 重新编译策略
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

    // 7. 可选：翻译策略用于预览
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
        const translationText = await policyTranslation({
          contract: policyCodeBase64,
        });
        console.log(chalk.cyan('\n策略翻译预览:'));
        console.log(chalk.gray(formatPolicyContent(translationText)));
        console.log();
      } catch (err: any) {
        console.log(chalk.yellow(`⚠️  策略翻译失败: ${err.message}`));
      }
    }

    // 8. 确认添加策略
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '确认添加此策略到配置?',
        default: true,
      },
    ]);

    if (!confirm) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 9. 添加到配置
    if (!config.policies) {
      config.policies = [];
    }

    // 检查策略代码是否已存在
    const existingPolicyTexts = config.policies
      .map((p) => p.policyText)
      .filter((text): text is string => !!text);
    
    if (existingPolicyTexts.includes(compiledPolicy)) {
      console.log(chalk.yellow('⚠️  策略代码已存在，跳过添加'));
      return;
    }

    config.policies.push({
      policyName: policyName.trim(),
      policyText: compiledPolicy,
      status: 1, // 默认启用
    } as any);

    // 10. 保存配置文件
    const saveSpinner = ora('正在保存配置文件...').start();
    try {
      await configOps.saveConfig(config, options.config);
      saveSpinner.succeed('配置文件保存成功');
    } catch (err: any) {
      saveSpinner.fail('保存配置文件失败');
      throw err;
    }

    console.log(chalk.green('\n✅ 策略添加成功！'));
    console.log(chalk.blue(`策略名称: ${policyName.trim()}`));
    console.log(chalk.gray(`策略代码已保存到配置文件`));

    // 11. 询问是否立即更新资源策略到服务器
    const resourceId = configOps.getResourceId(config);
    if (!resourceId) {
      console.log(chalk.yellow('\n⚠️  配置中未设置 resourceId，无法更新资源策略'));
      console.log(chalk.gray('请先创建资源或设置 resourceId 后再更新策略'));
      return;
    }

    const { updateNow } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'updateNow',
        message: '是否立即更新资源策略到服务器?',
        default: true,
      },
    ]);

    if (!updateNow) {
      const updateCommand = resourceType === 'collection' ? 'collection update' : 'update';
      console.log(chalk.blue(`\nℹ️  策略已保存到配置文件，稍后可以使用 \`freelog-cli2 ${updateCommand}\` 更新资源`));
      return;
    }

    // 12. 获取服务器上的资源信息（用于比对策略）
    const fetchSpinner = ora('正在获取资源信息...').start();
    let remoteResourceInfo: ResourceDetailResponse;
    try {
      remoteResourceInfo = await getResourceInfo(resourceId, {
        isLoadLatestVersionInfo: 0,
        isLoadPolicyInfo: 1,
      });
      fetchSpinner.succeed('资源信息获取成功');
    } catch (err: any) {
      fetchSpinner.fail('获取资源信息失败');
      throw err;
    }

    // 13. 计算策略差异
    const remotePolicies = remoteResourceInfo.policies || [];
    const policyChanges = configOps.calculatePolicyChanges(
      config.policies,
      remotePolicies.map((p: PolicyInfo) => ({
        policyId: p.policyId || '',
        policyName: p.policyName || '',
        status: p.status || 0,
      }))
    );

    // 检查是否有需要更新的策略
    if (
      (!policyChanges.addPolicies || policyChanges.addPolicies.length === 0) &&
      (!policyChanges.updatePolicies || policyChanges.updatePolicies.length === 0)
    ) {
      console.log(chalk.yellow('\n⚠️  没有需要更新的策略'));
      return;
    }

    // 14. 构建更新请求体
    const updateBody = configOps.configToUpdateBody(config, policyChanges);

    // 15. 更新资源
    const updateSpinner = ora('正在更新资源策略...').start();
    try {
      const updatedResource = await updateResource(resourceId, updateBody);
      updateSpinner.succeed('资源策略更新成功');
      
      if (policyChanges.addPolicies && policyChanges.addPolicies.length > 0) {
        console.log(chalk.green(`\n✅ 已添加 ${policyChanges.addPolicies.length} 个策略`));
      }
      if (policyChanges.updatePolicies && policyChanges.updatePolicies.length > 0) {
        console.log(chalk.green(`✅ 已更新 ${policyChanges.updatePolicies.length} 个策略状态`));
      }

      // 16. 更新配置文件中的 policyId（将服务器返回的 policyId 同步到本地配置）
      if (updatedResource && updatedResource.policies && updatedResource.policies.length > 0) {
        const syncSpinner = ora('正在同步策略ID到配置文件...').start();
        try {
          const updatedConfig = configOps.updatePolicyIdsFromResponse(config, updatedResource);
          await configOps.saveConfig(updatedConfig, options.config);
          syncSpinner.succeed('策略ID已同步到配置文件');
        } catch (err: any) {
          syncSpinner.fail('同步策略ID失败');
          console.log(chalk.yellow(`⚠️  策略已更新到服务器，但同步策略ID到配置文件失败: ${err.message}`));
        }
      } else if (!updatedResource) {
        console.log(chalk.yellow('⚠️  服务器未返回资源信息，无法同步策略ID'));
      }
    } catch (err: any) {
      updateSpinner.fail('更新资源策略失败');
      throw err;
    }
  } catch (error) {
    handleErrorAndExit(error);
  }
}
