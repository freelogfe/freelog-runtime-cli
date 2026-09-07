/** 丢工作稿：删 N.version.json。--yes 跳过确认。 */

import { deleteDraft, readDraft } from '../../local/draft';
import { resolveIdentity } from '../../local/resolve';

/** 丢稿：无稿幂等返回提示，有稿删 N.version.json（确认在命令层）。 */
export function draftDiscard(cwd: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    return '没有工作稿';
  }
  deleteDraft(cwd, identity.n);
  return '已丢掉工作稿';
}
