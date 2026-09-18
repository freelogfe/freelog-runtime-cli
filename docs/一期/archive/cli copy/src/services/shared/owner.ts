import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';

/** Owner 比较：平台 userId 与当前登录 userId 用 Number 对齐 */
export function ownersMatch(
  authUserId: number | string | undefined,
  platformUserId: number | string | undefined,
): boolean {
  const a = Number(authUserId);
  const b = Number(platformUserId);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

export function assertOwnerMatch(opts: {
  authUserId: number | string | undefined;
  authUsername?: string;
  platformUserId?: number | string;
  platformUsername?: string;
  hint?: string;
  requireNumericIds?: boolean;
}): void {
  const platformUserId = Number(opts.platformUserId);
  const authUserId = Number(opts.authUserId);
  if (opts.requireNumericIds !== false) {
    if (!Number.isFinite(platformUserId) || !Number.isFinite(authUserId)) {
      throw cliError(I18N_KEYS.owner_compare_missing_user_id, { code: 2, hint: '重新 login' });
    }
  }
  if (!ownersMatch(opts.authUserId, opts.platformUserId)) {
    throw cliError(I18N_KEYS.resource_owner_mismatch, {
      code: 2,
      params: {
        owner: String(opts.platformUsername || opts.platformUserId),
        current: String(opts.authUsername || opts.authUserId),
      },
      hint: opts.hint ?? '切换账号或更换目录',
    });
  }
}
