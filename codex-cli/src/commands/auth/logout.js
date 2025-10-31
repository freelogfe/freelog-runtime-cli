import { AUTH_SCOPE, logout as logoutService } from '../../services/auth-service.js';
import { withSpinner } from '../../cli/spinner.js';

export function buildLogoutCommand(renderer) {
  return {
    matches: (command, subcommand) => command === 'logout' && !subcommand,
    handler: async ({ options }) => {
      let scope = null;
      if (options.g || options.global) {
        scope = AUTH_SCOPE.GLOBAL;
      } else if (options.workspace) {
        scope = AUTH_SCOPE.WORKSPACE;
      }
      const result = await withSpinner('正在清除登录状态...', () => logoutService(scope));
      const messages = [];
      if (result.global) {
        messages.push('已清除全局登录状态。');
      }
      if (result.workspace) {
        messages.push('已清除工作空间登录状态。');
      }
      if (messages.length === 0) {
        renderer.warn('未找到需要清除的登录信息。');
        return;
      }
      messages.forEach((msg) => renderer.success(msg));
    }
  };
}
