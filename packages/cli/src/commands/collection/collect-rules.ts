import { defineCommand } from 'citty';
import { consola } from 'consola';
import {
  applyCommandFlags,
  applyWriteCommandFlags,
  handleCommandError,
} from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { collectRulesGet, collectRulesSet } from '../../services/collection/index.js';
import {
  parseBinaryFlag,
  parseConditionType,
} from '../../services/collection/collectRulesContract.js';
import { collectionCommonArgs, collectionEnvArgs } from './common.js';

const collectRulesGetCmd = defineCommand({
  meta: { name: 'get', description: '读取自动收录规则' },
  args: collectionEnvArgs,
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const rules = await collectRulesGet({ cwd: resolveCwd(args.cwd) });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, rules })}\n`);
      else consola.info(JSON.stringify(rules, null, 2));
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const collectRulesSetCmd = defineCommand({
  meta: { name: 'set', description: '设置自动收录规则' },
  args: {
    'from-file': { type: 'string' },
    status: { type: 'string', description: '0|1 自动收录开关' },
    'serialize-status': { type: 'string', description: '0 连载 / 1 完结' },
    'condition-type': { type: 'string', description: '1 every / 2 some' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const body = await collectRulesSet({
        cwd: resolveCwd(args.cwd),
        noAutoPull: args['no-auto-pull'],
        fromFile: args['from-file'],
        status: parseBinaryFlag(args.status, 'status'),
        serializeStatus: parseBinaryFlag(args['serialize-status'], 'serializeStatus'),
        conditionType: parseConditionType(args['condition-type']),
      });
      if (args.json) process.stdout.write(`${JSON.stringify({ ok: true, rules: body })}\n`);
      else consola.success('已更新 collect-rules');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const collectRulesCommand = defineCommand({
  meta: { name: 'collect-rules', description: '自动收录规则' },
  subCommands: { get: collectRulesGetCmd, set: collectRulesSetCmd },
});
