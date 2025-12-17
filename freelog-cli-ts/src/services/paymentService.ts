/**
 * 支付服务
 * 处理支付流程：获取策略、用户选择、密码输入、执行支付
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import apiClient from '../core/http';
import { requireAuth } from '../core/auth';
import { 
  executePaymentEvent, 
  getPaymentErrorMessage,
  getIndividualAccount 
} from '../api/payment';
import { getContractsList, getContractsTransitionRecord } from '../api/contract';
import { getResourceInfo } from '../api/resource';
import type { PaymentEventBody, IndividualAccountInfo } from '../api/payment';
import type { PolicyInfo as ApiPolicyInfo } from '../api/types';
import type { EventSectionEntity } from '../api/contract';

/**
 * 策略信息（用于支付流程）
 */
interface PolicyInfo {
  policyId: string;
  policyName: string;
  status: number;
  feeMode?: string;
  currentFsmState?: string;
  policyText?: string;
}

/**
 * 事件信息
 */
interface EventInfo {
  eventId: string;
  service: string;
  name: string;
  code: string;
  eventType: string;
  args?: any;
}

/**
 * 获取合同策略列表
 */
async function getContractPolicies(contractId: string): Promise<PolicyInfo[]> {
  // 使用 getContractsList 并传递 isLoadPolicyInfo: 1 来获取策略信息
  const contracts = await getContractsList({
    contractIds: contractId,
    isLoadPolicyInfo: 1,
    isTranslate: 0,
  });
  
  if (!contracts || contracts.length === 0) {
    throw new Error('合同信息获取失败');
  }
  
  const contract = contracts[0] as any;
  
  // 合约对象中应该包含 policyInfo（当 isLoadPolicyInfo: 1 时）
  if (contract.policyInfo) {
    // policyInfo 是一个 Policy 对象，需要转换为 PolicyInfo
    const policyInfo: PolicyInfo = {
      policyId: contract.policyInfo.policyId || contract.policyId,
      policyName: contract.policyInfo.policyName || contract.contractName || '未知策略',
      status: contract.policyInfo.status ?? 1,
      feeMode: (contract.policyInfo as any).feeMode,
      currentFsmState: contract.fsmCurrentState,
      policyText: contract.policyInfo.policyText,
    };
    return [policyInfo];
  }
  
  // 如果合约中没有策略信息，尝试从资源信息中获取
  if (contract.policyId && contract.subjectId) {
    try {
      const resourceInfo = await getResourceInfo(contract.subjectId, {
        isLoadPolicyInfo: 1,
        isTranslate: 0,
      });
      
      const policy = resourceInfo.policies?.find(p => p.policyId === contract.policyId);
      if (policy) {
        const policyInfo: PolicyInfo = {
          policyId: policy.policyId,
          policyName: policy.policyName || '未知策略',
          status: policy.status ?? 1,
          feeMode: (policy as any).feeMode,
          policyText: (policy as any).policyText,
        };
        return [policyInfo];
      }
    } catch (err) {
      // 忽略错误，继续使用合约中的策略ID
    }
  }
  
  // 如果都没有，尝试构造一个基本的策略信息
  if (contract.policyId) {
    return [{
      policyId: contract.policyId,
      policyName: contract.contractName || contract.subjectName || '未知策略',
      status: 1,
      feeMode: 'unknown',
    } as PolicyInfo];
  }
  
  throw new Error('无法获取策略信息');
}

/**
 * 获取合同的可执行事件列表
 */
async function getContractEvents(contractId: string): Promise<EventInfo[]> {
  // 调用 getContractsTransitionRecord 获取合约的最新流转记录（仅用于获取支付事件）
  const records = await getContractsTransitionRecord({
    contractIds: [contractId],
    isTranslate: true,
  });
  
  if (!records || records.length === 0) {
    return [];
  }
  
  const record = records[0];
  
  // 从 eventSectionEntities 中提取可执行事件
  if (!record.eventSectionEntities || record.eventSectionEntities.length === 0) {
    return [];
  }
  
  // 过滤出支付事件（参考前端：event.origin.name === 'TransactionEvent'）
  const paymentEvents = record.eventSectionEntities
    .filter((entity: EventSectionEntity) => {
      const origin = entity.origin;
      // 前端判断条件是：event.origin.name === 'TransactionEvent'
      return origin.name === 'TransactionEvent';
    })
    .map((entity: EventSectionEntity) => ({
      eventId: entity.origin.id, // 事件ID，用于支付
      service: entity.origin.service,
      name: entity.origin.name,
      code: entity.origin.code,
      eventType: entity.origin.service,
      args: entity.origin.args, // 包含 amount 等信息
    }));
  
  return paymentEvents;
}

/**
 * 让用户选择策略
 */
