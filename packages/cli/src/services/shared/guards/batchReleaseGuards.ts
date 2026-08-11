import { consola } from 'consola';
import * as p from '@clack/prompts';
import { cliError } from '../../../i18n/cliError.js';
import { I18N_KEYS } from '../../../i18n/bundled.js';
import { t } from '../../../i18n/index.js';
import { isInteractive } from '../../../core/tty.js';

/** 与 Console creatorBatch 单次 UI 上限一致 */
export const CREATE_BATCH_CHUNK_SIZE = 20;

/** Console 合集 Step2 单次添加目录项上限 */
export const COLLECTION_ITEM_ADD_LIMIT = 100;

export function assertBatchFileCount(count: number, strictBatchLimit?: boolean): void {
  if (strictBatchLimit && count > CREATE_BATCH_CHUNK_SIZE) {
    throw cliError(I18N_KEYS.brr_submitresource_alert_limitation, { code: 4 });
  }
}

export function warnBatchChunkingIfNeeded(total: number): void {
  if (total <= CREATE_BATCH_CHUNK_SIZE) return;
  consola.warn(t(I18N_KEYS.brr_submitresource_alert_limitation));
  consola.warn(
    t(I18N_KEYS.cli_batch_chunk_warn, {
      limit: String(CREATE_BATCH_CHUNK_SIZE),
      batches: String(Math.ceil(total / CREATE_BATCH_CHUNK_SIZE)),
    }),
  );
}

export function assertCollectionItemAddCount(count: number): void {
  if (count > COLLECTION_ITEM_ADD_LIMIT) {
    throw cliError(I18N_KEYS.additem_alert_qtylimit, { code: 4 });
  }
}

export async function confirmBatchReleaseWithoutPolicies(opts: {
  withoutPolicyCount: number;
  yes?: boolean;
}): Promise<void> {
  const { withoutPolicyCount, yes } = opts;
  if (withoutPolicyCount <= 0) return;

  const message = t(I18N_KEYS.brr_resourcelisting_complete_confirm_msg, {
    qty: String(withoutPolicyCount),
  });

  if (yes) return;

  if (isInteractive(yes)) {
    const ok = await p.confirm({ message });
    if (p.isCancel(ok) || !ok) {
      throw cliError(I18N_KEYS.cancelled, { code: 4 });
    }
    return;
  }

  throw cliError(I18N_KEYS.cli_non_interactive_needs_yes, {
    code: 4,
    hint: message,
  });
}

export function countPreparedWithoutPolicies<T extends { policies?: unknown[] }>(
  items: T[],
): number {
  return items.filter((item) => !(item.policies?.length)).length;
}
