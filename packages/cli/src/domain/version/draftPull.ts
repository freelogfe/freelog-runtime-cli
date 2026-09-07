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
