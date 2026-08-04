import type { PlatformResourceInfo } from './syncService.js';

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
