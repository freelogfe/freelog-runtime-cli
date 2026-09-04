import { requireAuth } from '../../../core/auth.js';
import { CliError } from '../../../core/errors.js';
import { FServiceAPI, unwrapData } from '../../../platform/index.js';
import { cliError } from '../../../i18n/cliError.js';
import { I18N_KEYS } from '../../../i18n/bundled.js';
import { ownersMatch } from '../owner.js';

/**
 * Console FLocalUpload：SHA1 已被发行时拦截（同源 i18n key）。
 * 404 / 空 data → 允许继续。
 */
export async function assertSha1PublishAllowed(sha1: string): Promise<void> {
  try {
    const envelope = await FServiceAPI.Resource.getResourceBySha1({ fileSha1: sha1 });
    const data = unwrapData<{
      resourceId?: string;
      userId?: number | string;
      ownerId?: number | string;
    } | null>(envelope);
    if (!data?.resourceId) return;

    const auth = requireAuth();
    const ownerId = data.userId ?? data.ownerId;
    if (ownersMatch(ownerId, auth.userId)) {
      throw cliError(I18N_KEYS.submitresource_err_resourceexist_sameuser, { code: 4 });
    }
    throw cliError(I18N_KEYS.submitresource_err_resourceexist_otheruser, { code: 4 });
  } catch (error) {
    if (error instanceof CliError) throw error;
    // 平台无绑定资源 → 允许
  }
}
