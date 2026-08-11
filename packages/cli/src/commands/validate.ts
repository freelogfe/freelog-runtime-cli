import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd, tryLoadVersionProject } from '../config/project.js';
import { validateProject, type ValidateTarget } from '../services/validateService.js';

function parseTarget(raw: string | undefined): ValidateTarget {
  if (raw === 'publish' || raw === 'online') return raw;
  return 'project';
}

async function runValidate(args: {
  cwd?: string;
  for?: string;
  json?: boolean;
}): Promise<void> {
  const cwd = resolveCwd(args.cwd);
  let target: ValidateTarget = args.for ? parseTarget(args.for) : 'project';
  if (!args.for && tryLoadVersionProject(cwd)) {
    target = 'publish';
  }
  const result = await validateProject({ cwd, target });

  if (args.json) {
    writeJsonSuccess('validate', { target: result.target, checks: result.checks }, { ok: result.ok });
    if (!result.ok) process.exit(4);
    return;
  }

  for (const check of result.checks) {
    const prefix = check.level === 'ok' ? '✓' : check.level === 'warn' ? '!' : '✗';
    const line = `${prefix} ${check.message}`;
    if (check.level === 'ok') consola.success(line);
    else if (check.level === 'warn') consola.warn(line);
    else consola.error(line);
    if (check.hint) consola.info(`  → ${check.hint}`);
  }

  if (result.ok) {
    consola.success(`validate 通过 (${result.checks.length} 项)`);
  } else {
    consola.error('validate 未通过');
    process.exit(4);
  }
}

const validateArgs = {
  cwd: { type: 'string' as const },
  for: {
    type: 'string' as const,
    description: '检查深度: project（默认）| publish | online',
  },
  test: { type: 'boolean' as const },
  env: { type: 'string' as const, description: '运行环境：production/prod/test/dev' },
  json: { type: 'boolean' as const },
  debug: { type: 'boolean' as const, description: '打印脱敏调试信息' },
};

export const validateCommand = defineCommand({
  meta: {
    name: 'validate',
    description: '发版前预检（登录、manifest、版本文件、owner、online 门禁等）',
  },
  args: validateArgs,
  async run({ args }) {
    try {
      applyCommandFlags(args);
      await runValidate(args);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const doctorCommand = defineCommand({
  meta: { name: 'doctor', description: 'validate 别名 — 发版前健康检查' },
  args: validateArgs,
  async run({ args }) {
    try {
      applyCommandFlags(args);
      await runValidate(args);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
