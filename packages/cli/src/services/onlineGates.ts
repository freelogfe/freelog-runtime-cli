import type { PlatformResourceInfo } from './sync/index.js';

/** ?? Console sidebar resourceOnline ?????? API????? update status:1? */
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
