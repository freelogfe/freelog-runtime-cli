/** version show 领域层：线上号详情 / 本地稿打印，只读。 */

import { CliError } from '../../core/errors';
import { readDraft } from '../../local/draft';
import { resolveIdentity } from '../../local/resolve';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { unwrapData } from '../../platform/unwrap';
import { resolveBoundIdentity } from './gates';

export type ShowApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  resourceVersionInfo1?: (params: Record<string, unknown>) => Promise<unknown>;
};



/** 本地稿 JSON 打印；没稿直接报错。 */
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

/** 线上号详情：默认 latest，--version 指定；带本地稿提示前缀；线上没版本也给出说明。 */
export async function showOnline(input: {
  cwd: string;
  file?: string;
  version?: string;
  homeDir?: string;
  apis?: ShowApis;
}): Promise<string> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const local = resolveIdentity(input.cwd, input.file);
  if (!local.resourceId) {
    return '本地还没有 resourceId';
  }
  const identity = resolveBoundIdentity(input.cwd, input.file);
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
