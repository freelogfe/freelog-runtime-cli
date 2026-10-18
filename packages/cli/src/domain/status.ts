/** status 领域层：本地身份、工作稿、线上 latest 三段一览；只读不写。 */

import semver from 'semver';
import { CliError } from '../core/errors';
import { readDraft } from '../local/draft';
import { resolveIdentity } from '../local/resolve';
import { FServiceAPI } from '../platform/api';
import { assertPlatformAllowed } from './env';
import { requireAuth } from './account/login';
import { resolveBoundIdentity } from './version/gates';

export type StatusApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 缓存仅选择目标，不能补造详情身份或把缺字段解释成“尚无版本”。 */
function confirmedOnlineStatus(result: unknown, resourceId: string): string {
  if (!record(result) || result.ret !== 0 || result.errCode !== 0 || !record(result.data)) {
    // i18n: cli.status.response_invalid
    throw new CliError('平台详情响应不是成功信封或缺少有效对象，无法确认线上现状', 'STATUS_RESPONSE_INVALID');
  }
  const data = result.data;
  if (typeof data.resourceId !== 'string' || data.resourceId !== resourceId) {
    // i18n: cli.status.id_mismatch
    throw new CliError('平台详情缺少或不匹配 resourceId，无法确认线上现状', 'STATUS_ID_MISMATCH');
  }
  const latest = data.latestVersion;
  if (typeof latest !== 'string' || (latest !== '' && !semver.valid(latest))) {
    // i18n: cli.status.latest_invalid
    throw new CliError('平台详情缺少有效 latestVersion，无法确认线上现状', 'STATUS_LATEST_INVALID');
  }
  return `resourceId=${data.resourceId} latestVersion=${latest === '' ? '无' : latest}`;
}

/** status 输出：本地身份 + 工作稿有无 + 线上 latest（有 resourceId 才打平台，本地查询不打）。 */
export async function statusProject(input: {
  cwd: string;
  file?: string;
  homeDir?: string;
  apis?: StatusApis;
}): Promise<string> {
  const local = resolveIdentity(input.cwd, input.file);
  const draft = readDraft(input.cwd, local.n);

  let online = '未查询';
  if (local?.resourceId) {
    assertPlatformAllowed();
    requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
    // status 虽然只读，也不能把 dev/test 身份拿到另一环境查询。
    resolveBoundIdentity(input.cwd, input.file);
    const infoApi =
      input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
    let result: unknown;
    try {
      result = await infoApi({ resourceIdOrName: local.resourceId, isLoadLatestVersionInfo: 1 });
    } catch (error) {
      // 不读取未知 HTTP 异常的字段、message/cause 或 toJSON；只读失败不触发恢复或重试。
      if (error instanceof CliError) throw error;
      // i18n: cli.status.request_failed
      throw new CliError('请求失败，无法确认线上现状', 'STATUS_REQUEST_FAILED');
    }
    online = confirmedOnlineStatus(result, local.resourceId);
  }

  return [
    `本地：${local.n}.json ${local.name ?? ''} ${local.typeCode} ${local.filePath ?? ''}`,
    `工作稿：${draft ? '有' : '无'}`,
    `线上：${online}`,
  ].join('\n');
}
