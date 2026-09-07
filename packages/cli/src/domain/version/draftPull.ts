/**
 * draft pull：把平台某一已发号回显成本地工作稿（整份覆盖，不混字段）。
 * fromVersion 记「底是哪一号」；已发号上的属性/依赖是冻住的，改树只能 pull → 改稿 → update-version。
 */

import { CliError } from '../../core/errors';
import { draftSummary, readDraft, writeDraft } from '../../local/draft';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { evaluateGates, resolveBoundIdentity } from './gates';
import { unwrapData } from '../../platform/unwrap';

export type DraftPullApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  resourceVersionInfo1?: (params: Record<string, unknown>) => Promise<unknown>;
  getVersionListByResourceID?: (params: Record<string, unknown>) => Promise<unknown>;
};



/** pull 某号回显成稿：门禁 → 校验版本存在 → （有稿未 --yes 时只给摘要不覆盖）→ 整份覆盖写稿。 */
export async function draftPull(input: {
  cwd: string;
  file?: string;
  version?: string;
  yes?: boolean;
  homeDir?: string;
  apis?: DraftPullApis;
}): Promise<string> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const infoApi =
    input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(
    await infoApi({
      resourceIdOrName: identity.resourceId,
      isLoadLatestVersionInfo: 1,
    }),
  );
  const latestVersion = info.latestVersion ? String(info.latestVersion) : undefined;
  const existing = readDraft(input.cwd, identity.n);
  evaluateGates({ latestVersion, draft: existing }, 'draft-pull');

  const want = input.version ?? latestVersion;
  if (!want) {
    // i18n: cli.draft.no_latest
    throw new CliError('还没有发行版本，请先 create-version', 'GATE_USE_CREATE');
  }

  const listApi =
    input.apis?.getVersionListByResourceID ??
    ((params) => FServiceAPI.Resource.getVersionListByResourceID(params as never));
  const list = unwrapData(await listApi({ resourceId: identity.resourceId }));
  const versions = (list.dataList as { version?: string }[] | undefined)
    ?? (list.list as { version?: string }[] | undefined)
    ?? [];
  if (input.version && versions.length > 0 && !versions.some((item) => item.version === input.version)) {
    // i18n: cli.draft.version_missing
    throw new CliError('没有这个版本', 'DRAFT_VERSION_MISSING');
  }

  if (existing) {
    const summary = draftSummary(existing);
    if (!input.yes && existing.fromVersion === want) {
      return `${summary}\n稿已来自 ${want}，未覆盖`;
    }
    if (!input.yes) {
      return `${summary}\n未覆盖`;
    }
  }

  const versionInfoApi =
    input.apis?.resourceVersionInfo1 ??
    ((params) => FServiceAPI.Resource.resourceVersionInfo1(params as never));
  const versionInfo = unwrapData(
    await versionInfoApi({
      resourceId: identity.resourceId,
      version: want,
    }),
  );
  writeDraft(input.cwd, identity.n, {
    fromVersion: want,
    fileSha1: versionInfo.fileSha1 ? String(versionInfo.fileSha1) : undefined,
    filename: versionInfo.filename ? String(versionInfo.filename) : undefined,
    description: versionInfo.description ? String(versionInfo.description) : undefined,
    customPropertyDescriptors: Array.isArray(versionInfo.customPropertyDescriptors)
      ? (versionInfo.customPropertyDescriptors as Record<string, unknown>[])
      : undefined,
    dependencies: Array.isArray(versionInfo.dependencies)
      ? (versionInfo.dependencies as Record<string, unknown>[]).map((item) => ({
          resourceId: String(item.resourceId),
          versionRange: item.versionRange ? String(item.versionRange) : '*',
        }))
      : undefined,
    inputAttrs: Array.isArray(versionInfo.inputAttrs)
      ? (versionInfo.inputAttrs as Record<string, unknown>[])
      : undefined,
    baseUpcastResources: [],
    authExcludedItems: [],
  });
  return existing ? `${draftSummary(existing)}\n已覆盖` : `已拉 ${want}`;
}
