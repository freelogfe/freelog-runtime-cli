import { loadState, saveCollectionProject, savePlatformCollectionState } from '../../config/project.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { CliError } from '../../core/errors.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import { fetchResourceInfo } from '../sync/index.js';
import { assertResourceTypeCode } from '../typeService.js';
import { assertOptionalConfigAllowed } from '../resourceTypeCapabilities.js';
import { isFrozenStatus } from '../shared/guards/index.js';
import {
  fingerprintCatalogueDraft,
  resolveMergeCatalogueDraft,
} from '../catalogueDraftTracking.js';
import { ensureCollectionSynced } from './owner.js';
import { assertRssManagedContentEditable } from './rssContract.js';
import { fetchDraftItems, hydrateCollectionTypeProperties } from './internal.js';
import { buildCollectionPublishParams, buildCollectionSyncPropertiesParams } from './params.js';
import type { UpdateCollectionParams } from './types.js';
import { assessDeclaredAuthorization } from '../authorizationTree.js';
import { buildConsoleHandoff } from '../../core/consoleUrl.js';
import { getCliEnv } from '../../core/env.js';

export async function collectionPublish(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  dryRun?: boolean;
}): Promise<{
  resourceId: string;
  itemCount: number;
  isMergeCatalogueDraft: number;
  updateCollectionParams?: unknown;
  dryRun?: boolean;
}> {
  if (!opts.dryRun) assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({
    cwd: opts.cwd,
    noAutoPull: opts.noAutoPull,
    readOnly: opts.dryRun,
  });
  assertRssManagedContentEditable(ctx.info, '手工发布合集版本');
  if (isFrozenStatus(ctx.info.status)) {
    throw cliError(I18N_KEYS.resource_frozen_cannot_publish, {
      code: 4,
      details: { status: ctx.info.status },
    });
  }
  const resourceId = ctx.collection.resourceId!;
  const typeInfo = ctx.collection.resourceTypeCode
    ? await assertResourceTypeCode(ctx.collection.resourceTypeCode)
    : undefined;
  assertOptionalConfigAllowed({
    typeInfo,
    customPropertyDescriptors: ctx.collection.customPropertyDescriptors,
  });

  const collectionForPublish = await hydrateCollectionTypeProperties(ctx.collection);
  if (!opts.dryRun) saveCollectionProject(collectionForPublish, opts.cwd);

  const items = await fetchDraftItems(resourceId);
  const state = loadState(opts.cwd, 'collection').data;
  const mergeCatalogueDraft = resolveMergeCatalogueDraft({
    currentItems: items,
    publishedFingerprint: state.collection.cataloguePublishedFingerprint,
  });
  const itemIds = items
    .map((it) => (it as { itemId?: string }).itemId)
    .filter((id): id is string => Boolean(id));

  const params = buildCollectionPublishParams({
    resourceId,
    collection: collectionForPublish,
    mergeCatalogueDraft,
  });

  const collectionDeps = collectionForPublish.dependencies || [];
  const collectionBaseUpcast = collectionForPublish.baseUpcastResources || [];
  if (collectionDeps.length > 0 || collectionBaseUpcast.length > 0) {
    const authHandoff = buildConsoleHandoff({
      id: resourceId,
      kind: 'collection',
      reason: 'DEPENDENCY_AUTH_INCOMPLETE',
      nextCommand: `freelog-cli dep auth --policy-map ./auth-map.yaml --yes --env ${getCliEnv()}`,
    });
    try {
      const assessment = await assessDeclaredAuthorization({
        resourceId,
        version: collectionForPublish.version || ctx.info.latestVersion,
        dependencies: collectionDeps,
        baseUpcastResources: collectionBaseUpcast,
      });
      if (!assessment.resolved) {
        throw cliError(I18N_KEYS.cli_dependency_unauthorized, {
          code: 5,
          details: {
            unresolvedDependencies: assessment.unresolvedDependencies,
            ...authHandoff,
          },
          hint: '请先在 Console 合集发版页完成依赖/上抛授权后重试',
        });
      }
    } catch (error) {
      if (error instanceof CliError && error.code === 5) throw error;
      throw cliError(I18N_KEYS.publish_dep_auth_tree_failed, {
        code: 5,
        details: {
          unresolvedDependencies: [...collectionDeps, ...collectionBaseUpcast],
          ...authHandoff,
          cause: error instanceof Error ? error.message : String(error),
        },
        hint: '请在 Console 中确认合集依赖授权，或修正 manifest collection.dependencies / collection.baseUpcastResources 后重试',
      });
    }
  }

  if (opts.dryRun) {
    return {
      resourceId,
      itemCount: items.length,
      isMergeCatalogueDraft: mergeCatalogueDraft,
      updateCollectionParams: params,
      dryRun: true,
    };
  }

  if (itemIds.length) {
    const authEnv = await FServiceAPI.Resource.getCollectionItemsAuth_Draft({
      resourceId,
      itemIds: itemIds.join(','),
    } as Parameters<typeof FServiceAPI.Resource.getCollectionItemsAuth_Draft>[0]);
    const authData = unwrapData<
      | Array<{ itemId?: string; isAuth?: boolean; authStatus?: number; resourceId?: string }>
      | { dataList?: Array<{ itemId?: string; isAuth?: boolean; authStatus?: number }> }
    >(authEnv);
    const rows = Array.isArray(authData)
      ? authData
      : Array.isArray((authData as { dataList?: unknown[] })?.dataList)
        ? (authData as { dataList: Array<{ itemId?: string; isAuth?: boolean; authStatus?: number }> })
            .dataList
        : [];

    const unresolved = rows.filter((r) => {
      if (typeof r.isAuth === 'boolean') return !r.isAuth;
      if (r.authStatus !== undefined) return Number(r.authStatus) !== 1;
      return false;
    });

    if (unresolved.length) {
      throw cliError(I18N_KEYS.collection_item_auth_incomplete, {
        code: 5,
        details: {
          error: 'DEPENDENCY_AUTH_INCOMPLETE',
          unresolvedDependencies: [],
          unresolvedItems: unresolved,
        },
        hint: '打开 Console 合集发版页完成目录项授权',
      });
    }
  }

  await FServiceAPI.Resource.updateCollection(params);

  const info = await fetchResourceInfo(resourceId);
  const catalogueFingerprint = fingerprintCatalogueDraft(items);
  savePlatformCollectionState({ ...collectionForPublish, ...info }, opts.cwd, {
    catalogueDraft: items,
    catalogueProperty: ctx.collection.display,
    cataloguePublishedFingerprint: catalogueFingerprint,
  }, { remoteWriteConfirmed: true });
  return { resourceId, itemCount: items.length, isMergeCatalogueDraft: mergeCatalogueDraft };
}

/** 维护期保存合集自定义属性（≅ collectionManager version_syncAllProperties） */
export async function collectionSyncProperties(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  dryRun?: boolean;
}): Promise<{
  resourceId: string;
  updateCollectionParams?: UpdateCollectionParams;
  dryRun?: boolean;
}> {
  if (!opts.dryRun) assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({
    cwd: opts.cwd,
    noAutoPull: opts.noAutoPull,
    readOnly: opts.dryRun,
  });
  assertRssManagedContentEditable(ctx.info, '同步合集目录属性');
  const resourceId = ctx.collection.resourceId!;
  const typeInfo = ctx.collection.resourceTypeCode
    ? await assertResourceTypeCode(ctx.collection.resourceTypeCode)
    : undefined;
  assertOptionalConfigAllowed({
    typeInfo,
    customPropertyDescriptors: ctx.collection.customPropertyDescriptors,
  });

  const params = buildCollectionSyncPropertiesParams({
    resourceId,
    collection: ctx.collection,
  });

  if (opts.dryRun) {
    return { resourceId, updateCollectionParams: params, dryRun: true };
  }

  await FServiceAPI.Resource.updateCollection(params);
  return { resourceId };
}
