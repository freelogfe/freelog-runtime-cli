import { CliError } from '../../core/errors';

/** addPolicies 没有幂等键；同名读回不能证明超时的这一次写入成功。 */
export function policyCreateResultUnknown(subject: '资源' | '合集', cause?: unknown): CliError {
  const reason = cause instanceof Error && cause.message.trim() ? `；原始错误：${cause.message.trim()}` : '';
  const listCommand = subject === '合集' ? 'collection policy list' : 'policy list';
  return new CliError(
    `${subject}策略创建结果未知${reason}。请先用 ${listCommand} 核对线上策略，确认后再决定是否重试`,
    'POLICY_CREATE_RESULT_UNKNOWN',
  );
}

export type MutablePolicy = { policyId: string; policyName: string; policyText?: string; status: number };

/** 创建只有成功响应加读回才能确认；失败响应绝不由同名读回推断成功。 */
export async function appendPolicy(input: {
  subject: '资源' | '合集';
  resourceId: string;
  policyName: string;
  policyText: string;
  update: (payload: Record<string, unknown>) => Promise<unknown>;
  read: () => Promise<MutablePolicy[]>;
}): Promise<void> {
  try {
    await input.update({
      resourceId: input.resourceId,
      addPolicies: [{ policyName: input.policyName, policyText: encodeURIComponent(input.policyText), status: 1 }],
    });
  } catch (cause) {
    throw policyCreateResultUnknown(input.subject, cause);
  }
  try {
    const after = await input.read();
    if (!after.some((item) => item.policyName === input.policyName && item.status === 1)) {
      throw new Error('创建后未读回同名启用策略');
    }
  } catch (cause) {
    throw policyCreateResultUnknown(input.subject, cause);
  }
}

/** policyId 是稳定身份；启停读回可据此判断最终状态，包括写入超时后的幂等结果。 */
export async function togglePolicy(input: {
  resourceId: string;
  policyId: string;
  on: boolean;
  resourceStatus: number;
  policies: MutablePolicy[];
  update: (payload: Record<string, unknown>) => Promise<unknown>;
  read: () => Promise<MutablePolicy[]>;
  verifyCode: string;
  subject: '资源' | '合集';
}): Promise<void> {
  const chosen = input.policies.find((item) => item.policyId === input.policyId);
  if (!chosen) throw new CliError(`指定策略不属于当前${input.subject}`, 'POLICY_NOT_FOUND');
  if (!input.on && input.resourceStatus === 1 && chosen.status === 1 && input.policies.filter((item) => item.status === 1).length <= 1) {
    throw new CliError(`上架${input.subject}至少保留一条启用策略`, 'POLICY_LAST_ENABLED');
  }
  const desired = input.on ? 1 : 0;
  if (chosen.status === desired) return;
  const verify = async () => (await input.read()).find((item) => item.policyId === chosen.policyId)?.status === desired;
  try {
    await input.update({ resourceId: input.resourceId, updatePolicies: [{ policyId: chosen.policyId, status: desired }] });
  } catch (cause) {
    try { if (await verify()) return; } catch { /* 原始写入错误更有诊断价值。 */ }
    throw cause;
  }
  if (!await verify()) throw new CliError(`${input.subject}策略启停后读回不一致`, input.verifyCode);
}
