import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { CliError } from '../core/errors.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { loadManifest, tryLoadVersionProject } from '../config/project.js';
import { ensureSynced } from './sync/index.js';
import { ensureOperationContext } from './sync/operationContext.js';
import type { ProjectStore } from './store/types.js';
import { fetchSessionDeclaredAuthSubjects } from './depSessionSources.js';
import { ensureCollectionSynced } from './collection/owner.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { buildConsoleHandoff, type ConsoleHandoff } from '../core/consoleUrl.js';
import { getCliEnv } from '../core/env.js';
import { assessDeclaredAuthorization, mergeDeclaredAuthSubjects } from './authorizationTree.js';

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
      throw cliError(I18N_KEYS.policy_map_undeclared_dep, {
        code: 4,
        params: { resourceId: entry.resourceId },
        hint: '先执行 dep add <resourceId>，或从 policy-map 删除该项',
      });
    }
    if (seenResources.has(entry.resourceId)) {
      throw cliError(I18N_KEYS.policy_map_duplicate_dep, {
        code: 4,
        params: { resourceId: entry.resourceId },
      });
    }
    seenResources.add(entry.resourceId);

    const policyIds = new Set<string>();
    for (const policyId of entry.policyIds) {
      if (policyIds.has(policyId)) {
        throw cliError(I18N_KEYS.policy_map_duplicate_policy, {
          code: 4,
          params: { resourceId: entry.resourceId, policyId },
        });
      }
      policyIds.add(policyId);
    }
  }
}

export function buildBatchSetContractsParams(opts: {
  licenseeResourceId: string;
  subjectId: string;
  policyId: string;
  version: string;
  subjectType?: 1 | 2 | 3;
}): Parameters<typeof FServiceAPI.Resource.batchSetContracts>[0] {
  return {
    resourceId: opts.licenseeResourceId,
    subjects: [
      {
        subjectId: opts.subjectId,
        subjectType: opts.subjectType ?? 1,
        versions: [{ version: opts.version, policyId: opts.policyId, operation: 1 }],
      },
    ] as unknown as Parameters<typeof FServiceAPI.Resource.batchSetContracts>[0]['subjects'],
  };
}

/** @deprecated 仅 createVersion 内嵌 batchSignContracts 使用；dep auth 走 batchSetContracts。 */
export function buildBatchSignContractsParams(opts: {
  licenseeResourceId: string;
  subjectId: string;
  policyId: string;
  subjectType?: 1 | 2 | 3;
}): Parameters<typeof FServiceAPI.Contract.batchCreateContracts>[0] {
  const subjectType = opts.subjectType ?? 1;
  return {
    licenseeId: opts.licenseeResourceId,
    licenseeIdentityType: 1,
    subjectType,
    subjects: [{ subjectId: opts.subjectId, policyId: opts.policyId, subjectType }] as unknown as Parameters<
      typeof FServiceAPI.Contract.batchCreateContracts
    >[0]['subjects'],
  };
}

async function resolveDependencyApplyVersion(resourceId: string): Promise<string> {
  const resource = unwrapData<{ latestVersion?: string | null }>(
    await FServiceAPI.Resource.info({
      resourceIdOrName: resourceId,
      isLoadPolicyInfo: 0,
    }),
  );
  const latest = resource?.latestVersion?.trim();
  if (!latest) {
    throw cliError(I18N_KEYS.cli_dependency_unauthorized, {
      code: 4,
      params: { resourceId },
      hint: '依赖资源须先 publish 并产生 latestVersion，再执行 dep auth',
    });
  }
  return latest;
}

async function assertPoliciesAreFreeAndEnabled(
  map: AuthMap,
  handoff: Omit<ConsoleHandoff, 'reason'>,
): Promise<void> {
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
        throw cliError(I18N_KEYS.dep_policy_not_found, {
          code: 5,
          params: { resourceId: entry.resourceId, policyId },
          hint: '执行 dep auth 前先用 Console 或资源 API 确认 policyId',
        });
      }
      if (Number(policy.status) !== 1) {
        throw cliError(I18N_KEYS.dep_policy_not_enabled, {
          code: 5,
          params: { resourceId: entry.resourceId, policyId },
          hint: '请让资源作者启用该策略，或选择已启用的免费策略',
        });
      }
      if (!policy.policyText) {
        throw cliError(I18N_KEYS.dep_policy_payment_unknown, {
          code: 5,
          params: { resourceId: entry.resourceId, policyId },
          details: {
            error: 'DEPENDENCY_POLICY_UNVERIFIABLE',
            reason: 'DEPENDENCY_POLICY_UNVERIFIABLE',
            resourceId: entry.resourceId,
            policyId,
            ...handoff,
          },
          hint: `请在 Console 查看策略并完成必要交互；CLI 不会执行支付：${handoff.actionUrl}`,
        });
      }
      if (isPaymentPolicy(policy.policyText)) {
        throw cliError(I18N_KEYS.dep_policy_payment_required, {
          code: 5,
          params: { resourceId: entry.resourceId, policyId },
          details: {
            error: 'DEPENDENCY_PAYMENT_REQUIRED',
            reason: 'DEPENDENCY_PAYMENT_REQUIRED',
            resourceId: entry.resourceId,
            policyId,
            ...handoff,
          },
          hint: `选择免费策略，或到 Console 完成支付/签约后再重试：${handoff.actionUrl}`,
        });
      }
    }
  }
}

