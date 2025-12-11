/**
 * 依赖添加服务
 * 提供通用的依赖添加逻辑，支持资源和合集
 */

import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { CommandOptions } from "../types";
import { requireAuth } from "../core/auth";
import { confirmAuth } from "../utils/authConfirm";
import { getResourceInfo } from "../api/resource";
import { getResourceVersionInfoList } from "../api/version";
import {
  checkResourceAuth,
  batchCheckResourceAuth,
} from "../api/auth";
import type { PolicyInfo, ResourceDetailResponse } from "../api/types";
import { handleErrorAndExit } from "../utils/errorHandler";
import { processPayment } from "./paymentService";
import { createContract } from "../api/contract";

/**
 * 依赖配置接口（通用）
 */
export interface DependencyConfig {
  resourceId?: string;
}

/**
 * 依赖配置操作接口
 */
export interface DependencyConfigOperations<T extends DependencyConfig> {
  /** 加载配置 */
  loadConfig: (customPath?: string) => Promise<T>;
  /** 保存配置 */
  saveConfig: (config: T, customPath?: string) => Promise<void>;
  /** 获取当前资源的 resourceId */
  getCurrentResourceId: (config: T) => string | undefined;
  /** 添加依赖到配置 */
  addDependencyToConfig: (
    config: T,
    dependency: {
      resourceId: string;
      resourceName: string;
      versionRange: string;
    }
  ) => Promise<T>;
  /** 检查依赖是否已存在 */
  dependencyExists: (
    config: T,
    resourceId: string
  ) => Promise<{
    exists: boolean;
    dependency?: any;
  }>;
  /** 添加上抛资源到配置（可选，仅资源需要） */
  addUpcastResource?: (
    config: T,
    upcastResource: {
      resourceId: string;
      resourceName: string;
    }
  ) => Promise<T>;
}

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
 * 格式化策略翻译内容
 */
function formatPolicyContent(
  content: string | undefined,
  forInquirer: boolean = false
): string {
  if (!content) return "";

  if (forInquirer) {
    return content
      .replace(/\r\n/g, " ")
      .replace(/\n/g, " ")
      .replace(/\r/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    return content;
  }
}

/**
 * 处理单个资源的签约和支付流程
 */
async function processSingleResourceContract(
  resourceInfo: ResourceDetailResponse,
  resourceName: string,
  policies: PolicyInfo[],
  licenseeId?: string
): Promise<{
  action: "completed" | "skip";
  contractResult?: any | null;
  selectedUpcast?: boolean;
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
      const policyContent = formatPolicyContent(
        policy.translateInfo?.content,
        false
      );
      console.log(chalk.bold(`${index + 1}. ${policy.policyName}`));
      if (policyContent) {
        console.log(
          chalk.gray("   " + policyContent.replace(/\n/g, "\n   "))
        );
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

  if (choices.length === 0) {
    return { action: "skip", contractResult: null };
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "请选择操作:",
      choices,
    },
  ]);

  if (action === "completed" || action === "skip") {
    return { action, contractResult: null };
  }

  // 处理策略签约
  if (action.startsWith("policy:")) {
    const policyId = action.split(":")[1];
    const selectedPolicy = policies.find((p) => p.policyId === policyId);
    if (!selectedPolicy) {
      throw new Error("选择的策略不存在");
    }

    console.log(chalk.cyan(`\n=== 签约策略: ${selectedPolicy.policyName} ===`));

    // 创建合同
    const contractSpinner = ora("正在创建合同...").start();
    let contractResult: any;
    try {
      contractResult = await createContract({
        policyId: selectedPolicy.policyId,
        licenseeId: licenseeId,
      });
      contractSpinner.succeed("合同创建成功");
    } catch (err: any) {
      contractSpinner.fail("合同创建失败");
      throw err;
    }

    // 处理支付
    if (contractResult.needPay && contractResult.needPay > 0) {
      await processPayment(contractResult);
    }

    return { action: "completed", contractResult };
  }

  return { action: "skip", contractResult: null };
}

/**
 * 依赖添加结果
 */
export interface DependencyAddResult {
  /** resolveResources，用于调用更新接口 */
  resolveResources: Array<{
    resourceId: string;
    contracts: Array<{ policyId: string }>;
  }>;
  /** 目标版本 */
  targetVersion: string;
  /** 资源信息 */
  resourceInfo: ResourceDetailResponse;
}

