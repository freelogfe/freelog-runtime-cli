/** 工作稿描述：只有更新稿（有 fromVersion）能改；首版稿描述恒空串。 */

import { CliError } from '../../core/errors';
import { readDraft, writeDraft } from '../../local/draft';
import { resolveIdentity } from '../../local/resolve';

/** 只写工作稿的 description 字段；线上描述走 version description（另一条命令）。 */
export function setDraftDescription(cwd: string, description: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    // i18n: cli.draft.missing
    throw new CliError('没有工作稿', 'DRAFT_MISSING');
  }
  draft.description = description;
  writeDraft(cwd, identity.n, draft);
  return description;
}
