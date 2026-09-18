import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { cliError } from '../../i18n/cliError.js';
import {
  applyCompiledPolicyToSubject,
  compilePolicyTemplateForSubject,
} from './compiler.js';
import type {
  AppliedTemplatePolicy,
  PolicyTemplateParam,
  PolicyTemplatePreview,
} from './types.js';
import { ensureSynced, fetchResourceInfo } from '../sync/index.js';
import type { ProjectStore } from '../store/types.js';

/**
 * 资源工程与 session 模式的策略模板入口。
 *
 * 这一层负责把 ProjectStore 同步成可提交的资源上下文，并在平台写成功后刷新 state；
 * 模板编译规则仍委托 compiler.ts，避免 Store 细节污染策略模板业务内核。
 */
export async function policyTemplatePreview(opts: {
  store: ProjectStore;
  templateId: string;
  policyName?: string;
  params?: PolicyTemplateParam[];
  noAutoPull?: boolean;
}): Promise<PolicyTemplatePreview> {
  const ctx = await ensureSynced({ store: opts.store, noAutoPull: opts.noAutoPull });
  const resourceTypeCode = ctx.info.resourceTypeCode || ctx.resource.resourceTypeCode;
  if (!resourceTypeCode) {
    throw cliError('当前资源缺少 resourceTypeCode，无法预览策略模板', { code: 4 });
  }
  return compilePolicyTemplateForSubject({
    resourceTypeCode,
    ownerId: ctx.info.userId ?? ctx.resource.userId ?? ctx.auth.userId,
    existingPolicies: ctx.info.policies || [],
    templateId: opts.templateId,
    policyName: opts.policyName,
    params: opts.params,
  });
}

export async function policyTemplateCommitPreview(opts: {
  store: ProjectStore;
  preview: PolicyTemplatePreview;
  noAutoPull?: boolean;
}): Promise<AppliedTemplatePolicy> {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureSynced({ store: opts.store, noAutoPull: opts.noAutoPull });
  await applyCompiledPolicyToSubject({
    resourceId: ctx.resource.resourceId!,
    existingPolicies: ctx.info.policies || [],
    preview: opts.preview,
  });
  const info = await fetchResourceInfo(ctx.resource.resourceId!);
  opts.store.savePlatformFacts(
    { ...ctx.resource, ...info },
    { remoteWriteConfirmed: true },
  );
  return opts.preview;
}

export async function policyTemplateApply(opts: {
  store: ProjectStore;
  templateId: string;
  policyName?: string;
  params?: PolicyTemplateParam[];
  noAutoPull?: boolean;
}): Promise<AppliedTemplatePolicy> {
  assertExplicitEnvForWriteOperation();
  const preview = await policyTemplatePreview(opts);
  return policyTemplateCommitPreview({
    store: opts.store,
    preview,
    noAutoPull: opts.noAutoPull,
  });
}
