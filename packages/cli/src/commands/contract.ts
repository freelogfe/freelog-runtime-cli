import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyGlobalFlags } from '../core/env.js';
import { resolveCwd } from '../config/paths.js';
import { listContracts } from '../services/contractService.js';
import { handleCommandError } from './login.js';

const listCommand = defineCommand({
  meta: { name: 'list', description: '授权方合约只读列表' },
  args: {
    licensee: { type: 'boolean', description: '以被授权方身份查询（默认授权方）' },
    cwd: { type: 'string' },
    'no-auto-pull': { type: 'boolean' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags(args);
      const data = await listContracts({
        cwd: args.cwd ? resolveCwd(args.cwd) : undefined,
        noAutoPull: args['no-auto-pull'],
        asLicensor: !args.licensee,
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, contracts: data })}\n`);
      else consola.info(JSON.stringify(data, null, 2));
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const contractCommand = defineCommand({
  meta: { name: 'contract', description: '合约只读（不含支付）' },
  subCommands: {
    list: listCommand,
  },
});
