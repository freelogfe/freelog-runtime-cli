import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyWriteCommandFlags, handleCommandError } from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { runCollectionFolderWizard } from '../../services/collectionFolderWizard.js';

export const initFromFolderCmd = defineCommand({
  meta: {
    name: 'init-from-folder',
    description: '从媒体文件夹创建合集工程并导入条目（方案 A：不经过 init 五选一）',
  },
  args: {
    'project-dir': {
      type: 'string',
      description: '合集项目目录名（默认交互输入）',
    },
    'media-dir': {
      type: 'string',
      description: '媒体文件夹路径（顶层每个文件 → 一个子资源 + 目录单品）',
    },
    cwd: { type: 'string' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args as { test?: boolean; env?: string; debug?: boolean });
      const cwd = resolveCwd(typeof args.cwd === 'string' ? args.cwd : undefined);
      const coll = await runCollectionFolderWizard({
        cwd,
        projectDir:
          typeof args['project-dir'] === 'string' ? args['project-dir'] : undefined,
        mediaDir: typeof args['media-dir'] === 'string' ? args['media-dir'] : undefined,
        yes: Boolean(args.yes),
      });
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: true, mode: 'collection_init_from_folder', ...coll })}\n`,
        );
      } else {
        consola.success(
          `合集 ${coll.projectDir} 已创建并导入 ${coll.importedCount} 个子资源`,
        );
        consola.info('下一步:');
        consola.info('  freelog-cli collection version set --description "首版" --env dev');
        consola.info('  freelog-cli collection publish --yes --env dev');
        consola.info(
          '  freelog-cli collection policy apply --from-file ./policy.free.json --yes --env dev',
        );
        consola.info('  freelog-cli online --yes --env dev');
      }
    } catch (error) {
      handleCommandError(error, Boolean(args.json));
    }
  },
});
