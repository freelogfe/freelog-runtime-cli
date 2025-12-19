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
  batchCheckResourceAvailable,
} from "../api/auth";
import type { PolicyInfo, ResourceDetailResponse } from "../api/types";
import { handleErrorAndExit } from "../utils/errorHandler";
import { processPayment } from "./paymentService";
import { createContract, getContractsList, getContractsTransitionRecord, type ContractResponse } from "../api/contract";

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

  if (!licenseeId) {
    console.log(chalk.yellow("⚠️ 未提供当前资源ID，无法查询合约列表"));
    return { action: "skip", contractResult: null };
  }

  // 1. 查询当前资源与依赖资源之间的合约列表（只查询主资源，不包括上抛资源）
  const contractSpinner = ora("正在查询合约列表...").start();
  let contracts: ContractResponse[] = [];
  try {
    contracts = await getContractsList({
      licenseeId,
      subjectIds: resourceInfo.resourceId,
      isLoadPolicyInfo: 1,
      isTranslate: 1,
    });
    contractSpinner.succeed(`找到 ${contracts.length} 个合约`);
  } catch (err: any) {
    contractSpinner.fail("查询合约列表失败");
    console.log(chalk.yellow(`⚠️ ${err.message}`));
    // 如果查询失败，继续使用策略列表
  }

  // 2. 检查授权链状态
  let authChainStatus: { isAuth: boolean; version?: string } | null = null;
  const authCheckSpinner = ora("正在检查授权链状态...").start();
  try {
    const authResults = await batchCheckResourceAvailable(resourceInfo.resourceId, resourceInfo.latestVersion);
    if (authResults.length > 0) {
      authChainStatus = {
        isAuth: authResults[0].isAuth,
        version: authResults[0].version,
      };
      if (authChainStatus.isAuth) {
        authCheckSpinner.succeed(`授权链正常 (版本: ${authChainStatus.version})`);
      } else {
        authCheckSpinner.warn("授权链异常，可能影响资源使用");
      }
    } else {
      authCheckSpinner.warn("无法获取授权链状态");
    }
  } catch (err: any) {
    authCheckSpinner.warn("授权链检查失败，将继续流程");
  }

  // 3. 过滤策略：只保留已启用的策略（status = 1），并排除已经在合约中的策略ID
  const contractPolicyIds = new Set(contracts.map(c => c.policyId));
  const availablePolicies = policies.filter(
    p => p.status === 1 && !contractPolicyIds.has(p.policyId || '')
  );

  // 4. 过滤生效合约（status = 0，只显示正常状态的合约）
  const activeContracts = contracts.filter(c => c.status === 0 && c.licensorId === resourceInfo.resourceId);
  // 已授权合约（authStatus = 1 或 2）
  const authorizedContracts = activeContracts.filter(c => c.authStatus === 1 || c.authStatus === 2);
  // 待执行合约（authStatus = 128，需要支付）
  const pendingContracts = activeContracts.filter(c => c.authStatus === 128);

  // 5. 获取合约流转记录（参考前端：使用 getContractTransitionRecordBatch 获取最新流转记录）
  let transitionRecords: any[] = [];
  if (activeContracts.length > 0) {
    const recordSpinner = ora("正在获取合约流转记录...").start();
    try {
      const contractIds = activeContracts.map(c => c.contractId);
      transitionRecords = await getContractsTransitionRecord({
        contractIds,
        isTranslate: true,
      });
      recordSpinner.succeed("合约流转记录获取成功");
    } catch (err: any) {
      recordSpinner.warn("获取合约流转记录失败，将使用基本信息");
    }
  }

  // 6. 显示合约列表（只显示生效合约，参考前端展示流转记录信息）
  if (activeContracts.length > 0) {
    console.log(chalk.cyan("\n=== 现有生效合约列表 ===\n"));
    activeContracts.forEach((contract, index) => {
      // 查找对应的流转记录
      const transitionRecord = transitionRecords.find(r => r.contractId === contract.contractId);
      
      // 授权状态文本（优先使用流转记录中的 serviceStates）
      let authStatusText: string;
      if (transitionRecord) {
        // 使用流转记录中的 serviceStates（1:授权 2:测试授权 3:授权且测试授权 128:无授权）
        const serviceStates = transitionRecord.serviceStates;
        if (serviceStates === 1) {
          authStatusText = chalk.green("正式授权");
        } else if (serviceStates === 2) {
          authStatusText = chalk.yellow("测试授权");
        } else if (serviceStates === 3) {
          authStatusText = chalk.green("授权且测试授权");
        } else if (serviceStates === 128) {
          authStatusText = chalk.yellow("待执行（需要支付）");
        } else {
          authStatusText = chalk.gray("未授权");
        }
      } else {
        // 回退到使用合约的 authStatus
        authStatusText = contract.authStatus === 1 
          ? chalk.green("正式授权") 
          : contract.authStatus === 2 
          ? chalk.yellow("测试授权") 
          : contract.authStatus === 128
          ? chalk.yellow("待执行（需要支付）")
          : chalk.gray("未授权");
      }
      
      console.log(chalk.bold(`${index + 1}. 合约: ${contract.contractName || contract.contractId}`));
      console.log(chalk.gray(`   标的物: ${contract.subjectName} (${contract.subjectId})`));
      console.log(chalk.gray(`   策略ID: ${contract.policyId}`));
      console.log(chalk.gray(`   授权状态: ${authStatusText}`));
      
      // 显示流转记录信息（参考前端展示）
      if (transitionRecord) {
        if (transitionRecord.stateStr) {
          console.log(chalk.gray(`   状态: ${transitionRecord.stateStr}`));
        }
        if (transitionRecord.stateInfoStr) {
          console.log(chalk.gray(`   状态信息: ${transitionRecord.stateInfoStr}`));
        }
        if (transitionRecord.time) {
          console.log(chalk.gray(`   时间: ${transitionRecord.time}`));
        }
        if (transitionRecord.eventStr) {
          console.log(chalk.gray(`   当前事件: ${transitionRecord.eventStr}`));
        }
        // 显示事件选项（eventSectionStrs）
        if (transitionRecord.eventSectionStrs && transitionRecord.eventSectionStrs.length > 0) {
          transitionRecord.eventSectionStrs.forEach((eventStr:any, eventIndex:number) => {
            console.log(chalk.gray(`   事件选项 ${eventIndex + 1}: ${eventStr}`));
          });
        }
      }
      
      console.log(chalk.gray(`   合约状态: 正常`));
      console.log();
    });
  }

  // 显示授权链警告
  if (authChainStatus && !authChainStatus.isAuth) {
    console.log(chalk.yellow("⚠️ 警告: 授权链异常，即使签约成功也可能无法正常使用该资源"));
    console.log();
  }

  // 6. 显示可用策略列表（排除已在合约中的）
  if (availablePolicies.length > 0) {
    console.log(chalk.cyan("\n=== 可用策略列表 ===\n"));
    availablePolicies.forEach((policy, index) => {
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

  // 7. 构建选择项
  const choices: Array<{ name: string; value: string }> = [];

  // 如果有已授权的合约，添加"确认添加"选项
  if (authorizedContracts.length > 0) {
    choices.push({
      name: `✓ 确认添加（已有 ${authorizedContracts.length} 个已授权合约）`,
      value: "completed",
    });
  }

  // 如果有待执行的合约，添加支付选项和跳过选项
  if (pendingContracts.length > 0) {
    pendingContracts.forEach((contract) => {
      choices.push({
        name: `支付合约: ${contract.contractName || contract.contractId}（待执行）`,
        value: `pay:${contract.contractId}`,
      });
    });
    // 添加跳过支付选项
    choices.push({
      name: `跳过支付（仅添加到配置，稍后处理）`,
      value: `skip-payment`,
    });
  }

  // 添加可用策略选项
  if (availablePolicies.length > 0) {
    availablePolicies.forEach((policy) => {
      choices.push({
        name: `签约策略: ${policy.policyName}`,
        value: `policy:${policy.policyId}`,
      });
    });
  }

  // 如果没有已授权合约、待执行合约且没有可用策略，添加跳过选项
  if (authorizedContracts.length === 0 && pendingContracts.length === 0 && availablePolicies.length === 0) {
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
      message: "请选择操作（使用空格键进行选择）:",
      choices,
    },
  ]);

  if (action === "completed") {
    // 用户选择确认添加（使用已有授权合约）
    const selectedContract = authorizedContracts[0]; // 使用第一个已授权合约
    console.log(chalk.green(`\n✔ 使用已有授权合约: ${selectedContract.contractName || selectedContract.contractId}`));
    return { action: "completed", contractResult: selectedContract };
  }

  if (action === "skip") {
    return { action: "skip", contractResult: null };
  }

  // 处理跳过支付
  if (action === "skip-payment") {
    console.log(chalk.blue("\nℹ️ 已跳过支付，依赖已添加到配置"));
    if (pendingContracts.length > 0) {
      console.log(chalk.yellow(`⚠️ 提示: 有 ${pendingContracts.length} 个合约待支付，请稍后完成支付以获得授权`));
      pendingContracts.forEach((contract) => {
        console.log(chalk.gray(`  - ${contract.contractName || contract.contractId}`));
      });
    }
    // 返回第一个待执行合约作为结果（虽然未支付，但合约已存在）
    return { action: "skip", contractResult: pendingContracts[0] || null };
  }

  // 处理待执行合约的支付
  if (action.startsWith("pay:")) {
    const contractId = action.split(":")[1];
    const selectedContract = pendingContracts.find(c => c.contractId === contractId);
    if (!selectedContract) {
      throw new Error("选择的合约不存在");
    }

    console.log(chalk.cyan(`\n=== 支付合约: ${selectedContract.contractName || selectedContract.contractId} ===`));

    // 先询问是否确认支付
    const { confirmPay } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmPay",
        message: "确认支付此合约?",
        default: true,
      },
    ]);

    if (!confirmPay) {
      console.log(chalk.blue("ℹ️ 已取消支付，依赖已添加到配置"));
      console.log(chalk.yellow(`⚠️ 提示: 合约 ${selectedContract.contractName || selectedContract.contractId} 待支付，请稍后完成支付以获得授权`));
      return { action: "skip", contractResult: selectedContract };
    }

    // 执行支付
    let hasPaid = false;
    try {
      const paymentResult = await processPayment(selectedContract.contractId);
      if (paymentResult.skipped) {
        // 用户选择跳过支付（在 processPayment 中已询问）
        console.log(chalk.yellow(`⚠️ 提示: 合约 ${selectedContract.contractName || selectedContract.contractId} 待支付，请稍后完成支付以获得授权`));
        return { action: "skip", contractResult: selectedContract };
      } else if (paymentResult.success) {
        hasPaid = true;
        console.log(chalk.green("✔ 支付成功"));
      } else {
        // 支付未成功，但用户未选择跳过（这种情况不应该发生，因为 processPayment 会询问）
        console.log(chalk.yellow("⚠️ 支付未成功"));
        return { action: "skip", contractResult: selectedContract };
      }
    } catch (err: any) {
      // 如果 processPayment 抛出错误（用户选择不跳过支付），则抛出错误
      console.log(chalk.red("❌ 支付流程失败"));
      throw err;
    }

    // 支付完成后，重新查询合约列表以确认合约状态
    const refreshSpinner = ora("正在刷新合约状态...").start();
    let refreshedContracts: ContractResponse[] = [];
    try {
      refreshedContracts = await getContractsList({
        licenseeId,
        subjectIds: resourceInfo.resourceId,
        isLoadPolicyInfo: 1,
        isTranslate: 1,
      });
      
      const refreshedActiveContracts = refreshedContracts.filter(
        c => c.status === 0 && c.licensorId === resourceInfo.resourceId
      );
      
      const updatedContract = refreshedActiveContracts.find(
        c => c.contractId === selectedContract.contractId
      );
      
      if (updatedContract) {
        refreshSpinner.succeed("合约状态已更新");
        
        // 显示合约授权状态
        if (updatedContract.authStatus === 1) {
          console.log(chalk.green("✔ 合约已正式授权"));
        } else if (updatedContract.authStatus === 2) {
          console.log(chalk.yellow("⚠️ 合约为测试授权"));
        } else if (updatedContract.authStatus === 128) {
          console.log(chalk.yellow("⚠️ 合约待执行，支付已完成但授权状态可能尚未更新，请稍后检查"));
        }
        
        return { action: "completed", contractResult: updatedContract };
      } else {
        refreshSpinner.warn("合约可能尚未生效，请稍后检查");
        return { action: "completed", contractResult: selectedContract };
      }
    } catch (err: any) {
      refreshSpinner.warn("刷新合约状态失败，但支付已完成");
      return { action: "completed", contractResult: selectedContract };
    }
  }

  // 处理策略签约
  if (action.startsWith("policy:")) {
    const policyId = action.split(":")[1];
    const selectedPolicy = availablePolicies.find((p) => p.policyId === policyId);
    if (!selectedPolicy) {
      throw new Error("选择的策略不存在");
    }

    console.log(chalk.cyan(`\n=== 签约策略: ${selectedPolicy.policyName} ===`));

    // 创建合同
    const createSpinner = ora("正在创建合同...").start();
    let contractResult: any;
    try {
      contractResult = await createContract(
        resourceInfo.resourceId,
        selectedPolicy.policyId,
        licenseeId
      );
      createSpinner.succeed("合同创建成功");
    } catch (err: unknown) {
      createSpinner.fail("合同创建失败");
      throw err;
    }

    // 检查是否需要支付（authStatus = 128 表示未获得授权，需要支付）
    let hasPaid = false;
    if (contractResult.authStatus === 128) {
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
          const paymentResult = await processPayment(contractResult.contractId);
          if (paymentResult.skipped) {
            console.log(chalk.blue("ℹ️ 已跳过支付，合约已创建但未授权"));
            hasPaid = false;
          } else if (paymentResult.success) {
            hasPaid = true;
            console.log(chalk.green("✔ 支付成功"));
          } else {
            console.log(chalk.yellow("⚠️ 支付未成功，但合约已创建"));
            hasPaid = false;
          }
        } catch (err: any) {
          console.log(chalk.yellow("⚠️ 支付流程失败，但合约已创建"));
          // 支付失败不阻止流程继续，但标记为未支付
          hasPaid = false;
        }
      } else {
        console.log(chalk.blue("ℹ️ 已跳过支付，合约已创建但未授权"));
      }
    } else if (contractResult.authStatus === 1 || contractResult.authStatus === 2) {
      const authType = contractResult.authStatus === 1 ? "正式授权" : "测试授权";
      console.log(chalk.green(`✔ 签约成功，已获得${authType}`));
    }

    // 签约/支付完成后，重新查询合约列表以确认合约状态（参考前端 update 函数）
    const refreshSpinner = ora("正在刷新合约状态...").start();
    let refreshedContracts: ContractResponse[] = [];
    try {
      refreshedContracts = await getContractsList({
        licenseeId,
        subjectIds: resourceInfo.resourceId,
        isLoadPolicyInfo: 1,
        isTranslate: 1,
      });
      
      // 过滤生效合约（status = 0 且 licensorId 匹配）
      const refreshedActiveContracts = refreshedContracts.filter(
        c => c.status === 0 && c.licensorId === resourceInfo.resourceId
      );
      
      // 检查新创建的合约是否在列表中
      const newContract = refreshedActiveContracts.find(
        c => c.contractId === contractResult.contractId
      );
      
      if (newContract) {
        refreshSpinner.succeed("合约状态已更新");
        // 更新 contractResult 为最新的合约信息
        contractResult = newContract;
        
        // 显示合约授权状态
        if (newContract.authStatus === 1) {
          console.log(chalk.green("✔ 合约已正式授权"));
        } else if (newContract.authStatus === 2) {
          console.log(chalk.yellow("⚠️ 合约为测试授权"));
        } else if (newContract.authStatus === 128) {
          if (hasPaid) {
            console.log(chalk.yellow("⚠️ 合约待执行，支付已完成但授权状态可能尚未更新，请稍后检查"));
          } else {
            console.log(chalk.yellow("⚠️ 合约待执行，需要完成支付"));
          }
        }
      } else {
        refreshSpinner.warn("合约可能尚未生效，请稍后检查");
        console.log(chalk.yellow("⚠️ 提示: 合约已创建，但可能尚未出现在生效合约列表中"));
      }
    } catch (err: any) {
      refreshSpinner.warn("刷新合约状态失败，但合约已创建");
    }

    // 签约后查询授权状态确认
    // const verifySpinner = ora("正在验证授权状态...").start();
    // try {
    //   const verifyResults = await batchCheckResourceAvailable(resourceInfo.resourceId, resourceInfo.latestVersion);
    //   if (verifyResults.length > 0 && verifyResults[0].isAuth) {
    //     verifySpinner.succeed(`授权验证成功 (版本: ${verifyResults[0].version})`);
    //   } else {
    //     verifySpinner.warn("授权验证异常，请稍后检查");
    //     console.log(chalk.yellow("⚠️ 提示: 合约已创建，但授权链可能存在问题，请稍后检查资源状态"));
    //   }
    // } catch (err: any) {
    //   verifySpinner.warn("授权验证失败，但合约已创建");
    // }

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
      const availabilityResults = await batchCheckResourceAvailable(allResourceIdsToCheck.join(','));
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

        const upcastAllPolicies = upcastResourceInfo.policies || [];
        const upcastPolicies = upcastAllPolicies.filter(p => p.status === 1);
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

      // 检查资源状态
      const status = resourceInfo.status;
      if (status === 0) {
        console.log(chalk.yellow("⚠️ 警告: 资源未发行，可能无法正常使用"));
      } else if (status === 2) {
        console.log(chalk.red("✖ 错误: 资源已冻结，无法使用"));
        throw new Error("资源已冻结，无法添加为依赖");
      } else if (status === 4) {
        console.log(chalk.yellow("⚠️ 警告: 资源已下架，可能无法正常使用"));
      }
    } catch (err: any) {
      spinner.fail("获取资源信息失败");
      if (err.message === "资源已冻结，无法添加为依赖") {
        handleErrorAndExit(err, "资源状态异常", options.debug);
      } else {
        handleErrorAndExit(err, "获取资源信息失败", options.debug);
      }
    }

    // 4. 检查资源可用性（主资源 + 上抛资源）
    const allResourceIdsToCheck = [resourceInfo.resourceId];
    if (resourceInfo.baseUpcastResources && resourceInfo.baseUpcastResources.length > 0) {
      allResourceIdsToCheck.push(...resourceInfo.baseUpcastResources.map(r => r.resourceId));
    }

    const checkAuthSpinner = ora("正在检查资源可用性...").start();
    try {
      const availabilityResults = await batchCheckResourceAvailable(allResourceIdsToCheck.join(','));
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

    // 6. 确定依赖版本（直接使用 * 或命令行指定的版本，不进行交互选择）
    let targetVersion = parsed.version || "*";

    // 7. 检查是否已存在（不核对版本，只检查资源ID是否存在）
    const existingCheck = await configOps.dependencyExists(config, resourceInfo.resourceId);
    if (existingCheck.exists) {
      console.log(chalk.yellow("⚠️ ") + "依赖已存在");
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
        throw new Error("用户取消添加依赖");
      }
    }

    // 8. 获取策略列表（只保留已启用的策略，status = 1）
    const allPolicies = resourceInfo.policies || [];
    const policies = allPolicies.filter(p => p.status === 1);
    if (policies.length > 0) {
      console.log(chalk.green(`✔ 找到 ${policies.length} 个可用策略`));
    } else if (allPolicies.length > 0) {
      console.log(chalk.yellow(`⚠️ 找到 ${allPolicies.length} 个策略，但都已禁用（status = 0）`));
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage === "用户取消添加依赖") {
        throw err; // 重新抛出，让调用者处理
      }
      throw err;
    }

    // 11. 处理上抛资源的签约和支付
    const resolveResources: Array<{
      resourceId: string;
      contracts: Array<{ policyId: string }>;
    }> = [];

    if (resourceInfo.baseUpcastResources && resourceInfo.baseUpcastResources.length > 0) {
      console.log(chalk.yellow(`\n⚠️ 检测到 ${resourceInfo.baseUpcastResources.length} 个上抛资源`));
      console.log(chalk.gray("上抛资源是依赖资源声明的基础授权资源，必须获得授权才能使用依赖资源。\n"));
      
      for (const upcast of resourceInfo.baseUpcastResources) {
        const upcastSpinner = ora(`正在获取上抛资源信息: ${upcast.resourceName}...`).start();
        let upcastResourceInfo: ResourceDetailResponse;
        try {
          upcastResourceInfo = await getResourceInfo(upcast.resourceId, {
            isLoadPolicyInfo: 1,
            isTranslate: 1,
          });
          upcastSpinner.succeed(`上抛资源信息获取成功`);
          
          // 检查上抛资源状态
          const upcastStatus = upcastResourceInfo.status;
          if (upcastStatus === 0) {
            console.log(chalk.yellow(`⚠️ 警告: 上抛资源 ${upcast.resourceName} 未发行，可能无法正常使用`));
          } else if (upcastStatus === 2) {
            console.log(chalk.red(`✖ 错误: 上抛资源 ${upcast.resourceName} 已冻结，无法使用`));
            throw new Error(`上抛资源 ${upcast.resourceName} 已冻结，无法添加为依赖`);
          } else if (upcastStatus === 4) {
            console.log(chalk.yellow(`⚠️ 警告: 上抛资源 ${upcast.resourceName} 已下架，可能无法正常使用`));
          }
        } catch (err: any) {
          upcastSpinner.fail(`获取上抛资源信息失败`);
          if (err.message && err.message.includes("已冻结")) {
            handleErrorAndExit(err, "上抛资源状态异常", options.debug);
          }
          throw err;
        }

        const upcastAllPolicies = upcastResourceInfo.policies || [];
        const upcastPolicies = upcastAllPolicies.filter(p => p.status === 1);
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

    // 12. 构建 resolveResources（主资源的合同）
    if (contractResult) {
      const contractId = contractResult.contractId;
      if (contractId) {
        resolveResources.push({
          resourceId: resourceInfo.resourceId,
          contracts: [{ policyId: contractResult.policyId }],
        });
      }
    }

    // 13. 添加依赖到配置
    const newDependency = {
      resourceId: resourceInfo.resourceId,
      resourceName: resourceInfo.resourceName,
      versionRange: targetVersion,
    };

    const updatedConfig = await configOps.addDependencyToConfig(config, newDependency);

    // 14. 保存配置
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

