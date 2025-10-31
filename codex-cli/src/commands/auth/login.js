import { AUTH_SCOPE, login as loginService } from '../../services/auth-service.js';
import { promptInput, promptPassword, promptSelect } from '../../cli/prompts.js';
import { withSpinner } from '../../cli/spinner.js';

const SCOPE_OPTIONS = [
  { value: AUTH_SCOPE.WORKSPACE, label: '工作空间登录（仅当前项目）' },
  { value: AUTH_SCOPE.GLOBAL, label: '全局登录（所有项目通用）' }
];

export function buildLoginCommand(renderer) {
  return {
    matches: (command, subcommand) => command === 'login' && !subcommand,
    handler: async ({ options }) => {
      const scope = await resolveScope(options);
      const username = await resolveUsername(options);
      const password = await resolvePassword(options);
      const result = await withSpinner('正在登录...', () =>
        loginService({ username, password, scope })
      );
      renderer.success(`登录成功（${scope === AUTH_SCOPE.GLOBAL ? '全局' : '工作空间'}）。`);
      renderer.table(
        [
          ['用户名', result.username],
          ['登录时间', result.loginTime.replace('T', ' ').replace('Z', '')],
          ['过期时间', result.expiresAt.replace('T', ' ').replace('Z', '')],
          ['Authorization', result.authorization]
        ],
        { header: ['字段', '值'] }
      );
      renderer.muted(
        scope === AUTH_SCOPE.GLOBAL
          ? '提示: 全局登录可跨项目共享状态。'
          : '提示: 工作空间登录仅在当前项目中使用，优先级高于全局。'
      );
    }
  };
}

async function resolveScope(options) {
  if (options.g || options.global) {
    return AUTH_SCOPE.GLOBAL;
  }
  if (options.workspace) {
    return AUTH_SCOPE.WORKSPACE;
  }
  if (!process.stdin.isTTY) {
    return AUTH_SCOPE.WORKSPACE;
  }
  return promptSelect('请选择登录范围', SCOPE_OPTIONS);
}

async function resolveUsername(options) {
  const raw = options.username ?? options.u;
  if (raw) {
    return Array.isArray(raw) ? raw[raw.length - 1] : raw;
  }
  if (!process.stdin.isTTY) {
    throw new Error('缺少用户名，请使用 --username 提供。');
  }
  return promptInput('请输入用户名');
}

async function resolvePassword(options) {
  const raw = options.password ?? options.p;
  if (raw) {
    return Array.isArray(raw) ? raw[raw.length - 1] : raw;
  }
  if (!process.stdin.isTTY) {
    throw new Error('缺少密码，请使用 --password 提供。');
  }
  return promptPassword('请输入密码');
}
