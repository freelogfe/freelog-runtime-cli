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
import { collectionStoreFromCwd } from '../store/index.js';
import {
  applyCompiledPolicyToSubject,
  applyPolicyTemplateToSubject,
  compilePolicyTemplateForSubject,
  type PolicyTemplateParam,
  type PolicyTemplatePreview,
} from '../policyTemplate/index.js';
import { cliError } from '../../i18n/cliError.js';

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
  collectionStoreFromCwd(opts.cwd).savePlatformFacts(
    { ...ctx.collection, ...info },
    {},
    { remoteWriteConfirmed: true },
  );
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
  collectionStoreFromCwd(opts.cwd).savePlatformFacts(
    { ...ctx.collection, ...info },
    {},
    { remoteWriteConfirmed: true },
  );
}

export async function collectionPolicyTemplateApply(opts: {
  cwd?: string;
  templateId: string;
  policyName?: string;
  params?: PolicyTemplateParam[];
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceTypeCode = ctx.info.resourceTypeCode || ctx.collection.resourceTypeCode;
  if (!resourceTypeCode) {
    throw cliError('当前合集缺少 resourceTypeCode，无法加载策略模板', { code: 4 });
  }
  const applied = await applyPolicyTemplateToSubject({
    resourceId: ctx.collection.resourceId!,
    resourceTypeCode,
    ownerId: ctx.info.userId ?? ctx.collection.userId ?? ctx.auth.userId,
    existingPolicies: ctx.info.policies || [],
    templateId: opts.templateId,
    policyName: opts.policyName,
    params: opts.params,
  });
  const info = await fetchResourceInfo(ctx.collection.resourceId!);
  collectionStoreFromCwd(opts.cwd).savePlatformFacts(
    { ...ctx.collection, ...info },
    {},
    { remoteWriteConfirmed: true },
  );
  return applied;
}

export async function collectionPolicyTemplatePreview(opts: {
  cwd?: string;
  templateId: string;
  policyName?: string;
  params?: PolicyTemplateParam[];
  noAutoPull?: boolean;
}): Promise<PolicyTemplatePreview> {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceTypeCode = ctx.info.resourceTypeCode || ctx.collection.resourceTypeCode;
  if (!resourceTypeCode) {
    throw cliError('当前合集缺少 resourceTypeCode，无法预览策略模板', { code: 4 });
  }
  return compilePolicyTemplateForSubject({
    resourceTypeCode,
    ownerId: ctx.info.userId ?? ctx.collection.userId ?? ctx.auth.userId,
    existingPolicies: ctx.info.policies || [],
    templateId: opts.templateId,
    policyName: opts.policyName,
    params: opts.params,
  });
}

export async function collectionPolicyTemplateCommitPreview(opts: {
  cwd?: string;
  preview: PolicyTemplatePreview;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  await applyCompiledPolicyToSubject({
    resourceId: ctx.collection.resourceId!,
    existingPolicies: ctx.info.policies || [],
    preview: opts.preview,
  });
  const info = await fetchResourceInfo(ctx.collection.resourceId!);
  collectionStoreFromCwd(opts.cwd).savePlatformFacts(
    { ...ctx.collection, ...info },
    {},
    { remoteWriteConfirmed: true },
  );
  return opts.preview;
}
