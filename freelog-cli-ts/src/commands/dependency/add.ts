/**
 * 添加依赖命令
 *
 * 功能：
 * 1. 获取资源信息
 * 2. 处理上抛资源（baseUpcastResources）的签约和支付
 * 3. 处理主资源的签约和支付
 * 4. 保存依赖到配置文件
 */

import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { requireAuth } from "../../core/auth";
import { confirmAuth } from "../../utils/authConfirm";
import { addDependency, getDependency } from "../../services/dependencyService";
import { loadResourceConfig } from "../../services/resourceConfigService";
import {
  loadVersionConfig,
  saveVersionConfig,
} from "../../services/versionConfigService";
import { processPayment } from "../../services/paymentService";
import { getResourceInfo } from "../../api/resource";
import { getResourceVersionInfoList } from "../../api/version";
import { createContract } from "../../api/contract";
import {
  checkResourceAuth,
  batchCheckResourceAuth,
} from "../../api/auth";
import type { PolicyInfo, ResourceDetailResponse } from "../../api/types";
import { handleErrorAndExit } from "../../utils/errorHandler";
import { CommandOptions } from "../../types";
import type {
  Dependency,
  BaseUpcastResource,
} from "../../../public/freelog.version";

/**
 * 解析资源标识符
 * @example "resourceId@1.0.0" => { value: "resourceId", version: "1.0.0" }
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
 * 格式化策略翻译内容，保留原有格式（换行和空格）
 * @param content 策略翻译内容
 * @param forInquirer 是否用于 inquirer（true: 将换行替换为空格，false: 保留换行）
 * @returns 格式化后的内容
 */
