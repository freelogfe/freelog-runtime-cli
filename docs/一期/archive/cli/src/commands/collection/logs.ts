import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, handleCommandError, writeJsonSuccess} from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { collectionLogs } from '../../services/collection/index.js';
import { collectionEnvArgs } from './common.js';

export const logsCmd = defineCommand({
  meta: { name: 'logs', description: '合集变更日志' },
  args: {
    skip: { type: 'string', description: '分页偏移，默认 0' },
    limit: { type: 'string', description: '每页条数，默认 20' },
    ...collectionEnvArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const logs = await collectionLogs({
        cwd: resolveCwd(args.cwd),
        skip: args.skip ? Number(args.skip) : undefined,
        limit: args.limit ? Number(args.limit) : undefined,
      });
      if (args.json) writeJsonSuccess('collection logs', { logs });
      else consola.info(JSON.stringify(logs, null, 2));
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
