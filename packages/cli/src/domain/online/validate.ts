/** 上架预检：逐条检查并返回结果列表，validate --for online 与 online 共用。 */

import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { resolveBoundIdentity } from '../version/gates';
import { validateForOnline, type ShelfApis } from './online';

/** 上架预检：与 online 同一套门禁但不落动作，输出「可以上架」或抛具体错误。 */
export async function validateOnline(input: {
  cwd: string;
  file?: string;
  forTarget?: string;
  homeDir?: string;
  apis?: ShelfApis;
}): Promise<string> {
  if (input.forTarget !== 'online') {
    // i18n: cli.validate.for_online
    throw new CliError('目前只支持 --for online', 'VALIDATE_FOR');
  }
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const infoApi =
    input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const result = await infoApi({
    resourceIdOrName: identity.resourceId,
    isLoadLatestVersionInfo: 1,
    isLoadPolicyInfo: 1,
  });
  const data = ((result as { data?: Record<string, unknown> }).data ?? result) as Record<string, unknown>;
  validateForOnline(data);
  return '可以上架';
}
