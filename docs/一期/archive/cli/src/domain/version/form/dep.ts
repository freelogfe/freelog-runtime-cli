/**
 * 依赖表单：查授权 →（未授权时）列出可签策略并选择 → 签约 → 写稿。
 * 只看 batchAuth 的 isAuth，不查合约；上抛不加；环检测拒；签后不复查。
 * 签约体注意：平台要求 subjects 每项带 subjectType（tools-lib 类型定义已过期）。
 */

import semver from 'semver';
import { CliError } from '../../../core/errors';
import { isInteractive, selectQuestion } from '../../../core/tty';
import { requireAuth } from '../../account/login';
import { readDraft, writeDraft } from '../../../local/draft';
import { resolveIdentity } from '../../../local/resolve';
import { withProjectLock } from '../../../local/lock';
import { FServiceAPI } from '../../../platform/api';
import { assertPlatformAllowed } from '../../env';
import { assertRemoteResourceWritable, resolveBoundIdentity } from '../gates';

export type DepApis = {
  /** 当前工作稿所属资源的详情；与对方详情分开，避免两次 GET 的返回被混淆。 */
  ownInfo?: (params: Record<string, unknown>) => Promise<unknown>;
  batchAuth?: (params: Record<string, unknown>) => Promise<unknown>;
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  sign?: (params: Record<string, unknown>) => Promise<unknown>;
  getVersionListByResourceID?: (params: Record<string, unknown>) => Promise<unknown>;
  cycleDependencyCheck?: (params: Record<string, unknown>) => Promise<unknown>;
};

/** `add` / `range` 可能创建合约，先证明当前工作稿所属资源仍属于当前账号且可写。 */
async function assertCurrentResourceWritable(input: {
  cwd: string;
  identity: { resourceId?: string };
  apis?: DepApis;
}): Promise<string> {
  const auth = requireAuth({ cwd: input.cwd });
  const resourceId = input.identity.resourceId;
  if (!resourceId) {
    throw new CliError('请先 create 或 bind', 'DEP_NEED_SHELL');
  }
  const infoApi = input.apis?.ownInfo
    ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(await infoApi({ resourceIdOrName: resourceId }));
  assertRemoteResourceWritable({
    info,
    resourceId,
    authUserId: auth.userId,
    codes: {
      invalid: 'DEP_CURRENT_INFO_INVALID',
      notOwner: 'DEP_CURRENT_NOT_OWNER',
      frozen: 'DEP_CURRENT_RESOURCE_FROZEN',
    },
  });
  return resourceId;
}

/** 把「信封 data / 裸对象 / 数组 / 布尔」统一成对象，方便各判断取字段。 */
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

/**
 * 从 batchAuth 响应里取目标资源的 isAuth。
 * 列表按 resourceId 命中；平台有时只回一行（此时取 list[0]）。
 * 查不到 / 没有 isAuth 字段 → undefined（调用方视同「未授权，去签」）。
 */
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

/** 资源状态 → 拒加原因文案；正常（status=1）返回 undefined。 */
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

type DependencyTarget = {
  info: Record<string, unknown>;
  resourceId: string;
  latestVersion: string;
};

/**
 * `add` 与 `range` 共享的目标事实：不可信的资源详情不能继续到签约或写稿。
 * `expectedResourceId` 只用于 range：已有条目不允许被平台响应悄悄换成另一资源。
 */
async function loadDependencyTarget(input: {
  resourceIdOrName: string;
  expectedResourceId?: string;
  identity: { resourceId?: string; name?: string };
  apis?: DepApis;
}): Promise<DependencyTarget> {
  const infoApi = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(
    await infoApi({
      resourceIdOrName: input.resourceIdOrName,
      isLoadLatestVersionInfo: 1,
      isLoadPolicyInfo: 1,
    }),
  );
  const resourceId = typeof info.resourceId === 'string' ? info.resourceId.trim() : '';
  if (!resourceId || input.expectedResourceId && resourceId !== input.expectedResourceId) {
    throw new CliError('对方资源信息不完整或与要修改的依赖不一致', 'DEP_TARGET_INVALID');
  }
  const resourceName = typeof info.resourceName === 'string' ? info.resourceName : typeof info.name === 'string' ? info.name : '';
  if (input.identity.resourceId === resourceId || input.identity.name && resourceName === input.identity.name) {
    throw new CliError('不能依赖自己', 'DEP_SELF');
  }
  if (Number(info.subjectType) !== 1) {
    throw new CliError('对方不是普通单资源，不加', 'DEP_NOT_RESOURCE');
  }
  const latestVersion = typeof info.latestVersion === 'string' ? info.latestVersion.trim() : '';
  if (!latestVersion || !semver.valid(latestVersion)) {
    throw new CliError('对方还没有发行版本', 'DEP_NO_VERSION');
  }
  if (info.status === undefined || !Number.isFinite(Number(info.status))) {
    throw new CliError('对方资源信息不完整或状态不可用', 'DEP_TARGET_INVALID');
  }
  const blocked = statusLabel(Number(info.status));
  if (blocked) {
    throw new CliError(blocked, 'DEP_TARGET_STATUS');
  }
  if (Array.isArray(info.baseUpcastResources) && info.baseUpcastResources.length > 0) {
    throw new CliError('对方存在基础上抛，本期不支持。', 'DEP_UPCAST');
  }
  return { info, resourceId, latestVersion };
}

