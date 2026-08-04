import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import { runInitScaffold } from '../services/scaffold.js';

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: '脚手架：可选工程模板 + freelog.manifest.json（不 create 资源）',
  },
  args: {
    dir: { type: 'positional', description: '项目目录名；传 . 表示当前目录', required: true },
    scaffold: {
      type: 'string',
      description: 'runtime | package | none | collection',
      default: 'runtime',
    },
    template: { type: 'string', description: '模板 id，如 vite-vue-ts' },
    runtime: { type: 'string', description: '0.4 | 0.5（运行时资源）' },
    'resource-type': { type: 'string', description: '平台 resourceTypeCode（所有脚手架必填）' },
    'resource-name': { type: 'string', description: '资源短授权标识；默认目录名' },
    title: { type: 'string', description: '资源标题；默认资源短授权标识' },
    namespace: { type: 'string', description: '前端库命名空间' },
    'templates-dir': { type: 'string', description: '本地 templates 根目录' },
    pm: { type: 'string', description: 'pnpm | npm | yarn（默认 pnpm）' },
    'skip-install': { type: 'boolean', description: '跳过依赖安装' },
    cwd: { type: 'string' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const scaffold = args.scaffold as 'runtime' | 'package' | 'none' | 'collection';
      if (!['runtime', 'package', 'none', 'collection'].includes(scaffold)) {
        throw new CliError('非法 --scaffold', { code: 4 });
      }
      let runtime: '0.4' | '0.5' | undefined;
      if (args.runtime) {
        if (args.runtime !== '0.4' && args.runtime !== '0.5') {
          throw new CliError('--runtime 仅支持 0.4 或 0.5', { code: 4 });
        }
        runtime = args.runtime;
      }
      let pm: 'pnpm' | 'npm' | 'yarn' | undefined;
      if (args.pm) {
        if (!['pnpm', 'npm', 'yarn'].includes(args.pm)) {
          throw new CliError('--pm 仅支持 pnpm|npm|yarn', { code: 4 });
        }
        pm = args.pm as 'pnpm' | 'npm' | 'yarn';
      }

      const result = await runInitScaffold({
        dir: String(args.dir),
        cwd: resolveCwd(args.cwd),
        scaffold,
        template: args.template,
        runtime,
        resourceTypeCode: args['resource-type'],
        resourceName: args['resource-name'],
        title: args.title,
        namespace: args.namespace,
        templatesDir: args['templates-dir'],
        pm,
        skipInstall: Boolean(args['skip-install']),
        overwrite: Boolean(args.yes),
      });

      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: true, projectDir: result.projectDir, cliVersion: result.compat?.cliVersion })}\n`,
        );
      } else {
        consola.success(`已创建 ${result.projectDir}`);
        consola.info('下一步: freelog-cli login → freelog-cli create');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
