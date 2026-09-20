/** 合集策略命令：仅注入合集目标适配器，模板交互复用单资源的公共命令工厂。 */

import { confirm } from '@inquirer/prompts';
import { Command } from 'commander';
import { readSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { resolveCwd } from '../../domain/account/login';
import {
  applyCollectionPolicy,
  getCollectionPolicyList,
  getCollectionPolicyTemplateCatalog,
  getCollectionPolicyTemplateInfo,
  prepareCollectionPolicyTemplate,
  setCollectionPolicy,
} from '../../domain/collection/policy';
import { createPolicyTemplateCommandWithBackend } from '../policy/template';
import { addCollectionOptions } from './options';

/** 装配合集策略目录、模板选择/提交和显式开关命令。 */
export function createCollectionPolicyCommand(): Command {
  const policy = addCollectionOptions(new Command('policy')).description('合集自身授权策略');
  policy.addCommand(createPolicyTemplateCommandWithBackend({
    addOptions: addCollectionOptions,
    backend: {
      commandPrefix: 'freelog-cli collection policy template',
      getCatalog: ({ cwd, file }) => getCollectionPolicyTemplateCatalog({ cwd, selector: file }),
      getInfo: ({ cwd, file, templateId }) => getCollectionPolicyTemplateInfo({ cwd, selector: file, templateId }),
      prepare: ({ cwd, file, templateId, expectedFingerprint, params, requireEveryParam }) => prepareCollectionPolicyTemplate({ cwd, selector: file, templateId, expectedFingerprint, params, requireEveryParam }),
      apply: ({ cwd, file, policyName, policyText }) => applyCollectionPolicy({ cwd, selector: file, policyName, policyText }),
    },
  }));
  policy.addCommand(addCollectionOptions(new Command('list'))
    .description('查看当前合集的全部自身授权策略')
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      const policies = await getCollectionPolicyList({ cwd: resolveCwd(shared.cwd), selector: shared.file });
      console.log(policies.length ? policies.map((item) => `${item.policyId}\t${item.policyName}\t${item.status === 1 ? 'on' : 'off'}`).join('\n') : '还没有授权策略');
    }));
  policy.addCommand(addCollectionOptions(new Command('set'))
    .description('启用或停用合集自身策略')
    .requiredOption('--id <policyId>', '策略编号')
    .option('--on', '启用')
    .option('--off', '停用')
    .action(async function(this: Command, options: { id: string; on?: boolean; off?: boolean }) {
      const shared = readSharedOptions(this);
      if (options.on === options.off) throw new CliError('必须且只能提供 --on 或 --off', 'POLICY_SET_DIRECTION');
      if (!shared.yes && !await confirm({ message: `${options.on ? '启用' : '停用'}策略 ${options.id}？`, default: true })) return;
      await setCollectionPolicy({ cwd: resolveCwd(shared.cwd), selector: shared.file, policyId: options.id, on: options.on === true });
      console.log(`已${options.on ? '启用' : '停用'}授权策略`);
    }));
  return policy;
}
