import { CliError } from '../core/errors.js';
import { findConfigPath } from '../config/paths.js';
import { FServiceAPI } from '../platform/index.js';
import { ensureSynced, fetchResourceInfo, type PlatformResourceInfo } from './syncService.js';

/** ≅ Console sidebar resourceOnline 门禁（无独立 API；门禁后才 update status:1） */
export function evaluateOnlineGates(info: PlatformResourceInfo): {
  hasLatestVersion: boolean;
  enabledPolicyCount: number;
  ok: boolean;
} {
  const hasLatestVersion = Boolean(info.latestVersion);
  const enabledPolicyCount = (info.policies || []).filter((p) => Number(p.status) === 1).length;
  return {
    hasLatestVersion,
    enabledPolicyCount,
    ok: hasLatestVersion && enabledPolicyCount >= 1,
  };
}

async function applyOnline(resourceId: string, info: PlatformResourceInfo, hint: string) {
  if (Number(info.status) === 2) {
    throw new CliError('资源已冻结，无法上架', { code: 4, details: { status: info.status } });
  }

  const gates = evaluateOnlineGates(info);

  // 即使平台 status===1（Console 软上架），门禁未满足仍拒 —— 验收 #15b
  if (!gates.ok) {
    throw new CliError('上架门禁未满足：需要 latestVersion 与至少一条启用策略', {
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
    });
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
  // 合集目录：读 collection config（动态 import 避免与 collectionService 静态环）
  if (findConfigPath('collection', opts.cwd)) {
    const { ensureCollectionSynced } = await import('./collectionService.js');
    const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
    return applyOnline(
      ctx.collection.resourceId!,
      ctx.info,
      '先 collection publish / policy add，然后 online',
    );
  }

  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;
  const info = await fetchResourceInfo(resourceId);
  return applyOnline(resourceId, info, '先 publish 再 policy add --from-file，然后 online');
}

export async function offlineResource(opts: { cwd?: string; noAutoPull?: boolean }) {
  if (findConfigPath('collection', opts.cwd)) {
    const { ensureCollectionSynced } = await import('./collectionService.js');
    const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
    await FServiceAPI.Resource.update({
      resourceId: ctx.collection.resourceId!,
      status: 4,
    } as unknown as Parameters<typeof FServiceAPI.Resource.update>[0]);
    return;
  }

  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  await FServiceAPI.Resource.update({
    resourceId: ctx.resource.resourceId!,
    status: 4,
  } as unknown as Parameters<typeof FServiceAPI.Resource.update>[0]);
}
