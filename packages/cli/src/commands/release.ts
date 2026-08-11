import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { releaseProject } from '../services/releaseService.js';

export const releaseCommand = defineCommand({
  meta: {
    name: 'release',
    description: '发版流水线：validate → 可选 build → bump → publish → 可选 online',
  },
  args: {
    bump: {
      type: 'string',
      description: '升版本：patch|minor|major',
    },
    'build-cmd': { type: 'string', description: '发布前执行的本地命令，如 npm run build' },
    online: { type: 'boolean', description: 'publish 成功后执行 online' },
    'skip-validate': { type: 'boolean', description: '跳过 validate 预检' },
    'dry-run': { type: 'boolean', description: '仅 publish dry-run（不实际上线）' },
    'changelog-from-git': {
      type: 'boolean',
      description: '用最近一次 git commit 正文作为 publish description',
    },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const bumpRaw = args.bump;
      const bump =
        bumpRaw === undefined
          ? false
          : bumpRaw === 'true' || bumpRaw === '1'
            ? true
            : bumpRaw;

      const result = await releaseProject({
        cwd: resolveCwd(args.cwd),
        bump,
        'build-cmd': args['build-cmd'],
        online: args.online,
        skipValidate: args['skip-validate'],
        dryRun: args['dry-run'],
        noAutoPull: args['no-auto-pull'],
        yes: args.yes,
        debug: args.debug,
        changelogFromGit: args['changelog-from-git'],
      });

      if (args.json) {
        writeJsonSuccess('release', result);
        return;
      }

      if (result.validated) consola.success('预检通过');
      if (result.built) consola.success('build 完成');
      if (result.validatedAfterBuild) consola.success('build 产物复检通过');
      if (result.bumped) consola.success(`已 bump 版本 → ${result.bumped}`);
      if (result.changelogFromGit) {
        consola.success(`已写入 changelog（git）: ${result.changelogFromGit.split('\n')[0]}`);
      }
      if (result.published) {
        if (result.subject === 'collection') {
          const coll = result.published as { itemCount?: number; dryRun?: boolean };
          consola.success(
            args['dry-run']
              ? '合集 dry-run 完成'
              : `已发布合集（draft items=${coll.itemCount ?? '?'})`,
          );
        } else {
          const pub = result.published as {
            version?: string;
            filename?: string;
            stages?: { package?: string; upload?: string; properties?: string; platformWrite?: string };
          };
          consola.success(
            args['dry-run']
              ? 'dry-run 完成'
              : `已发行 ${pub.version}（${pub.filename}）`,
          );
          if (pub.stages) {
            consola.info(
              `阶段：package=${pub.stages.package} upload=${pub.stages.upload} properties=${pub.stages.properties} platformWrite=${pub.stages.platformWrite}`,
            );
          }
        }
      }
      if (result.online) {
        consola.success(result.online.already ? '资源已在上架状态' : '已上架');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
