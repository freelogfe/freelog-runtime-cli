/**
 * policy 领域层：列模板 / 列已有策略 / apply / set on|off。
 * 本期只做免费模板：策略文本含 TransactionEvent 拒收（dep 签约不挑免费/付费，两码事）。
 */

import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { unwrapData } from '../../platform/unwrap';
import { resolveBoundIdentity } from '../version/gates';

export type PolicyApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  policyTemplates?: (params?: Record<string, unknown>) => Promise<unknown>;
  update?: (params: Record<string, unknown>) => Promise<unknown>;
};



/** 列本资源已有策略（id + 名称 + on/off）。 */
export async function listPolicies(input: {
  cwd: string;
  file?: string;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<string> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const infoApi =
    input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(
    await infoApi({
      resourceIdOrName: identity.resourceId,
      isLoadPolicyInfo: 1,
    }),
  );
  const policies = (info.policies as { policyId?: string; policyName?: string; status?: number }[]) ?? [];
  return policies
    .map((item) => `${item.policyId}\t${item.policyName}\t${item.status === 1 ? 'on' : 'off'}`)
    .join('\n');
}

/** 列平台免费策略模板（paid 的过滤掉；付费模板一期不申请）。 */
export async function listPolicyTemplates(input: {
  cwd: string;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<string> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const request =
    input.apis?.policyTemplates ??
    ((params) => FServiceAPI.Policy.policyTemplates(params as never));
  const result = unwrapData(await request({}));
  const list = (result.list as { id?: string; name?: string; paid?: boolean }[])
    ?? (result.dataList as { id?: string; name?: string; paid?: boolean }[])
    ?? [];
  return list
    .filter((item) => !item.paid)
    .map((item) => `${item.id}\t${item.name}`)
    .join('\n');
}

/** 应用策略：--from-file 的文本（或 JSON）以 status=1 加进资源（addPolicies）；含付费事件的文本在命令层被拒。 */
export async function applyPolicy(input: {
  cwd: string;
  file?: string;
  policyName: string;
  policyText: string;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<void> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const update =
    input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  await update({
    resourceId: identity.resourceId,
    addPolicies: [
      {
        policyName: input.policyName,
        policyText: input.policyText,
        status: 1,
      },
    ],
  });
}

/** 策略开关（updatePolicies status 1/0）。已上架资源关到 0 条会被平台拒，错误原样抛。 */
export async function setPolicy(input: {
  cwd: string;
  file?: string;
  policyId: string;
  on?: boolean;
  homeDir?: string;
  apis?: PolicyApis;
}): Promise<void> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const update =
    input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  await update({
    resourceId: identity.resourceId,
    updatePolicies: [
      {
        policyId: input.policyId,
        status: input.on ? 1 : 0,
      },
    ],
  });
}
