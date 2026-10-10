/** 合集完结状态与自动收录规则命令。 */

import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { getCollectionCollectRules, setCollectionCollectRules } from '../../domain/collection/collectRules';
import { addCollectionOptions } from './options';

/** 装配合集完结状态与自动收录规则命令。 */
export function createCollectionCollectRulesCommand(): Command {
  const rules = addCollectionOptions(new Command('collect-rules')).description('查看或维护合集更新状态与自动收录规则');
  addCollectionOptions(rules.command('get'))
    .description('读取当前收录规则，只读')
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      const result = await getCollectionCollectRules({ cwd: resolveCwd(shared.cwd), selector: shared.file });
      console.log(JSON.stringify(result, null, 2));
    });
  addCollectionOptions(rules.command('set'))
    .description('仅修改显式字段；开启自动收录时必须给出规则 JSON 文件')
    .option('--serialize <state>', 'completed 或 serial')
    .option('--auto <mode>', 'off、all 或 any')
    .option('--rules <path>', '规则 JSON 文件路径')
    .action(async function(this: Command, options: { serialize?: string; auto?: string; rules?: string }) {
      if (options.serialize !== undefined && options.serialize !== 'completed' && options.serialize !== 'serial') {
        throw new CliError('--serialize 仅支持 completed 或 serial', 'COLLECTION_SERIALIZE_INVALID');
      }
      if (options.auto !== undefined && options.auto !== 'off' && options.auto !== 'all' && options.auto !== 'any') {
        throw new CliError('--auto 仅支持 off、all 或 any', 'COLLECTION_AUTO_INVALID');
      }
      const shared = readSharedOptions(this);
      const result = await setCollectionCollectRules({
        cwd: resolveCwd(shared.cwd), selector: shared.file, serialize: options.serialize as 'completed' | 'serial' | undefined,
        auto: options.auto as 'off' | 'all' | 'any' | undefined, rulesFile: options.rules, yes: shared.yes,
      });
      console.log(JSON.stringify(result, null, 2));
    });
  return rules;
}
