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
