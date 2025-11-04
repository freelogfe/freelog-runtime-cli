/**
 * 认证命令（login / logout / status）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import apiClient from '../core/api';
import { saveAuth, clearAuth, getCurrentAuth } from '../core/auth';
import { CommandOptions, AuthInfo } from '../types';

// ==================== LOGIN ====================

async function callLoginApi(loginName: string, password: string) {
  const response = await apiClient.post('/v2/passport/login', {
    loginName,
    password,
    jwtType: 'header'
  });

  const authHeader = response.headers.authorization || response.headers['authorization'];
  const token = typeof authHeader === 'string' ? authHeader : '';
  
  return {
    userInfo: response.data.data,
    token,
    headers: response.headers
  };
}

export async function executeLogin(options: CommandOptions): Promise<void> {
  try {
    const isGlobal = options.global || false;
    console.log(chalk.blue('ℹ ') + (isGlobal ? '正在执行全局登录...' : `正在执行工作空间登录...`));
    
    let username = options.username;
    let password = options.password;
    
    if (!username || !password) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'username',
          message: '请输入用户名或邮箱:',
          when: !username,
          validate: (input: string) => input.trim() ? true : '用户名不能为空'
        },
        {
          type: 'password',
          name: 'password',
          message: '请输入密码:',
          when: !password,
          mask: '*',
          validate: (input: string) => input ? true : '密码不能为空'
        }
      ]);
      
      username = username || answers.username;
      password = password || answers.password;
    }
    
    const spinner = ora('正在登录...').start();
    
    try {
      const result = await callLoginApi(username, password);
      
      const authData: AuthInfo = {
        username: result.userInfo.username,
        userId: result.userInfo.userId,
        token: result.token,
        authorization: result.token,
        scope: isGlobal ? 'global' : 'workspace'
      };
      
      saveAuth(authData, isGlobal);
      spinner.succeed(isGlobal ? '全局登录成功!' : '工作空间登录成功!');
      
      console.log(chalk.green('✔ ') + `欢迎, ${authData.username}!`);
      console.log(chalk.blue('ℹ ') + `用户ID: ${authData.userId}`);
      console.log(chalk.blue('ℹ ') + `认证范围: ${isGlobal ? '全局' : '工作空间'}`);
      
    } catch (err: any) {
      spinner.fail('登录失败');
      console.log(chalk.red('✖ ') + err.message);
      process.exit(1);
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `登录失败: ${err.message}`);
    process.exit(1);
  }
}

// ==================== LOGOUT ====================

export async function executeLogout(options: CommandOptions): Promise<void> {
  try {
    const isGlobal = options.global || false;
    
    clearAuth(isGlobal);
    
    console.log(chalk.green('✔ ') + (isGlobal ? '全局登录信息已清除' : '工作空间登录信息已清除'));
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `退出登录失败: ${err.message}`);
    process.exit(1);
  }
}

// ==================== STATUS ====================

export async function executeStatus(): Promise<void> {
  try {
    const auth = getCurrentAuth();
    
    if (!auth) {
      console.log(chalk.yellow('⚠ ') + '当前未登录');
      console.log(chalk.blue('ℹ ') + '使用 `freelog-cli login` 进行登录');
      return;
    }
    
    console.log(chalk.cyan('\n=== 登录状态 ===\n'));
    console.log(`用户名: ${chalk.green(auth.username)}`);
    console.log(`用户ID: ${chalk.green(auth.userId)}`);
    console.log(`认证范围: ${chalk.green(auth.scope === 'global' ? '全局' : '工作空间')}`);
    console.log(`状态: ${chalk.green('已登录')}\n`);
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `获取状态失败: ${err.message}`);
    process.exit(1);
  }
}

