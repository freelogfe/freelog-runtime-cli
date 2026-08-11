import { FServiceAPI, unwrapData } from '../platform/index.js';

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
 * 对齐 Console FGraph_Tree_Authorization_Resource：authTree 返回嵌套资源树，
 * 需要提取 contractIds 后再用 batchContracts 的 status/authStatus 判断最终授权。
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
      unresolvedDependencies: opts.declaredDependencies,
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