function formatPolicyContent(
  content: string | undefined,
  forInquirer: boolean = false
): string {
  if (!content) return "";

  if (forInquirer) {
    // 对于 inquirer 选择列表，将换行符替换为空格，但保留多个空格
    // 将连续的换行符替换为单个空格，单个换行符也替换为空格
    return content
      .replace(/\r\n/g, " ")
      .replace(/\n/g, " ")
      .replace(/\r/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    // 对于 console.log，保留原有格式（换行和空格）
    return content;
  }
}

/**
 * 处理单个资源的签约和支付流程（支持重试和切换资源）
 * @param resourceInfo 资源信息
 * @param resourceName 资源名称（用于显示）
 * @param policies 策略列表
 * @param canUpcast 是否允许上抛
 * @param allowSwitchResource 是否允许切换资源（返回 'switch'）
 * @returns { action: 'completed' | 'switch' | 'skip'; selectedUpcast?: boolean; contractResult?: any | null }
 */
async function processSingleResourceContract(
  resourceInfo: ResourceDetailResponse,
  resourceName: string,
  policies: PolicyInfo[],
  canUpcast: boolean,
  allowSwitchResource: boolean = false,
  licenseeId?: string
): Promise<{
  action: "completed" | "switch" | "skip";
  selectedUpcast?: boolean;
  contractResult?: any | null;
}> {
  let selectedUpcast = false;
  let contractResult: any = null;
  let actionCompleted = false;

  console.log(chalk.bold.cyan(`\n=== 处理资源: ${resourceName} ===`));
  console.log(`资源ID: ${resourceInfo.resourceId}`);
  console.log(
    `资源类型: ${
      Array.isArray(resourceInfo.resourceType)
        ? resourceInfo.resourceType.join(", ")
        : resourceInfo.resourceType
    }`
  );

  // 检查是否已经授权（资源可用性已在 executeAdd 中批量检查过）
  const authSpinner = ora("正在检查授权状态...").start();
  let isAlreadyAuthorized = false;
  try {
    const authResult = await checkResourceAuth(
      resourceInfo.resourceId,
      resourceInfo.latestVersion
    );
    if (authResult.isAuth) {
      authSpinner.succeed(`已授权 (版本: ${authResult.version})`);
      isAlreadyAuthorized = true;
      console.log(chalk.green("✔ 该资源已获得授权"));

      // 即使已授权，也允许用户查看策略信息或重新处理
      // 如果策略列表为空，直接返回已完成
      if (policies.length === 0 && !canUpcast) {
        console.log(chalk.blue("ℹ️ 该资源没有可用策略，标记为已完成"));
        return { action: "completed", contractResult: null };
      }

      // 如果有策略或可以上抛，继续显示选项让用户选择
      console.log(chalk.blue("ℹ️ 您可以查看策略信息或选择其他操作"));
    } else {
      authSpinner.info("未授权，需要签约");
    }
  } catch (err: any) {
    authSpinner.warn("无法检查授权状态，将继续签约流程");
  }

  while (!actionCompleted) {
    // 如果有策略，先显示所有策略的完整信息（保留换行和空格）
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

    // 展示策略列表和上抛选项
    const choices: Array<{ name: string; value: string; short: string }> = [];

    // 如果已授权，添加"已完成"选项
    if (isAlreadyAuthorized) {
      choices.push({
        name: "✓ 已完成（资源已授权，无需处理）",
        value: "completed",
        short: "已完成",
      });
    }
    // 添加策略选项（只显示策略名称，详情已在上方显示）
    if (policies.length > 0) {
      policies.forEach((policy, index) => {
        const prefix = isAlreadyAuthorized
          ? "查看/重新签约策略: "
          : "签约策略: ";
        choices.push({
          name: `${prefix}${policy.policyName}`,
          value: `policy:${policy.policyId}`,
          short: policy.policyName,
        });
      });
    }

    // 添加上抛选项（如果允许）
    if (canUpcast) {
      choices.push({
        name: "选择上抛（添加到 baseUpcastResources）",
        value: "upcast",
        short: "上抛",
      });
    }

    // 只有在没有策略列表且不允许上抛时，才提供跳过选项
    if (policies.length === 0 && !canUpcast) {
      choices.push({
        name: "跳过（仅添加到配置，稍后处理）",
        value: "skip",
        short: "跳过",
      });
    }

    // 如果允许切换资源，添加"返回选择资源"选项
    if (allowSwitchResource) {
      choices.push({
        name: "← 返回选择其他资源",
        value: "switch",
        short: "返回",
      });
    }

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: `请选择操作 (${resourceName}):`,
        choices: choices,
      },
    ]);

    // 处理用户选择
    if (action === "switch") {
      // 返回选择其他资源
      return { action: "switch" };
    } else if (action === "completed") {
      // 用户选择已完成（资源已授权）
      return { action: "completed", contractResult: null };
    } else if (action === "upcast") {
      // 选择上抛
      selectedUpcast = true;
      console.log(
        chalk.blue("ℹ️ ") +
          "已选择上抛，将在保存配置时更新到 baseUpcastResources"
      );
      return {
        action: "completed",
        selectedUpcast: true,
        contractResult: null,
      };
    } else if (action.startsWith("policy:")) {
      // 选择签约策略
      const policyId = action.replace("policy:", "");
      const selectedPolicy = policies.find((p) => p.policyId === policyId)!;

      // 先显示完整的策略信息（保留换行和空格）
      const policyContent = formatPolicyContent(
        selectedPolicy.translateInfo?.content,
        false
      );
      if (policyContent) {
        console.log(chalk.cyan("\n策略详情:"));
        console.log(chalk.gray(policyContent));
        console.log();
      }

      const { confirmSign } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmSign",
          message: `确认签约策略 "${selectedPolicy.policyName}"${
            policyContent ? " (详情已显示上方)" : ""
          }?`,
          default: true,
        },
      ]);

      if (confirmSign) {
        const signSpinner = ora("正在签约...").start();
        try {
          contractResult = await createContract(
            resourceInfo.resourceId,
            policyId,
            licenseeId || ""
          );
          signSpinner.succeed("签约成功");

          // 检查授权状态
          if (
            contractResult.authStatus === 1 ||
            contractResult.authStatus === 2
          ) {
            const authType =
              contractResult.authStatus === 1 ? "正式授权" : "测试授权";
            console.log(chalk.green(`✔ 签约成功，已获得${authType}`));
            // 已授权，无需支付
            return { action: "completed", contractResult };
          } else {
            // 未获得授权，需要支付
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
                // 支付失败，询问是否重试或切换资源
                const retryChoices = [{ name: "重新选择策略", value: "retry" }];
                if (allowSwitchResource) {
                  retryChoices.push({
                    name: "返回选择其他资源",
                    value: "switch",
                  });
                }
                retryChoices.push({ name: "退出", value: "exit" });

                const { retryAction } = await inquirer.prompt([
                  {
                    type: "list",
                    name: "retryAction",
                    message: "支付失败，请选择:",
                    choices: retryChoices,
                  },
                ]);

                if (retryAction === "exit") {
                  console.log(chalk.blue("ℹ️ ") + "已取消添加依赖");
                  throw new Error("用户取消添加依赖");
                } else if (retryAction === "switch") {
                  return { action: "switch" };
                }
                // 继续循环，重新选择策略
              }
            } else {
              // 用户选择不支付，但签约已成功，可以继续
              return { action: "completed", contractResult };
            }
          }
        } catch (err: any) {
          signSpinner.fail("签约失败");
          console.log(chalk.red(`✖ ${err.message}`));

          // 显示完整的请求详情用于排查问题
          console.log(chalk.gray("\n[调试] 签约请求完整信息:"));
          console.log(chalk.gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
          
          // 基本信息
          console.log(chalk.gray("\n[基本信息]"));
          console.log(chalk.gray(`  资源ID: ${resourceInfo.resourceId}`));
          console.log(chalk.gray(`  策略ID: ${policyId}`));
          
          // 打印完整的 request 对象（err.config）
          if (err?.config) {
            console.log(chalk.gray("\n[完整 Request 对象 (err.config)]"));
            console.log(chalk.gray(JSON.stringify(err.config, null, 2)));
          } else {
            console.log(chalk.gray("\n[警告] err.config 不存在，无法显示完整请求信息"));
          }
          
          // 打印完整的 response 对象（如果有）
          if (err?.response) {
            console.log(chalk.gray("\n[完整 Response 对象 (err.response)]"));
            // 避免循环引用，只打印关键字段
            const responseData: any = {
              status: err.response.status,
              statusText: err.response.statusText,
              headers: err.response.headers,
              data: err.response.data,
            };
            if (err.response.config) {
              responseData.config = err.response.config;
            }
            console.log(chalk.gray(JSON.stringify(responseData, null, 2)));
          }
          
          // 打印完整的错误对象（简化，避免循环引用）
          console.log(chalk.gray("\n[完整错误对象]"));
          const errorData: any = {
            message: err.message,
            name: err.name,
            code: err.code,
            errno: err.errno,
            errCode: err.errCode,
            ret: err.ret,
            status: err.status,
            statusText: err.statusText,
            data: err.data,
          };
          if (err.config) {
            errorData.config = err.config;
          }
          if (err.response) {
            errorData.response = {
              status: err.response.status,
              statusText: err.response.statusText,
              headers: err.response.headers,
              data: err.response.data,
            };
          }
          if (err.originalError) {
            errorData.originalError = {
              message: err.originalError.message,
              name: err.originalError.name,
              code: err.originalError.code,
            };
          }
          console.log(chalk.gray(JSON.stringify(errorData, null, 2)));
          
          console.log(chalk.gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

          // 如果是用户取消，直接抛出
          if (err.message === "用户取消添加依赖") {
            throw err;
          }

          // 签约失败，询问是否重试或切换资源
          const retryChoices = [{ name: "重新选择策略", value: "retry" }];
          if (allowSwitchResource) {
            retryChoices.push({ name: "返回选择其他资源", value: "switch" });
          }
          retryChoices.push({ name: "退出", value: "exit" });

          const { retryAction } = await inquirer.prompt([
            {
              type: "list",
              name: "retryAction",
              message: "签约失败，请选择:",
              choices: retryChoices,
            },
          ]);

          if (retryAction === "exit") {
            console.log(chalk.blue("ℹ️ ") + "已取消添加依赖");
            throw new Error("用户取消添加依赖");
          } else if (retryAction === "switch") {
            return { action: "switch" };
          }
          // 继续循环，重新选择策略
        }
      } else {
        // 用户取消签约确认，重新选择
        console.log(chalk.blue("ℹ️ ") + "已取消签约，请重新选择");
        // 继续循环
      }
    } else if (action === "skip") {
      // 跳过（仅在无策略且不允许上抛时可用）
      console.log(chalk.yellow("⚠️ ") + "跳过签约和上抛");
      return { action: "skip" };
    } else {
      // 不应该到达这里，但为了安全起见
      console.log(chalk.red("✖ ") + "未知的操作类型");
      return { action: "completed", contractResult: null };
    }
  }

  return { action: "completed", selectedUpcast, contractResult };
}

