import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';

export const COLLECTION_LICENSEE_IDENTITY_TYPE = 4 as const;

export type CollectionContractQuery = (params: Record<string, unknown>) => Promise<unknown>;

function unwrapData(value: unknown): unknown {
  return value && typeof value === 'object' && 'data' in value ? (value as { data?: unknown }).data : value;
}

function contractList(value: unknown, code: string): Record<string, unknown>[] {
  const raw = unwrapData(value);
  const items = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as { dataList?: unknown; list?: unknown }).dataList ?? (raw as { list?: unknown }).list)
      : undefined;
  if (!Array.isArray(items)) throw new CliError('平台合同查询返回格式无法识别', code);
  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new CliError('平台合同查询返回格式无法识别', code);
    return item as Record<string, unknown>;
  });
}

function textField(contract: Record<string, unknown>, key: string): string {
  const value = contract[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** 查询并严格核验合集作为乙方对一组单资源目标的生效合同。 */
export async function verifyCollectionResourceContracts(input: {
  collectionId: string;
  subjectIds: string[];
  batchContracts?: CollectionContractQuery;
  responseCode?: string;
}): Promise<{ covered: Set<string>; contracts: Array<{ contractId: string; subjectId: string }> }> {
  const subjectIds = [...new Set(input.subjectIds.filter(Boolean))];
  const covered = new Set<string>();
  if (subjectIds.length === 0) return { covered, contracts: [] };

  const batchContracts =
    input.batchContracts ?? ((params: Record<string, unknown>) => FServiceAPI.Contract.batchContracts(params as never));
  let response: unknown;
  try {
    response = await batchContracts({
      subjectIds: subjectIds.join(','),
      subjectType: 1,
      licenseeId: input.collectionId,
      licenseeIdentityType: COLLECTION_LICENSEE_IDENTITY_TYPE,
      isLoadPolicyInfo: 1,
    });
  } catch (error) {
    if (error instanceof CliError) throw error;
    // 不把未知请求 message/String(error) 提升为可打印的业务错误。
    throw new CliError('合同查询失败：请求失败', input.responseCode ?? 'COLLECTION_CONTRACT_RESPONSE_INVALID');
  }
  const contracts = contractList(response, input.responseCode ?? 'COLLECTION_CONTRACT_RESPONSE_INVALID');
  const valid: Array<{ contractId: string; subjectId: string }> = [];
  for (const contract of contracts) {
    const contractId = textField(contract, 'contractId');
    const subjectId = textField(contract, 'subjectId');
    const licenseeId = textField(contract, 'licenseeId');
    if (
      contractId
      && subjectIds.includes(subjectId)
      && contract.subjectType === 1
      && licenseeId === input.collectionId
      && contract.licenseeIdentityType === COLLECTION_LICENSEE_IDENTITY_TYPE
      && contract.status === 0
    ) {
      covered.add(subjectId);
      valid.push({ contractId, subjectId });
    }
  }
  return { covered, contracts: valid };
}
