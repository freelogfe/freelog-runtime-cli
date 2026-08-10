import { getCurrentAuth } from '../core/auth.js';
import {
  findProjectPath,
  resolveCwd,
  tryLoadCollectionProject,
  tryLoadResourceProject,
  tryLoadVersionProject,
} from '../config/project.js';
import { listingDrifted } from './shared/listing.js';
import { fetchResourceInfo } from './sync/fetch.js';
import { ownersMatch } from './sync/index.js';
import { buildProjectStatus } from './statusService.js';
import { evaluateOnlineGates } from './onlineGates.js';

export type DiffLevel = 'same' | 'drift' | 'unknown';

export interface DiffEntry {
  field: string;
  level: DiffLevel;
  local: unknown;
  platform: unknown;
  note?: string;
}

export interface DiffResult {
  ok: boolean;
  subject: 'resource' | 'collection' | 'none';
  hasDrift: boolean;
  entries: DiffEntry[];
}

function entry(
  field: string,
  level: DiffLevel,
  local: unknown,
  platform: unknown,
  note?: string,
): DiffEntry {
  return { field, level, local, platform, note };
}

function normJson(v: unknown): string {
  return JSON.stringify(v ?? null);
}

export async function diffProject(opts: { cwd?: string }): Promise<DiffResult> {
  const cwd = resolveCwd(opts.cwd);
  const entries: DiffEntry[] = [];

  if (!findProjectPath(cwd)) {
    return {
      ok: false,
      subject: 'none',
      hasDrift: true,
      entries: [entry('manifest', 'drift', null, null, '未找到 freelog.manifest.json')],
    };
  }

  const collectionCfg = tryLoadCollectionProject(cwd);
  const resourceCfg = tryLoadResourceProject(cwd);
  const versionCfg = tryLoadVersionProject(cwd);
  const subject = collectionCfg ? 'collection' : 'resource';

  const auth = getCurrentAuth();
  if (!auth?.token) {
    entries.push(entry('auth', 'unknown', '未登录', null, 'login 后可对比平台'));
    return { ok: true, subject, hasDrift: false, entries };
  }

  const resourceId = resourceCfg?.data.resourceId || collectionCfg?.data.resourceId;
  if (!resourceId) {
    entries.push(entry('resourceId', 'unknown', null, null, '尚未 create/bind'));
    return { ok: true, subject, hasDrift: false, entries };
  }

  let info: Awaited<ReturnType<typeof fetchResourceInfo>> | null = null;
  try {
    info = await fetchResourceInfo(resourceId);
  } catch (error) {
    entries.push(
      entry(
        'platform',
        'unknown',
        null,
        null,
        error instanceof Error ? error.message : String(error),
      ),
    );
    return { ok: true, subject, hasDrift: false, entries };
  }

  const local = resourceCfg?.data || collectionCfg?.data;
  if (local && info) {
    if (auth.userId != null && info.userId != null && !ownersMatch(auth.userId, info.userId)) {
      entries.push(entry('owner', 'drift', auth.userId, info.userId, '登录用户非 owner'));
    } else {
      entries.push(entry('owner', 'same', auth.userId, info.userId));
    }

    const fields: Array<{ key: string; localVal: unknown; platformVal: unknown }> = [
      { key: 'resourceTitle', localVal: local.resourceTitle, platformVal: info.resourceTitle },
      { key: 'intro', localVal: local.intro, platformVal: info.intro },
      { key: 'tags', localVal: local.tags, platformVal: info.tags },
      { key: 'coverImages', localVal: local.coverImages, platformVal: info.coverImages },
    ];

    for (const f of fields) {
      const same =
        f.key === 'tags' || f.key === 'coverImages'
          ? normJson(f.localVal) === normJson(f.platformVal)
          : (f.localVal ?? null) === (f.platformVal ?? null);
      entries.push(entry(`listing.${f.key}`, same ? 'same' : 'drift', f.localVal, f.platformVal));
    }

    if (local && info && listingDrifted(local, info)) {
      entries.push(entry('listing', 'drift', 'local', 'platform', 'listing 字段与平台不一致'));
    }

    entries.push(
      entry(
        'platform.latestVersion',
        'same',
        versionCfg?.data.version ?? null,
        info.latestVersion ?? null,
        '左：本地版本意图；右：平台 latest',
      ),
    );

    if (versionCfg?.data.version && info.latestVersion) {
      entries.push(
        entry(
          'version.intent',
          versionCfg.data.version === info.latestVersion ? 'same' : 'drift',
          versionCfg.data.version,
          info.latestVersion,
        ),
      );
    }

    entries.push(
      entry('platform.status', 'same', local.status ?? null, info.status ?? null),
    );

    const gates = evaluateOnlineGates(info);
    entries.push(
      entry(
        'online.gates',
        gates.ok ? 'same' : 'drift',
        {
          enabledPolicies: gates.enabledPolicyCount,
          hasLatest: gates.hasLatestVersion,
        },
        { ok: gates.ok },
      ),
    );
  }

  try {
    const status = await buildProjectStatus(cwd);
    if (status.sync === 'behind') {
      entries.push(entry('sync', 'drift', 'local', 'platform', 'listing 未与平台对齐'));
    }
    if (status.draftAdvice) {
      entries.push(
        entry('draft', 'drift', status.draftAdvice, status.platformVersionDraft?.exists, status.draftAdviceHint || undefined),
      );
    }
    if (status.localDraftSync?.dirty) {
      entries.push(entry('draft.local', 'drift', 'dirty', status.localDraftSync.lastFingerprint));
    }
  } catch {
    // ignore
  }

  const hasDrift = entries.some((e) => e.level === 'drift');
  return { ok: !hasDrift, subject, hasDrift, entries };
}
