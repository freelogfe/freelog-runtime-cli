import fs from 'node:fs';
import { z } from 'zod';
import { savePlatformResourceState } from '../config/project.js';
import { CliError } from '../core/errors.js';
import { FServiceAPI } from '../platform/index.js';
import { ensureOwner, ensureSynced, fetchResourceInfo } from './syncService.js';
import type { PlatformResourceInfo } from './syncService.js';

const PolicyItemSchema = z.object({
  policyName: z.string().min(2).max(20),
  policyText: z.string().min(1),
  status: z.union([z.literal(0), z.literal(1)]).optional().default(1),
});

const PolicyFileSchema = z.union([PolicyItemSchema, z.array(PolicyItemSchema).min(1)]);

export type PolicyFileItem = z.infer<typeof PolicyItemSchema>;

export function parsePolicyFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new CliError(`策略文件不存在: ${filePath}`, { code: 4 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new CliError('policy.json 不是合法 JSON', { code: 4, cause: error });
  }
  const parsed = PolicyFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError('policy.json 校验失败（policyName 2–20、policyText 非空）', {
      code: 4,
      details: parsed.error.flatten(),
    });
  }
  return Array.isArray(parsed.data) ? parsed.data : [parsed.data];
}

export function buildPolicyUpdatePayload(items: PolicyFileItem[]) {
  return {
    addPolicies: items.map((p) => ({
      policyName: p.policyName,
      policyText: encodeURIComponent(p.policyText),
      status: p.status ?? 1,
    })),
  };
}

export async function policyApplyFromFile(opts: {
  cwd?: string;
  fromFile: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const items = parsePolicyFile(opts.fromFile);
  await FServiceAPI.Resource.update({
    resourceId: ctx.resource.resourceId!,
    ...buildPolicyUpdatePayload(items),
  });
  const info = await fetchResourceInfo(ctx.resource.resourceId!);
  savePlatformResourceState({ ...ctx.resource, ...info }, opts.cwd);
  return items;
}

export async function policyList(opts: { cwd?: string }) {
  const ctx = await ensureOwner({ cwd: opts.cwd });
  const info = await fetchResourceInfo(ctx.resource.resourceId!);
  return info.policies || [];
}

export async function policySetStatus(opts: {
  cwd?: string;
  policyId: string;
  status: 0 | 1;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  assertPolicyStatusChangeAllowed(ctx.info, opts.policyId, opts.status);
  await FServiceAPI.Resource.update({
    resourceId: ctx.resource.resourceId!,
    updatePolicies: [{ policyId: opts.policyId, status: opts.status }],
  });
  const info = await fetchResourceInfo(ctx.resource.resourceId!);
  savePlatformResourceState({ ...ctx.resource, ...info }, opts.cwd);
}

export function assertPolicyStatusChangeAllowed(
  info: PlatformResourceInfo,
  policyId: string,
  status: 0 | 1,
): void {
  if (status !== 0 || Number(info.status) !== 1) return;
  const enabled = (info.policies || []).filter((p) => Number(p.status) === 1);
  const targetIsEnabled = enabled.some((p) => p.policyId === policyId);
  if (targetIsEnabled && enabled.length <= 1) {
    throw new CliError('已上架资源不能停用最后一条启用策略', {
      code: 4,
      details: {
        error: 'LAST_ENABLED_POLICY_REQUIRED',
        policyId,
        enabledPolicyCount: enabled.length,
        platformStatus: info.status,
      },
      hint: '先添加或启用另一条策略，或先 offline 后再停用',
    });
  }
}
