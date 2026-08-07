import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import { publishVersion } from '../services/resource/index.js';

export const publishCommand = defineCommand({
  meta: { name: 'publish', description: '正式发行版本（sha1 → Storage → createVersion）' },
  args: {
    'dry-run': { type: 'boolean', description: '解析属性并输出 createVersion 请求体，不调用 API' },
    bump: { type: 'boolean', description: '基于平台 latest 自动升 patch 再发行' },
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
      applyCommandFlags(args);
      const result = await publishVersion({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
        bump: args.bump,
        dryRun: args['dry-run'],
        debug: args.debug,
      });
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      } else {
        consola.success(
          `已发行 ${result.version}（${result.filename}，sha1=${result.fileSha1.slice(0, 12)}…）`,
        );
      }
    } catch (error) {
      if (error instanceof CliError && error.code === 5 && args.json) {
        const details = (error.details || {}) as Record<string, unknown>;
        process.stdout.write(
          `${JSON.stringify({
            ok: false,
            code: 5,
            message: error.message,
            unresolvedDependencies: details.unresolvedDependencies || [],
            consoleHint: details.consoleHint || error.hint,
          })}\n`,
        );
        process.exit(5);
      }
      handleCommandError(error, args.json);
    }
  },
});