/**
 * 合集单品添加结果（只处理上抛资源）
 */
export interface CollectionItemAddResult {
  /** resolveResources，用于调用更新接口（只包含上抛资源） */
  resolveResources: Array<{
    resourceId: string;
    contracts: Array<{ policyId: string }>;
  }>;
  /** 目标版本 */
  targetVersion: string;
  /** 资源信息 */
  resourceInfo: ResourceDetailResponse;
}

/**
 * 合集单品配置操作接口（简化版，只处理 items）
 */
export interface CollectionItemConfigOperations<T extends DependencyConfig> {
  /** 加载配置 */
  loadConfig: (customPath?: string) => Promise<T>;
  /** 保存配置 */
  saveConfig: (config: T, customPath?: string) => Promise<void>;
  /** 获取当前资源的 resourceId */
  getCurrentResourceId: (config: T) => string | undefined;
  /** 添加单品到配置 */
  addItemToConfig: (
    config: T,
    item: {
      resourceId: string;
      resourceName: string;
      version?: string;
    }
  ) => Promise<T>;
  /** 检查单品是否已存在 */
  itemExists: (
    config: T,
    resourceId: string
  ) => Promise<{
    exists: boolean;
    item?: any;
  }>;
}

/**
 * 添加合集单品（只处理上抛资源，不处理单品本身签约）
 */
