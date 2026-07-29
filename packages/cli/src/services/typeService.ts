import { CliError } from '../core/errors.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';

export async function assertResourceTypeCode(code: string): Promise<unknown> {
  if (!code?.trim()) {
    throw new CliError('缺少 resourceTypeCode', { code: 4 });
  }
  const envelope = await FServiceAPI.Resource.getResourceTypeInfoByCode({
    code: code.trim(),
  } as Parameters<typeof FServiceAPI.Resource.getResourceTypeInfoByCode>[0]);
  const data = unwrapData<unknown>(envelope);
  if (data === null || data === undefined || data === '') {
    throw new CliError(`未知资源类型 code: ${code}`, {
      code: 4,
      hint: 'freelog-cli 使用平台 resourceTypes 返回的 code',
    });
  }
  return data;
}

export async function listResourceTypes(opts?: {
  codeOrName?: string;
  category?: 1 | 2;
  isMine?: boolean;
  status?: 0 | 1;
  supportCreateBatch?: 1 | 2;
  subjectType?: 1 | 4 | 5;
}) {
  const envelope = await FServiceAPI.Resource.resourceTypes(
    (opts || {}) as Parameters<typeof FServiceAPI.Resource.resourceTypes>[0],
  );
  return unwrapData<unknown>(envelope);
}
