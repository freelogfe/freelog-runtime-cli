/** 工作稿删除/覆盖的统一确认入口；领域层仍会校验确认结果。 */

import { confirmDestructive, confirmQuestion, isInteractive } from '../../core/tty';

/** 命令层统一展示领域层刚读到的摘要，再按 TTY / --yes 规则确认。 */
export async function confirmDraftDestruction(input: {
  summary: string;
  yes?: boolean;
  action: string;
}): Promise<boolean> {
  return confirmDestructive(input.summary, input.action, input.yes, isInteractive(), confirmQuestion);
}