export function parsePolicyMapFile(filePath: string): AuthMap {
  if (!fs.existsSync(filePath)) {
    throw cliError(I18N_KEYS.policy_map_not_found, {
      code: 4,
      params: { path: filePath },
    });
  }
  const rawText = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  let raw: unknown;
  try {
    raw = ext === '.json' ? JSON.parse(rawText) : YAML.parse(rawText);
  } catch (error) {
    throw cliError(I18N_KEYS.policy_map_parse_failed, {
      code: 4,
      details: { cause: error instanceof Error ? error.message : String(error) },
    });
  }
  const parsed = AuthMapSchema.safeParse(raw);
  if (!parsed.success) {
    throw cliError(I18N_KEYS.policy_map_schema_invalid, {
      code: 4,
      details: parsed.error.flatten(),
      hint: 'contracts: [{ resourceId, policyIds: [...] }]',
    });
  }
  return parsed.data;
}

export async function depAuthFromMap(opts: {
  store: ProjectStore;
  policyMap: string;
  noAutoPull?: boolean;
  /** 会话模式：读 resourceVersionInfo1 的目标已发版；默认 latestVersion */
  version?: string;
}): Promise<{
  ok: boolean;
  succeeded: Array<{ resourceId: string; policyId: string }>;
  failed: Array<{ resourceId: string; policyId: string; message: string }>;
}> {
  const store = opts.store;
  const mapPath = path.resolve(store.rootDir(), opts.policyMap);
  const map = parsePolicyMapFile(mapPath);

  let subject: 'resource' | 'collection';
  let licenseeResourceId: string | undefined;
  let localDeps: Array<{ resourceId: string }> = [];
  let localBaseUpcast: Array<{ resourceId: string }> = [];
  let authTreeVersion: string | undefined;

  if (store.mode() === 'session') {
    subject = 'resource';
    await ensureOperationContext({ store, noAutoPull: opts.noAutoPull });
    licenseeResourceId = store.resolveResourceId();
    if (!licenseeResourceId) {
      throw cliError(I18N_KEYS.session_resource_id_required, { code: 4 });
    }
    const declared = await fetchSessionDeclaredAuthSubjects({
      resourceId: licenseeResourceId,
      version: opts.version,
    });
    localDeps = declared.dependencies;
    localBaseUpcast = declared.baseUpcastResources;
    authTreeVersion = declared.authTreeVersion;
  } else {
    const projectCwd = store.rootDir();
    subject = loadManifest(projectCwd).data.subject;
    const collectionCtx =
      subject === 'collection'
        ? await ensureCollectionSynced({ cwd: projectCwd, noAutoPull: opts.noAutoPull })
        : null;
    const resourceCtx = collectionCtx
      ? null
      : await ensureSynced({ store, noAutoPull: opts.noAutoPull });
    const versionCfg = resourceCtx
      ? tryLoadVersionProject(projectCwd)?.data || resourceCtx.version
      : undefined;
    localDeps = (collectionCtx?.collection.dependencies || versionCfg?.dependencies || []) as Array<{
      resourceId: string;
    }>;
    localBaseUpcast = (collectionCtx?.collection.baseUpcastResources ||
      versionCfg?.baseUpcastResources ||
      []) as Array<{ resourceId: string }>;
    licenseeResourceId = collectionCtx?.collection.resourceId || resourceCtx?.resource.resourceId;
    authTreeVersion =
      collectionCtx?.collection.version ||
      collectionCtx?.info.latestVersion ||
      versionCfg?.version ||
      resourceCtx?.info.latestVersion;
  }

  const declaredAuthSubjects = mergeDeclaredAuthSubjects(localDeps, localBaseUpcast);
  assertAuthMapMatchesDependencies(map, declaredAuthSubjects);
  if (!licenseeResourceId) {
    throw cliError(
      subject === 'collection' ? I18N_KEYS.no_collection_resource_id : I18N_KEYS.no_local_resource_id,
      { code: 4 },
    );
  }
  const env = getCliEnv();
  const policyMapArg = /\s/.test(opts.policyMap) ? JSON.stringify(opts.policyMap) : opts.policyMap;
  const nextCommand = `freelog-cli dep auth --policy-map ${policyMapArg} --yes --env ${env}`;
  const consoleHandoff = buildConsoleHandoff({
    id: licenseeResourceId,
    kind: subject,
    reason: 'DEPENDENCY_AUTH_INCOMPLETE',
    nextCommand,
    env,
  });
  const consoleUrls: Omit<ConsoleHandoff, 'reason'> = {
    actionUrl: consoleHandoff.actionUrl,
    contractsUrl: consoleHandoff.contractsUrl,
    nextCommand: consoleHandoff.nextCommand,
  };

  // Console 可能已经完成付费或复杂签约。先验证平台最终授权状态，
  // 已全部解决时直接幂等成功，避免重新按策略正文进入支付接力循环。
  if (declaredAuthSubjects.length > 0) {
    try {
      const assessment = await assessDeclaredAuthorization({
        resourceId: licenseeResourceId,
        version: authTreeVersion,
        dependencies: localDeps,
        baseUpcastResources: localBaseUpcast,
      });
      if (assessment.resolved) {
        return { ok: true, succeeded: [], failed: [] };
      }
    } catch {
      // 预检不可达时继续执行既有免费签约流程，并在签约后做强制验证。
    }
  }
  await assertPoliciesAreFreeAndEnabled(map, consoleUrls);

  const succeeded: Array<{ resourceId: string; policyId: string }> = [];
  const failed: Array<{ resourceId: string; policyId: string; message: string }> = [];

  for (const entry of map.contracts) {
    const applyVersion = await resolveDependencyApplyVersion(entry.resourceId);
    for (const policyId of entry.policyIds) {
      try {
        await FServiceAPI.Contract.batchCreateContracts(
          buildBatchSignContractsParams({
            licenseeResourceId,
            subjectId: entry.resourceId,
            policyId,
          }),
        );
        try {
          await FServiceAPI.Resource.batchSetContracts(
            buildBatchSetContractsParams({
              licenseeResourceId,
              subjectId: entry.resourceId,
              policyId,
              version: applyVersion,
            }),
          );
        } catch {
          // 首版发行前 authTree/resolveResources 可能为空，batchSet 会报 invalidVersions；
          // batchCreate 已建合同时由 assessResourceAuthorization 的 contracts 回退验证。
        }
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

  if (declaredAuthSubjects.length > 0 && failed.length === 0) {
    try {
      const assessment = await assessDeclaredAuthorization({
        resourceId: licenseeResourceId,
        version: authTreeVersion,
        dependencies: localDeps,
        baseUpcastResources: localBaseUpcast,
      });
      if (!assessment.resolved) {
        throw cliError(I18N_KEYS.dep_auth_incomplete, {
          code: 5,
          details: {
            error: 'DEPENDENCY_AUTH_INCOMPLETE',
            reason: 'DEPENDENCY_AUTH_INCOMPLETE',
            unresolvedDependencies: assessment.unresolvedDependencies,
            succeeded,
            ...consoleUrls,
          },
          hint: `检查 policyIds，或在 Console 完成签约后执行：${nextCommand}\n${consoleUrls.actionUrl}`,
        });
      }
    } catch (error) {
      if (error instanceof CliError && error.code === 5) throw error;
      throw cliError(I18N_KEYS.dep_auth_verify_failed, {
        code: 5,
        details: {
          error: 'DEPENDENCY_AUTH_UNVERIFIABLE',
          reason: 'DEPENDENCY_AUTH_UNVERIFIABLE',
          unresolvedDependencies: declaredAuthSubjects,
          cause: error instanceof Error ? error.message : String(error),
          ...consoleUrls,
        },
        hint: `请在 Console 确认签约状态后重试；CLI 不会执行支付：${consoleUrls.actionUrl}`,
      });
    }
  }

  if (failed.length > 0) {
    throw cliError(I18N_KEYS.dep_sign_partial_failed, {
      code: 5,
      details: {
        error: 'DEPENDENCY_AUTH_INCOMPLETE',
        reason: 'DEPENDENCY_SIGN_PARTIAL_FAILED',
        succeeded,
        failed,
        unresolvedDependencies: failed.map((f) => ({
          resourceId: f.resourceId,
          policyId: f.policyId,
        })),
        ...consoleUrls,
      },
      hint: `检查失败项，或在 Console 完成签约后执行：${nextCommand}\n${consoleUrls.actionUrl}`,
    });
  }

  return { ok: true, succeeded, failed };
}
