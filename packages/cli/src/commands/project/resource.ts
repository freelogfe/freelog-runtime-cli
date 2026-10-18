/** `resource sync` / `recover`：工程级资源状态维护。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { syncResourceTitles, type ResourceSyncBatch } from '../../domain/resource/sync';
import { CliError } from '../../core/errors';
import { recoverPendingOperation } from '../../domain/resource/recover';
import { diagnoseLocalState } from '../../local/diagnostics';

function syncSummary(batch: ResourceSyncBatch): string {
  const failed = batch.results.filter((result) => result.status === 'failed');
  // i18n: cli.resource.sync.summary
  if (failed.length === 0) return `已同步 ${batch.summary.succeeded} 份资源标题`;
  return `标题已同步 ${batch.summary.succeeded} 份；失败：${failed.map((result) => `${result.stateFile}（${result.error.message}）`).join('、')}`;
}

/** 仅 resource sync 的已完成失败批次；普通错误仍只序列化 code/message。 */
export class ResourceSyncBatchFailure extends CliError {
  constructor(readonly batch: ResourceSyncBatch) {
    super(syncSummary(batch), 'RESOURCE_SYNC_PARTIAL');
  }
}

/** 显式白名单投影，绝不展开完整身份/响应或调用 DTO、异常的 toJSON。 */
export function resourceSyncBatchJson(batch: ResourceSyncBatch): string {
  return JSON.stringify({
    schemaVersion: 1,
    env: batch.env,
    summary: {
      total: batch.summary.total,
      succeeded: batch.summary.succeeded,
      failed: batch.summary.failed,
    },
    results: batch.results.map((result) => {
      const target = { stateFile: result.stateFile, resourceId: result.resourceId };
      return result.status === 'synced'
        ? { ...target, status: 'synced', title: result.title }
        : { ...target, status: 'failed', error: { code: result.error.code, message: result.error.message } };
    }),
  });
}

/** 创建资源状态维护命令组。 */
export function createResourceCommand(): Command {
  const resource = addSharedOptions(new Command('resource')).description('资源本地状态维护');
  resource.command('list').description('只读诊断本地资源状态（损坏时也可运行）').action(function(this: Command) {
    const shared = readSharedOptions(this);
    console.log(diagnoseLocalState(resolveCwd(shared.cwd)));
  });
  resource.command('sync').description('从平台同步本地资源标题').action(async function(this: Command) {
    const shared = readSharedOptions(this);
    const batch = await syncResourceTitles({ cwd: resolveCwd(shared.cwd), selector: shared.file });
    if (batch.summary.failed > 0) throw new ResourceSyncBatchFailure(batch);
    console.log(shared.json ? resourceSyncBatchJson(batch) : syncSummary(batch));
  });
  resource.command('recover').description('处理未决版本提交，绝不重发')
    .option('--apply', 'prepared 只清记录留稿；sending 远端确认后清本次记录，仅摘要未变才删稿，旧记录或变稿保留')
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      const options = this.opts<{ apply?: boolean }>();
      console.log(await recoverPendingOperation({
        cwd: resolveCwd(shared.cwd),
        apply: options.apply === true,
        yes: shared.yes,
      }));
    });
  return resource;
}
