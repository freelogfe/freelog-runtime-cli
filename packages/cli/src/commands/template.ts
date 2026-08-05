import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { listTemplateRefs } from '../services/compat.js';

const listCommand = defineCommand({
  meta: { name: 'list', description: '列出可用项目模板' },
  args: {
    scaffold: { type: 'string', description: 'runtime | package' },
    runtime: { type: 'string', description: '0.4 | 0.5' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const rows = listTemplateRefs().filter((row) => {
        if (args.scaffold && row.scaffold !== args.scaffold) return false;
        if (args.runtime && row.runtime !== args.runtime) return false;
        return true;
      });
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ ok: true, templates: rows })}\n`);
        return;
      }
      if (!rows.length) {
        consola.warn('没有匹配模板');
        return;
      }
      for (const row of rows) {
        const runtime = row.runtime ? ` runtime=${row.runtime}` : '';
        const defaultMark = row.defaultRuntime ? ' default' : '';
        const range = row.freelogRuntimeRange ? ` freelogRuntime=${row.freelogRuntimeRange}` : '';
        consola.info(
          `${row.id}  scaffold=${row.scaffold}${runtime}${defaultMark} version=${row.version}${range}`,
        );
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const templateCommand = defineCommand({
  meta: { name: 'template', description: '模板发现与选择' },
  subCommands: {
    list: listCommand,
  },
});
