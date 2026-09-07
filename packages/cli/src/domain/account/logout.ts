/** 登出：删本地凭据文件（先工作区 .freelog/auth，再全局 ~/.freelog-auth），不调平台。 */

import os from 'node:os';
import { CliError } from '../../core/errors';
import {
  deleteAuth,
  findWorkspaceAuthPath,
  globalAuthPath,
} from '../../local/auth';

/** 删凭据：--global 只删用户级；默认先找工程级，找不到再删用户级；两处都没有报 LOGOUT_NOTHING。 */
export function logoutAccount(input: {
  cwd: string;
  global?: boolean;
  homeDir?: string;
}): { deleted: string } {
  const homeDir = input.homeDir ?? os.homedir();
  if (input.global) {
    const filePath = globalAuthPath(homeDir);
    if (!deleteAuth(filePath)) {
      // i18n: cli.logout.nothing
      throw new CliError('没有可删除的全局凭据', 'LOGOUT_NOTHING');
    }
    return { deleted: filePath };
  }

  const workspacePath = findWorkspaceAuthPath(input.cwd);
  if (workspacePath) {
    deleteAuth(workspacePath);
    return { deleted: workspacePath };
  }

  const filePath = globalAuthPath(homeDir);
  if (!deleteAuth(filePath)) {
    // i18n: cli.logout.nothing
    throw new CliError('没有可删除的凭据', 'LOGOUT_NOTHING');
  }
  return { deleted: filePath };
}
