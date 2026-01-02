/**
 * batch dep change 命令
 * 修改依赖版本（update 命令的别名）
 */

import { executeBatchDepUpdate } from './update';
import { CommandOptions } from '../../../types';

/**
 * 执行 batch dep change 命令
 * change 命令是 update 命令的别名
 */
export async function executeBatchDepChange(
  resourceName: string,
  dependencyId: string,
  versionRange?: string,
  options: CommandOptions = {}
): Promise<void> {
  return executeBatchDepUpdate(resourceName, dependencyId, versionRange, options);
}