async function selectPolicy(policies: PolicyInfo[]): Promise<PolicyInfo> {
  if (policies.length === 0) {
    throw new Error('没有可用的策略');
  }
  
  if (policies.length === 1) {
    console.log(chalk.blue('ℹ ') + `使用策略: ${policies[0].policyName}`);
    return policies[0];
  }
  
  console.log(chalk.cyan('\n=== 可用策略 ===\n'));
  policies.forEach((policy, index) => {
    console.log(chalk.gray(`${index + 1}. ${policy.policyName}`));
    console.log(chalk.gray(`   策略 ID: ${policy.policyId}`));
    console.log(chalk.gray(`   计费模式: ${policy.feeMode}`));
    console.log(chalk.gray(`   状态: ${policy.status === 0 ? '正常' : '异常'}`));
    console.log();
  });
  
  const { selectedIndex } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedIndex',
      message: '请选择策略:',
      choices: policies.map((policy, index) => ({
        name: `${policy.policyName} (${policy.feeMode})`,
        value: index
      }))
    }
  ]);
  
  return policies[selectedIndex];
}

/**
 * 让用户选择支付事件
 */
async function selectPaymentEvent(events: EventInfo[]): Promise<EventInfo> {
  const paymentEvents = events.filter(event => 
    event.service === 'payment' || 
    event.code?.toLowerCase().includes('payment') ||
    event.name?.toLowerCase().includes('支付')
  );
  
  if (paymentEvents.length === 0) {
    throw new Error('没有可用的支付事件');
  }
  
  if (paymentEvents.length === 1) {
    console.log(chalk.blue('ℹ ') + `使用支付事件: ${paymentEvents[0].name}`);
    return paymentEvents[0];
  }
  
  console.log(chalk.cyan('\n=== 支付事件 ===\n'));
  paymentEvents.forEach((event, index) => {
    console.log(chalk.gray(`${index + 1}. ${event.name}`));
    console.log(chalk.gray(`   事件 ID: ${event.eventId}`));
    console.log(chalk.gray(`   服务: ${event.service}`));
    console.log();
  });
  
  const { selectedIndex } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedIndex',
      message: '请选择支付事件:',
      choices: paymentEvents.map((event, index) => ({
        name: `${event.name} (${event.service})`,
        value: index
      }))
    }
  ]);
  
  return paymentEvents[selectedIndex];
}

/**
 * 获取用户账户信息
 */
async function getUserAccount(): Promise<IndividualAccountInfo> {
  const auth = requireAuth();
  const userId = auth.userId;
  
  if (!userId) {
    throw new Error('无法获取用户 ID，请重新登录');
  }
  
  // 使用新的个人账户 API
  const account = await getIndividualAccount(Number(userId));
  
  if (!account) {
    throw new Error('未找到支付账户');
  }
  
  // 检查账户状态
  if (account.status === 0) {
    throw new Error('支付账户未激活，请先激活账户');
  }
  
  if (account.status === 2) {
    throw new Error('支付账户已被冻结');
  }
  
  return account;
}

/**
 * 处理支付流程
 */
