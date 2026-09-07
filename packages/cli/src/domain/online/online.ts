import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { resolveBoundIdentity } from '../version/gates';

export type ShelfApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  update?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: Record<string, unknown> };
  return envelope.data ?? (result as Record<string, unknown>);
}

async function loadInfo(
  resourceId: string,
  apis?: ShelfApis,
): Promise<Record<string, unknown>> {
  const infoApi = apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  return unwrapData(
    await infoApi({
      resourceIdOrName: resourceId,
      isLoadLatestVersionInfo: 1,
      isLoadPolicyInfo: 1,
    }),
  );
}

export function validateForOnline(info: Record<string, unknown>): void {
  if (!info.latestVersion) {
    // i18n: cli.online.no_version
    throw new CliError('上架须已有版本', 'ONLINE_NO_VERSION');
  }
  const policies = (info.policies as { status?: number }[]) ?? [];
  if (!policies.some((item) => item.status === 1)) {
    // i18n: cli.online.no_policy
    throw new CliError('上架须至少一条启用策略', 'ONLINE_NO_POLICY');
  }
}

export async function onlineResource(input: {
  cwd: string;
  file?: string;
  homeDir?: string;
  apis?: ShelfApis;
}): Promise<void> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const info = await loadInfo(identity.resourceId!, input.apis);
  validateForOnline(info);
  const update =
    input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  await update({
    resourceId: identity.resourceId,
    status: 1,
  });
}

export async function offlineResource(input: {
  cwd: string;
  file?: string;
  homeDir?: string;
  apis?: ShelfApis;
}): Promise<void> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const update =
    input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  await update({
    resourceId: identity.resourceId,
    status: 4,
  });
}
