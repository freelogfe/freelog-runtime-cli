/**
 * 认证命令（login / logout / status）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { login, logout } from '../api/user';
import { saveAuth, clearAuth, getCurrentAuth } from '../core/auth';
import { handleErrorAndExit } from '../utils/errorHandler';
import { CommandOptions, AuthInfo } from '../types';
import { freelogRequest } from '../core/http';

// ==================== LOGIN ====================

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
      // 调用登录 API
      const userInfo = await login({
        loginName: username,
        password: password,
        jwtType: 'header'
      });
      
      // 获取响应头中的 token
      const lastResponse = (freelogRequest as any).lastResponse;
      const authHeader = lastResponse?.headers?.authorization || lastResponse?.headers?.['authorization'];
      const token = typeof authHeader === 'string' ? authHeader : '';
      
      if (!token) {
        throw new Error('未能获取到认证 token');
      }
      console.log(userInfo);
      const authData: AuthInfo = {
        username: userInfo.username,
        userId: String(userInfo.userId),
        token: token,
        authorization: token,
        scope: isGlobal ? 'global' : 'workspace'
      };
      
      saveAuth(authData, isGlobal);
      spinner.succeed(isGlobal ? '全局登录成功!' : '工作空间登录成功!');
      
      console.log(chalk.green('✔ ') + `欢迎, ${authData.username}!`);
      console.log(chalk.blue('ℹ ') + `用户ID: ${authData.userId}`);
      console.log(chalk.blue('ℹ ') + `认证范围: ${isGlobal ? '全局' : '工作空间'}`);
      
    } catch (err: any) {
      spinner.fail('登录失败');
      throw err;
    }
    
  } catch (err: any) {
    handleErrorAndExit(err, '登录失败');
  }
}

// ==================== LOGOUT ====================

export async function executeLogout(options: CommandOptions): Promise<void> {
  try {
    const isGlobal = options.global || false;
    
    // 调用登出 API（可选，用于清理服务端会话）
    try {
      await logout();
    } catch (err) {
      // 忽略登出 API 错误，继续清理本地认证信息
      console.log(chalk.yellow('⚠ ') + '服务端登出失败，但本地认证信息将被清除');
    }
    
    // 清除本地认证信息
    clearAuth(isGlobal);
    
    console.log(chalk.green('✔ ') + (isGlobal ? '全局登录信息已清除' : '工作空间登录信息已清除'));
    
  } catch (err: any) {
    handleErrorAndExit(err, '退出登录失败');
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

