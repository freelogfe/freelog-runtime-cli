import { cliError } from '../../../i18n/cliError.js';
import { I18N_KEYS } from '../../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../../platform/index.js';
import { fingerprint, type ResourceVersionDraftData } from '../../../adapters/versionDraftAdapter.js';
import type { PlatformResourceInfo, PlatformVersionDraft } from './types.js';

export async function fetchResourceInfo(resourceIdOrName: string): Promise<PlatformResourceInfo> {
  const envelope = await FServiceAPI.Resource.info({
    resourceIdOrName,
    isLoadPolicyInfo: 1,
    isLoadLatestVersionInfo: 1,
  });
  const data = unwrapData<PlatformResourceInfo>(envelope);
  if (!data?.resourceId && !(data as { resourceID?: string })?.resourceID) {
    throw cliError(I18N_KEYS.platform_no_resource_info, { code: 1, details: data });
  }
  const anyData = data as PlatformResourceInfo & { resourceID?: string };
  return {
    ...data,
    resourceId: data.resourceId || anyData.resourceID || resourceIdOrName,
  };
}

export async function fetchVersionDraft(resourceId: string): Promise<PlatformVersionDraft> {
  try {
    const envelope = await FServiceAPI.Resource.lookDraft({ resourceId });
    const data = unwrapData<Record<string, unknown> | null>(envelope);
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return { exists: false };
    }

    const draftData = (data.draftData ?? data) as ResourceVersionDraftData;
    const hasShape =
      data.draftData !== undefined ||
      draftData.versionInput !== undefined ||
      draftData.selectedFileInfo !== undefined ||
      draftData.descriptionEditorInput !== undefined ||
      Array.isArray(draftData.directDependencies);

    if (!hasShape && !data.updateDate) {
      return { exists: false };
    }

    return {
      exists: true,
      updateDate: (data.updateDate || data.updateDateTime || data.modifyDate) as string | undefined,
      version: draftData.versionInput,
      fingerprint: fingerprint(draftData),
      raw: data,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/404|不存在|not\s*found|无草稿/i.test(msg)) {
      return { exists: false };
    }
    throw error;
  }
}
