/** 资源标题同步：按当前环境读取平台详情，只回写 N.json.title。 */

import { CliError } from '../../core/errors';
import { identityFilePath, prepareIdentityUpdate, serializeIdentity } from '../../local/identity';
import { resolveIdentity, validateLocalState } from '../../local/resolve';
import { withProjectLock } from '../../local/lock';
import { commitLocalTransaction } from '../../local/transaction';
import { FServiceAPI } from '../../platform/api';
import { unwrapData } from '../../platform/unwrap';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv } from '../env';

export type ResourceSyncApis = { info?: (params: Record<string, unknown>) => Promise<unknown> };

/** 从平台读取指定或当前环境全部资源的标题，并原子回写成功项。 */
export async function syncResourceTitles(input: {
  cwd: string;
  selector?: string;
  homeDir?: string;
  apis?: ResourceSyncApis;
}): Promise<string> {
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
    if (input.selector && (targets[0]!.env ?? 'prod') !== env) {
      throw new CliError('所选资源不属于当前环境，不能同步标题', 'RESOURCE_SYNC_ENV_MISMATCH');
    }
    const info = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
    const results = await Promise.all(targets.map(async (identity) => {
      if (!identity.resourceId) return { identity, error: '资源尚未绑定' };
      try {
        const data = unwrapData(await info({ resourceIdOrName: identity.resourceId, isLoadLatestVersionInfo: 1 }));
        const title = String(data.resourceTitle ?? data.title ?? '');
        if (!title) return { identity, error: '平台详情缺少标题' };
        return { identity, title };
      } catch (error) {
        return { identity, error: error instanceof Error ? error.message : '请求失败' };
      }
    }));
    const successful = results.filter((item): item is typeof item & { title: string } => 'title' in item);
    if (successful.length > 0) {
      const changes = successful.map(({ identity, title }) => {
        const updated = prepareIdentityUpdate(input.cwd, identity.n, { title });
        return { path: identityFilePath(input.cwd, identity.n), content: serializeIdentity(updated) };
      });
      commitLocalTransaction(input.cwd, changes);
    }
    const failed = results.filter((item): item is typeof item & { error: string } => 'error' in item);
    if (failed.length > 0) {
      throw new CliError(`标题已同步 ${successful.length} 份；失败：${failed.map((item) => `${item.identity.n}.json（${item.error}）`).join('、')}`, 'RESOURCE_SYNC_PARTIAL');
    }
    return `已同步 ${successful.length} 份资源标题`;
  }, 'sync-resource-titles');
}
