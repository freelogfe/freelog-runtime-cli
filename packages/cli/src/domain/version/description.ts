import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { resolveBoundIdentity } from './gates';

export type DescriptionApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  updateResourceVersionInfo?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: Record<string, unknown> };
  return envelope.data ?? (result as Record<string, unknown>);
}

export async function updateOnlineDescription(input: {
  cwd: string;
  file?: string;
  version?: string;
  description?: string;
  homeDir?: string;
  apis?: DescriptionApis;
}): Promise<string> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const infoApi =
    input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(
    await infoApi({
      resourceIdOrName: identity.resourceId,
      isLoadLatestVersionInfo: 1,
    }),
  );
  if (!info.latestVersion) {
    // i18n: cli.description.no_version
    throw new CliError(
      '还没有发行版本。请先按发行版本 create-version 提交资源文件。',
      'DESCRIPTION_NO_VERSION',
    );
  }
  const version = input.version ?? String(info.latestVersion);
  const update =
    input.apis?.updateResourceVersionInfo ??
    ((params) => FServiceAPI.Resource.updateResourceVersionInfo(params as never));
  await update({
    resourceId: identity.resourceId,
    version,
    description: input.description ?? '',
    inputAttrs: [],
  });
  return version;
}
