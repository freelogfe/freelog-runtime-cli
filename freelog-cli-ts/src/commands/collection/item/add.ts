/**
 * collection item add 命令
 * 添加合集单品（需要签约支付流程，包括上抛资源）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../../types';
import { requireAuth } from '../../../core/auth';
import { confirmAuth } from '../../../utils/authConfirm';
import { loadCollectionConfig, saveCollectionConfig } from '../../../services/collectionConfigService';
import { getResourceInfo } from '../../../api/resource';
import { 
  batchAddCollectionItemsDraft,
  batchQueryItemAuthDraft,
  getCollectionItemDetail,
  type BatchAddCollectionItemsDraftBody,
  type ResolveResource,
} from '../../../api/collection';
import { batchCheckResourceAuth } from '../../../api/auth';
import { createContract } from '../../../api/contract';
import { processPayment } from '../../../services/paymentService';
import { handleErrorAndExit } from '../../../utils/errorHandler';
import type { ResourceDetailResponse, PolicyInfo } from '../../../api/types';
import type { CollectionItemConfig } from '../../../../public/freelog.collection';

/**
 * 解析资源标识符
 */
function parseResourceIdentifier(identifier: string): {
  value: string;
  version?: string;
} {
  const parts = identifier.split("@");
  return parts.length === 1
    ? { value: parts[0] }
    : { value: parts[0], version: parts[1] };
}

/**
 * 处理单个资源的签约和支付流程（复用依赖添加的逻辑）
 */
async function processSingleResourceContract(
  resourceInfo: ResourceDetailResponse,
  resourceName: string,
  policies: PolicyInfo[],
  licenseeId?: string
): Promise<{
  action: "completed" | "skip";
  contractResult?: any | null;
}> {
  console.log(chalk.bold.cyan(`\n=== 处理资源: ${resourceName} ===`));
  console.log(`资源ID: ${resourceInfo.resourceId}`);

  // 检查是否已经授权
  const authSpinner = ora("正在检查授权状态...").start();
  let isAlreadyAuthorized = false;
  try {
    const authResult = await batchCheckResourceAuth(
      resourceInfo.resourceId,
      resourceInfo.latestVersion
    );
    if (authResult.length > 0 && authResult[0].isAuth) {
      authSpinner.succeed(`已授权 (版本: ${authResult[0].version})`);
      isAlreadyAuthorized = true;
      console.log(chalk.green("✔ 该资源已获得授权"));
      return { action: "completed", contractResult: null };
    } else {
      authSpinner.info("未授权，需要签约");
    }
  } catch (err: any) {
    authSpinner.warn("无法检查授权状态，将继续签约流程");
  }

  // 如果有策略，显示策略列表
  if (policies.length > 0) {
    console.log(chalk.cyan("\n=== 可用策略 ===\n"));
    policies.forEach((policy, index) => {
      const policyContent = policy.translateInfo?.content || '';
      console.log(chalk.bold(`${index + 1}. ${policy.policyName}`));
      if (policyContent) {
        console.log(chalk.gray("   " + policyContent.replace(/\n/g, "\n   ")));
      }
      console.log();
    });
  }

  // 选择策略
  const choices: Array<{ name: string; value: string }> = [];
  if (isAlreadyAuthorized) {
    choices.push({
      name: "✓ 已完成（资源已授权，无需处理）",
      value: "completed",
    });
  }
  if (policies.length > 0) {
    policies.forEach((policy) => {
      choices.push({
        name: `签约策略: ${policy.policyName}`,
        value: `policy:${policy.policyId}`,
      });
    });
  }
  if (policies.length === 0) {
    choices.push({
      name: "跳过（仅添加到配置，稍后处理）",
      value: "skip",
    });
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: `请选择操作 (${resourceName}):`,
      choices,
    },
  ]);

  if (action === "completed" || action === "skip") {
    return { action: action as "completed" | "skip", contractResult: null };
  }

  if (action.startsWith("policy:")) {
    const policyId = action.replace("policy:", "");
    const selectedPolicy = policies.find((p) => p.policyId === policyId)!;

    const { confirmSign } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmSign",
        message: `确认签约策略 "${selectedPolicy.policyName}"?`,
        default: true,
      },
    ]);

    if (!confirmSign) {
      return { action: "skip", contractResult: null };
    }

    const signSpinner = ora("正在签约...").start();
    try {
      const contractResult = await createContract(
        resourceInfo.resourceId,
        policyId,
        licenseeId || ""
      );
      signSpinner.succeed("签约成功");

      if (contractResult.authStatus === 1 || contractResult.authStatus === 2) {
        const authType = contractResult.authStatus === 1 ? "正式授权" : "测试授权";
        console.log(chalk.green(`✔ 签约成功，已获得${authType}`));
        return { action: "completed", contractResult };
      } else {
        console.log(chalk.yellow("⚠️ 签约成功但未获得授权，需要完成支付"));
        const { confirmPay } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirmPay",
            message: "是否立即支付?",
            default: true,
          },
        ]);

        if (confirmPay) {
          try {
            await processPayment(contractResult.contractId);
            console.log(chalk.green("✔ 支付成功，已获得授权"));
            return { action: "completed", contractResult };
          } catch (payErr: any) {
            console.log(chalk.red(`✖ 支付失败: ${payErr.message}`));
            return { action: "skip", contractResult };
          }
        } else {
          return { action: "completed", contractResult };
        }
      }
    } catch (err: any) {
      signSpinner.fail("签约失败");
      console.log(chalk.red(`✖ ${err.message}`));
      return { action: "skip", contractResult: null };
    }
  }

  return { action: "skip", contractResult: null };
}

