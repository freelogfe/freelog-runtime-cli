import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { resolveBoundIdentity } from '../version/gates';

export type ListingApis = {
  update?: (params: Record<string, unknown>) => Promise<unknown>;
};

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
