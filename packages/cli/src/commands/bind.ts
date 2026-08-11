import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { bindProject } from '../services/bindService.js';

export const bindCommand = defineCommand({
  meta: {
    name: 'bind',
    description: '绑定 Console 已有资源（写 state.resourceId 并 pull）',
  },
  args: {
    target: {
      type: 'positional',
      required: true,
      description: 'resourceId 或 username/shortname',
    },
    'apply-listing': {
      type: 'boolean',
      description: '绑定后把平台 listing 写回 manifest',
    },
    force: { type: 'boolean', description: '覆盖已绑定的 resourceId' },
    cwd: { type: 'string' },
    yes: { type: 'boolean', alias: 'y' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const result = await bindProject({
        cwd: resolveCwd(args.cwd),
        target: String(args.target),
        applyListing: args['apply-listing'],
        force: args.force,
        yes: args.yes,
      });
      if (args.json) {
        writeJsonSuccess('bind', result);
      } else {
        consola.success(`已绑定 ${result.resourceName || result.resourceId}`);
        if (result.latestVersion) consola.info(`latestVersion: ${result.latestVersion}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
