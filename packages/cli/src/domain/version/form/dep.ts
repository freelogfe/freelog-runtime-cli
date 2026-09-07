import semver from 'semver';
import { CliError } from '../../../core/errors';
import { readDraft, writeDraft } from '../../../local/draft';
import { resolveIdentity } from '../../../local/resolve';
import { FServiceAPI } from '../../../platform/api';
import { assertPlatformAllowed } from '../../env';

export type DepApis = {
  batchAuth?: (params: Record<string, unknown>) => Promise<unknown>;
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  sign?: (params: Record<string, unknown>) => Promise<unknown>;
  getVersionListByResourceID?: (params: Record<string, unknown>) => Promise<unknown>;
  cycleDependencyCheck?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: Record<string, unknown> | unknown[] | boolean };
  const data = envelope.data ?? result;
  if (Array.isArray(data)) {
    return { list: data };
  }
  if (typeof data === 'boolean') {
    return { ok: data };
  }
  return (data as Record<string, unknown>) ?? {};
}

function extractIsAuth(result: Record<string, unknown>, resourceId: string): boolean | undefined {
  const list = (result.list as Record<string, unknown>[] | undefined)
    ?? (result.dataList as Record<string, unknown>[] | undefined);
  if (Array.isArray(list)) {
    const hit = list.find((item) => item.resourceId === resourceId) ?? list[0];
    if (!hit || hit.isAuth === undefined) {
      return undefined;
    }
    return Boolean(hit.isAuth);
  }
  if (result.isAuth === undefined) {
    return undefined;
  }
  return Boolean(result.isAuth);
}

function statusLabel(status: number): string | undefined {
  if (status === 0) {
    return '对方未发行';
  }
  if (status === 2 || (status & 2) === 2) {
    return '对方已冻结';
  }
  if (status === 4) {
    return '对方已下架';
  }
  return undefined;
}

/** 对方启用的策略（status===1 且有 policyId）。不区分免费/付费。 */
function signablePolicies(info: Record<string, unknown>): { policyId: string; policyName?: string }[] {
  const policies = (info.policies as {
    policyId?: string;
    policyName?: string;
    status?: number;
  }[]) ?? [];
  return policies
    .filter((item) => item.status === 1 && item.policyId)
    .map((item) => ({ policyId: item.policyId!, policyName: item.policyName }));
}

