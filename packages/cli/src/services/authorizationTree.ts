import { FServiceAPI, unwrapData } from '../platform/index.js';

/**
 * 将 Console authTree 与合同状态折叠为直接依赖授权结论。
 * 不能只判断树中“存在 active 合同”：每个 manifest 声明的直接依赖都必须在对应顶层
 * 分组中找到可用授权路径，间接子节点不得替代缺失的直接依赖。
 */
interface AuthTreeContractRef {
  contractId?: string;
  policyId?: string;
}

interface AuthTreeResourceNode {
  resourceId?: string;
  resourceName?: string;
  contracts?: AuthTreeContractRef[];
  children?: unknown;
}

type AuthTreeGroup = AuthTreeResourceNode[];

interface ContractStatus {
  contractId?: string;
  status?: number;
  authStatus?: number;
  subjectId?: string;
  policyId?: string;
}

export interface AuthorizationAssessment {
  resolved: boolean;
  contractIds: string[];
  unresolvedDependencies: unknown[];
}

function collectContractIds(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectContractIds(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const node = value as AuthTreeResourceNode;
  for (const contract of node.contracts || []) {
    if (contract.contractId) output.add(contract.contractId);
  }
  if (node.children) collectContractIds(node.children, output);
  return output;
}

function asAuthTreeGroups(value: unknown): AuthTreeGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((group): group is unknown[] => Array.isArray(group))
    .map((group) => group.filter((node): node is AuthTreeResourceNode => Boolean(node && typeof node === 'object')))
    .filter((group) => group.length > 0);
}

function collectGroups(value: unknown, output: AuthTreeGroup[] = []): AuthTreeGroup[] {
  for (const group of asAuthTreeGroups(value)) {
    output.push(group);
    for (const node of group) collectGroups(node.children, output);
  }
  return output;
}

function groupContractIds(group: AuthTreeGroup): string[] {
  return [
    ...new Set(
      group.flatMap((node) => (node.contracts || []).map((contract) => contract.contractId).filter(Boolean) as string[]),
    ),
  ];
}

function declaredResourceIds(dependencies: unknown[]): string[] {
  return [
    ...new Set(
      dependencies
        .map((dependency) =>
          dependency && typeof dependency === 'object' && 'resourceId' in dependency
            ? String((dependency as { resourceId?: unknown }).resourceId || '')
            : '',
        )
        .filter(Boolean),
    ),
  ];
}

/** 合并 dependencies 与 baseUpcastResources 为 authTree / contracts 预检用的声明列表。 */
export function mergeDeclaredAuthSubjects(
  dependencies?: unknown[],
  baseUpcastResources?: unknown[],
): Array<{ resourceId: string }> {
  const seen = new Set<string>();
  const merged: Array<{ resourceId: string }> = [];
  for (const list of [dependencies, baseUpcastResources]) {
    for (const resourceId of declaredResourceIds(list || [])) {
      if (seen.has(resourceId)) continue;
      seen.add(resourceId);
      merged.push({ resourceId });
    }
  }
  return merged;
}

export interface CollectionItemBaseUpcastAssessment {
  resolved: boolean;
  unresolvedItems: Array<{
    childResourceId: string;
    baseUpcastResourceIds: string[];
    missingSubjectIds: string[];
  }>;
}

interface BatchInfoResourceRow {
  resourceId?: string;
  baseUpcastResources?: Array<{ resourceId?: string }>;
}

function unwrapContractRows(value: unknown): ContractStatus[] {
  const data = unwrapData<unknown>(value);
  if (Array.isArray(data)) return data as ContractStatus[];
  if (data && typeof data === 'object') {
    const row = data as { dataList?: unknown[]; list?: unknown[] };
    if (Array.isArray(row.dataList)) return row.dataList as ContractStatus[];
    if (Array.isArray(row.list)) return row.list as ContractStatus[];
  }
  return [];
}

function isActiveContract(contract: ContractStatus): boolean {
  return Number(contract.status) === 0 && [1, 2, 3].includes(Number(contract.authStatus));
}

