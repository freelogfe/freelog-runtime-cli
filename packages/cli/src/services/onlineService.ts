import { CliError } from '../core/errors.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import {
  savePlatformCollectionState,
  savePlatformResourceState,
  tryLoadCollectionProject,
} from '../config/project.js';
import { FServiceAPI } from '../platform/index.js';
import { ensureSynced, fetchResourceInfo, type PlatformResourceInfo } from './sync/index.js';
import { evaluateOnlineGates } from './onlineGates.js';
import { ensureCollectionSynced } from './collection/index.js';

export { evaluateOnlineGates };

async function applyOnline(resourceId: string, info: PlatformResourceInfo, hint: string) {
  if (Number(info.status) === 2) {
    throw new CliError('资源已冻结，无法上架', { code: 4, details: { status: info.status } });
  }

  const gates = evaluateOnlineGates(info);

  // 即使平台 status===1（Console 软上架），门禁未满足仍拒 —— 验收 #15b
  if (!gates.ok) {
    const policies = info.policies || [];
    throw cliError(
      policies.length === 0
        ? I18N_KEYS.msg_set_resource_avaliable_for_auth01
        : I18N_KEYS.msg_set_resource_avaliable_for_auth02,
      {
        code: 4,
        details: {
          error: 'ONLINE_GATE_FAILED',
          gates: {
            hasLatestVersion: gates.hasLatestVersion,
            enabledPolicyCount: gates.enabledPolicyCount,
          },
          platformStatus: info.status,
        },
        hint,
      },
    );
  }

  if (Number(info.status) === 1) {
    return { already: true as const, info, gates };
  }

  await FServiceAPI.Resource.update({
    resourceId,
    status: 1,
  });

  return { already: false as const, info, gates };
}

export async function onlineResource(opts: { cwd?: string; noAutoPull?: boolean }) {
  if (tryLoadCollectionProject(opts.cwd)) {
    const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
    const result = await applyOnline(
      ctx.collection.resourceId!,
      ctx.info,
      '先 collection publish / policy apply，然后 online',
    );
    savePlatformCollectionState(
      { ...ctx.collection, ...ctx.info, status: 1 },
      opts.cwd,
    );
    return result;
  }

  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;
  const info = await fetchResourceInfo(resourceId);
  const result = await applyOnline(resourceId, info, '先 publish 再 policy apply --from-file，然后 online');
  savePlatformResourceState({ ...ctx.resource, ...info, status: 1 }, opts.cwd);
  return result;
}

export async function offlineResource(opts: { cwd?: string; noAutoPull?: boolean }) {
  if (tryLoadCollectionProject(opts.cwd)) {
    const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
    await FServiceAPI.Resource.update({
      resourceId: ctx.collection.resourceId!,
      status: 4,
    } as unknown as Parameters<typeof FServiceAPI.Resource.update>[0]);
    savePlatformCollectionState({ ...ctx.collection, ...ctx.info, status: 4 }, opts.cwd);
    return;
  }

  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  await FServiceAPI.Resource.update({
    resourceId: ctx.resource.resourceId!,
    status: 4,
  } as unknown as Parameters<typeof FServiceAPI.Resource.update>[0]);
  savePlatformResourceState({ ...ctx.resource, ...ctx.info, status: 4 }, opts.cwd);
}
