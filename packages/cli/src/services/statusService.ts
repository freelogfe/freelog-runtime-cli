import { getCliEnv, getApiBaseURL } from '../core/env.js';
import { getCurrentAuth } from '../core/auth.js';
import { findProjectFilePath } from '../config/project.js';
import {
  tryLoadCollectionProject,
  tryLoadResourceProject,
  tryLoadVersionProject,
} from '../config/project.js';
import { fingerprint, toDraftData } from '../adapters/versionDraftAdapter.js';
import {
  fingerprintCollectionDraft,
  toCollectionDraftData,
  type CollectionVersionDraftData,
} from '../adapters/collectionVersionDraftAdapter.js';
import { lookRemoteVersionDraft } from './draftService.js';
import { fetchResourceInfo, ownersMatch } from './sync/index.js';

export type DraftAdvice =
  | 'pull_or_force_push_or_discard'
  | 'draft_conflict'
  | 'draft_pull'
  | 'draft_push'
  | null;

export interface DraftSyncState {
  lastFingerprint: string;
  lastRemoteUpdateDate?: string | null;
  dirty: boolean;
}

export interface PlatformFormDraftState {
  exists: boolean;
  updateDate?: string | null;
  version?: string | null;
  fingerprint?: string | null;
}

export interface StatusPayload {
  ok: true;
  environment: string;
  apiBaseURL: string;
  loggedIn: boolean;
  auth: {
    username: string | null;
    userId: string | number | null;
    environment: string;
  } | null;
  owner: {
    username: string | null;
    userId: string | number | null;
    matchLogin: boolean | null;
  } | null;
  sync: 'unknown' | 'ok' | 'behind';
  platform: {
    resourceId: string;
    latestVersion: string | null;
    status: number | null;
    enabledPolicyCount: number;
  } | null;
  platformVersionDraft: PlatformFormDraftState | null;
  localDraftSync: DraftSyncState | null;
  draftAdvice: DraftAdvice;
  draftAdviceHint: string | null;
  local: {
    resourceId: string | null;
    version: string | null;
    runtimeVersion: string | null;
    filePath: string | null;
  };
  collection: {
    resourceId: string | null;
    itemCount: number;
    hasCollectRules: boolean;
    rssFeedUrl: string | null;
    draftSync: DraftSyncState | null;
    platformFormDraftExists: boolean | null;
    platformFormDraft: PlatformFormDraftState | null;
    draftAdvice: DraftAdvice;
    draftAdviceHint: string | null;
  } | null;
  configs: {
    resource: string | null;
    version: string | null;
    collection: string | null;
  };
}

function resolveDraftAdvice(opts: {
  platformDraft: PlatformFormDraftState | null;
  localDraftSync: DraftSyncState | null;
  hasVersionCfg: boolean;
  remoteExistsNoSyncHint: string;
  conflictHint: string;
  pullHint: string;
  pushHint: string;
  noVersionHint: string;
}): { advice: DraftAdvice; hint: string | null } {
  const { platformDraft, localDraftSync } = opts;
  const syncMeta = localDraftSync;
  const localDirty = Boolean(localDraftSync?.dirty);
  const remoteDirty = Boolean(
    platformDraft?.exists &&
      localDraftSync &&
      platformDraft.fingerprint &&
      platformDraft.fingerprint !== localDraftSync.lastFingerprint,
  );

  if (platformDraft?.exists && !syncMeta) {
    return {
      advice: 'pull_or_force_push_or_discard',
      hint: opts.hasVersionCfg ? opts.remoteExistsNoSyncHint : opts.noVersionHint,
    };
  }
  if (platformDraft?.exists && localDirty && remoteDirty) {
    return { advice: 'draft_conflict', hint: opts.conflictHint };
  }
  if (platformDraft?.exists && remoteDirty) {
    return { advice: 'draft_pull', hint: opts.pullHint };
  }
  if (localDirty) {
    return { advice: 'draft_push', hint: opts.pushHint };
  }
  return { advice: null, hint: null };
}

