import { assertExplicitEnvForWriteOperation } from '../core/command.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import {
  savePlatformCollectionState,
  tryLoadCollectionProject,
} from '../config/project.js';
import { FServiceAPI } from '../platform/index.js';
import { ensureSynced, fetchResourceInfo, type PlatformResourceInfo } from './sync/index.js';
import type { ProjectStore } from './store/types.js';
import { evaluateOnlineGates } from './onlineGates.js';
import { ensureCollectionSynced } from './collection/index.js';
import { isFrozenStatus } from './shared/guards/index.js';

export { evaluateOnlineGates };

async function applyOnline(resourceId: string, info: PlatformResourceInfo, hint: string) {
  if (isFrozenStatus(info.status)) {
    throw cliError(I18N_KEYS.cli_resource_frozen, {
      code: 4,
      details: { status: info.status },
    });
  }

  const gates = evaluateOnlineGates(info);

  // 即使平台 status===1（Console 软上架），门禁未满足仍拒 —— 验收 #15b
  if (!gates.ok) {
    const policies = info.policies || [];
    const key = !gates.hasLatestVersion
      ? I18N_KEYS.msg_release_version_first
      : policies.length === 0
        ? I18N_KEYS.msg_set_resource_avaliable_for_auth01
        : I18N_KEYS.msg_set_resource_avaliable_for_auth02;
    throw cliError(key, {
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

export async function onlineResource(opts: {
  store: ProjectStore;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const store = opts.store;
  if (store.mode() !== 'session' && tryLoadCollectionProject(store.rootDir())) {
    const ctx = await ensureCollectionSynced({ cwd: store.rootDir(), noAutoPull: opts.noAutoPull });
    const result = await applyOnline(
      ctx.collection.resourceId!,
      ctx.info,
      '先 collection publish / policy apply，然后 online',
    );
    savePlatformCollectionState(
      { ...ctx.collection, ...ctx.info, status: 1 },
      store.rootDir(),
    );
    return result;
  }

  const ctx = await ensureSynced({ store, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;
  const info = await fetchResourceInfo(resourceId);
  const result = await applyOnline(resourceId, info, '先 publish 再 policy apply --from-file，然后 online');
  store.savePlatformFacts({ ...ctx.resource, ...info, status: 1 });
  return result;
}

export async function offlineResource(opts: {
  store: ProjectStore;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const store = opts.store;
  if (store.mode() !== 'session' && tryLoadCollectionProject(store.rootDir())) {
    const ctx = await ensureCollectionSynced({ cwd: store.rootDir(), noAutoPull: opts.noAutoPull });
    await FServiceAPI.Resource.update({
      resourceId: ctx.collection.resourceId!,
      status: 4,
    } as unknown as Parameters<typeof FServiceAPI.Resource.update>[0]);
    savePlatformCollectionState({ ...ctx.collection, ...ctx.info, status: 4 }, store.rootDir());
    return;
  }

  const ctx = await ensureSynced({ store, noAutoPull: opts.noAutoPull });
  await FServiceAPI.Resource.update({
    resourceId: ctx.resource.resourceId!,
    status: 4,
  } as unknown as Parameters<typeof FServiceAPI.Resource.update>[0]);
  store.savePlatformFacts({ ...ctx.resource, ...ctx.info, status: 4 });
}
