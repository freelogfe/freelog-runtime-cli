import { defineCommand } from 'citty';
import { consola } from 'consola';
import path from 'node:path';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { prepareLocalFileForPlatform } from '../services/storageUpload.js';
import { compareCoverSyncAndSse } from '../services/coverGenerateService.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

const compareCommand = defineCommand({
  meta: {
    name: 'compare',
    description: '对比 generateCoverImage 同步 API 与 generateCoverImageSSE 同 sha1 封面 URL',
  },
  args: {
    file: { type: 'string', description: '本地图片（会上传若尚未存在）' },
    sha1: { type: 'string', description: '已有 sha1（与 --file 二选一）' },
    cwd: { type: 'string' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);

      let sha1 = args.sha1?.trim();
      if (!sha1) {
        if (!args.file?.trim()) {
          throw cliError(I18N_KEYS.missing_file_or_sha1, { code: 4 });
        }
        const filePath = path.resolve(resolveCwd(args.cwd), args.file);
        sha1 = await prepareLocalFileForPlatform(filePath);
      }

      const result = await compareCoverSyncAndSse(sha1);

      if (args.json) {
        process.stdout.write(`${JSON.stringify({ sha1, ...result })}\n`);
      } else if (result.ok) {
        consola.success(`同步/SSE 封面 URL 一致（sha1=${sha1.slice(0, 12)}…）`);
      } else {
        consola.error(result.error || '封面 URL 不一致', result);
        process.exitCode = 1;
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const coverCommand = defineCommand({
  meta: { name: 'cover', description: '封面生成 parity 工具（dev/验证用）' },
  subCommands: {
    compare: compareCommand,
  },
});
