import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';

export const COLLECTION_LICENSEE_IDENTITY_TYPE = 4 as const;

export type CollectionContractQuery = (params: Record<string, unknown>) => Promise<unknown>;

function contractList(value: unknown, code: string): Record<string, unknown>[] {
  // SDK未抛错并非成功证明：ret失败/errCode=0仍可沿SDK正常返回。
  const response = value as Record<string, unknown> | null;
  if (!response || typeof response !== 'object' || Array.isArray(response)
    || response.ret !== 0 || response.errCode !== 0 || !Array.isArray(response.data)) {
    throw new CliError('平台合同查询返回格式无法识别', code);
  }
  return response.data.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new CliError('平台合同查询返回格式无法识别', code);
    return item as Record<string, unknown>;
  });
}

function identityField(contract: Record<string, unknown>, key: string): string {
  const value = contract[key];
  // 合同及双方ID是身份，不是展示文本；拒绝坏值，绝不修剪出另一份身份。
  return typeof value === 'string' && value && !/[\s,\p{Cc}\p{Cf}]/u.test(value) ? value : '';
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
    const contractId = identityField(contract, 'contractId');
    const subjectId = identityField(contract, 'subjectId');
    const licenseeId = identityField(contract, 'licenseeId');
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
