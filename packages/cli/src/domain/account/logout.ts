import os from 'node:os';
import { CliError } from '../../core/errors';
import {
  deleteAuth,
  findWorkspaceAuthPath,
  globalAuthPath,
} from '../../local/auth';

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
