import { savePlatformCollectionState } from '../../config/project.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { FServiceAPI } from '../../platform/index.js';
import { fetchResourceInfo } from '../sync/index.js';
import {
  assertNewPoliciesUnique,
  assertPolicyStatusChangeAllowed,
  assertPolicySyntaxForAppend,
  buildPolicyUpdatePayload,
  parsePolicyFile,
  resolvePolicyFilePath,
} from '../policyService.js';
import { ensureCollectionOwner, ensureCollectionSynced } from './owner.js';

export async function collectionPolicyApply(opts: {
  cwd?: string;
  fromFile: string;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const items = parsePolicyFile(resolvePolicyFilePath(opts.fromFile, opts.cwd));
  const existing = ctx.info.policies || [];
  assertNewPoliciesUnique(existing, items);
  assertPolicySyntaxForAppend(items, existing.length);
  await FServiceAPI.Resource.update({
    resourceId: ctx.collection.resourceId!,
    ...buildPolicyUpdatePayload(items),
  } as Parameters<typeof FServiceAPI.Resource.update>[0]);
  const info = await fetchResourceInfo(ctx.collection.resourceId!);
  savePlatformCollectionState({ ...ctx.collection, ...info }, opts.cwd);
  return items;
}

export async function collectionPolicyList(opts: { cwd?: string }) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd });
  const info = await fetchResourceInfo(ctx.collection.resourceId!);
  return info.policies || [];
}

export async function collectionPolicySetStatus(opts: {
  cwd?: string;
  policyId: string;
  status: 0 | 1;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  assertPolicyStatusChangeAllowed(ctx.info, opts.policyId, opts.status);
  await FServiceAPI.Resource.update({
    resourceId: ctx.collection.resourceId!,
    updatePolicies: [{ policyId: opts.policyId, status: opts.status }],
  } as Parameters<typeof FServiceAPI.Resource.update>[0]);
  const info = await fetchResourceInfo(ctx.collection.resourceId!);
  savePlatformCollectionState({ ...ctx.collection, ...info }, opts.cwd);
}