/**
 * 执行 collection item add 命令
 */
export async function executeCollectionItemAdd(
  resourceIdOrName: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 添加合集单品 ===\n'));

    // 1. 验证登录
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
      console.log(chalk.red('\n❌ 合集配置中未设置 resourceId'));
      console.log(chalk.yellow('\n💡 请先执行: freelog-cli2 collection create 创建合集'));
      throw new Error('未设置合集 resourceId');
    }

    // 3. 解析资源标识符
    const parsed = parseResourceIdentifier(resourceIdOrName);
    console.log(chalk.blue("ℹ ") + `资源标识: ${parsed.value}`);
    if (parsed.version) {
      console.log(chalk.blue("ℹ ") + `指定版本: ${parsed.version}`);
    }

    // 4. 获取单品资源信息
    const resourceSpinner = ora("正在获取资源信息...").start();
    let itemResourceInfo: ResourceDetailResponse;
    try {
      itemResourceInfo = await getResourceInfo(parsed.value, {
        isLoadPolicyInfo: 1,
        isTranslate: 1,
      });
      resourceSpinner.succeed("资源信息获取成功");
      console.log(chalk.green("✔ ") + `资源名称: ${itemResourceInfo.resourceName}`);
    } catch (err: any) {
      resourceSpinner.fail("获取资源信息失败");
      throw err;
    }

    // 5. 检查资源可用性（主资源 + 上抛资源）
    const allResourceIdsToCheck = [itemResourceInfo.resourceId];
    if (itemResourceInfo.baseUpcastResources && itemResourceInfo.baseUpcastResources.length > 0) {
      allResourceIdsToCheck.push(...itemResourceInfo.baseUpcastResources.map(r => r.resourceId));
    }

    const availabilitySpinner = ora('正在检查资源可用性...').start();
    try {
      const availabilityResults = await batchCheckResourceAuth(allResourceIdsToCheck.join(','));
      const unavailableResources = availabilityResults.filter(r => !r.isAuth);

      if (unavailableResources.length > 0) {
        availabilitySpinner.fail('发现异常不可用资源');
        const unavailableNames = unavailableResources.map(r => `"${r.resourceName}" (ID: ${r.resourceId})`).join(', ');
        throw new Error(`以下资源异常不可用，无法用于签约: ${unavailableNames}`);
      }
      availabilitySpinner.succeed('所有资源正常可用');
    } catch (err: any) {
      availabilitySpinner.fail('资源可用性检查失败');
      handleErrorAndExit(err, '资源可用性检查失败', options.debug);
    }

    // 6. 处理主资源的签约支付
    const policies = itemResourceInfo.policies || [];
    const mainContractResult = await processSingleResourceContract(
      itemResourceInfo,
      itemResourceInfo.resourceName,
      policies,
      collectionConfig.resourceId
    );

    // 7. 处理上抛资源的签约支付
    const resolveResources: ResolveResource[] = [];
    if (itemResourceInfo.baseUpcastResources && itemResourceInfo.baseUpcastResources.length > 0) {
      console.log(chalk.yellow(`\n⚠️ 检测到 ${itemResourceInfo.baseUpcastResources.length} 个上抛资源`));
      
      for (const upcast of itemResourceInfo.baseUpcastResources) {
        const upcastSpinner = ora(`正在获取上抛资源信息: ${upcast.resourceName}...`).start();
        let upcastResourceInfo: ResourceDetailResponse;
        try {
          upcastResourceInfo = await getResourceInfo(upcast.resourceId, {
            isLoadPolicyInfo: 1,
            isTranslate: 1,
          });
          upcastSpinner.succeed(`上抛资源信息获取成功`);
        } catch (err: any) {
          upcastSpinner.fail(`获取上抛资源信息失败`);
          throw err;
        }

        const upcastPolicies = upcastResourceInfo.policies || [];
        const upcastContractResult = await processSingleResourceContract(
          upcastResourceInfo,
          upcast.resourceName,
          upcastPolicies,
          collectionConfig.resourceId
        );

        // 如果签约成功，添加到 resolveResources
        if (upcastContractResult.contractResult) {
          const contractId = upcastContractResult.contractResult.contractId;
          if (contractId) {
            resolveResources.push({
              resourceId: upcast.resourceId,
              contracts: [{ policyId: upcastContractResult.contractResult.policyId }],
            });
          }
        }
      }
    }

    // 8. 构建 resolveResources（主资源的合同）
    if (mainContractResult.contractResult) {
      const contractId = mainContractResult.contractResult.contractId;
      if (contractId) {
        resolveResources.push({
          resourceId: itemResourceInfo.resourceId,
          contracts: [{ policyId: mainContractResult.contractResult.policyId }],
        });
      }
    }

    // 9. 添加到草稿
    const addSpinner = ora('正在添加单品到草稿...').start();
    try {
      const addBody: BatchAddCollectionItemsDraftBody = {
        items: [{
          resourceId: itemResourceInfo.resourceId,
          version: parsed.version || itemResourceInfo.latestVersion,
          resolveResources: resolveResources.length > 0 ? resolveResources : undefined,
        }],
      };

      await batchAddCollectionItemsDraft(collectionConfig.resourceId, addBody);
      addSpinner.succeed('单品已添加到草稿');
    } catch (err: any) {
      addSpinner.fail('添加单品失败');
      throw err;
    }

    // 10. 更新本地配置
    if (!collectionConfig.items) {
      collectionConfig.items = [];
    }
    
    const itemConfig: CollectionItemConfig = {
      resourceId: itemResourceInfo.resourceId,
      resourceName: itemResourceInfo.resourceName,
      version: parsed.version || itemResourceInfo.latestVersion,
    };
    
    // 检查是否已存在
    const existingIndex = collectionConfig.items.findIndex(
      item => item.resourceId === itemResourceInfo.resourceId
    );
    
    if (existingIndex >= 0) {
      collectionConfig.items[existingIndex] = itemConfig;
    } else {
      collectionConfig.items.push(itemConfig);
    }

    await saveCollectionConfig(collectionConfig, options.config);

    // 11. 显示结果
    console.log(chalk.green('\n✔ ') + '单品添加成功');
    console.log(chalk.blue('ℹ️ ') + `单品资源: ${chalk.cyan(itemResourceInfo.resourceName)}`);
    console.log(chalk.blue('ℹ️ ') + `版本: ${chalk.cyan(parsed.version || itemResourceInfo.latestVersion)}`);
    console.log(chalk.blue('ℹ️ ') + `配置文件已更新`);
    
    console.log(chalk.blue('\n💡 提示:'));
    console.log(`  ${chalk.gray('$')} freelog-cli2 collection update  ${chalk.gray('# 更新合集信息并提交草稿')}`);

  } catch (err: any) {
    handleErrorAndExit(err, '添加合集单品失败', options.debug);
  }
}