async function assessViaLicenseeContracts(
  resourceId: string,
  declaredDependencies: unknown[],
): Promise<AuthorizationAssessment | null> {
  const declaredIds = declaredResourceIds(declaredDependencies);
  if (declaredIds.length === 0) return null;

  const contractEnvelope = await FServiceAPI.Contract.contracts({
    identityType: 1,
    licenseeId: resourceId,
    subjectType: 1,
    licenseeIdentityType: 1,
    limit: 100,
  } as Parameters<typeof FServiceAPI.Contract.contracts>[0]);
  const rows = unwrapContractRows(contractEnvelope);
  if (rows.length === 0) return null;

  const activeSubjectIds = new Set(
    rows.filter(isActiveContract).map((row) => row.subjectId).filter(Boolean) as string[],
  );
  const unresolvedDependencies = declaredIds
    .filter((subjectId) => !activeSubjectIds.has(subjectId))
    .map((subjectId) => ({ reason: 'DECLARED_DEPENDENCY_NOT_AUTHORIZED', resourceId: subjectId }));

  return {
    resolved: unresolvedDependencies.length === 0,
    contractIds: rows
      .filter(isActiveContract)
      .map((row) => row.contractId)
      .filter(Boolean) as string[],
    unresolvedDependencies,
  };
}

/**
 * 对齐 Console FMicroAPP_Authorization / step2_isCompleteAuthorization：
 * dependencies 与 baseUpcastResources 均须完整授权。
 */
export async function assessDeclaredAuthorization(opts: {
  resourceId: string;
  version?: string;
  dependencies?: unknown[];
  baseUpcastResources?: unknown[];
}): Promise<AuthorizationAssessment> {
  const declaredDependencies = mergeDeclaredAuthSubjects(opts.dependencies, opts.baseUpcastResources);
  return assessResourceAuthorization({
    resourceId: opts.resourceId,
    version: opts.version,
    declaredDependencies,
  });
}

/**
 * 对齐 Console FAddResourcesHandleAuth：合集 licensee 对子资源 baseUpcast 须有 contractStatus=0 合同。
 */
export async function assessCollectionItemBaseUpcastAuthorization(opts: {
  collectionId: string;
  childResourceIds: string[];
}): Promise<CollectionItemBaseUpcastAssessment> {
  const childResourceIds = [...new Set(opts.childResourceIds.map((id) => id.trim()).filter(Boolean))];
  if (childResourceIds.length === 0) {
    return { resolved: true, unresolvedItems: [] };
  }

  const batchEnvelope = await FServiceAPI.Resource.batchInfo({
    resourceIds: childResourceIds.join(','),
  } as Parameters<typeof FServiceAPI.Resource.batchInfo>[0]);
  const batchData = unwrapData<BatchInfoResourceRow[] | { dataList?: BatchInfoResourceRow[] }>(
    batchEnvelope,
  );
  const rows = Array.isArray(batchData)
    ? batchData
    : Array.isArray(batchData?.dataList)
      ? batchData.dataList
      : [];

  const allBaseUpcastIds = [
    ...new Set(
      rows.flatMap((row) =>
        (row.baseUpcastResources || [])
          .map((item) => String(item.resourceId || '').trim())
          .filter(Boolean),
      ),
    ),
  ];

  let contractRows: ContractStatus[] = [];
  if (allBaseUpcastIds.length > 0) {
    const contractEnvelope = await FServiceAPI.Contract.batchContracts({
      licenseeId: opts.collectionId,
      subjectIds: allBaseUpcastIds.join(','),
      contractStatus: 0,
    } as Parameters<typeof FServiceAPI.Contract.batchContracts>[0]);
    contractRows = unwrapContractRows(contractEnvelope);
  }

  const authorizedSubjectIds = new Set(
    contractRows.map((row) => row.subjectId).filter(Boolean) as string[],
  );

  const unresolvedItems = rows
    .map((row) => {
      const childResourceId = String(row.resourceId || '').trim();
      if (!childResourceId) return null;
      const baseUpcastResourceIds = (row.baseUpcastResources || [])
        .map((item) => String(item.resourceId || '').trim())
        .filter(Boolean);
      if (baseUpcastResourceIds.length === 0) return null;
      const missingSubjectIds = baseUpcastResourceIds.filter((id) => !authorizedSubjectIds.has(id));
      if (missingSubjectIds.length === 0) return null;
      return { childResourceId, baseUpcastResourceIds, missingSubjectIds };
    })
    .filter(Boolean) as CollectionItemBaseUpcastAssessment['unresolvedItems'];

  return {
    resolved: unresolvedItems.length === 0,
    unresolvedItems,
  };
}

