import type { ArtifactMode, RuntimeVersion } from '../../config/project/types.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { createResource } from '../resourceService.js';
import type { ProjectStore } from '../store/types.js';
import { computeBumpedVersion, publishVersion, type PublishResult } from './publishVersion.js';

export async function createThenPublish(opts: {
  store: ProjectStore;
  title?: string;
  typeCode?: string;
  name?: string;
  resourceTypeName?: string;
  file?: string;
  version?: string;
  bump?: boolean;
  description?: string;
  videoCover?: string;
  artifactMode?: ArtifactMode;
  runtime?: RuntimeVersion;
  noAutoPull?: boolean;
  dryRun?: boolean;
  debug?: boolean;
}): Promise<PublishResult> {
  if (opts.store.resolveResourceId()) {
    throw cliError(I18N_KEYS.session_first_publish_no_resource_id, {
      code: 4,
      hint: '已有 resourceId 时请走 applySessionPublishIntent + publishVersion',
    });
  }
  if (!opts.file?.trim()) {
    throw cliError(I18N_KEYS.session_first_publish_file_required, { code: 4 });
  }
  if (!opts.title?.trim()) {
    throw cliError(I18N_KEYS.naming_convention_resource_title_required, { code: 4 });
  }
  if (!opts.typeCode?.trim()) {
    throw cliError(I18N_KEYS.naming_convention_resource_type_required, { code: 4 });
  }

  await createResource({
    store: opts.store,
    title: opts.title,
    typeCode: opts.typeCode,
    name: opts.name,
    resourceTypeName: opts.resourceTypeName,
  });

  const version = opts.bump
    ? computeBumpedVersion(undefined)
    : (opts.version?.trim() || '1.0.0');

  opts.store.saveVersion({
    version,
    filePath: opts.file.trim(),
    description: opts.description,
    videoCover: opts.videoCover,
    artifactMode: opts.artifactMode,
    runtimeVersion: opts.runtime,
    dependencies: [],
    authExcludedItems: [],
  });

  return publishVersion({
    store: opts.store,
    noAutoPull: opts.noAutoPull,
    dryRun: opts.dryRun,
    debug: opts.debug,
  });
}