/**
 * 处理有上抛资源的情况：列出所有资源，让用户选择处理顺序
 * @param mainResourceInfo 主资源信息
 * @param upcastResources 上抛资源列表
 * @param canUpcast 是否允许上抛
 * @returns { selectedUpcast: boolean; contractResult: any | null }
 */
async function processResourcesWithUpcast(
  mainResourceInfo: ResourceDetailResponse,
  upcastResources: Array<{ resourceId: string; resourceName: string }>,
  canUpcast: boolean,
  licenseeId?: string
): Promise<{ selectedUpcast: boolean; contractResult: any | null }> {
  console.log(
    chalk.bold.yellow(
      `\n⚠️ 检测到依赖资源有 ${upcastResources.length} 个上抛资源`
    )
  );
  console.log(
    chalk.gray(
      "上抛资源是依赖资源声明的基础授权资源，必须获得授权才能使用依赖资源。\n"
    )
  );

  // 构建所有资源列表（主资源 + 上抛资源）
  const allResources: Array<{
    resourceId: string;
    resourceName: string;
    resourceInfo: ResourceDetailResponse | null;
    policies: PolicyInfo[];
    isUpcast: boolean;
    isCompleted: boolean;
  }> = [
    {
      resourceId: mainResourceInfo.resourceId,
      resourceName: mainResourceInfo.resourceName,
      resourceInfo: mainResourceInfo,
      policies: [],
      isUpcast: false,
      isCompleted: false,
    },
    ...upcastResources.map((upcast) => ({
      resourceId: upcast.resourceId,
      resourceName: upcast.resourceName,
      resourceInfo: null as ResourceDetailResponse | null,
      policies: [] as PolicyInfo[],
      isUpcast: true,
      isCompleted: false,
    })),
  ];

  // 预加载所有资源的策略信息
  console.log(chalk.cyan("\n=== 加载所有资源的策略信息 ===\n"));
  for (const resource of allResources) {
    const spinner = ora(`正在加载: ${resource.resourceName}`).start();
    try {
      // 一次性加载资源信息、策略信息和翻译信息
      const resourceWithPolicies = await getResourceInfo(resource.resourceId, {
        isLoadPolicyInfo: 1,
        isTranslate: 1,
      });
      resource.resourceInfo = resourceWithPolicies;
      resource.policies = resourceWithPolicies.policies || [];
      spinner.succeed(
        `${resource.resourceName}: 找到 ${resource.policies.length} 个策略`
      );
    } catch (err: any) {
      spinner.fail(`${resource.resourceName}: 加载失败`);
      console.log(chalk.yellow(`  ⚠️ ${err.message}`));
    }
  }

  // 显示所有资源信息
  console.log(chalk.cyan("\n=== 所有资源信息 ===\n"));
  allResources.forEach((resource, index) => {
    const prefix = resource.isUpcast ? "[上抛] " : "";
    console.log(chalk.bold(`${index + 1}. ${prefix}${resource.resourceName}`));
    console.log(chalk.gray(`   资源ID: ${resource.resourceId}`));
    if (resource.resourceInfo) {
      console.log(
        chalk.gray(
          `   类型: ${
            Array.isArray(resource.resourceInfo.resourceType)
              ? resource.resourceInfo.resourceType.join(", ")
              : resource.resourceInfo.resourceType
          }`
        )
      );
    }
    console.log(chalk.gray(`   策略数量: ${resource.policies.length}`));
    if (resource.policies.length > 0) {
      resource.policies.forEach((policy) => {
        const policyContent = formatPolicyContent(
          policy.translateInfo?.content,
          false
        );
        console.log(
          chalk.gray(
            `     - ${policy.policyName}${
              policyContent
                ? "\n       " + policyContent.replace(/\n/g, "\n       ")
                : ""
            }`
          )
        );
      });
    }
    console.log();
  });

  let selectedUpcast = false;
  let contractResult: any = null;

  // 循环处理资源，直到所有资源都处理完成或用户选择完成
  while (true) {
    // 构建资源选择列表
    const resourceChoices: Array<{
      name: string;
      value: number | "done";
      short: string;
    }> = allResources.map((resource, index) => {
      const prefix = resource.isUpcast ? "[上抛] " : "";
      const status = resource.isCompleted
        ? chalk.green("✓ 已完成")
        : chalk.yellow("待处理");
      return {
        name: `${index + 1}. ${prefix}${resource.resourceName} ${status}`,
        value: index,
        short: resource.resourceName,
      };
    });

    // 添加"完成"选项（当所有资源都处理完成时）
    const allCompleted = allResources.every((r) => r.isCompleted);
    if (allCompleted) {
      resourceChoices.push({
        name: "✓ 完成（所有资源已处理）",
        value: "done",
        short: "完成",
      });
    }

    const { selectedIndex } = await inquirer.prompt<{
      selectedIndex: number | "done";
    }>([
      {
        type: "list",
        name: "selectedIndex",
        message: "请选择要处理的资源:",
        choices: resourceChoices,
      },
    ]);

    if (selectedIndex === "done") {
      break;
    }

    const selectedResource = allResources[selectedIndex];

    // 如果资源信息未加载，先加载（包含策略信息和翻译信息）
    if (!selectedResource.resourceInfo) {
      const spinner = ora(
        `正在加载资源信息: ${selectedResource.resourceName}`
      ).start();
      try {
        selectedResource.resourceInfo = await getResourceInfo(
          selectedResource.resourceId,
          { isLoadPolicyInfo: 1, isTranslate: 1 }
        );
        // 如果策略信息还未加载，更新策略列表
        if (
          selectedResource.policies.length === 0 &&
          selectedResource.resourceInfo.policies
        ) {
          selectedResource.policies = selectedResource.resourceInfo.policies;
        }
        spinner.succeed("资源信息加载成功");
      } catch (err: any) {
        spinner.fail("资源信息加载失败");
        console.log(chalk.red(`✖ ${err.message}`));
        continue;
      }
    }

    // 处理选中的资源
    const result = await processSingleResourceContract(
      selectedResource.resourceInfo!,
      selectedResource.resourceName,
      selectedResource.policies,
      canUpcast && !selectedResource.isUpcast, // 只有主资源可以选择上抛
      true, // 允许切换资源
      licenseeId // 传递 licenseeId
    );

    if (result.action === "switch") {
      // 用户选择返回，继续循环选择其他资源
      continue;
    } else if (result.action === "completed") {
      // 资源处理完成
      selectedResource.isCompleted = true;
      if (result.selectedUpcast) {
        selectedUpcast = true;
      }
      if (result.contractResult && !selectedResource.isUpcast) {
        contractResult = result.contractResult;
      }
      console.log(
        chalk.green(`\n✔ ${selectedResource.resourceName} 处理完成\n`)
      );
    } else if (result.action === "skip") {
      // 跳过（仅主资源可能跳过）
      selectedResource.isCompleted = true;
      console.log(
        chalk.yellow(`\n⚠️ ${selectedResource.resourceName} 已跳过\n`)
      );
    }
  }

  return { selectedUpcast, contractResult };
}