export async function buildProjectStatus(cwd: string): Promise<StatusPayload> {
  const auth = getCurrentAuth();
  const resourceCfg = tryLoadResourceProject(cwd);
  const versionCfg = tryLoadVersionProject(cwd);
  const collectionCfg = tryLoadCollectionProject(cwd);
  const activeCfg = resourceCfg || collectionCfg;

  let platform: Awaited<ReturnType<typeof fetchResourceInfo>> | null = null;
  let platformVersionDraft: PlatformFormDraftState | null = null;
  let ownerMatch: boolean | null = null;
  let sync: StatusPayload['sync'] = 'unknown';
  let draftAdvice: DraftAdvice = null;
  let draftAdviceHint: string | null = null;
  let localDraftSync: DraftSyncState | null = null;

  if (auth?.token && activeCfg?.data.resourceId) {
    try {
      platform = await fetchResourceInfo(activeCfg.data.resourceId);
      ownerMatch = ownersMatch(auth.userId, platform.userId);
      if (
        (activeCfg.data.resourceTitle &&
          platform.resourceTitle &&
          activeCfg.data.resourceTitle !== platform.resourceTitle) ||
        (activeCfg.data.intro !== undefined &&
          platform.intro !== undefined &&
          activeCfg.data.intro !== platform.intro) ||
        (activeCfg.data.tags &&
          platform.tags &&
          JSON.stringify(activeCfg.data.tags) !== JSON.stringify(platform.tags)) ||
        (activeCfg.data.coverImages &&
          platform.coverImages &&
          JSON.stringify(activeCfg.data.coverImages) !== JSON.stringify(platform.coverImages))
      ) {
        sync = 'behind';
      } else {
        sync = 'ok';
      }

      if (resourceCfg?.data.resourceId) {
        const remote = await lookRemoteVersionDraft(resourceCfg.data.resourceId);
        if (remote.exists && remote.draftData) {
          const remoteFp = fingerprint(remote.draftData);
          platformVersionDraft = {
            exists: true,
            updateDate: remote.updateDate ?? null,
            version: remote.draftData.versionInput ?? null,
            fingerprint: remoteFp,
          };
        } else {
          platformVersionDraft = {
            exists: false,
            updateDate: null,
            version: null,
            fingerprint: null,
          };
        }

        if (versionCfg?.data) {
          const localFp = fingerprint(toDraftData(versionCfg.data));
          const syncMeta = versionCfg.data.draftSync;
          if (syncMeta?.lastFingerprint) {
            localDraftSync = {
              lastFingerprint: syncMeta.lastFingerprint,
              lastRemoteUpdateDate: syncMeta.lastRemoteUpdateDate ?? null,
              dirty: localFp !== syncMeta.lastFingerprint,
            };
          }

          const advice = resolveDraftAdvice({
            platformDraft: platformVersionDraft,
            localDraftSync,
            hasVersionCfg: true,
            remoteExistsNoSyncHint: '???????????? draftSync????? Console ??',
            conflictHint: '??????????????? draft pull ?????? force push',
            pullHint: '?????????????????? draft pull',
            pushHint: '???????????? push ??',
            noVersionHint: '????????????????',
          });
          draftAdvice = advice.advice;
          draftAdviceHint = advice.hint;
        } else if (platformVersionDraft?.exists) {
          draftAdvice = 'pull_or_force_push_or_discard';
          draftAdviceHint = '????????????????';
        }
      }
    } catch {
      sync = 'unknown';
    }
  }

  const payload: StatusPayload = {
    ok: true,
    environment: getCliEnv(),
    apiBaseURL: getApiBaseURL(),
    loggedIn: Boolean(auth?.token),
    auth: auth
      ? {
          username: auth.username ?? null,
          userId: auth.userId ?? null,
          environment: auth.environment,
        }
      : null,
    owner: activeCfg
      ? {
          username: activeCfg.data.username ?? platform?.username ?? null,
          userId: activeCfg.data.userId ?? platform?.userId ?? null,
          matchLogin: ownerMatch,
        }
      : null,
    sync,
    platform: platform
      ? {
          resourceId: platform.resourceId,
          latestVersion: platform.latestVersion ?? null,
          status: platform.status ?? null,
          enabledPolicyCount: (platform.policies || []).filter((p) => Number(p.status) === 1)
            .length,
        }
      : null,
    platformVersionDraft,
    localDraftSync,
    draftAdvice,
    draftAdviceHint,
    local: {
      resourceId: resourceCfg?.data.resourceId ?? null,
      version: versionCfg?.data.version ?? null,
      runtimeVersion: versionCfg?.data.runtimeVersion ?? null,
      filePath: versionCfg?.data.filePath ?? null,
    },
    collection: null,
    configs: {
      resource: findProjectFilePath('resource', cwd),
      version: findProjectFilePath('version', cwd),
      collection: findProjectFilePath('collection', cwd),
    },
  };

  if (collectionCfg) {
    let platformFormDraftExists: boolean | null = null;
    let platformFormDraft: PlatformFormDraftState | null = null;
    if (auth?.token && collectionCfg.data.resourceId) {
      try {
        const remote = await lookRemoteVersionDraft(collectionCfg.data.resourceId);
        platformFormDraftExists = remote.exists;
        const remoteDraft = remote.draftData as CollectionVersionDraftData | undefined;
        platformFormDraft =
          remote.exists && remoteDraft
            ? {
                exists: true,
                updateDate: remote.updateDate ?? null,
                version: remoteDraft.versionInput ?? null,
                fingerprint: fingerprintCollectionDraft(remoteDraft),
              }
            : { exists: false, updateDate: null, version: null, fingerprint: null };
      } catch {
        platformFormDraftExists = null;
        platformFormDraft = null;
      }
    }

    const localFp = fingerprintCollectionDraft(toCollectionDraftData(collectionCfg.data));
    const syncMeta = collectionCfg.data.draftSync;
    const collectionDraftSync = syncMeta?.lastFingerprint
      ? {
          lastFingerprint: syncMeta.lastFingerprint,
          lastRemoteUpdateDate: syncMeta.lastRemoteUpdateDate ?? null,
          dirty: localFp !== syncMeta.lastFingerprint,
        }
      : null;

    const collectionAdvice = resolveDraftAdvice({
      platformDraft: platformFormDraft,
      localDraftSync: collectionDraftSync,
      hasVersionCfg: true,
      remoteExistsNoSyncHint: '???????????????? draftSync',
      conflictHint:
        '??????????????????? draft pull --collection ?????? force push',
      pullHint: '?????????????????????? draft pull --collection',
      pushHint: '???????????????? push ??',
      noVersionHint: '???????????????? draftSync',
    });

    payload.collection = {
      resourceId: collectionCfg.data.resourceId ?? null,
      itemCount: Array.isArray(collectionCfg.data.catalogueItems)
        ? collectionCfg.data.catalogueItems.length
        : 0,
      hasCollectRules: Boolean(collectionCfg.data.collectRules),
      rssFeedUrl: collectionCfg.data.rssFeedUrl ?? null,
      draftSync: collectionDraftSync,
      platformFormDraftExists,
      platformFormDraft,
      draftAdvice: collectionAdvice.advice,
      draftAdviceHint: collectionAdvice.hint,
    };
  }

  return payload;
}