/** 版本列表必须是可解析的完整事实；空 / 畸形 / 不含 latest 时拒绝，不能把范围校验降级为跳过。 */
async function assertDependencyVersionRange(input: {
  resourceId: string;
  latestVersion: string;
  versionRange: string;
  apis?: DepApis;
}): Promise<void> {
  const listApi =
    input.apis?.getVersionListByResourceID ??
    ((params) => FServiceAPI.Resource.getVersionListByResourceID(params as never));
  const list = unwrapData(await listApi({ resourceId: input.resourceId }));
  const rawVersions = list.dataList ?? list.list;
  if (!Array.isArray(rawVersions) || rawVersions.length === 0) {
    throw new CliError('对方版本列表不可用，不能确认依赖范围', 'DEP_VERSION_LIST_INVALID');
  }
  const versions: string[] = [];
  for (const item of rawVersions) {
    const version = typeof item === 'object' && item !== null && typeof (item as { version?: unknown }).version === 'string'
      ? (item as { version: string }).version
      : '';
    if (!version || !semver.valid(version)) {
      throw new CliError('对方版本列表不可用，不能确认依赖范围', 'DEP_VERSION_LIST_INVALID');
    }
    versions.push(version);
  }
  if (!versions.some((version) => semver.eq(version, input.latestVersion))) {
    throw new CliError('对方版本列表不可用，不能确认依赖范围', 'DEP_VERSION_LIST_INVALID');
  }
  if (!semver.validRange(input.versionRange) || !semver.maxSatisfying(versions, input.versionRange)) {
    throw new CliError('这个范围对不上对方已发行的版本', 'DEP_RANGE');
  }
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

/** 交互时列出策略并选择；自动化必须显式提供当前可签的 policyId。 */
async function choosePolicy(input: {
  policies: { policyId: string; policyName?: string }[];
  policyId?: string;
  yes?: boolean;
}): Promise<string> {
  if (input.policies.length === 0) {
    // i18n: cli.dep.no_policy
    throw new CliError('对方没有可签约的策略', 'DEP_NO_POLICY');
  }
  if (input.policyId) {
    if (!input.policies.some((policy) => policy.policyId === input.policyId)) {
      // i18n: cli.dep.policy_invalid
      throw new CliError('指定的策略不在对方当前可签策略列表中', 'DEP_POLICY_INVALID');
    }
    return input.policyId;
  }
  if (input.yes || !isInteractive()) {
    // i18n: cli.dep.policy_required
    throw new CliError('未授权依赖请显式提供 --policy-id', 'DEP_POLICY_REQUIRED');
  }
  return selectQuestion(
    '请选择要签约的策略',
    input.policies.map((policy) => ({
      name: `${policy.policyName ?? '未命名策略'} (${policy.policyId})`,
      value: policy.policyId,
    })),
  );
}

async function signWithSelectedPolicy(input: {
  policies: { policyId: string; policyName?: string }[];
  policyId?: string;
  yes?: boolean;
  targetId: string;
  licenseeId: string;
  sign: (params: Record<string, unknown>) => Promise<unknown>;
}): Promise<void> {
  const policyId = await choosePolicy(input);
  await input.sign({
    subjectType: 1,
    licenseeId: input.licenseeId,
    licenseeIdentityType: 1,
    // 平台校验要求 subjects 每项也带 subjectType（tools-lib 类型定义已过期）
    subjects: [{ subjectId: input.targetId, policyId, subjectType: 1 }],
  });
}

/**
 * 加一条依赖（版本表单 5 / 6 与 `version dep add` 共用）。
 *
 * 流程：门禁校验（自己/合集/未发行/冻结/上抛）→ 版本范围校验（semver 命中对方已发号）
 * → 循环依赖检测 → batchAuth 查授权 → 未授权则选择可签策略并签约 → 写稿。
 *
 * 关键不变量：
 * - 只看 isAuth，不看合约；isAuth 查不到视同未授权。
 * - 签约不挑免费/付费（付费签完是待执行态 authStatus 128，支付在平台侧）；签后不复查。
 * - 写稿只进 { resourceId, versionRange }；上抛 / 排除项恒 []。
 */
export async function depAdd(input: {
  cwd: string;
  resourceId: string;
  versionRange?: string;
  file?: string;
  yes?: boolean;
  policyId?: string;
  apis?: DepApis;
}): Promise<string> {
  return withProjectLock(input.cwd, () => depAddLocked(input), 'version-dep-add');
}

async function depAddLocked(input: {
  cwd: string;
  resourceId: string;
  versionRange?: string;
  file?: string;
  yes?: boolean;
  policyId?: string;
  apis?: DepApis;
}): Promise<string> {
  assertPlatformAllowed();
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const draft = readDraft(input.cwd, identity.n) ?? {
    baseUpcastResources: [] as [],
    authExcludedItems: [] as [],
  };
  const licenseeId = await assertCurrentResourceWritable({ cwd: input.cwd, identity, apis: input.apis });

  const target = await loadDependencyTarget({
    resourceIdOrName: input.resourceId,
    identity,
    apis: input.apis,
  });
  const targetId = target.resourceId;
  const info = target.info;
  const versionRange = input.versionRange ?? `^${target.latestVersion}`;
  await assertDependencyVersionRange({
    resourceId: targetId,
    latestVersion: target.latestVersion,
    versionRange,
    apis: input.apis,
  });

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
    // 未授权：用户选择一条启用策略签约，不区分免费/付费。
    // 付费策略签完是待执行（authStatus 128），支付在平台侧完成；签约后直接写稿，不复查。
    const policies = signablePolicies(info);
    const sign =
      input.apis?.sign ??
      ((params) => FServiceAPI.Contract.batchCreateContracts(params as never));
    await signWithSelectedPolicy({
      policies,
      policyId: input.policyId,
      yes: input.yes,
      targetId,
      licenseeId,
      sign,
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

/** 列稿上依赖（resourceId@range）。 */
export function depList(cwd: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  return (draft?.dependencies ?? [])
    .map((item) => `${item.resourceId}@${item.versionRange ?? '*'}`)
    .join('\n');
}

/** 删一条依赖；稿上没有该依赖报 DEP_NOT_FOUND。 */
export function depRm(cwd: string, resourceId: string, file?: string): string {
  return withProjectLock(cwd, () => depRmLocked(cwd, resourceId, file), 'version-dep-rm');
}

function depRmLocked(cwd: string, resourceId: string, file?: string): string {
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

/** 改某条依赖的版本范围：与 add 同一套校验（范围命中对方发号 → 环检测 → isAuth/选策略签约 → 上抛拒），只改范围不换对象。 */
export async function depRange(
  cwd: string,
  resourceId: string,
  versionRange: string,
  file?: string,
  apis?: DepApis,
  options?: { policyId?: string; yes?: boolean },
): Promise<string> {
  return withProjectLock(cwd, () => depRangeLocked(cwd, resourceId, versionRange, file, apis, options), 'version-dep-range');
}

async function depRangeLocked(
  cwd: string,
  resourceId: string,
  versionRange: string,
  file?: string,
  apis?: DepApis,
  options?: { policyId?: string; yes?: boolean },
): Promise<string> {
  assertPlatformAllowed();
  const identity = resolveBoundIdentity(cwd, file);
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
  const licenseeId = await assertCurrentResourceWritable({ cwd, identity, apis });

  const target = await loadDependencyTarget({
    resourceIdOrName: resourceId,
    expectedResourceId: resourceId,
    identity,
    apis,
  });
  await assertDependencyVersionRange({
    resourceId: target.resourceId,
    latestVersion: target.latestVersion,
    versionRange,
    apis,
  });
  const info = target.info;

  if (identity.resourceId) {
    const cycleApi =
      apis?.cycleDependencyCheck ??
      ((params) => FServiceAPI.Resource.cycleDependencyCheck(params as never));
    const existing = ((draft.dependencies ?? []) as { resourceId?: string; versionRange?: string }[])
      .filter((item) => item.resourceId !== resourceId)
      .map((item) => ({ resourceId: String(item.resourceId), versionRange: String(item.versionRange ?? '*') }));
    const cycle = unwrapData(
      await cycleApi({
        resourceId: identity.resourceId,
        dependencies: [...existing, { resourceId: target.resourceId, versionRange }],
      }),
    );
    if (cycle.ok === false || cycle.data === false) {
      // i18n: cli.dep.cycle
      throw new CliError('添加此依赖会导致循环依赖，无法添加。', 'DEP_CYCLE');
    }
  }

  const batchAuth = apis?.batchAuth ?? ((params) => FServiceAPI.Resource.batchAuth(params as never));
  const firstAuth = unwrapData(await batchAuth({ resourceIds: target.resourceId, versionRanges: versionRange }));
  if (!extractIsAuth(firstAuth, target.resourceId) && identity.resourceId) {
    const policies = signablePolicies(info);
    const sign =
      apis?.sign ?? ((params) => FServiceAPI.Contract.batchCreateContracts(params as never));
    await signWithSelectedPolicy({
      policies,
      policyId: options?.policyId,
      yes: options?.yes,
      targetId: target.resourceId,
      licenseeId,
      sign,
    });
  }

  found.versionRange = versionRange;
  writeDraft(cwd, identity.n, draft);
  return `${target.resourceId}@${versionRange}`;
}
