import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { resolveCwd, savePlatformResourceState } from '../config/project.js';
import { CliError } from '../core/errors.js';
import { FServiceAPI } from '../platform/index.js';
import { ensureOwner, ensureSynced, fetchResourceInfo } from './sync/index.js';
import type { PlatformResourceInfo } from './sync/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

const PolicyItemSchema = z.object({
  policyName: z.string().min(2).max(20),
  policyText: z.string().min(1),
  status: z.union([z.literal(0), z.literal(1)]).optional().default(1),
});

const PolicyFileSchema = z.union([PolicyItemSchema, z.array(PolicyItemSchema).min(1)]);

export type PolicyFileItem = z.infer<typeof PolicyItemSchema>;

export function resolvePolicyFilePath(fromFile: string, cwd?: string): string {
  if (path.isAbsolute(fromFile)) return fromFile;
  return path.resolve(resolveCwd(cwd), fromFile);
}

export function parsePolicyFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw cliError(I18N_KEYS.policy_file_not_found, { code: 4 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw cliError(I18N_KEYS.policy_json_invalid, { code: 4, cause: error });
  }
  const parsed = PolicyFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw cliError(I18N_KEYS.policy_json_validation_failed, {
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

export function assertNewPoliciesUnique(
  existing: Array<{ policyName?: string; policyText?: string }>,
  items: PolicyFileItem[],
): void {
  const names = new Set(
    existing.map((p) => (p.policyName || '').trim().toLowerCase()).filter(Boolean),
  );
  const texts = new Set(
    existing
      .map((p) => {
        const raw = p.policyText || '';
        try {
          return decodeURIComponent(raw).trim();
        } catch {
          return raw.trim();
        }
      })
      .filter(Boolean),
  );
  for (const item of items) {
    const nameKey = item.policyName.trim().toLowerCase();
    if (names.has(nameKey)) {
      throw cliError(I18N_KEYS.cli_policy_name_duplicate, { code: 4 });
    }
    const textKey = item.policyText.trim();
    if (texts.has(textKey)) {
      throw cliError(I18N_KEYS.cli_policy_code_duplicate, { code: 4 });
    }
  }
}

export function assertPolicySyntaxForAppend(
  items: PolicyFileItem[],
  existingPolicyCount: number,
): void {
  if (existingPolicyCount <= 0) return;
  for (const item of items) {
    const text = item.policyText.trim();
    const upper = text.toUpperCase();
    if (!upper.includes('FOR PUBLIC') || !/\bINITIAL\b/i.test(text)) {
      throw cliError(I18N_KEYS.policy_append_syntax_invalid, {
        code: 4,
        hint: '示例：\\nFOR PUBLIC\\n\\nInitial:\\n\\tterminate',
        details: { policyName: item.policyName },
      });
    }
  }
}

export async function policyApplyFromFile(opts: {
  cwd?: string;
  fromFile: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const items = parsePolicyFile(resolvePolicyFilePath(opts.fromFile, opts.cwd));
  const existing = ctx.info.policies || [];
  assertNewPoliciesUnique(existing, items);
  assertPolicySyntaxForAppend(items, existing.length);
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
    throw cliError(I18N_KEYS.cannot_disable_last_policy, {
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
