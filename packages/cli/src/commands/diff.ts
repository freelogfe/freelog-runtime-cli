import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { diffProject } from '../services/diffService.js';

export const diffCommand = defineCommand({
  meta: { name: 'diff', description: '对比本地 manifest 与平台状态（listing、版本意图、草稿、online 门禁）' },
  args: {
    cwd: { type: 'string' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const result = await diffProject({ cwd: resolveCwd(args.cwd) });

      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: result.ok, ...result })}\n`);
        if (result.hasDrift) process.exit(3);
        return;
      }

      for (const e of result.entries) {
        const mark = e.level === 'same' ? '=' : e.level === 'drift' ? '≠' : '?';
        consola.info(`${mark} ${e.field}`);
        consola.info(`    local:    ${JSON.stringify(e.local)}`);
        consola.info(`    platform: ${JSON.stringify(e.platform)}`);
        if (e.note) consola.info(`    note: ${e.note}`);
      }

      if (result.hasDrift) {
        consola.warn('存在与平台不一致项');
        process.exit(3);
      }
      consola.success('本地与平台一致（在已对比字段范围内）');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
