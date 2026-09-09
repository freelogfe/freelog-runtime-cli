/** 丢工作稿：删 N.version.json。--yes 跳过确认。 */

import { deleteDraft, draftSummary, readDraft } from '../../local/draft';
import { resolveIdentity } from '../../local/resolve';
import { withProjectLock } from '../../local/lock';
import { CliError } from '../../core/errors';

/** 丢稿：读摘要、确认和删除必须在同一把工程锁内，避免确认后删到被替换的稿。 */
export async function draftDiscard(
  cwd: string,
  file?: string,
  confirmed = false,
  confirm?: (summary: string) => Promise<boolean>,
): Promise<string> {
  return withProjectLock(cwd, () => draftDiscardLocked(cwd, file, confirmed, confirm), 'version-draft-discard');
}

async function draftDiscardLocked(
  cwd: string,
  file: string | undefined,
  confirmed: boolean,
  confirm?: (summary: string) => Promise<boolean>,
): Promise<string> {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    return '没有工作稿';
  }
  if (!confirmed) {
    if (!confirm) {
      throw new CliError('请先确认丢弃工作稿', 'DRAFT_DISCARD_CONFIRMATION_REQUIRED');
    }
    if (!await confirm(draftSummary(draft))) {
      return '已取消';
    }
  }
  deleteDraft(cwd, identity.n);
  return '已丢掉工作稿';
}
