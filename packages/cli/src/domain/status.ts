/** status 领域层：本地身份、工作稿、线上 latest 三段一览；只读不写。 */

import { listIdentities } from '../local/identity';
import { readDraft } from '../local/draft';
import { resolveIdentity } from '../local/resolve';
import { FServiceAPI } from '../platform/api';
import { assertPlatformAllowed } from './env';
import { requireAuth } from './account/login';

export type StatusApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};

/** status 输出：本地身份 + 工作稿有无 + 线上 latest（有 resourceId 才打平台，本地查询不打）。 */
export async function statusProject(input: {
  cwd: string;
  file?: string;
  homeDir?: string;
  apis?: StatusApis;
}): Promise<string> {
  const identities = listIdentities(input.cwd);
  const local = identities.length
    ? resolveIdentity(input.cwd, input.file)
    : undefined;
  const draft = local ? readDraft(input.cwd, local.n) : undefined;

  let online = '未查询';
  if (local?.resourceId) {
    assertPlatformAllowed();
    requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
    const infoApi =
      input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
    const result = await infoApi({
      resourceIdOrName: local.resourceId,
      isLoadLatestVersionInfo: 1,
    });
    const data = (result as { data?: Record<string, unknown> }).data ?? result;
    const rec = data as Record<string, unknown>;
    online = `resourceId=${rec.resourceId ?? local.resourceId} latestVersion=${rec.latestVersion ?? '无'}`;
  }

  return [
    `本地：${local ? `${local.n}.json ${local.name} ${local.typeCode} ${local.filePath ?? ''}` : '无'}`,
    `工作稿：${draft ? '有' : '无'}`,
    `线上：${online}`,
  ].join('\n');
}
