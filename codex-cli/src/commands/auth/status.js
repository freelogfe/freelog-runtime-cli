import { getStatus } from '../../services/auth-service.js';
import { formatDateTime } from '../../utils/datetime.js';

export function buildStatusCommand(renderer) {
  return {
    matches: (command, subcommand) => command === 'login' && subcommand === 'status',
    handler: async () => {
      const status = await getStatus();
      const rows = [
        [
          '全局',
          status.global?.username ?? '-',
          status.global ? formatDateTime(status.global.loginTime) : '-',
          status.global ? formatDateTime(status.global.expiresAt) : '-',
          status.global
            ? status.global.isExpired
              ? '已过期'
              : `有效（剩余 ${status.global.remainingDays} 天）`
            : '-'
        ],
        [
          '工作空间',
          status.workspace?.username ?? '-',
          status.workspace ? formatDateTime(status.workspace.loginTime) : '-',
          status.workspace ? formatDateTime(status.workspace.expiresAt) : '-',
          status.workspace
            ? status.workspace.isExpired
              ? '已过期'
              : `有效（剩余 ${status.workspace.remainingDays} 天）`
            : '-'
        ]
      ];
      renderer.table(rows, { header: ['范围', '用户名', '登录时间', '过期时间', '状态'] });
      const hints = [];
      if (!status.global) {
        hints.push('尚未进行全局登录，可执行 freelog-cli login -g');
      }
      if (!status.workspace) {
        hints.push('尚未进行工作空间登录，可在项目内执行 freelog-cli login');
      }
      if (hints.length > 0) {
        renderer.newline();
        hints.forEach((hint) => renderer.muted(hint));
      }
    }
  };
}
