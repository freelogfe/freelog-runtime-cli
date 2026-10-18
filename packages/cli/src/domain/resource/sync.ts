/** 资源标题同步：按当前环境读取平台详情，只回写 N.json.title。 */

import { CliError, serializeCliError, type CliErrorJson } from '../../core/errors';
import { identityFilePath, prepareIdentityUpdate, serializeIdentity } from '../../local/identity';
import { resolveIdentity, validateLocalState } from '../../local/resolve';
import { withProjectLock } from '../../local/lock';
import { commitLocalTransaction } from '../../local/transaction';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv } from '../env';
import type { FreelogEnv, IdentityRecord } from '../../local/types';

export type ResourceSyncApis = { info?: (params: Record<string, unknown>) => Promise<unknown> };
export type ResourceSyncResult = {
  stateFile: string;
  resourceId: string;
} & ({ status: 'synced'; title: string } | { status: 'failed'; error: CliErrorJson });
export type ResourceSyncBatch = {
  schemaVersion: 1;
  env: FreelogEnv;
  summary: { total: number; succeeded: number; failed: number };
  results: ResourceSyncResult[];
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readSyncResult(identity: IdentityRecord, info: NonNullable<ResourceSyncApis['info']>): Promise<ResourceSyncResult> {
  // 调用前已证明绑定；响应中的 ID 永远不能改写本地目标。
  const target = { stateFile: `${identity.n}.json`, resourceId: identity.resourceId! };
  const failed = (code: string, message: string): ResourceSyncResult => ({ ...target, status: 'failed', error: { code, message } });
  try {
    const response = await info({ resourceIdOrName: target.resourceId, isLoadLatestVersionInfo: 1 });
    if (!record(response) || response.ret !== 0 || response.errCode !== 0 || !record(response.data)) {
      // i18n: cli.resource.sync.response_invalid
      return failed('RESOURCE_SYNC_RESPONSE_INVALID', '平台详情响应不是成功信封或缺少有效对象');
    }
    const data = response.data;
    if (data.resourceId !== target.resourceId) {
      // i18n: cli.resource.sync.id_mismatch
      return failed('RESOURCE_SYNC_ID_MISMATCH', '平台详情缺少或不匹配 resourceId');
    }
    const title = data.resourceTitle;
    if (typeof title !== 'string' || title.trim() === '' || title.length > 100) {
      // i18n: cli.resource.sync.title_invalid
      return failed('RESOURCE_SYNC_TITLE_INVALID', '平台详情缺少有效标题（须为非空且不超过100个字符的字符串）');
    }
    return { ...target, status: 'synced', title };
  } catch (error) {
    // 不序列化异常对象或调用 toJSON；未知 HTTP message 可能含凭据。
    if (error instanceof CliError) return { ...target, status: 'failed', error: serializeCliError(error) };
    // i18n: cli.resource.sync.request_failed
    return failed('RESOURCE_SYNC_REQUEST_FAILED', '请求失败');
  }
}

/** 从平台读取本轮标题并原子回写成功项；事务完成后才返回含失败项的安全批次。 */
export async function syncResourceTitles(input: {
  cwd: string;
  selector?: string;
  homeDir?: string;
  apis?: ResourceSyncApis;
}): Promise<ResourceSyncBatch> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  return withProjectLock(input.cwd, async () => {
    const env = getEnv();
    const all = validateLocalState(input.cwd);
    const targets = input.selector
      ? [resolveIdentity(input.cwd, input.selector)]
      : all.filter((identity) => identity.resourceId && (identity.env ?? 'prod') === env);
    if (targets.length === 0) {
      throw new CliError('当前环境没有可同步标题的已绑定资源', 'RESOURCE_SYNC_EMPTY');
    }
    if (input.selector && !targets[0]!.resourceId) {
      // i18n: cli.resource.sync.unbound
      throw new CliError('所选资源尚未绑定，不能同步标题', 'RESOURCE_SYNC_UNBOUND');
    }
    if (input.selector && (targets[0]!.env ?? 'prod') !== env) {
      throw new CliError('所选资源不属于当前环境，不能同步标题', 'RESOURCE_SYNC_ENV_MISMATCH');
    }
    const info = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
    const results = await Promise.all(targets.map(async (identity) => ({
      identity,
      result: await readSyncResult(identity, info),
    })));
    const changes = results.flatMap(({ identity, result }) => {
      if (result.status !== 'synced') return [];
      const updated = prepareIdentityUpdate(input.cwd, identity.n, { title: result.title });
      return [{ path: identityFilePath(input.cwd, identity.n), content: serializeIdentity(updated) }];
    });
    if (changes.length > 0) commitLocalTransaction(input.cwd, changes);
    // 事务未正常返回就不返回 DTO：日志前滚可能已写部分文件，不能误报 synced。
    return {
      schemaVersion: 1, env,
      summary: { total: results.length, succeeded: changes.length, failed: results.length - changes.length },
      results: results.map(({ result }) => result),
    };
  }, 'sync-resource-titles');
}
