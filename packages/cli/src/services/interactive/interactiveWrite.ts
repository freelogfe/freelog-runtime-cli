import * as p from '@clack/prompts';
import { consola } from 'consola';
import {
  assertExplicitEnvForWriteOperation,
  logAuthContextIfInteractive,
} from '../../core/command.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { t } from '../../i18n/index.js';

/** 交互壳写操作：显式 env + 当前账号提示 + clack confirm（非 --yes 语义）。 */
export async function confirmInteractiveWrite(message: string): Promise<boolean> {
  assertExplicitEnvForWriteOperation();
  logAuthContextIfInteractive();
  const ok = await p.confirm({ message });
  if (p.isCancel(ok) || !ok) {
    consola.info('已取消');
    return false;
  }
  return true;
}

/** 交互壳下架确认（与 online 命令 offline 分支同源 i18n）。 */
export async function confirmInteractiveOffline(): Promise<boolean> {
  assertExplicitEnvForWriteOperation();
  logAuthContextIfInteractive();
  consola.info(t(I18N_KEYS.remove_resource_from_auth_confirmation_title));
  const ok = await p.confirm({ message: t(I18N_KEYS.confirm_msg_remove_resource_from_auth) });
  if (p.isCancel(ok) || !ok) {
    consola.info('已取消');
    return false;
  }
  return true;
}
