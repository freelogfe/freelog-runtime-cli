import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyGlobalFlags, getCliEnv, getApiBaseURL } from '../core/env.js';
import { getCurrentAuth } from '../core/auth.js';
import { findConfigPath, resolveCwd } from '../config/paths.js';
import {
  tryLoadCollectionConfig,
  tryLoadResourceConfig,
  tryLoadVersionConfig,
} from '../config/read.js';
import { fingerprint, toDraftData } from '../adapters/versionDraftAdapter.js';
import { fingerprintCollectionDraft, toCollectionDraftData } from '../adapters/collectionVersionDraftAdapter.js';
import { lookRemoteVersionDraft } from '../services/draftService.js';
import {
  fetchResourceInfo,
  ownersMatch,
} from '../services/syncService.js';
import { handleCommandError } from './login.js';

export const statusCommand = defineCommand({
  meta: { name: 'status', description: '登录态 + owner + 同步 + 平台发版草稿' },
  args: {
    test: { type: 'boolean' },
    cwd: { type: 'string' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags({ test: args.test });
      const cwd = resolveCwd(args.cwd);
      const auth = getCurrentAuth();
      const resourceCfg = tryLoadResourceConfig(cwd);
      const versionCfg = tryLoadVersionConfig(cwd);
      const collectionCfg = tryLoadCollectionConfig(cwd);

      let platform: Awaited<ReturnType<typeof fetchResourceInfo>> | null = null;
      let platformVersionDraft: {
        exists: boolean;
        updateDate?: string | null;
        version?: string | null;
        fingerprint?: string | null;
      } | null = null;
      let ownerMatch: boolean | null = null;
      let sync: 'unknown' | 'ok' | 'behind' = 'unknown';
      let draftAdvice: string | null = null;
      let draftAdviceHint: string | null = null;
      let localDraftSync: {
        lastFingerprint: string;
        lastRemoteUpdateDate?: string | null;
        dirty: boolean;
      } | null = null;

      if (auth?.token && resourceCfg?.data.resourceId) {
        try {
          platform = await fetchResourceInfo(resourceCfg.data.resourceId);
          const remote = await lookRemoteVersionDraft(resourceCfg.data.resourceId);
          ownerMatch = ownersMatch(auth.userId, platform.userId);
          if (
            (resourceCfg.data.resourceTitle &&
              platform.resourceTitle &&
              resourceCfg.data.resourceTitle !== platform.resourceTitle) ||
            (resourceCfg.data.tags &&
              platform.tags &&
              JSON.stringify(resourceCfg.data.tags) !== JSON.stringify(platform.tags))
          ) {
            sync = 'behind';
          } else {
            sync = 'ok';
          }

          if (remote.exists && remote.draftData) {
            const remoteFp = fingerprint(remote.draftData);
            platformVersionDraft = {
              exists: true,
              updateDate: remote.updateDate ?? null,
              version: remote.draftData.versionInput ?? null,
              fingerprint: remoteFp,
            };
          } else {
            platformVersionDraft = { exists: false, updateDate: null, version: null, fingerprint: null };
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
            } else {
              localDraftSync = null;
            }

            if (platformVersionDraft?.exists && !syncMeta?.lastFingerprint) {
              draftAdvice = 'pull_or_force_push_or_discard';
              draftAdviceHint =
                '远端存在发版草稿且本地无 draftSync；可能来自 Console 防抖';
            } else if (platformVersionDraft?.exists && localDraftSync?.dirty) {
              draftAdvice = 'draft_push';
              draftAdviceHint = '本地相对上次草稿同步有未 push 变更';
            } else if (
              platformVersionDraft?.exists &&
              localDraftSync &&
              platformVersionDraft.fingerprint &&
              platformVersionDraft.fingerprint !== localDraftSync.lastFingerprint
            ) {
              draftAdvice = 'draft_pull';
              draftAdviceHint = '平台发版草稿与上次同步指纹不同，建议 draft pull';
            }
          } else if (platformVersionDraft?.exists) {
            draftAdvice = 'pull_or_force_push_or_discard';
            draftAdviceHint = '远端存在发版草稿且本地无 version.config';
          }
        } catch {
          sync = 'unknown';
        }
      }

      const payload = {
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
        owner: resourceCfg
          ? {
              username: resourceCfg.data.username ?? platform?.username ?? null,
              userId: resourceCfg.data.userId ?? platform?.userId ?? null,
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
        collection: null as null | {
          resourceId: string | null;
          itemCount: number;
          hasCollectRules: boolean;
          rssFeedUrl: string | null;
          draftSync: { lastFingerprint: string; dirty: boolean } | null;
          platformFormDraftExists: boolean | null;
        },
        configs: {
          resource: findConfigPath('resource', cwd),
          version: findConfigPath('version', cwd),
          collection: findConfigPath('collection', cwd),
        },
      };

      if (collectionCfg) {
        let platformFormDraftExists: boolean | null = null;
        if (auth?.token && collectionCfg.data.resourceId) {
          try {
            const remote = await lookRemoteVersionDraft(collectionCfg.data.resourceId);
            platformFormDraftExists = remote.exists;
          } catch {
            platformFormDraftExists = null;
          }
        }
        const localFp = fingerprintCollectionDraft(toCollectionDraftData(collectionCfg.data));
        const syncMeta = collectionCfg.data.draftSync;
        payload.collection = {
          resourceId: collectionCfg.data.resourceId ?? null,
          itemCount: Array.isArray(collectionCfg.data.catalogueItems)
            ? collectionCfg.data.catalogueItems.length
            : 0,
          hasCollectRules: Boolean(collectionCfg.data.collectRules),
          rssFeedUrl: collectionCfg.data.rssFeedUrl ?? null,
          draftSync: syncMeta?.lastFingerprint
            ? {
                lastFingerprint: syncMeta.lastFingerprint,
                dirty: localFp !== syncMeta.lastFingerprint,
              }
            : null,
          platformFormDraftExists,
        };
      }

      if (args.json) {
        process.stdout.write(`${JSON.stringify(payload)}\n`);
        return;
      }

      consola.info(`环境: ${payload.environment} (${payload.apiBaseURL})`);
      if (payload.loggedIn) {
        consola.success(`已登录: ${payload.auth?.username} (userId=${payload.auth?.userId})`);
      } else {
        consola.warn('未登录');
      }
      if (payload.owner) {
        const mark =
          payload.owner.matchLogin === true ? '✅' : payload.owner.matchLogin === false ? '❌' : '—';
        consola.info(`所属用户: ${payload.owner.username} (${payload.owner.userId}) ${mark}`);
      }
      consola.info(`同步: ${payload.sync}`);
      if (payload.platform) {
        consola.info(
          `平台: latest=${payload.platform.latestVersion || '—'} status=${payload.platform.status} policies(enabled)=${payload.platform.enabledPolicyCount}`,
        );
      }
      if (payload.platformVersionDraft?.exists) {
        consola.warn(
          `平台发版草稿: 有  (updateDate: ${payload.platformVersionDraft.updateDate || '—'})`,
        );
      } else {
        consola.info('平台发版草稿: 无');
      }
      if (payload.localDraftSync) {
        consola.info(
          `本地相对上次草稿同步: ${payload.localDraftSync.dirty ? '有未 push 变更' : '已对齐'}`,
        );
      } else if (payload.platformVersionDraft?.exists) {
        consola.warn('本地草稿同步: 从未同步（可能来自 Console 防抖自动保存）');
      } else {
        consola.info('本地草稿同步: 从未同步');
      }
      if (draftAdviceHint) {
        consola.info(`建议: ${draftAdviceHint}`);
        consola.info('      freelog-cli draft pull');
        consola.info('      或 freelog-cli draft push --force');
        consola.info('      或 freelog-cli draft discard');
      }
      consola.info(
        `本地版本意图: ${payload.local.version || '—'} file=${payload.local.filePath || '—'}`,
      );
      if (payload.collection) {
        consola.info(
          `合集: id=${payload.collection.resourceId || '—'} items=${payload.collection.itemCount} rules=${payload.collection.hasCollectRules ? '有' : '无'} rss=${payload.collection.rssFeedUrl || '—'}`,
        );
        consola.info(
          `合集发版表单草稿: 平台=${payload.collection.platformFormDraftExists === null ? '—' : payload.collection.platformFormDraftExists ? '有' : '无'} 本地sync=${payload.collection.draftSync ? (payload.collection.draftSync.dirty ? '有未 push 变更' : '已对齐') : '从未同步'}`,
        );
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