export async function addCollectionItem<T extends DependencyConfig>(
  resourceIdentifier: string,
  options: CommandOptions,
  configOps: CollectionItemConfigOperations<T>
): Promise<CollectionItemAddResult> {
  try {
    // 1. 检查登录并确认用户信息
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 解析资源标识符
    const parsed = parseResourceIdentifier(resourceIdentifier);
    console.log(chalk.cyan(`\n=== 添加合集单品 ===`));
    console.log(chalk.blue("ℹ ") + `资源标识: ${parsed.value}`);
    if (parsed.version) {
      console.log(chalk.blue("ℹ ") + `指定版本: ${parsed.version}`);
    }

    // 3. 获取单品资源信息
    const spinner = ora("正在获取资源信息...").start();
    let resourceInfo: ResourceDetailResponse;
    try {
      resourceInfo = await getResourceInfo(parsed.value, {
        isLoadPolicyInfo: 1,
        isTranslate: 1,
      });
      spinner.succeed("资源信息获取成功");
      console.log(chalk.green("✔ ") + `资源名称: ${resourceInfo.resourceName}`);
    } catch (err: any) {
      spinner.fail("获取资源信息失败");
      handleErrorAndExit(err, "获取资源信息失败", options.debug);
    }

    // 4. 检查资源可用性（主资源 + 上抛资源）
    const allResourceIdsToCheck = [resourceInfo.resourceId];
    if (resourceInfo.baseUpcastResources && resourceInfo.baseUpcastResources.length > 0) {
      allResourceIdsToCheck.push(...resourceInfo.baseUpcastResources.map(r => r.resourceId));
    }

    const checkAuthSpinner = ora("正在检查资源可用性...").start();
    try {
      const availabilityResults = await batchCheckResourceAuth(allResourceIdsToCheck.join(','));
      const unavailableResources = availabilityResults.filter(r => !r.isAuth);

      if (unavailableResources.length > 0) {
        checkAuthSpinner.fail("发现异常资源");
        console.log(
          chalk.red(
            `\n✖ 以下资源异常不可用，无法用于签约：\n`
          )
        );
        unavailableResources.forEach((resource) => {
          console.log(
            chalk.red(
              `  - ${resource.resourceName} (ID: ${resource.resourceId})`
            )
          );
        });
        throw new Error("资源异常不可用");
      }
      checkAuthSpinner.succeed("所有资源正常可用");
    } catch (err: any) {
      if (err.message === "资源异常不可用") {
        handleErrorAndExit(err, "资源检查失败", options.debug);
      } else {
        checkAuthSpinner.warn("无法检查资源可用性，将继续流程");
      }
    }

    // 5. 加载配置并获取当前项目的 resourceId
    const config = await configOps.loadConfig(options.config);
    const currentResourceId = configOps.getCurrentResourceId(config);

    if (!currentResourceId) {
      console.log(chalk.yellow(`\n⚠️  未找到当前合集的 resourceId`));
      console.log(chalk.gray(`请先创建合集或设置 resourceId`));
    }

    // 6. 确定版本
    let targetVersion = parsed.version || "*";

    if (!parsed.version) {
      const { useLatest } = await inquirer.prompt([
        {
          type: "confirm",
          name: "useLatest",
          message: "是否使用最新版本 (*)?",
          default: true,
        },
      ]);

      if (!useLatest) {
        try {
          const versionSpinner = ora("正在获取依赖资源的版本列表...").start();
          const versions = await getResourceVersionInfoList(
            resourceInfo.resourceId
          );
          versionSpinner.succeed(`找到 ${versions.length} 个版本`);

          if (versions.length > 0) {
            const { version } = await inquirer.prompt([
              {
                type: "list",
                name: "version",
                message: "请选择版本:",
                choices: versions.map((v: any) => ({
                  name: `${v.version} (${new Date(
                    v.createDate
                  ).toLocaleDateString()})`,
                  value: v.version,
                  short: v.version,
                })),
              },
            ]);
            targetVersion = `^${version}`;
          } else {
            console.log(chalk.yellow("⚠️ 未找到可用版本，使用 *"));
          }
        } catch (err: any) {
          console.log(
            chalk.yellow(`⚠️ 获取版本列表失败: ${err.message}，使用 *`)
          );
        }
      }
    }

    // 7. 检查是否已存在
    const existingCheck = await configOps.itemExists(config, resourceInfo.resourceId);
    if (existingCheck.exists) {
      console.log(
        chalk.yellow("⚠️ ") +
          `单品已存在，当前版本: ${existingCheck.item?.version || '*'}`
      );
      const { overwrite } = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          message: "是否覆盖现有单品?",
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(chalk.blue("ℹ️ ") + "已取消添加");
        throw new Error("用户取消添加单品");
      }
    }

    // 8. 只处理上抛资源的签约和支付（不处理单品本身）
    const resolveResources: Array<{
      resourceId: string;
      contracts: Array<{ policyId: string }>;
    }> = [];

    if (resourceInfo.baseUpcastResources && resourceInfo.baseUpcastResources.length > 0) {
      console.log(
        chalk.yellow(`\n⚠️ 检测到单品有 ${resourceInfo.baseUpcastResources.length} 个上抛资源`)
      );
      console.log(
        chalk.gray("上抛资源是单品声明的基础授权资源，必须获得授权才能使用单品。\n")
      );

      for (const upcast of resourceInfo.baseUpcastResources) {
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
          currentResourceId
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
        } else if (upcastContractResult.action === "skip") {
          throw new Error("用户取消添加单品");
        }
      }
    } else {
      console.log(chalk.blue("ℹ️ ") + "单品没有上抛资源，无需签约");
    }

    // 9. 添加单品到配置
    const versionForConfig = targetVersion === "*" ? undefined : targetVersion.replace(/^\^/, "");
    const updatedConfig = await configOps.addItemToConfig(config, {
      resourceId: resourceInfo.resourceId,
      resourceName: resourceInfo.resourceName,
      version: versionForConfig,
    });

    // 10. 保存配置
    const saveSpinner = ora("正在保存配置...").start();
    try {
      await configOps.saveConfig(updatedConfig, options.config);
      saveSpinner.succeed("配置保存成功");
    } catch (err: any) {
      saveSpinner.fail("保存配置失败");
      throw err;
    }

    console.log(
      chalk.green("\n✔️ ") + `单品添加成功: ${resourceInfo.resourceName}`
    );
    console.log(
      chalk.blue("ℹ️ ") + `版本范围: ${targetVersion}`
    );
    if (resolveResources.length > 0) {
      console.log(
        chalk.blue("ℹ️ ") + `已处理 ${resolveResources.length} 个上抛资源的签约`
      );
    }
    console.log(
      chalk.gray(
        "\n提示: 合集添加单品不需要与单品本身签约，只需要处理上抛资源。"
      )
    );

    // 返回结果，供调用者使用（如调用更新接口）
    return {
      resolveResources,
      targetVersion,
      resourceInfo,
    };
  } catch (err: any) {
    if (err.message === "用户取消添加单品") {
      throw err;
    }
    handleErrorAndExit(err, "执行添加单品命令失败");
  }
}

