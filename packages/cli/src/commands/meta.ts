import { defineCommand } from 'citty';
import { consola } from 'consola';
import path from 'node:path';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import { prepareLocalFileForPlatform } from '../services/storageUpload.js';
import { compareFileMetaRestAndSse } from '../services/metaInfoParity.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

const compareCommand = defineCommand({
  meta: {
    name: 'compare',
    description: '对比 REST filesListInfo 与 SSE listSSE/info 同 sha1 的 metaInfoArray',
  },
  args: {
    file: { type: 'string', description: '本地文件（会上传若尚未存在）' },
    sha1: { type: 'string', description: '已有 sha1（与 --file 二选一）' },
    'resource-type': { type: 'string', description: 'resourceTypeCode，如 RT005001' },
    cwd: { type: 'string' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const typeCode = args['resource-type']?.trim();
      if (!typeCode) throw cliError(I18N_KEYS.missing_resource_type_flag, { code: 4 });

      let sha1 = args.sha1?.trim();
      if (!sha1) {
        if (!args.file?.trim()) {
          throw cliError(I18N_KEYS.missing_file_or_sha1, { code: 4 });
        }
        const filePath = path.resolve(resolveCwd(args.cwd), args.file);
        sha1 = await prepareLocalFileForPlatform(filePath);
      }

      const result = await compareFileMetaRestAndSse({
        sha1: [sha1],
        resourceTypeCode: typeCode,
      });

      if (args.json) {
        process.stdout.write(`${JSON.stringify({ sha1, ...result })}\n`);
      } else if (result.ok) {
        consola.success(`REST/SSE meta 一致（sha1=${sha1.slice(0, 12)}…）`);
      } else {
        consola.error(result.error || 'REST/SSE meta 不一致', result.diffs);
        process.exitCode = 1;
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const metaCommand = defineCommand({
  meta: { name: 'meta', description: '文件 meta 解析 parity 工具（dev/验证用）' },
  subCommands: {
    compare: compareCommand,
  },
});
