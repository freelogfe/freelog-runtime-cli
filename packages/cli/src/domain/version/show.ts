import { CliError } from '../../core/errors';
import { readDraft } from '../../local/draft';
import { resolveIdentity } from '../../local/resolve';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';

export type ShowApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  resourceVersionInfo1?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: Record<string, unknown> };
  return envelope.data ?? (result as Record<string, unknown>);
}

export function showLocal(cwd: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    // i18n: cli.show.no_draft
    throw new CliError('没有本地版本工作稿', 'DRAFT_MISSING');
  }
  const source = draft.fromVersion ? `从 ${draft.fromVersion} 回显` : '首版';
  return [
    `这是本地未提交的版本工作稿（来源：${source}）。不是线上已发号。`,
    JSON.stringify(draft, null, 2),
  ].join('\n');
}

export async function showOnline(input: {
  cwd: string;
  file?: string;
  version?: string;
  homeDir?: string;
  apis?: ShowApis;
}): Promise<string> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveIdentity(input.cwd, input.file);
  if (!identity.resourceId) {
    return '本地还没有 resourceId';
  }
  const draft = readDraft(input.cwd, identity.n);
  const hint = draft
    ? '本地有未提交的版本工作稿，查看请 version show --local\n'
    : '';
  const infoApi =
    input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(
    await infoApi({
      resourceIdOrName: identity.resourceId,
      isLoadLatestVersionInfo: 1,
    }),
  );
  const version = input.version ?? (info.latestVersion ? String(info.latestVersion) : undefined);
  if (!version) {
    return `${hint}线上还没有版本`;
  }
  const versionInfoApi =
    input.apis?.resourceVersionInfo1 ??
    ((params) => FServiceAPI.Resource.resourceVersionInfo1(params as never));
  const versionInfo = unwrapData(
    await versionInfoApi({
      resourceId: identity.resourceId,
      version,
    }),
  );
  return `${hint}${JSON.stringify({ version, ...versionInfo }, null, 2)}`;
}