/**
 * 通用的依赖添加逻辑
 */
export async function addDependency<T extends DependencyConfig>(
  resourceIdentifier: string,
  options: CommandOptions,
  configOps: DependencyConfigOperations<T>,
  configType: 'resource' | 'collection'
): Promise<DependencyAddResult> {
  try {
    // 1. 检查登录并确认用户信息
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 解析资源标识符
    const parsed = parseResourceIdentifier(resourceIdentifier);
    const configTypeName = configType === 'resource' ? '资源' : '合集';
    console.log(chalk.cyan(`\n=== 添加依赖 ===`));
    console.log(chalk.blue("ℹ ") + `资源标识: ${parsed.value}`);
    if (parsed.version) {
      console.log(chalk.blue("ℹ ") + `指定版本: ${parsed.version}`);
    }

    // 3. 获取依赖资源信息
    const spinner = ora("正在获取资源信息...").start();
    let resourceInfo: ResourceDetailResponse;
    try {
      resourceInfo = await getResourceInfo(parsed.value, {
        isLoadPolicyInfo: 1,
        isTranslate: 1,
      });
      spinner.succeed("资源信息获取成功");

      console.log(chalk.green("✔ ") + `资源名称: ${resourceInfo.resourceName}`);
      console.log(
        chalk.green("✔ ") +
          `资源类型: ${
            Array.isArray(resourceInfo.resourceType)
              ? resourceInfo.resourceType.join(", ")
              : resourceInfo.resourceType
          }`
      );
      if (resourceInfo.intro) {
        console.log(chalk.blue("ℹ ") + `描述: ${resourceInfo.intro}`);
      }
    } catch (err: any) {
      spinner.fail("获取资源信息失败");
      handleErrorAndExit(err, "获取资源信息失败", options.debug);
    }

    // 4. 检查资源可用性（主资源 + 上抛资源）
    const allResourceIdsToCheck = [resourceInfo.resourceId];
    if (resourceInfo.baseUpcastResources && resourceInfo.baseUpcastResources.length > 0) {
      allResourceIdsToCheck.push(...resourceInfo.baseUpcastResources.map(r => r.resourceId));
    }

    const checkAuthSpinner = ora("正在检查资源可用性...").start();
    try {
      const availabilityResults = await batchCheckResourceAuth(allResourceIdsToCheck.join(','));
      const unavailableResources = availabilityResults.filter(r => !r.isAuth);

      if (unavailableResources.length > 0) {
        checkAuthSpinner.fail("发现异常资源");
        console.log(
          chalk.red(
            `\n✖ 以下资源异常不可用，无法用于签约：\n`
          )
        );
        unavailableResources.forEach((resource) => {
          console.log(
            chalk.red(
              `  - ${resource.resourceName} (ID: ${resource.resourceId})`
            )
          );
        });
        throw new Error("资源异常不可用");
      }
      checkAuthSpinner.succeed("所有资源正常可用");
    } catch (err: any) {
      if (err.message === "资源异常不可用") {
        handleErrorAndExit(err, "资源检查失败", options.debug);
      } else {
        checkAuthSpinner.warn("无法检查资源可用性，将继续流程");
      }
    }

    // 5. 加载配置并获取当前项目的 resourceId
    const config = await configOps.loadConfig(options.config);
    const currentResourceId = configOps.getCurrentResourceId(config);

    if (!currentResourceId) {
      console.log(chalk.yellow(`\n⚠️  未找到当前${configTypeName}的 resourceId`));
      console.log(chalk.gray(`请先创建${configTypeName}或设置 resourceId`));
    }

    // 6. 确定依赖版本
    let targetVersion = parsed.version || "*";

    if (!parsed.version) {
      const { useLatest } = await inquirer.prompt([
        {
          type: "confirm",
          name: "useLatest",
          message: "是否使用最新版本 (*)?",
          default: true,
        },
      ]);

      if (!useLatest) {
        try {
          const versionSpinner = ora("正在获取依赖资源的版本列表...").start();
          const versions = await getResourceVersionInfoList(
            resourceInfo.resourceId
          );
          versionSpinner.succeed(`找到 ${versions.length} 个版本`);

          if (versions.length > 0) {
            const { version } = await inquirer.prompt([
              {
                type: "list",
                name: "version",
                message: "请选择版本:",
                choices: versions.map((v: any) => ({
                  name: `${v.version} (${new Date(
                    v.createDate
                  ).toLocaleDateString()})`,
                  value: v.version,
                  short: v.version,
                })),
              },
            ]);
            targetVersion = `^${version}`;
          } else {
            console.log(chalk.yellow("⚠️ 未找到可用版本，使用 *"));
          }
        } catch (err: any) {
          console.log(
            chalk.yellow(`⚠️ 获取版本列表失败: ${err.message}，使用 *`)
          );
        }
      }
    }

    // 7. 检查是否已存在
    const existingCheck = await configOps.dependencyExists(config, resourceInfo.resourceId);
    if (existingCheck.exists) {
      console.log(
        chalk.yellow("⚠️ ") +
          `依赖已存在，当前版本: ${existingCheck.dependency?.versionRange || '*'}`
      );
      const { overwrite } = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          message: "是否覆盖现有依赖?",
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(chalk.blue("ℹ️ ") + "已取消添加");
        return;
      }
    }

    // 8. 获取策略列表
    const policies = resourceInfo.policies || [];
    if (policies.length > 0) {
      console.log(chalk.green(`✔ 找到 ${policies.length} 个可用策略`));
    }

    // 9. 处理资源的策略选择和签约
    let contractResult: any = null;

    try {
      const result = await processSingleResourceContract(
        resourceInfo,
        resourceInfo.resourceName,
        policies,
        currentResourceId
      );
      contractResult = result.contractResult;

      if (result.action === "skip") {
        console.log(chalk.yellow("⚠️ 跳过签约，仅添加到配置"));
      }
    } catch (err: any) {
      if (err.message === "用户取消添加依赖") {
        return;
      }
      throw err;
    }

    // 10. 处理上抛资源的签约和支付
    const resolveResources: Array<{
      resourceId: string;
      contracts: Array<{ policyId: string }>;
    }> = [];

    if (resourceInfo.baseUpcastResources && resourceInfo.baseUpcastResources.length > 0) {
      console.log(chalk.yellow(`\n⚠️ 检测到 ${resourceInfo.baseUpcastResources.length} 个上抛资源`));
      
      for (const upcast of resourceInfo.baseUpcastResources) {
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
          currentResourceId
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

    // 11. 构建 resolveResources（主资源的合同）
    if (contractResult) {
      const contractId = contractResult.contractId;
      if (contractId) {
        resolveResources.push({
          resourceId: resourceInfo.resourceId,
          contracts: [{ policyId: contractResult.policyId }],
        });
      }
    }

    // 12. 添加依赖到配置
    const newDependency = {
      resourceId: resourceInfo.resourceId,
      resourceName: resourceInfo.resourceName,
      versionRange: targetVersion,
    };

    const updatedConfig = await configOps.addDependencyToConfig(config, newDependency);

    // 13. 保存配置
    const saveSpinner = ora("正在保存配置...").start();
    try {
      await configOps.saveConfig(updatedConfig, options.config);
      saveSpinner.succeed("配置保存成功");
    } catch (err: any) {
      saveSpinner.fail("保存配置失败");
      throw err;
    }

    console.log(
      chalk.green("\n✔️ ") + `依赖添加成功: ${resourceInfo.resourceName}`
    );
    console.log(
      chalk.blue("ℹ️ ") + `版本范围: ${newDependency.versionRange}`
    );
    if (contractResult) {
      const authType =
        contractResult.authStatus === 1
          ? "正式授权"
          : contractResult.authStatus === 2
          ? "测试授权"
          : "未授权";
      console.log(chalk.blue("ℹ️ ") + `授权状态: ${authType}`);
    }
    console.log(
      chalk.gray(
        "\n提示: 请确保完成所有必要的签约和支付，否则依赖资源可能无法使用。"
      )
    );

    // 返回结果，供调用者使用（如调用更新接口）
    return {
      resolveResources,
      targetVersion,
      resourceInfo,
    };
  } catch (err: any) {
    handleErrorAndExit(err, "执行添加依赖命令失败");
  }
}

