/** 合集命令的公共选项：沿用全局旗标，但收窄 --resource 的合集选择器说明。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';

/** 为合集命令添加共享选项，并声明合集不接受 artifact: 选择器。 */
export function addCollectionOptions(command: Command): Command {
  const configured = addSharedOptions(command);
  const resource = configured.options.find((option) => option.long === '--resource');
  if (resource) resource.description = '选择合集（id:、name: 或 file:N.json）';
  return configured;
}