/**
 * 执行添加依赖命令
 */
export async function executeAdd(
  resourceIdentifier: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    // 1. 检查登录并确认用户信息
    try {
      requireAuth();
      await confirmAuth(options.skipConfirm);
    } catch (err: any) {
      console.log(chalk.red("✖ ") + err.toString());
      process.exit(1);
    }

    // 2. 解析资源标识符
    const parsed = parseResourceIdentifier(resourceIdentifier);
    console.log(chalk.cyan("\n=== 添加依赖 ==="));
    console.log(chalk.blue("ℹ ") + `资源标识: ${parsed.value}`);
    if (parsed.version) {
      console.log(chalk.blue("ℹ ") + `指定版本: ${parsed.version}`);
    }

    // 3. 获取依赖资源信息
    const spinner = ora("正在获取资源信息...").start();
    let resourceInfo: ResourceDetailResponse;

    try {
      // 调试模式：显示请求信息
      if (options.debug) {
        console.log(chalk.gray("\n[调试] 请求资源信息:"));
        console.log(chalk.gray(`  资源标识: ${parsed.value}`));
        console.log(
          chalk.gray(
            `  接口: GET /v2/resources/${encodeURIComponent(parsed.value)}`
          )
        );
      }

      // 一次性加载资源信息、策略信息和翻译信息，避免后续重复请求
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

      // 调试模式：显示详细的错误信息
      if (options.debug) {
        console.log(chalk.gray("\n[调试] 错误详情:"));
        console.log(
          chalk.gray(
            `  请求 URL: GET /v2/resources/${encodeURIComponent(parsed.value)}`
          )
        );
        if (err?.response) {
          console.log(chalk.gray(`  状态码: ${err.response.status}`));
          console.log(
            chalk.gray(
              `  响应数据: ${JSON.stringify(
                err.response.data || err.data || {},
                null,
                2
              )}`
            )
          );
        }
        if (err?.config?.url) {
          console.log(chalk.gray(`  完整 URL: ${err.config.url}`));
        }
      }

      // 使用统一的错误处理
      handleErrorAndExit(err, "获取资源信息失败", options.debug);
    }

    // 3.1. 检查依赖资源是否有上抛资源
    const hasUpcastResources =
      resourceInfo.baseUpcastResources &&
      resourceInfo.baseUpcastResources.length > 0;

    // 3.2. 检查资源是否正常可用（可用于签约）
    const checkAuthSpinner = ora("正在检查资源可用性...").start();
    try {
      // 构建需要检查的资源列表（主资源 + 所有上抛资源）
      const resourcesToCheck: Array<{
        resourceId: string;
        resourceName: string;
        version?: string;
      }> = [
        {
          resourceId: resourceInfo.resourceId,
          resourceName: resourceInfo.resourceName,
          version: resourceInfo.latestVersion,
        },
      ];

      // 如果有上抛资源，添加到检查列表
      if (hasUpcastResources && resourceInfo.baseUpcastResources) {
        for (const upcast of resourceInfo.baseUpcastResources) {
          resourcesToCheck.push({
            resourceId: upcast.resourceId,
            resourceName: upcast.resourceName,
          });
        }
      }

      // 批量检查所有资源的可用性
      const resourceIds = resourcesToCheck
        .map((r) => r.resourceId)
        .join(",");
      const versions = resourcesToCheck
        .map((r) => r.version || "")
        .join(",");
      const authResults = await batchCheckResourceAuth(
        resourceIds,
        versions || undefined
      );

      // 检查是否有不可用的资源
      const unavailableResources: Array<{
        resourceId: string;
        resourceName: string;
        version?: string;
      }> = [];

      for (let i = 0; i < resourcesToCheck.length; i++) {
        const resource = resourcesToCheck[i];
        const authResult = authResults[i];

        if (!authResult || !authResult.isAuth) {
          unavailableResources.push(resource);
        }
      }

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
              `  - ${resource.resourceName} (ID: ${resource.resourceId})${
                resource.version ? ` [版本: ${resource.version}]` : ""
              }`
            )
          );
        });
        console.log(
          chalk.yellow(
            "\n提示: 请确保资源状态正常后再尝试添加依赖。"
          )
        );
        throw new Error("资源异常不可用");
      }

      checkAuthSpinner.succeed("所有资源正常可用");
    } catch (err: any) {
      if (err.message === "资源异常不可用") {
        handleErrorAndExit(err, "资源检查失败", options.debug);
      } else {
        checkAuthSpinner.warn("无法检查资源可用性，将继续流程");
        console.log(
          chalk.yellow(`⚠️ 资源可用性检查失败: ${err.message}`)
        );
      }
    }

    // 4. 从 version.config 或 resource.config 获取当前项目的 resourceId
    let currentResourceId: string | undefined;
    try {
      const versionConfig = await loadVersionConfig(options.config).catch(
        () => null
      );
      if (versionConfig?.resourceId) {
        currentResourceId = versionConfig.resourceId;
      } else {
        const resourceConfig = await loadResourceConfig(options.config).catch(
          () => null
        );
        if (resourceConfig?.resourceId) {
          currentResourceId = resourceConfig.resourceId;
        }
      }
    } catch (err) {
      // 忽略错误，继续执行
    }

    // 4. 根据当前项目的 resourceId 请求版本列表，判断是否可以选择上抛
    let versionList: any[] = [];
    let canUpcast = false;

    // 如果依赖资源有上抛资源，不允许选择上抛
    if (hasUpcastResources) {
      canUpcast = false;
    } else if (currentResourceId) {
      const versionListSpinner = ora("正在获取当前项目的版本列表...").start();
      try {
        versionList = await getResourceVersionInfoList(currentResourceId);
        versionListSpinner.succeed(`找到 ${versionList.length} 个版本`);

        // 6. 如果版本列表不为空，请求资源信息更新 baseUpcastResources
        if (versionList.length > 0) {
          const resourceInfoSpinner =
            ora("正在获取当前项目的资源信息...").start();
          try {
            const currentResourceInfo = await getResourceInfo(
              currentResourceId
            );
            resourceInfoSpinner.succeed("资源信息获取成功");

            // 更新 version.config 中的 baseUpcastResources
            const versionConfig = await loadVersionConfig(options.config);
            if (
              currentResourceInfo.baseUpcastResources &&
              currentResourceInfo.baseUpcastResources.length > 0
            ) {
              versionConfig.baseUpcastResources =
                currentResourceInfo.baseUpcastResources.map((upcast) => ({
                  resourceId: upcast.resourceId,
                  resourceName: upcast.resourceName,
                }));
              await saveVersionConfig(versionConfig, options.config);
              console.log(
                chalk.green("✔ ") +
                  `已更新 baseUpcastResources (${versionConfig.baseUpcastResources.length} 个)`
              );
            }

            // 7. 判断 version.config 中是否存在相同依赖（根据 resourceId 对比）
            const existsInUpcast = versionConfig.baseUpcastResources?.some(
              (upcast) => upcast.resourceId === resourceInfo.resourceId
            );

            if (existsInUpcast) {
              console.log(chalk.green("✔ ") + "该依赖已在上抛资源列表中");
              canUpcast = false;
            } else {
              console.log(
                chalk.yellow("⚠️ ") + "该依赖不在上抛资源列表中，不能选择上抛"
              );
              canUpcast = false;
            }
          } catch (err: any) {
            resourceInfoSpinner.fail("获取资源信息失败");
            console.log(chalk.yellow(`⚠️ 获取资源信息失败: ${err.message}`));
          }
        } else {
          // 版本列表为空，可以选择上抛
          console.log(chalk.blue("ℹ️ ") + "当前项目版本列表为空，可以选择上抛");
          canUpcast = true;
        }
      } catch (err: any) {
        versionListSpinner.fail("获取版本列表失败");
        console.log(chalk.yellow(`⚠️ 获取版本列表失败: ${err.message}`));
        // 如果获取失败，允许选择上抛（保守策略）
        canUpcast = true;
      }
    } else {
      console.log(
        chalk.yellow("⚠️ ") + "未找到当前项目的 resourceId，允许选择上抛"
      );
      canUpcast = true;
    }

    // 8. 确定依赖版本
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

    // 9. 检查是否已存在
    const existingDep = await getDependency(
      resourceInfo.resourceId,
      options.config
    ).catch(() => undefined);

    if (existingDep) {
      console.log(
        chalk.yellow("⚠️ ") +
          `依赖已存在，当前版本: ${existingDep.versionRange}`
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

    // 10. 获取策略列表（如果 resourceInfo 中已有策略信息，直接使用，避免重复请求）
    let policies: PolicyInfo[] = [];
    if (resourceInfo.policies && resourceInfo.policies.length > 0) {
      // 使用已加载的策略信息
      policies = resourceInfo.policies;
      console.log(chalk.green(`✔ 找到 ${policies.length} 个可用策略`));
    } else {
      // 如果策略信息未加载，才请求
      const policySpinner = ora("正在获取策略列表...").start();
      try {
        const resourceWithPolicies = await getResourceInfo(
          resourceInfo.resourceId,
          { isLoadPolicyInfo: 1, isTranslate: 1 }
        );
        policies = resourceWithPolicies.policies || [];
        // 更新 resourceInfo 中的策略信息，避免后续重复请求
        resourceInfo.policies = policies;
        policySpinner.succeed(`找到 ${policies.length} 个可用策略`);
      } catch (err: any) {
        policySpinner.fail("获取策略列表失败");
        console.log(chalk.yellow(`⚠️ 获取策略列表失败: ${err.message}`));
      }
    }

    // 12. 处理资源的策略选择和签约
    let selectedUpcast = false;
    let contractResult: any = null;

    try {
      if (hasUpcastResources && resourceInfo.baseUpcastResources) {
        // 如果有上抛资源，使用新的流程：列出所有资源，让用户选择处理顺序
        const result = await processResourcesWithUpcast(
          resourceInfo,
          resourceInfo.baseUpcastResources,
          canUpcast,
          currentResourceId // 传递 licenseeId
        );
        selectedUpcast = result.selectedUpcast;
        contractResult = result.contractResult;
      } else {
        // 如果没有上抛资源，使用原来的流程
        const result = await processSingleResourceContract(
          resourceInfo,
          resourceInfo.resourceName,
          policies,
          canUpcast,
          false, // 不允许切换资源
          currentResourceId // 传递 licenseeId
        );

        if (result.action === "switch") {
          // 不应该到达这里（allowSwitchResource = false）
          throw new Error("意外的切换资源操作");
        } else if (result.action === "completed") {
          selectedUpcast = result.selectedUpcast || false;
          contractResult = result.contractResult || null;
        } else if (result.action === "skip") {
          // 跳过
          selectedUpcast = false;
          contractResult = null;
        }
      }
    } catch (err: any) {
      if (err.message === "用户取消添加依赖") {
        return;
      }
      throw err;
    }

    // 14. 添加依赖到版本配置文件
    const newDependency: Dependency = {
      resourceId: resourceInfo.resourceId,
      resourceName: resourceInfo.resourceName,
      versionRange: targetVersion,
    };

    const saveSpinner = ora("正在保存配置...").start();

    try {
      await addDependency(newDependency, options.config);

      // 如果选择了上抛，更新 baseUpcastResources
      if (selectedUpcast) {
        const versionConfig = await loadVersionConfig(options.config);
        if (!versionConfig.baseUpcastResources) {
          versionConfig.baseUpcastResources = [];
        }
        // 检查是否已存在
        const exists = versionConfig.baseUpcastResources.some(
          (upcast) => upcast.resourceId === resourceInfo.resourceId
        );
        if (!exists) {
          versionConfig.baseUpcastResources.push({
            resourceId: resourceInfo.resourceId,
            resourceName: resourceInfo.resourceName,
          });
          await saveVersionConfig(versionConfig, options.config);
          console.log(chalk.green("✔ ") + "已添加到 baseUpcastResources");
        }
      }

      saveSpinner.succeed("配置保存成功");

      console.log(
        chalk.green("\n✔️ ") + `依赖添加成功: ${resourceInfo.resourceName}`
      );
      console.log(
        chalk.blue("ℹ️ ") + `版本范围: ${newDependency.versionRange}`
      );
      if (selectedUpcast) {
        console.log(chalk.blue("ℹ️ ") + "已添加到上抛资源列表");
      }
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
    } catch (err: any) {
      saveSpinner.fail("保存配置失败");
      throw err;
    }
  } catch (err: any) {
    handleErrorAndExit(err, "执行添加依赖命令失败");
  }
}

