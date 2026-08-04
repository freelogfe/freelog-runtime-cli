import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { tryLoadVersionProject } from '../config/project.js';
import { ensureSynced } from './syncService.js';

const AuthMapSchema = z.object({
  contracts: z
    .array(
      z.object({
        resourceId: z.string().min(1),
        policyIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1, 'contracts 不能为空'),
});

export type AuthMap = z.infer<typeof AuthMapSchema>;

type DependencyLike = { resourceId: string };
type ResourcePolicy = {
  policyId?: string;
  policyID?: string;
  policyText?: string;
  status?: number;
};

const PAYMENT_EVENT_PATTERN = /freelog\s*\.\s*TransactionEvent\s*\(/i;

function getPolicyId(policy: ResourcePolicy): string {
  return String(policy.policyId || policy.policyID || '');
}

export function isPaymentPolicy(policyText: string | undefined): boolean {
  if (!policyText) return false;
  let text = policyText;
  try {
    text = decodeURIComponent(policyText);
  } catch {
    // 非 URI 编码策略仍按原文检查。
  }
  return PAYMENT_EVENT_PATTERN.test(text);
}

export function assertAuthMapMatchesDependencies(
  map: AuthMap,
  dependencies: DependencyLike[],
): void {
  const dependencyIds = new Set(dependencies.map((item) => item.resourceId));
  const seenResources = new Set<string>();

  for (const entry of map.contracts) {
    if (!dependencyIds.has(entry.resourceId)) {
      throw new CliError(`policy-map 包含未声明的依赖资源: ${entry.resourceId}`, {
        code: 4,
        hint: '先执行 dep add <resourceId>，或从 policy-map 删除该项',
      });
    }
    if (seenResources.has(entry.resourceId)) {
      throw new CliError(`policy-map 重复声明依赖资源: ${entry.resourceId}`, { code: 4 });
    }
    seenResources.add(entry.resourceId);

    const policyIds = new Set<string>();
    for (const policyId of entry.policyIds) {
      if (policyIds.has(policyId)) {
        throw new CliError(`policy-map 重复声明策略: ${entry.resourceId}/${policyId}`, {
          code: 4,
        });
      }
      policyIds.add(policyId);
    }
  }
}

export function buildBatchSignContractsParams(opts: {
  licenseeResourceId: string;
  subjectId: string;
  policyId: string;
}): Parameters<typeof FServiceAPI.Contract.batchCreateContracts>[0] {
  return {
    // Console FMicroAPP_Authorization 传入的是待发版资源 ID；identityType=1 表示资源。
    licenseeId: opts.licenseeResourceId,
    licenseeIdentityType: 1,
    subjectType: 1,
    subjects: [{ subjectId: opts.subjectId, policyId: opts.policyId }],
  };
}

async function assertPoliciesAreFreeAndEnabled(map: AuthMap): Promise<void> {
  for (const entry of map.contracts) {
    const resource = unwrapData<{ policies?: ResourcePolicy[] }>(
      await FServiceAPI.Resource.info({
        resourceIdOrName: entry.resourceId,
        isLoadPolicyInfo: 1,
      }),
    );
    const policies = resource?.policies || [];

    for (const policyId of entry.policyIds) {
      const policy = policies.find((item) => getPolicyId(item) === policyId);
      if (!policy) {
        throw new CliError(`依赖资源不存在策略: ${entry.resourceId}/${policyId}`, {
          code: 5,
          hint: '执行 dep auth 前先用 Console 或资源 API 确认 policyId',
        });
      }
      if (Number(policy.status) !== 1) {
        throw new CliError(`依赖策略未启用: ${entry.resourceId}/${policyId}`, {
          code: 5,
          hint: '请让资源作者启用该策略，或选择已启用的免费策略',
        });
      }
      if (!policy.policyText) {
        throw new CliError(`无法确认依赖策略是否需要支付: ${entry.resourceId}/${policyId}`, {
          code: 5,
          details: {
            error: 'DEPENDENCY_POLICY_UNVERIFIABLE',
            resourceId: entry.resourceId,
            policyId,
          },
          hint: '请在 Console 查看策略并完成必要交互；CLI 不会执行支付',
        });
      }
      if (isPaymentPolicy(policy.policyText)) {
        throw new CliError(`依赖策略需要支付，CLI 不执行支付: ${entry.resourceId}/${policyId}`, {
          code: 5,
          details: {
            error: 'DEPENDENCY_PAYMENT_REQUIRED',
            resourceId: entry.resourceId,
            policyId,
          },
          hint: '选择不含 TransactionEvent 的免费策略，或到 Console 完成必要交互后再 publish',
        });
      }
    }
  }
}

export function parsePolicyMapFile(filePath: string): AuthMap {
  if (!fs.existsSync(filePath)) {
    throw new CliError(`policy-map 不存在: ${filePath}`, { code: 4 });
  }
  const rawText = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  let raw: unknown;
  try {
    raw = ext === '.json' ? JSON.parse(rawText) : YAML.parse(rawText);
  } catch (error) {
    throw new CliError('无法解析 policy-map（需 yaml/json）', {
      code: 4,
      details: { cause: error instanceof Error ? error.message : String(error) },
    });
  }
  const parsed = AuthMapSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError('policy-map schema 非法', {
      code: 4,
      details: parsed.error.flatten(),
      hint: 'contracts: [{ resourceId, policyIds: [...] }]',
    });
  }
  return parsed.data;
}

export async function depAuthFromMap(opts: {
  cwd?: string;
  policyMap: string;
  noAutoPull?: boolean;
}): Promise<{
  ok: boolean;
  succeeded: Array<{ resourceId: string; policyId: string }>;
  failed: Array<{ resourceId: string; policyId: string; message: string }>;
}> {
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const mapPath = path.resolve(resolveCwd(opts.cwd), opts.policyMap);
  const map = parsePolicyMapFile(mapPath);
  const versionCfg = tryLoadVersionProject(opts.cwd)?.data || ctx.version;
  const localDeps = (versionCfg?.dependencies || []) as Array<{ resourceId: string }>;
  assertAuthMapMatchesDependencies(map, localDeps);
  await assertPoliciesAreFreeAndEnabled(map);

  const succeeded: Array<{ resourceId: string; policyId: string }> = [];
  const failed: Array<{ resourceId: string; policyId: string; message: string }> = [];

  for (const entry of map.contracts) {
    for (const policyId of entry.policyIds) {
      try {
        await FServiceAPI.Contract.batchCreateContracts(
          buildBatchSignContractsParams({
            licenseeResourceId: ctx.resource.resourceId!,
            subjectId: entry.resourceId,
            policyId,
          }),
        );
        succeeded.push({ resourceId: entry.resourceId, policyId });
      } catch (error) {
        failed.push({
          resourceId: entry.resourceId,
          policyId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (localDeps.length > 0 && failed.length === 0) {
    try {
      const treeEnv = await FServiceAPI.Resource.authTree({
        resourceId: ctx.resource.resourceId!,
        version: versionCfg?.version || ctx.info.latestVersion,
      } as Parameters<typeof FServiceAPI.Resource.authTree>[0]);
      const tree = unwrapData<{ unresolvedDependencies?: unknown[] }>(treeEnv);
      const unresolved = tree?.unresolvedDependencies;
      if (Array.isArray(unresolved) && unresolved.length > 0) {
        throw new CliError('依赖授权未完成', {
          code: 5,
          details: {
            error: 'DEPENDENCY_AUTH_INCOMPLETE',
            unresolvedDependencies: unresolved,
            succeeded,
            consoleHint: `请在 Console 完成依赖签约：资源 ${ctx.resource.resourceId}`,
          },
          hint: '检查 policyIds 是否正确，或打开 Console 依赖页',
        });
      }
    } catch (error) {
      if (error instanceof CliError && error.code === 5) throw error;
      throw new CliError('签约后无法验证依赖授权，不能确认签约成功', {
        code: 5,
        details: {
          error: 'DEPENDENCY_AUTH_UNVERIFIABLE',
          unresolvedDependencies: localDeps,
          cause: error instanceof Error ? error.message : String(error),
        },
        hint: '请在 Console 确认签约状态；CLI 不会执行支付或其他交互',
      });
    }
  }

  if (failed.length > 0) {
    throw new CliError('部分依赖签约失败', {
      code: 5,
      details: {
        error: 'DEPENDENCY_AUTH_INCOMPLETE',
        succeeded,
        failed,
        unresolvedDependencies: failed.map((f) => ({
          resourceId: f.resourceId,
          policyId: f.policyId,
        })),
        consoleHint: `资源 ${ctx.resource.resourceId}`,
      },
      hint: '检查失败项后重试，或在 Console 完成签约',
    });
  }

  return { ok: true, succeeded, failed };
}
