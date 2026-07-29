import { requireAuth } from '../core/auth.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureSynced } from './syncService.js';

/** 授权方合约只读列表 */
export async function listContracts(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  asLicensor?: boolean;
}) {
  const auth = requireAuth();
  let subjectIds: string | undefined;
  try {
    const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
    subjectIds = ctx.resource.resourceId;
  } catch {
    // 无本地资源时仍可列账号维度合约
  }

  const asLicensor = opts.asLicensor !== false;
  const envelope = await FServiceAPI.Contract.contracts({
    identityType: asLicensor ? 1 : 2,
    licensorId: asLicensor ? String(auth.userId) : undefined,
    licenseeId: asLicensor ? undefined : String(auth.userId),
    subjectIds,
    subjectType: 1,
    isLoadPolicyInfo: 1,
    limit: 100,
  } as Parameters<typeof FServiceAPI.Contract.contracts>[0]);

  return unwrapData(envelope);
}
