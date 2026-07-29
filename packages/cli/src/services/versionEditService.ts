import { CliError } from '../core/errors.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureSynced } from './syncService.js';
import { assertSemverLike } from './validation.js';

export async function editReleasedVersion(opts: {
  cwd?: string;
  version: string;
  description?: string;
  noAutoPull?: boolean;
}) {
  if (!opts.version?.trim()) {
    throw new CliError('缺少 --version', { code: 4 });
  }
  assertSemverLike(opts.version);
  if (opts.description === undefined) {
    throw new CliError('至少提供 --description', { code: 4 });
  }

  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;

  const envelope = await FServiceAPI.Resource.updateResourceVersionInfo({
    resourceId,
    version: opts.version,
    description: opts.description,
  } as Parameters<typeof FServiceAPI.Resource.updateResourceVersionInfo>[0]);

  return {
    resourceId,
    version: opts.version,
    data: unwrapData(envelope),
  };
}
