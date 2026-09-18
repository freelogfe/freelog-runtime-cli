/** `policy apply`：从策略文本或 JSON 文件追加一条策略。 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { confirm, input } from '@inquirer/prompts';
import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import { applyPolicy } from '../../domain/policy/list';

function parsePolicy(file: string): { policyName?: string; policyText: string } {
  const text = readFileSync(file, 'utf8');
  if (path.extname(file).toLowerCase() !== '.json') return { policyText: text };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new CliError('策略 JSON 无法解析', 'POLICY_JSON_INVALID'); }
  if (!parsed || typeof parsed !== 'object') throw new CliError('策略 JSON 必须是对象', 'POLICY_JSON_INVALID');
  const value = parsed as Record<string, unknown>;
  if (typeof value.policyText !== 'string') throw new CliError('策略 JSON 缺少 policyText', 'POLICY_JSON_INVALID');
  return { policyName: typeof value.policyName === 'string' ? value.policyName : undefined, policyText: value.policyText };
}

/** 装配从本地策略文本或 JSON 文件追加策略的命令。 */
export function createPolicyApplyCommand(): Command {
  const command = addSharedOptions(new Command('apply'));
  command.description('从本地文件追加策略')
    .option('--from-file <path>', '策略文本或 JSON 路径')
    .option('--name <name>', '策略名，覆盖 JSON 内名称')
    .action(async function (this: Command, options: { fromFile?: string; name?: string }) {
      const shared = readSharedOptions(this);
      const cwd = resolveCwd(shared.cwd);
      const file = shared.file;
      const yes = shared.yes === true;
      if (!options.fromFile) throw new CliError('请提供 --from-file', 'POLICY_FROM_FILE');
      const source = parsePolicy(options.fromFile);
      let policyName = options.name ?? source.policyName;
      if (!policyName) {
        if (yes || !process.stdin.isTTY) throw new CliError('--yes 或非交互模式必须提供 --name 或 JSON policyName', 'POLICY_NAME_REQUIRED');
        policyName = await input({ message: '策略名称' });
      }
      if (!yes && !await confirm({ message: `添加并启用策略「${policyName}」？`, default: true })) return;
      await applyPolicy({ cwd, file, policyName, policyText: source.policyText });
      console.log('已添加并启用授权策略');
    });
  return command;
}
