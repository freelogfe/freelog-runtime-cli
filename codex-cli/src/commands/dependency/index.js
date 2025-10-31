import {
  addDependency,
  changeDependency,
  removeDependencies,
  updateDependencies,
  listDependencies,
  syncDependencies
} from '../../services/dependency-service.js';
import { withSpinner } from '../../cli/spinner.js';

export function buildDependencyCommands(renderer) {
  return [
    {
      matches: (command, subcommand) => command === 'add' && !subcommand,
      handler: async ({ positionals, options }) => {
        if (positionals.length === 0) {
          throw new Error('请指定要添加的依赖，例如 freelog-cli add <resource>@<version>');
        }
        const result = await withSpinner('正在添加依赖...', () =>
          addDependency(positionals[0], options)
        );
        renderer.success(`已添加依赖 ${result.name}@${result.version}`);
      }
    },
    {
      matches: (command, subcommand) => command === 'change' && !subcommand,
      handler: async ({ positionals, options }) => {
        if (positionals.length === 0) {
          throw new Error('请指定要修改的依赖，例如 freelog-cli change <resource>@<version>');
        }
        const result = await withSpinner('正在修改依赖...', () =>
          changeDependency(positionals[0], options)
        );
        renderer.success(`已更新依赖 ${result.name}@${result.version}`);
      }
    },
    {
      matches: (command, subcommand) => command === 'remove' && !subcommand,
      handler: async ({ positionals }) => {
        if (positionals.length === 0) {
          throw new Error('请指定要删除的依赖列表。');
        }
        const count = await withSpinner('正在删除依赖...', () => removeDependencies(positionals));
        renderer.success(`已删除 ${count} 个依赖。`);
      }
    },
    {
      matches: (command, subcommand) => command === 'update' && !subcommand,
      handler: async ({ positionals, options }) => {
        const updated = await withSpinner('正在更新依赖...', () =>
          updateDependencies(positionals, options)
        );
        if (updated.length === 0) {
          renderer.warn('没有依赖被更新。');
        } else {
          renderer.success(`已更新 ${updated.length} 个依赖:`);
          renderer.list(updated.map((item) => `${item.name}@${item.version}`));
        }
      }
    },
    {
      matches: (command, subcommand) => command === 'dep' && subcommand === 'list',
      handler: async ({ options }) => {
        const deps = await withSpinner('正在拉取依赖列表...', () => listDependencies(options));
        if (deps.length === 0) {
          renderer.warn('暂无依赖记录。');
          return;
        }
        renderer.table(
          deps.map((dep) => [
            dep.name,
            dep.version,
            dep.policyId ?? '-',
            dep.authStatus === false ? '未授权' : '已授权',
            dep.resourceId ?? '-'
          ]),
          { header: ['名称', '版本', '策略', '授权', '资源ID'] }
        );
      }
    },
    {
      matches: (command, subcommand) => command === 'dep' && subcommand === 'sync',
      handler: async ({ options }) => {
        const result = await withSpinner('正在同步依赖...', () => syncDependencies(options));
        renderer.success(`已同步依赖 ${result.length} 项。`);
      }
    }
  ];
}
