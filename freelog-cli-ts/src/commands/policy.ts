/**
 * policy add 命令
 * 为资源添加策略
 * 
 * 注意：策略添加功能在 policy copy.ts 中有完整实现
 * 这里暂时重定向到完整实现
 */

import { CommandOptions } from '../types';
import { requireAuth } from '../core/auth';
import { confirmAuth } from '../utils/authConfirm';

/**
 * 执行 policy add 命令
 * 
 * TODO: 将 policy copy.ts 中的完整实现迁移到这里，或创建统一的策略添加服务
 */
export async function executePolicyAdd(options: CommandOptions = {}): Promise<void> {
  requireAuth();
  await confirmAuth(options.skipConfirm);
  
  // 暂时提示用户使用完整实现
  console.log('策略添加功能正在完善中，请使用 policy copy.ts 中的实现');
  throw new Error('策略添加功能暂未实现，请参考 policy copy.ts');
}

