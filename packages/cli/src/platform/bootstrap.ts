import { FUtil } from '@freelog-cli/tools-lib2/node';
import { getEnv } from '../domain/env';
import { getAuthSearchCwd, loadAuth } from '../local/auth';

let bootstrapped = false;

function currentAuth() {
  return loadAuth({ cwd: getAuthSearchCwd() });
}

export function bootstrapPlatform(): void {
  if (bootstrapped) {
    return;
  }
  FUtil.configurePlatform({
    getEnv,
    getAuthorization: () => currentAuth()?.auth.token,
    getUserId: () => currentAuth()?.auth.userId ?? -1,
  });
  bootstrapped = true;
}
