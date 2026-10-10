import * as p from '@clack/prompts';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  printPolicyTemplatePreview,
  type PolicyTemplatePreview,
} from '../../services/policyTemplate/index.js';

export { printPolicyTemplatePreview };

export interface PolicyTemplateCommandIdArgs {
  template?: unknown;
  'template-id'?: unknown;
}

export function resolvePolicyTemplateId(args: PolicyTemplateCommandIdArgs): string {
  return String(args.template || args['template-id'] || '').trim();
}

export function shouldConfirmPolicyTemplateApply(args: {
  yes?: boolean;
  json?: boolean;
}): boolean {
  return Boolean(process.stdin.isTTY && !args.yes && !args.json);
}

export async function confirmPolicyTemplatePreview(
  preview: PolicyTemplatePreview,
  message: string,
): Promise<void> {
  printPolicyTemplatePreview(preview);
  const ok = await p.confirm({
    message,
    initialValue: true,
  });
  if (p.isCancel(ok) || !ok) throw cliError(I18N_KEYS.cancelled, { code: 4 });
}
