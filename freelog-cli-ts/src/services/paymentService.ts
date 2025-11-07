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
import type { PaymentEventBody, IndividualAccountInfo } from '../api/payment';

/**
 * 策略信息
 */
interface PolicyInfo {
  policyId: string;
  policyName: string;
  status: number;
  feeMode: string;
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
  const response = await apiClient.get(`/v2/contracts/${contractId}`);
  const contract = response.data?.data;
  
  if (!contract) {
    throw new Error('合同信息获取失败');
  }
  
  return contract.policyInfo ? [contract.policyInfo] : [];
}

/**
 * 获取合同的可执行事件列表
 */
async function getContractEvents(contractId: string): Promise<EventInfo[]> {
  const response = await apiClient.get(`/v2/contracts/${contractId}/transitions`);
  return response.data?.data || [];
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
  const account = await getIndividualAccount(userId);
  
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
    
    // 1. 获取策略列表
    const policySpinner = ora('正在获取策略列表...').start();
    let policies: PolicyInfo[];
    
    try {
      policies = await getContractPolicies(contractId);
      policySpinner.succeed('策略列表获取成功');
    } catch (error) {
      policySpinner.fail('策略列表获取失败');
      throw error;
    }
    
    // 2. 让用户选择策略
    const selectedPolicy = await selectPolicy(policies);
    console.log(chalk.green('✔ ') + `已选择策略: ${selectedPolicy.policyName}`);
    
    // 3. 获取可执行事件
    const eventSpinner = ora('正在获取支付事件...').start();
    let events: EventInfo[];
    
    try {
      events = await getContractEvents(contractId);
      eventSpinner.succeed('支付事件获取成功');
    } catch (error) {
      eventSpinner.fail('支付事件获取失败');
      throw error;
    }
    
    // 4. 让用户选择支付事件
    const selectedEvent = await selectPaymentEvent(events);
    console.log(chalk.green('✔ ') + `已选择事件: ${selectedEvent.name}`);
    
    // 5. 获取用户账户
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
    
    // 6. 确定支付金额
    let paymentAmount: number;
    const availableBalance = parseFloat(account.balance);
    
    if (amount !== undefined) {
      paymentAmount = amount;
      
      // 验证金额
      if (paymentAmount <= 0) {
        throw new Error('支付金额必须大于 0');
      }
      if (paymentAmount > availableBalance) {
        throw new Error(`余额不足。可用余额: ${availableBalance} 元`);
      }
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
    
    console.log(chalk.blue('ℹ ') + `支付金额: ${paymentAmount} 元`);
    
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
    
    // 8. 确认支付
    console.log(chalk.cyan('\n=== 支付确认 ===\n'));
    console.log(chalk.blue('合同 ID: ') + contractId);
    console.log(chalk.blue('策略: ') + selectedPolicy.policyName);
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
    
    // 9. 执行支付
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

