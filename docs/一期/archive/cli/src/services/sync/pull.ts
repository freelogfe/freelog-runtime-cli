import type { ProjectStore } from '../store/types.js';
import { ensureOperationContext } from './operationContext.js';
import type { EnsureOwnerResult } from './types.js';

export { ownersMatch } from '../shared/owner.js';
export { pullResourceToLocal } from './pullResource.js';

export async function ensureSynced(opts: {
  store: ProjectStore;
  noAutoPull?: boolean;
  owner?: EnsureOwnerResult;
}): Promise<EnsureOwnerResult> {
  const store = opts.store;
  const ctx = await ensureOperationContext({
    store,
    noAutoPull: opts.noAutoPull,
  });
  return {
    auth: ctx.auth,
    resource: ctx.resource,
    info: ctx.platform,
    version: ctx.version,
  };
}
