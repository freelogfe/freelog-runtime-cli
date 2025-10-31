import { isOptionEnabled } from '../utils/options.js';
import { syncProject } from '../services/sync-service.js';
import { withSpinner } from '../cli/spinner.js';

export function buildSyncCommand(renderer) {
  return {
    matches: (command, subcommand) =>
      command === 'sync' && (!subcommand || subcommand === 'work' || subcommand === 'all'),
    handler: async ({ command, subcommand, positionals, options }) => {
      const resourceSpec = resolveResourceSpec(command, subcommand, positionals);
      const flags = {
        all: isOptionEnabled(options, 'a', 'all'),
        props: isOptionEnabled(options, 'props'),
        config: isOptionEnabled(options, 'config'),
        changelog: isOptionEnabled(options, 'changelog'),
        dependencies: isOptionEnabled(options, 'dependencies', 'dep')
      };
      if (subcommand === 'all') {
        flags.all = true;
      }
      if (subcommand === 'work') {
        flags.config = true;
        flags.dependencies = true;
      }
      const summary = await withSpinner('正在同步远端信息...', () =>
        syncProject({ resourceSpec, options: flags })
      );
      renderer.success('同步完成。');
      renderer.table(
        Object.entries(summary).map(([key, value]) => [translateKey(key), value ? '已更新' : '未变动']),
        { header: ['模块', '状态'] }
      );
    }
  };
}

function resolveResourceSpec(command, subcommand, positionals) {
  if (command === 'sync' && positionals.length > 0) {
    return positionals[0];
  }
  return null;
}

function translateKey(key) {
  switch (key) {
    case 'resourceUpdated':
      return '作品信息';
    case 'dependenciesUpdated':
      return '依赖列表';
    case 'propertiesUpdated':
      return '属性信息';
    case 'configUpdated':
      return '本地配置';
    case 'changelogUpdated':
      return '更新说明';
    default:
      return key;
  }
}
