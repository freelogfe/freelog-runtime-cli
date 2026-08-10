import { CliError } from '../core/errors.js';
import { assertExplicitEnvForWriteOperation } from '../core/command.js';
import { loadVersionProject, saveVersionProject } from '../config/project.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureSynced } from './sync/index.js';
import { assertSemverLike } from './validation.js';
import { resolveCoverImageUrl } from './coverUpload.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import {
  fetchReleasedVersionProperties,
  mergeVersionPropertiesForSync,
} from './versionPropertyService.js';

export async function editReleasedVersion(opts: {
  cwd?: string;
  version: string;
  description?: string;
  videoCover?: string;
  syncProperties?: boolean;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  if (!opts.version?.trim()) {
    throw cliError(I18N_KEYS.missing_version_flag, { code: 4 });
  }
  assertSemverLike(opts.version);

  const hasDescription = opts.description !== undefined;
  const hasVideoCover = opts.videoCover !== undefined;
  const hasSyncProperties = Boolean(opts.syncProperties);
  if (!hasDescription && !hasVideoCover && !hasSyncProperties) {
    throw cliError(I18N_KEYS.version_edit_at_least_one_field, {
      code: 4,
    });
  }

  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;
  const { data: versionCfg } = loadVersionProject(opts.cwd);

  let syncedInputAttrs: Array<{ key: string; value: string }> | undefined;
  let syncedCustomPropertyDescriptors:
    | Array<{
        key: string;
        name: string;
        defaultValue: string;
        type: 'editableText' | 'readonlyText' | 'radio' | 'checkbox' | 'select';
        candidateItems?: string[];
        remark?: string;
      }>
    | undefined;

  if (hasSyncProperties) {
    const platform = await fetchReleasedVersionProperties({
      resourceId,
      version: opts.version,
    });
    const merged = mergeVersionPropertiesForSync({
      platform,
      manifest: versionCfg,
    });
    syncedInputAttrs = merged.inputAttrs;
    syncedCustomPropertyDescriptors = merged.customPropertyDescriptors;
  }

  const params: Parameters<typeof FServiceAPI.Resource.updateResourceVersionInfo>[0] = {
    resourceId,
    version: opts.version,
    inputAttrs: hasSyncProperties ? syncedInputAttrs || [] : [],
    ...(hasDescription ? { description: opts.description } : {}),
    ...(hasVideoCover
      ? { videoCover: await resolveCoverImageUrl(opts.videoCover!, opts.cwd) }
      : {}),
    ...(hasSyncProperties
      ? {
          customPropertyDescriptors: syncedCustomPropertyDescriptors || [],
        }
      : {}),
  };

  const envelope = await FServiceAPI.Resource.updateResourceVersionInfo(params);

  const nextVersionCfg = {
    ...versionCfg,
    ...(hasDescription ? { description: opts.description } : {}),
    ...(hasVideoCover ? { videoCover: params.videoCover as string } : {}),
  };
  if (hasSyncProperties) {
    nextVersionCfg.inputAttrs = syncedInputAttrs?.map((attr) => ({
      key: attr.key,
      value: attr.value,
    }));
    nextVersionCfg.customPropertyDescriptors = syncedCustomPropertyDescriptors?.map((desc) => ({
      type: desc.type,
      key: desc.key,
      name: desc.name,
      defaultValue: desc.defaultValue,
      candidateItems: desc.candidateItems,
      remark: desc.remark,
    }));
  }
  saveVersionProject(nextVersionCfg, opts.cwd);

  return {
    resourceId,
    version: opts.version,
    data: unwrapData(envelope),
    ...(hasSyncProperties
      ? {
          syncedInputAttrKeys: syncedInputAttrs?.map((attr) => attr.key) || [],
        }
      : {}),
  };
}
