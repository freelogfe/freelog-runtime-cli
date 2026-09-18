import { resolveCwd } from '../../config/project.js';
import {
  loadCollectionProject,
  tryLoadManifest,
  withProjectWriteLockAsync,
  writeCollectionProject,
  type CollectionProject,
} from '../../config/project.js';
import { requireAuth } from '../../core/auth.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import { assertResourceTitle } from '../validation.js';
import { assertResourceTypeCode } from '../typeService.js';
import {
  requireAuthUsername,
  resolveCreateApiResourceTypeName,
  toFullResourceName,
} from '../resourceName.js';
import { hydrateCollectionTypeProperties, resolveCollectionCreateName } from './internal.js';

export async function createCollection(opts: {
  title?: string;
  typeCode?: string;
  resourceTypeName?: string;
  name?: string;
  cwd?: string;
}) {
  assertExplicitEnvForWriteOperation();
  const auth = requireAuth();
  const username = requireAuthUsername(auth.username);

  const cwd = resolveCwd(opts.cwd);
  return withProjectWriteLockAsync(cwd, async () => {
  let local: CollectionProject = {
    resourceName: '',
    resourceType: [],
  };
  if (tryLoadManifest(cwd)) {
    local = loadCollectionProject(cwd).data;
  }
  if (local.resourceId?.trim()) {
    throw cliError(I18N_KEYS.collection_already_exists, { code: 4 });
  }

  const title = (opts.title || local.resourceTitle || local.resourceName || '').trim();
  const typeCode = (opts.typeCode || local.resourceTypeCode || '').trim();
  const resourceTypeName = resolveCreateApiResourceTypeName(typeCode, {
    explicit: opts.resourceTypeName,
    manifest: local.resourceTypeName,
  });
  if (!title) {
    throw cliError(I18N_KEYS.collection_title_required, {
      code: 4,
      hint: '传 --title，或在 freelog.manifest.json 写 resource.title',
    });
  }
  if (!typeCode) {
    throw cliError(I18N_KEYS.naming_convention_resource_type_required, {
      code: 4,
      hint: '传 --type，或在 freelog.manifest.json 写 resource.typeCode',
    });
  }
  assertResourceTitle(title, true);
  await assertResourceTypeCode(typeCode);

  const name = resolveCollectionCreateName({
    explicitName: opts.name,
    localName: local.resourceName,
    title,
  });

  const existing = unwrapData<{
    resourceId?: string;
    resourceName?: string;
    resourceType?: string[];
    resourceTypeCode?: string;
    resourceTypeName?: string;
    resourceTitle?: string;
    userId?: number | string;
    username?: string;
  } | null>(
    await FServiceAPI.Resource.info({
      resourceIdOrName: toFullResourceName(username, name),
    }),
  );
  const existingMatchesIntent =
    existing?.resourceId &&
    existing.resourceName === toFullResourceName(username, name) &&
    existing.resourceTypeCode === typeCode &&
    existing.resourceTitle === title &&
    (existing.userId === undefined || String(existing.userId) === String(auth.userId));
  if (existing && !existingMatchesIntent) {
    throw cliError(I18N_KEYS.resource_name_exist, {
      code: 4,
      params: { authID: toFullResourceName(username, name) },
      hint: '传 --name 指定其他短授权标识',
    });
  }

  const data = existingMatchesIntent
    ? existing
    : unwrapData<{
    resourceId: string;
    resourceName: string;
    resourceType?: string[];
    resourceTypeCode?: string;
    resourceTypeName?: string;
    userId?: number | string;
    username?: string;
      }>(
        await FServiceAPI.Resource.create({
          name,
          subjectType: 4,
          resourceTypeCode: typeCode,
          resourceTypeName,
          resourceTitle: title,
        } as Parameters<typeof FServiceAPI.Resource.create>[0]),
      );

  if (!data?.resourceId) {
    throw cliError(I18N_KEYS.collection_create_missing_resource_id, { code: 1, details: data });
  }

  const next: CollectionProject = {
    ...local,
    resourceId: data.resourceId,
    resourceName: data.resourceName || toFullResourceName(username, name),
    resourceType: data.resourceType || [],
    resourceTypeCode: data.resourceTypeCode || typeCode,
    resourceTypeName: data.resourceTypeName || resourceTypeName,
    resourceTitle: title,
    userId: data.userId ?? auth.userId,
    username: data.username ?? auth.username,
  };
  writeCollectionProject(next, cwd);
  const hydrated = await hydrateCollectionTypeProperties(next);
  writeCollectionProject(hydrated, cwd);
  return hydrated;
  });
}