export async function depAdd(input: {
  cwd: string;
  resourceId: string;
  versionRange?: string;
  file?: string;
  yes?: boolean;
  apis?: DepApis;
}): Promise<string> {
  assertPlatformAllowed();
  const identity = resolveIdentity(input.cwd, input.file);
  const draft = readDraft(input.cwd, identity.n) ?? {
    baseUpcastResources: [] as [],
    authExcludedItems: [] as [],
  };

  const infoApi = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(
    await infoApi({
      resourceIdOrName: input.resourceId,
      isLoadLatestVersionInfo: 1,
      isLoadPolicyInfo: 1,
    }),
  );

  const targetId = String(info.resourceId ?? input.resourceId);
  const targetName = String(info.resourceName ?? info.name ?? '');
  if (identity.resourceId && (targetId === identity.resourceId || targetName === `${identity.name}`)) {
    // i18n: cli.dep.self
    throw new CliError('不能依赖自己', 'DEP_SELF');
  }
  if (info.subjectType !== undefined && Number(info.subjectType) !== 1) {
    // i18n: cli.dep.not_resource
    throw new CliError('对方不是普通单资源，不加', 'DEP_NOT_RESOURCE');
  }
  const latestVersion = info.latestVersion ? String(info.latestVersion) : undefined;
  if (!latestVersion) {
    // i18n: cli.dep.no_version
    throw new CliError('对方还没有发行版本', 'DEP_NO_VERSION');
  }
  const status = Number(info.status ?? 1);
  const blocked = statusLabel(status);
  if (blocked) {
    // i18n: cli.dep.target_status
    throw new CliError(blocked, 'DEP_TARGET_STATUS');
  }
  const upcast = info.baseUpcastResources;
  if (Array.isArray(upcast) && upcast.length > 0) {
    // i18n: cli.dep.upcast
    throw new CliError('对方存在基础上抛，本期不支持。', 'DEP_UPCAST');
  }

  let versionRange = input.versionRange ?? `^${latestVersion}`;
  const listApi =
    input.apis?.getVersionListByResourceID ??
    ((params) => FServiceAPI.Resource.getVersionListByResourceID(params as never));
  const list = unwrapData(await listApi({ resourceId: targetId }));
  const versions = (
    (list.dataList as { version?: string }[] | undefined)
    ?? (list.list as { version?: string }[] | undefined)
    ?? []
  )
    .map((item) => item.version)
    .filter((item): item is string => Boolean(item));
  if (versions.length > 0) {
    if (!semver.validRange(versionRange) || !semver.maxSatisfying(versions, versionRange)) {
      // i18n: cli.dep.range_miss
      throw new CliError('这个范围对不上对方已发行的版本', 'DEP_RANGE');
    }
  }

  if (identity.resourceId) {
    const cycleApi =
      input.apis?.cycleDependencyCheck ??
      ((params) => FServiceAPI.Resource.cycleDependencyCheck(params as never));
    const existing = ((draft.dependencies ?? []) as { resourceId?: string; versionRange?: string }[])
      .filter((item) => item.resourceId !== targetId)
      .map((item) => ({ resourceId: String(item.resourceId), versionRange: String(item.versionRange ?? '*') }));
    const cycle = unwrapData(
      await cycleApi({
        resourceId: identity.resourceId,
        dependencies: [...existing, { resourceId: targetId, versionRange }],
      }),
    );
    if (cycle.ok === false || cycle.data === false) {
      // i18n: cli.dep.cycle
      throw new CliError('添加此依赖会导致循环依赖，无法添加。', 'DEP_CYCLE');
    }
  }

  const batchAuth =
    input.apis?.batchAuth ?? ((params) => FServiceAPI.Resource.batchAuth(params as never));
  const firstAuth = unwrapData(
    await batchAuth({
      resourceIds: targetId,
      versionRanges: versionRange,
    }),
  );
  if (!extractIsAuth(firstAuth, targetId)) {
    // 未授权：取对方第一条启用策略直接签约，不区分免费/付费。
    // 付费策略签完是待执行（authStatus 128），支付在平台侧完成；签约后直接写稿，不复查。
    const policies = signablePolicies(info);
    if (policies.length === 0) {
      // i18n: cli.dep.no_policy
      throw new CliError('对方没有可签约的策略', 'DEP_NO_POLICY');
    }
    if (!identity.resourceId) {
      // i18n: cli.dep.need_shell
      throw new CliError('请先 create 或 bind', 'DEP_NEED_SHELL');
    }
    const sign =
      input.apis?.sign ??
      ((params) => FServiceAPI.Contract.batchCreateContracts(params as never));
    await sign({
      subjectType: 1,
      licenseeId: identity.resourceId,
      licenseeIdentityType: 1,
      subjects: [{ subjectId: targetId, policyId: policies[0]!.policyId }],
    });
  }

  const deps = (draft.dependencies ?? []) as Record<string, unknown>[];
  const existing = deps.find((item) => item.resourceId === targetId);
  if (existing) {
    existing.versionRange = versionRange;
  } else {
    deps.push({
      resourceId: targetId,
      versionRange,
    });
  }
  draft.dependencies = deps;
  draft.baseUpcastResources = [];
  draft.authExcludedItems = [];
  writeDraft(input.cwd, identity.n, draft);
  return targetId;
}

export function depList(cwd: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  return (draft?.dependencies ?? [])
    .map((item) => `${item.resourceId}@${item.versionRange ?? '*'}`)
    .join('\n');
}

export function depRm(cwd: string, resourceId: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    // i18n: cli.draft.missing
    throw new CliError('没有工作稿，请先 version draft pull', 'DRAFT_MISSING');
  }
  const next = (draft.dependencies ?? []).filter((item) => item.resourceId !== resourceId);
  if (next.length === (draft.dependencies ?? []).length) {
    // i18n: cli.dep.not_found
    throw new CliError(`稿上没有依赖 ${resourceId}`, 'DEP_NOT_FOUND');
  }
  draft.dependencies = next;
  writeDraft(cwd, identity.n, draft);
  return resourceId;
}

export function depRange(
  cwd: string,
  resourceId: string,
  versionRange: string,
  file?: string,
): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    // i18n: cli.draft.missing
    throw new CliError('没有工作稿，请先 version draft pull', 'DRAFT_MISSING');
  }
  const found = (draft.dependencies ?? []).find((item) => item.resourceId === resourceId);
  if (!found) {
    // i18n: cli.dep.not_found
    throw new CliError(`稿上没有依赖 ${resourceId}`, 'DEP_NOT_FOUND');
  }
  found.versionRange = versionRange;
  writeDraft(cwd, identity.n, draft);
  return `${resourceId}@${versionRange}`;
}
