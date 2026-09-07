/** listing 更新：title/intro/cover/tags 的 PUT。--yes 且无 flag = 拒绝空更新；不带 status。 */

import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { resolveBoundIdentity } from '../version/gates';

export type ListingApis = {
  update?: (params: Record<string, unknown>) => Promise<unknown>;
};

/** 只更新给了的 listing 字段（PUT /v2/resources/{id}）；status 永不携带，上下架走 shelf 命令。 */
export async function updateListing(input: {
  cwd: string;
  file?: string;
  title?: string;
  intro?: string;
  cover?: string;
  tags?: string;
  yes?: boolean;
  homeDir?: string;
  apis?: ListingApis;
}): Promise<Record<string, unknown>> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  if (input.yes && !input.title && !input.intro && !input.cover && !input.tags) {
    // i18n: cli.update.no_flags
    throw new CliError('--yes 且无修改项，拒绝空更新', 'UPDATE_NO_FLAGS');
  }
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const payload: Record<string, unknown> = {
    resourceId: identity.resourceId,
  };
  if (input.title) payload.resourceTitle = input.title;
  if (input.intro) payload.intro = input.intro;
  if (input.cover) payload.coverImages = [input.cover];
  if (input.tags) payload.tags = input.tags.split(',').map((item) => item.trim());
  if ('status' in payload) {
    delete payload.status;
  }
  const update =
    input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  await update(payload);
  return payload;
}