/**
 * 对齐 Console FGraph_Tree_Authorization_Resource：authTree 返回嵌套资源树，
 * 需要提取 contractIds 后再用 batchContracts 的 status/authStatus 判断最终授权。树中的任意 active
 * 合同并不足够：每个 manifest 声明的直接依赖都必须在对应顶层分组有 active 路径；历史失效合同
 * 不应让同组的有效合同误判失败。
 */
export async function assessResourceAuthorization(opts: {
  resourceId: string;
  version?: string;
  declaredDependencies: unknown[];
}): Promise<AuthorizationAssessment> {
  const treeEnvelope = await FServiceAPI.Resource.authTree({
    resourceId: opts.resourceId,
    version: opts.version,
  } as Parameters<typeof FServiceAPI.Resource.authTree>[0]);
  const tree = unwrapData<unknown>(treeEnvelope);

  const groups = collectGroups(tree);
  const contractIds = [...collectContractIds(tree)];
  if (contractIds.length === 0) {
    const viaLicensee = await assessViaLicenseeContracts(opts.resourceId, opts.declaredDependencies);
    if (viaLicensee) return viaLicensee;
    return {
      resolved: opts.declaredDependencies.length === 0,
      contractIds,
      unresolvedDependencies: declaredResourceIds(opts.declaredDependencies).map((resourceId) => ({
        reason: 'DECLARED_DEPENDENCY_NOT_AUTHORIZED',
        resourceId,
      })),
    };
  }

  const contractEnvelope = await FServiceAPI.Contract.batchContracts({
    contractIds: contractIds.join(','),
    projection: 'authStatus,contractId,status',
  } as Parameters<typeof FServiceAPI.Contract.batchContracts>[0]);
  const rows = unwrapContractRows(contractEnvelope);
  const activeIds = new Set(
    rows.filter(isActiveContract).map((contract) => contract.contractId).filter(Boolean) as string[],
  );
  const unresolvedGroups = groups
    .map((group) => {
      const ids = groupContractIds(group);
      return ids.some((contractId) => activeIds.has(contractId))
        ? null
        : {
            reason: ids.length === 0 ? 'DEPENDENCY_HAS_NO_CONTRACT' : 'CONTRACT_NOT_AUTHORIZED',
            resourceIds: [...new Set(group.map((node) => node.resourceId).filter(Boolean) as string[])],
            contractIds: ids,
          };
    })
    .filter(Boolean) as Array<{ reason: string; resourceIds: string[]; contractIds: string[] }>;

  const topLevelGroups = asAuthTreeGroups(tree);
  const missingDeclared = declaredResourceIds(opts.declaredDependencies)
    .filter(
      (resourceId) =>
        !topLevelGroups.some(
          (group) =>
            group.some((node) => node.resourceId === resourceId) &&
            groupContractIds(group).some((contractId) => activeIds.has(contractId)),
        ),
    )
    .map((resourceId) => ({ reason: 'DECLARED_DEPENDENCY_NOT_AUTHORIZED', resourceId }));
  const unresolvedDependencies = [...missingDeclared, ...unresolvedGroups];
  return {
    resolved: unresolvedDependencies.length === 0,
    contractIds,
    unresolvedDependencies,
  };
}
