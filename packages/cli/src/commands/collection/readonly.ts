/** 合集更新日志与授权合约命令。 */

import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { isInteractive, selectQuestion } from '../../core/tty';
import { resolveCwd } from '../../domain/account/login';
import { getCollectionContract, listCollectionContracts, listCollectionUpdateLogs, type CollectionReadPage } from '../../domain/collection/readonly';
import { addCollectionOptions } from './options';

function readPositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) throw new CliError('--limit 必须是 1 到 100 的整数', 'COLLECTION_READ_LIMIT_INVALID');
  return Number(value);
}

function cell(value: unknown): string {
  return JSON.stringify(value ?? '平台未提供').replace(/[\p{Cc}\p{Cf}]/gu, (char) => `\\u${char.codePointAt(0)!.toString(16).padStart(4, '0')}`);
}
function operationLabel(value: unknown): string {
  if (value === 'ADD') return '增加单品';
  if (value === 'DELETE') return '移除单品';
  if (value === 'CREATE') return '首次发布';
  return `未识别 ${cell(value)}`;
}
function printRows(rows: Record<string, unknown>[], json?: boolean, kind: 'log' | 'contract' = 'log'): void {
  if (json) console.log(JSON.stringify(rows, null, 2));
  else if (!rows.length) console.log('暂无记录。');
  else console.log(rows.map((row, index) => kind === 'contract'
    ? [`合同：${cell(row.contractId)}`, `被授权方：${cell(row.licenseeId)} ${cell(row.licenseeName)}`, `标的：${cell(row.subjectId)}；策略：${cell(row.policyId)} ${cell(row.contractName)}`,
      `合同状态：${({ 0: '生效中', 1: '已终止', 2: '异常' } as Record<number, string>)[Number(row.status)] ?? `未识别 ${cell(row.status)}`}`,
      `授权状态：${({ 1: '正式授权', 2: '测试授权', 3: '正式授权（含测试）', 128: '未获得授权（如需支付请在浏览器处理）' } as Record<number, string>)[Number(row.authStatus)] ?? `未识别 ${cell(row.authStatus)}`}`,
      `创建：${cell(row.createDate)}；更新：${cell(row.updateDate)}`].join('\n')
    : [`日志：${row.logId === undefined ? `本页第${index + 1}条（非ID）` : cell(row.logId)}`, `时间：${cell(row.createDate)}；操作者：平台未提供`,
      `影响对象：${cell(row.resourceId)}`, ...((row.operations as Record<string, unknown>[] | undefined) ?? []).map((operation) =>
        `操作：${operationLabel(operation.operationType)}；对象/服务端记录：${cell(operation.operationItems)}`)].join('\n')).join('\n\n'));
}
function pager(json: boolean | undefined, all: boolean | undefined, kind: 'log' | 'contract'): ((page: CollectionReadPage) => Promise<boolean>) | undefined {
  if (json || all || !isInteractive()) return undefined;
  return async (page) => {
    printRows(page.rows, false, kind);
    if (!page.hasNext) return false;
    return await selectQuestion(`已显示${page.skip + page.rows.length}/${page.totalItem}条`, [{ name: '结束', value: 'stop' }, { name: '下一页', value: 'next' }]) === 'next';
  };
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
      if (shared.json && options.all && !shared.yes) throw new CliError('JSON读取全部分页请明确提供 --all --yes', 'COLLECTION_READ_ALL_NEED_YES');
      const nextPage = pager(shared.json, options.all, 'log');
      const rows = await listCollectionUpdateLogs({ cwd: resolveCwd(shared.cwd), selector: shared.file, limit: options.limit, order: options.order, all: options.all, yes: shared.yes, nextPage });
      if (!nextPage) printRows(rows, shared.json, 'log');
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
      if (shared.json && options.all && !shared.yes) throw new CliError('JSON读取全部分页请明确提供 --all --yes', 'COLLECTION_READ_ALL_NEED_YES');
      const nextPage = pager(shared.json, options.all, 'contract');
      const rows = await listCollectionContracts({ cwd: resolveCwd(shared.cwd), selector: shared.file, status, search: options.search, limit: options.limit, order: options.order, all: options.all, yes: shared.yes, nextPage });
      if (!nextPage) printRows(rows, shared.json, 'contract');
    });
  addCollectionOptions(contract.command('show'))
    .argument('<contract-id>', '合同 contractId')
    .action(async function(this: Command, contractId: string) {
      const shared = readSharedOptions(this);
      const detail = await getCollectionContract({ cwd: resolveCwd(shared.cwd), selector: shared.file, contractId });
      if (shared.json) console.log(JSON.stringify(detail, null, 2));
      else printRows([detail], false, 'contract');
    });
  return [log, contract];
}
