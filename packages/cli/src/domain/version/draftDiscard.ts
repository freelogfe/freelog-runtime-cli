import { deleteDraft, readDraft } from '../../local/draft';
import { resolveIdentity } from '../../local/resolve';

export function draftDiscard(cwd: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    return '没有工作稿';
  }
  deleteDraft(cwd, identity.n);
  return '已丢掉工作稿';
}
