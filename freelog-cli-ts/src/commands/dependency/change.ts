/**
 * 修改依赖命令
 * 修改依赖的版本范围（update 命令的别名）
 */

import { executeUpdate } from './update';
import { CommandOptions } from '../../types';

export async function executeChange(resourceIdentifier: string, options: CommandOptions): Promise<void> {
  // change 命令是 update 命令的别名
  return executeUpdate(resourceIdentifier, options);
}
