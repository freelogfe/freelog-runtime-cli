/**
 * tools-lib 平台装配（进程内一次）：env 必须显式注入 getEnv（空 FREELOG_ENV 会落 test）；
 * dev 会话凭据是 Cookie，getHeaders 注入 Cookie；token 走 getAuthorization。
 */

import { FUtil } from '@freelog-cli/tools-lib2/node';
import { getEnv } from '../domain/env';
import { getAuthSearchCwd, loadAuth } from '../local/auth';

let bootstrapped = false;

function currentAuth() {
  return loadAuth({ cwd: getAuthSearchCwd() });
}

/** 把 env/凭据注入 tools-lib 的请求层；进程内只装配一次，凭据每次请求时现读（支持登录后切换）。 */
export function bootstrapPlatform(): void {
  if (bootstrapped) {
    return;
  }
  FUtil.configurePlatform({
    getEnv,
    getAuthorization: () => currentAuth()?.auth.token,
    getHeaders: () => {
      const cookie = currentAuth()?.auth.cookie;
      return cookie ? { Cookie: cookie } : undefined;
    },
    getUserId: () => currentAuth()?.auth.userId ?? -1,
  });
  bootstrapped = true;
}
