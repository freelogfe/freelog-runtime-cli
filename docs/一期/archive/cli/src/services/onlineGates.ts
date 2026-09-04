import type { PlatformResourceInfo } from './sync/index.js';

/** 对齐 Console 侧栏上架门禁；通过后由调用方执行 status=1 的平台写入。 */
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
