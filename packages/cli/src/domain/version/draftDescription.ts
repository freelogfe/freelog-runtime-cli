/** 工作稿描述：只有更新稿（有 fromVersion）能改；首版稿描述恒空串。 */

import { CliError } from '../../core/errors';
import { readDraft, writeDraft } from '../../local/draft';
import { resolveIdentity } from '../../local/resolve';

/** 只写工作稿的 description 字段；只有更新稿（有 fromVersion）能改，首版稿失败；线上描述走 version description。 */
export function setDraftDescription(cwd: string, description: string, file?: string): string {
  const identity = resolveIdentity(cwd, file);
  const draft = readDraft(cwd, identity.n);
  if (!draft) {
    // i18n: cli.draft.missing
    throw new CliError('没有工作稿', 'DRAFT_MISSING');
  }
  if (!draft.fromVersion) {
    // i18n: cli.draft.description_first
    throw new CliError('首版稿不能改描述，发行后用 version description', 'DRAFT_DESCRIPTION_FIRST');
  }
  draft.description = description;
  writeDraft(cwd, identity.n, draft);
  return description;
}
