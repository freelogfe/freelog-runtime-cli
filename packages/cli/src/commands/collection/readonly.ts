/** 合集更新日志与授权合约命令。 */

import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { getCollectionContract, listCollectionContracts, listCollectionUpdateLogs } from '../../domain/collection/readonly';
import { addCollectionOptions } from './options';

function readPositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) throw new CliError('--limit 必须是 1 到 100 的整数', 'COLLECTION_READ_LIMIT_INVALID');
  return Number(value);
}

function printRows(rows: Record<string, unknown>[], json?: boolean): void {
  if (json) console.log(JSON.stringify(rows, null, 2));
  else console.log(rows.map((row) => JSON.stringify(row)).join('\n'));
}

/** 装配合集发行后只读观察命令。 */
export function createCollectionReadonlyCommands(): Command[] {
  const log = addCollectionOptions(new Command('log')).description('查看合集更新日志，只读');
  addCollectionOptions(log.command('list'))
    .option('--limit <n>', '每页条数，1 到 100', readPositiveInt)
    .option('--order <order>', 'asc 或 desc', 'desc')
    .option('--all', '读取全部分页结果')
    .action(async function(this: Command, options: { limit?: number; order: string; all?: boolean }) {
      if (options.order !== 'asc' && options.order !== 'desc') throw new CliError('--order 仅支持 asc 或 desc', 'COLLECTION_READ_ORDER_INVALID');
      const shared = readSharedOptions(this);
      printRows(await listCollectionUpdateLogs({ cwd: resolveCwd(shared.cwd), selector: shared.file, limit: options.limit, order: options.order, all: options.all }), shared.json);
    });

  const contract = addCollectionOptions(new Command('contract')).description('查看本合集作为授权方的授权合约，只读');
  addCollectionOptions(contract.command('list'))
    .option('--status <status>', 'active、terminated 或 abnormal')
    .option('--search <text>', '搜索合同')
    .option('--limit <n>', '每页条数，1 到 100', readPositiveInt)
    .option('--order <order>', 'asc 或 desc', 'desc')
    .option('--all', '读取全部分页结果')
    .action(async function(this: Command, options: { status?: string; search?: string; limit?: number; order: string; all?: boolean }) {
      if (options.order !== 'asc' && options.order !== 'desc') throw new CliError('--order 仅支持 asc 或 desc', 'COLLECTION_READ_ORDER_INVALID');
      const status = options.status === undefined ? undefined : ({ active: 0, terminated: 1, abnormal: 2 } as const)[options.status as 'active'];
      if (options.status !== undefined && status === undefined) throw new CliError('--status 仅支持 active、terminated 或 abnormal', 'COLLECTION_CONTRACT_STATUS_INVALID');
      const shared = readSharedOptions(this);
      printRows(await listCollectionContracts({ cwd: resolveCwd(shared.cwd), selector: shared.file, status, search: options.search, limit: options.limit, order: options.order, all: options.all }), shared.json);
    });
  addCollectionOptions(contract.command('show'))
    .argument('<contract-id>', '合同 contractId')
    .action(async function(this: Command, contractId: string) {
      const shared = readSharedOptions(this);
      const detail = await getCollectionContract({ cwd: resolveCwd(shared.cwd), selector: shared.file, contractId });
      console.log(shared.json ? JSON.stringify(detail, null, 2) : JSON.stringify(detail));
    });
  return [log, contract];
}
