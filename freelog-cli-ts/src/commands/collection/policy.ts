/**
 * collection policy add 命令
 * 为合集添加授权策略（复用资源的策略添加逻辑，但使用合集配置）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import {
  loadCollectionConfig,
  saveCollectionConfig,
  calculatePolicyChanges,
  collectionConfigToUpdateBody,
} from '../../services/collectionConfigService';
import { getPolicyTemplateInfos } from '../../services/policyService';
import {
  policyReCompile,
  policyTranslation,
  type DisplayItem,
  type PolicyTemplateInfo,
} from '../../api/policy';
import { updateResource, getResourceInfo } from '../../api/resource';
import { handleErrorAndExit } from '../../utils/errorHandler';
import { confirmAuth } from '../../utils/authConfirm';

/**
 * 格式化策略翻译内容，用于显示
 */
function formatPolicyContent(content: string | undefined): string {
  if (!content) return '';
  return content;
}

/**
 * 获取需要输入的参数列表（排除 text 类型）
 */
function getInputItems(displayData: DisplayItem[]): DisplayItem[] {
  return displayData.filter(item => item.type !== 'text');
}

/**
 * 执行 collection policy add 命令
 */
export async function executeCollectionPolicyAdd(options: CommandOptions = {}): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 为合集添加授权策略 ===\n'));

    // 1. 验证登录并确认用户信息
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载合集配置
    const spinner = ora('正在加载合集配置...').start();
    let collectionConfig;
    try {
      collectionConfig = await loadCollectionConfig(options.config);
      spinner.succeed('合集配置加载成功');
    } catch (err: any) {
      spinner.fail('加载合集配置失败');
      throw err;
    }

    if (!collectionConfig.resourceId) {
      console.log(chalk.yellow('\n⚠️  合集配置中未设置 resourceId'));
      console.log(chalk.gray('策略已保存到配置文件，稍后可以使用 `freelog-cli2 collection update` 更新合集'));
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

    console.log(chalk.gray(`策略说明: ${formatPolicyContent(selectedTemplate.translation)}\n`));

    // 5. 输入策略名称
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
          const existingPolicies = collectionConfig.policies || [];
          if (existingPolicies.some((p) => p.policyName === input.trim())) {
            return '策略名称已存在';
          }
          return true;
        },
      },
    ]);

    // 6. 收集 DisplayItem 值
    const inputItems = getInputItems(selectedTemplate.displayData);
    const fillArgs: Array<{ name: string; value: string | number }> = [];
    
    for (const item of inputItems) {
      if (item.type === 'number') {
        const { value } = await inquirer.prompt([
          {
            type: 'number',
            name: 'value',
            message: `${item.id}:`,
            default: item.number?.defaultValue,
          },
        ]);
        fillArgs.push({ name: item.id, value });
      } else if (item.type === 'select') {
        const { value } = await inquirer.prompt([
          {
            type: 'list',
            name: 'value',
            message: `${item.id}:`,
            choices: item.select?.options?.map(opt => ({
              name: opt.label,
              value: opt.value,
            })) || [],
            default: item.select?.defaultValue,
          },
        ]);
        fillArgs.push({ name: item.id, value });
      }
    }

    // 7. 编译策略
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

    // 8. 可选预览
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
        const translation = await policyTranslation({ contract: compiledPolicy });
        console.log(chalk.cyan('\n策略翻译预览:'));
        console.log(chalk.gray(translation));
        console.log();
      } catch (err: any) {
        console.log(chalk.yellow(`⚠️  预览失败: ${err.message}`));
      }
    }

    // 9. 添加到配置
    if (!collectionConfig.policies) {
      collectionConfig.policies = [];
    }
    collectionConfig.policies.push({
      policyName: policyName.trim(),
      policyText: compiledPolicy,
      status: 1, // 默认启用
    });

    await saveCollectionConfig(collectionConfig, options.config);
    console.log(chalk.green('✔ 策略已保存到配置文件'));

    // 10. 询问是否立即更新到服务器
    if (!collectionConfig.resourceId) {
      console.log(chalk.yellow('\n⚠️  合集配置中未设置 resourceId，无法更新合集策略'));
      console.log(chalk.gray('请先创建合集或设置 resourceId 后再更新策略'));
      return;
    }

    const { updateNow } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'updateNow',
        message: '是否立即更新合集策略到服务器?',
        default: true,
      },
    ]);

    if (!updateNow) {
      console.log(chalk.blue('\nℹ️  策略已保存到配置文件，稍后可以使用 `freelog-cli2 collection update` 更新合集'));
      return;
    }

    // 11. 获取服务器上的资源信息
    const fetchSpinner = ora('正在获取资源信息...').start();
    let remoteResourceInfo;
    try {
      remoteResourceInfo = await getResourceInfo(collectionConfig.resourceId, {
        isLoadPolicyInfo: 1,
      });
      fetchSpinner.succeed('资源信息获取成功');
    } catch (err: any) {
      fetchSpinner.fail('获取资源信息失败');
      throw err;
    }

    // 12. 计算策略差异
    const remotePolicies = remoteResourceInfo.policies || [];
    const policyChanges = calculatePolicyChanges(
      collectionConfig.policies,
      remotePolicies.map((p) => ({
        policyId: p.policyId,
        policyName: p.policyName,
        status: p.status,
      }))
    );

    // 13. 构建更新请求体
    const updateBody = collectionConfigToUpdateBody(collectionConfig, policyChanges);

    // 14. 更新资源
    const updateSpinner = ora('正在更新合集策略...').start();
    try {
      const updatedResource = await updateResource(collectionConfig.resourceId, updateBody);
      updateSpinner.succeed('合集策略更新成功');

      // 更新本地配置中的 policyId
      if (updatedResource.policies) {
        collectionConfig.policies = collectionConfig.policies?.map(localPolicy => {
          const matchingRemotePolicy = updatedResource.policies?.find(rp => rp.policyName === localPolicy.policyName);
          if (matchingRemotePolicy && matchingRemotePolicy.policyId) {
            return { ...localPolicy, policyId: matchingRemotePolicy.policyId };
          }
          return localPolicy;
        }) || [];
        await saveCollectionConfig(collectionConfig, options.config);
        console.log(chalk.green('✔ 已同步策略ID到本地配置'));
      }

      console.log(chalk.green('\n✔ 策略添加完成'));
    } catch (err: any) {
      updateSpinner.fail('更新合集策略失败');
      throw err;
    }

  } catch (err: any) {
    handleErrorAndExit(err, '添加合集策略失败', options.debug);
  }
}
