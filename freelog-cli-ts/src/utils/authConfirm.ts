/**
 * 认证确认工具
 * 显示当前登录用户信息并确认
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getCurrentAuthWithSource } from '../core/auth';
import { getCurrentUser } from '../api/user';
import type { LoginResponse } from '../api/user';

/**
 * 显示用户信息并确认
 * @param skipConfirm 是否跳过确认（直接继续）
 * @returns 用户信息
 */
export async function confirmAuth(skipConfirm: boolean = false): Promise<LoginResponse> {
  // 获取本地认证信息及其来源
  const authWithSource = getCurrentAuthWithSource();
  if (!authWithSource) {
    throw new Error('请先登录: freelog-cli login');
  }

  const { auth, isGlobal, authPath } = authWithSource;

  // 显示本地保存的用户信息
  console.log(chalk.cyan('\n=== 当前登录用户 ===\n'));
  console.log(`用户名: ${chalk.green(auth.username || auth.userId || '未知')}`);
  console.log(`用户ID: ${chalk.green(auth.userId)}`);
  
  // 明确显示登录类型和路径
  const loginType = isGlobal ? '全局登录' : '工作空间登录';
  const loginTypeColor = isGlobal ? chalk.blue : chalk.cyan;
  console.log(`登录类型: ${loginTypeColor(loginType)}`);
  console.log(`认证文件: ${chalk.gray(authPath)}`);
  
  // 如果 auth.scope 存在，也显示（保持兼容性）
  if (auth.scope) {
    const scopeText = auth.scope === 'global' ? '全局' : '工作空间';
    if ((auth.scope === 'global') !== isGlobal) {
      // 如果 scope 和实际来源不一致，显示警告
      console.log(chalk.yellow(`⚠️  注意: 认证文件中的 scope 标记为 "${scopeText}"，但实际来源为 ${loginType}`));
    }
  }
  console.log('');

  // 尝试从服务器获取最新用户信息
  let userInfo: LoginResponse | null = null;
  const spinner = ora('正在验证用户信息...').start();
  try {
    userInfo = await getCurrentUser();
    spinner.succeed('用户信息验证成功');
    
    // 如果服务器返回的用户信息与本地不一致，显示警告
    if (userInfo.username !== auth.username && auth.username) {
      console.log(chalk.yellow(`⚠️  注意: 服务器返回的用户名为 ${chalk.cyan(userInfo.username)}，与本地保存的不一致`));
    }
    
    // 显示服务器返回的完整用户信息
    console.log(chalk.cyan('\n=== 用户详细信息 ===\n'));
    console.log(`用户名: ${chalk.green(userInfo.username)}`);
    console.log(`昵称: ${chalk.green(userInfo.nickname || '未设置')}`);
    console.log(`用户ID: ${chalk.green(userInfo.userId)}`);
    if (userInfo.email) {
      console.log(`邮箱: ${chalk.green(userInfo.email)}`);
    }
    if (userInfo.mobile) {
      console.log(`手机: ${chalk.green(userInfo.mobile)}`);
    }
    console.log('');
  } catch (err: any) {
    spinner.fail('无法获取服务器用户信息');
    
    // 显示详细的错误信息
    console.log(chalk.red('\n✖ 用户信息验证失败\n'));
    
    // 提取错误信息
    let errorMessage = '未知错误';
    if (err?.response?.data) {
      const errorData = err.response.data as any;
      if (errorData?.msg) {
        errorMessage = errorData.msg;
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      }
    } else if (err?.message) {
      errorMessage = err.message;
    }
    
    console.log(chalk.red(`   错误信息: ${errorMessage}`));
    
    // 显示请求信息
    if (err?.response) {
      const status = err.response.status;
      const statusText = err.response.statusText;
      const url = err.response.config?.url || err.response.config?.baseURL || '未知';
      const method = err.response.config?.method?.toUpperCase() || 'GET';
      
      console.log(chalk.red(`   请求方法: ${method}`));
      console.log(chalk.red(`   请求URL: ${url}`));
      console.log(chalk.red(`   状态码: ${status} ${statusText ? `(${statusText})` : ''}`));
      
      // 显示错误码（如果有）
      if (err?.errCode !== undefined) {
        console.log(chalk.red(`   错误码: ${err.errCode}`));
      } else if (err?.response?.data?.errCode !== undefined) {
        console.log(chalk.red(`   错误码: ${err.response.data.errCode}`));
      } else if (err?.response?.data?.ret !== undefined && err.response.data.ret !== 0) {
        console.log(chalk.red(`   错误码: ${err.response.data.ret}`));
      }
    } else if (err?.request) {
      console.log(chalk.red(`   请求URL: ${err.request.path || err.config?.url || '未知'}`));
      console.log(chalk.yellow('   提示: 请求已发送，但未收到响应（可能是网络问题）'));
    }
    
    console.log(chalk.yellow('\n   提示: 将使用本地保存的用户信息继续操作'));
    console.log(chalk.yellow('   如果后续操作失败，请重新登录: freelog-cli login\n'));
  }

  // 如果跳过确认，直接返回
  if (skipConfirm) {
    return userInfo || {
      userId: parseInt(auth.userId, 10) || 0,
      username: auth.username || '',
      nickname: '',
      email: '',
      mobile: '',
      tokenSn: '',
      userRole: 0,
      status: 0,
      createDate: '',
      updateDate: '',
      headImage: '',
    } as LoginResponse;
  }

  // 确认是否继续
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '确认使用此账号继续操作？',
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('\n操作已取消'));
    process.exit(0);
  }

  console.log('');

  return userInfo || {
    userId: parseInt(auth.userId, 10) || 0,
    username: auth.username || '',
    nickname: '',
    email: '',
    mobile: '',
    tokenSn: '',
    userRole: 0,
    status: 0,
    createDate: '',
    updateDate: '',
    headImage: '',
  } as LoginResponse;
}