export async function processPayment(contractId: string, amount?: number): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 支付流程 ===\n'));
    console.log(chalk.blue('ℹ ') + `合同 ID: ${contractId}`);
    
    // 1. 获取合约流转记录（包含支付事件信息，参考前端流程）
    const eventSpinner = ora('正在获取支付事件...').start();
    let events: EventInfo[];
    
    try {
      events = await getContractEvents(contractId);
      eventSpinner.succeed('支付事件获取成功');
    } catch (error) {
      eventSpinner.fail('支付事件获取失败');
      throw error;
    }
    
    // 2. 选择支付事件（参考前端：从 eventSectionEntities 中找到 name === 'TransactionEvent' 的事件）
    let selectedEvent: EventInfo;
    if (events.length === 0) {
      throw new Error('没有可用的支付事件');
    } else if (events.length === 1) {
      selectedEvent = events[0];
      console.log(chalk.green('✔ ') + `已找到支付事件`);
    } else {
      selectedEvent = await selectPaymentEvent(events);
      console.log(chalk.green('✔ ') + `已选择支付事件`);
    }
    
    // 从事件参数中获取支付金额（参考前端：event.origin.args.amount）
    const eventAmountFromArgs = selectedEvent.args?.amount;
    if (eventAmountFromArgs !== undefined && eventAmountFromArgs > 0) {
      console.log(chalk.blue('ℹ ') + `事件金额: ${eventAmountFromArgs} 元`);
    }
    
    // 3. 获取用户账户
    const accountSpinner = ora('正在获取账户信息...').start();
    let account: IndividualAccountInfo;
    
    try {
      account = await getUserAccount();
      accountSpinner.succeed('账户信息获取成功');
      console.log(chalk.blue('ℹ ') + `账户名称: ${account.accountName}`);
      console.log(chalk.blue('ℹ ') + `账户余额: ${account.balance} 元`);
      console.log(chalk.blue('ℹ ') + `冻结金额: ${account.freezeBalance} 元`);
    } catch (error) {
      accountSpinner.fail('账户信息获取失败');
      throw error;
    }
    
    // 4. 确定支付金额（优先使用事件参数中的金额，参考前端：event.origin.args.amount）
    let paymentAmount: number;
    const availableBalance = parseFloat(account.balance);
    
    // 优先使用事件参数中的金额
    const eventAmount = selectedEvent.args?.amount;
    if (eventAmount !== undefined && eventAmount > 0) {
      paymentAmount = eventAmount;
      console.log(chalk.blue('ℹ ') + `使用事件金额: ${paymentAmount} 元`);
    } else if (amount !== undefined) {
      paymentAmount = amount;
      console.log(chalk.blue('ℹ ') + `使用指定金额: ${paymentAmount} 元`);
    } else {
      const { inputAmount } = await inquirer.prompt([
        {
          type: 'number',
          name: 'inputAmount',
          message: '请输入支付金额（元）:',
          validate: (input: number) => {
            if (input <= 0) return '金额必须大于 0';
            if (input > availableBalance) return `余额不足。可用余额: ${availableBalance} 元`;
            return true;
          }
        }
      ]);
      paymentAmount = inputAmount;
    }
    
    // 验证金额
    if (paymentAmount <= 0) {
      throw new Error('支付金额必须大于 0');
    }
    if (paymentAmount > availableBalance) {
      throw new Error(`余额不足。可用余额: ${availableBalance} 元，需要支付: ${paymentAmount} 元`);
    }
    
    console.log(chalk.blue('ℹ ') + `最终支付金额: ${paymentAmount} 元`);
    
    // 7. 输入支付密码
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: '请输入支付密码（6位数字）:',
        mask: '*',
        validate: (input: string) => {
          if (!/^\d{6}$/.test(input)) return '支付密码必须是6位数字';
          return true;
        }
      }
    ]);
    
    // 6. 确认支付
    console.log(chalk.cyan('\n=== 支付确认 ===\n'));
    console.log(chalk.blue('合同 ID: ') + contractId);
    console.log(chalk.blue('支付金额: ') + chalk.yellow(`${paymentAmount} 元`));
    console.log(chalk.blue('账户余额: ') + `${availableBalance} 元`);
    console.log(chalk.blue('支付后余额: ') + `${(availableBalance - paymentAmount).toFixed(2)} 元`);
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '确认支付？',
        default: false
      }
    ]);
    
    if (!confirm) {
      console.log(chalk.yellow('\n⚠ 支付已取消'));
      return;
    }
    
    // 7. 执行支付（参考前端：ContractService.payContract(contractId, { eventId, accountId, transactionAmount, password })）
    const paymentSpinner = ora('正在处理支付...').start();
    
    try {
      const paymentBody: PaymentEventBody = {
        eventId: selectedEvent.eventId,
        accountId: account.accountId,
        transactionAmount: paymentAmount,
        password: password
      };
      
      const result = await executePaymentEvent(contractId, paymentBody);
      
      // 检查支付状态
      if (result.status === 2) {
        paymentSpinner.succeed(chalk.green('支付成功！'));
        console.log(chalk.green('\n✔ 支付完成'));
        console.log(chalk.blue('ℹ ') + `交易记录 ID: ${result.transactionRecordId}`);
      } else if (result.status === 1) {
        paymentSpinner.warn('支付确认中...');
        console.log(chalk.yellow('\n⚠ 交易正在确认中'));
        console.log(chalk.blue('ℹ ') + `交易记录 ID: ${result.transactionRecordId}`);
        console.log(chalk.blue('ℹ ') + '请稍后查询交易状态');
      } else if (result.status === 3) {
        paymentSpinner.fail('支付已取消');
        console.log(chalk.yellow('\n⚠ 交易已取消'));
      } else if (result.status === 4) {
        paymentSpinner.fail('支付失败');
        console.log(chalk.red('\n❌ 交易失败'));
        if (result.code) {
          console.log(chalk.red(`错误: ${getPaymentErrorMessage(result.code)}`));
        }
      }
      
    } catch (error: any) {
      paymentSpinner.fail('支付失败');
      
      if (error.response) {
        const errorData = error.response.data;
        console.log(chalk.red('\n❌ 支付失败:'));
        console.log(chalk.red(`状态码: ${error.response.status}`));
        console.log(chalk.red(`错误信息: ${errorData.msg || errorData.message || '未知错误'}`));
        
        if (errorData.errCode || errorData.code) {
          const code = errorData.errCode || errorData.code;
          console.log(chalk.red(`错误码: ${code} - ${getPaymentErrorMessage(code)}`));
        }
      } else {
        console.log(chalk.red('\n❌ 错误:'));
        console.log(chalk.red(error.message));
      }
      
      throw error;
    }
    
  } catch (error: any) {
    if (!error.response) {
      console.log(chalk.red('\n❌ 支付流程失败: ') + error.message);
    }
    throw error;
  }
}

