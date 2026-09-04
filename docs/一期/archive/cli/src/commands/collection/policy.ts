import { defineCommand } from 'citty';
import { consola } from 'consola';
import {
  applyCommandFlags,
  applyWriteCommandFlags,
  handleCommandError,
  writeJsonSuccess,
} from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  collectionPolicyApply,
  collectionPolicyList,
  collectionPolicySetStatus,
  collectionPolicyTemplateApply,
  collectionPolicyTemplateCommitPreview,
  collectionPolicyTemplatePreview,
} from '../../services/collection/index.js';
import { collectionCommonArgs, collectionEnvArgs } from './common.js';
import {
  listPolicyTemplates,
  parseTemplateParams,
} from '../../services/policyTemplate/index.js';
import { collectionStoreFromCwd } from '../../services/store/index.js';
import {
  confirmPolicyTemplatePreview,
  printPolicyTemplatePreview,
  resolvePolicyTemplateId,
  shouldConfirmPolicyTemplateApply,
} from '../shared/policyTemplateUi.js';

async function runCollectionPolicyTemplateApply(args: {
  cwd?: string;
  template?: unknown;
  'template-id'?: unknown;
  name?: string;
  param?: string | string[];
  'no-auto-pull'?: boolean;
  yes?: boolean;
  json?: boolean;
}) {
  const templateId = resolvePolicyTemplateId(args);
  if (!templateId) {
    throw cliError('请选择合集策略模板', {
      code: 4,
      hint: '先运行 freelog-cli collection policy template list',
    });
  }
  const cwd = resolveCwd(args.cwd);
  const params = parseTemplateParams(args.param);
  if (!shouldConfirmPolicyTemplateApply(args)) {
    return collectionPolicyTemplateApply({
      cwd,
      templateId,
      policyName: args.name ? String(args.name) : undefined,
      params,
      noAutoPull: args['no-auto-pull'],
    });
  }

  const preview = await collectionPolicyTemplatePreview({
    cwd,
    templateId,
    policyName: args.name ? String(args.name) : undefined,
    params,
    noAutoPull: args['no-auto-pull'],
  });
  await confirmPolicyTemplatePreview(preview, '确认应用此合集策略模板？');
  return collectionPolicyTemplateCommitPreview({
    cwd,
    preview,
    noAutoPull: args['no-auto-pull'],
  });
}

const policyApplyCmd = defineCommand({
  meta: { name: 'apply', description: '应用合集策略：推荐 --template；高级路径可用 --from-file' },
  args: {
    'from-file': { type: 'string', description: '高级：策略 JSON 文件路径' },
    template: { type: 'string', description: '策略模板 ID（等价 collection policy template apply）' },
    name: { type: 'string', description: '策略名称；模板路径不传则使用模板标题' },
    param: { type: 'string', description: '模板参数，格式 key=value；多个可用逗号分隔' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      if (args.template) {
        if (args['from-file']) {
          throw cliError('--template 与 --from-file 只能选择一种策略来源', { code: 4 });
        }
        const applied = await runCollectionPolicyTemplateApply({
          ...args,
          template: args.template,
        });
        if (args.json) writeJsonSuccess('collection policy', applied);
        else consola.success(`已从模板应用合集策略：${applied.policyName}`);
        return;
      }
      if (!args['from-file']) {
        throw cliError('缺少合集策略来源', {
          code: 4,
          hint: '普通流程用 collection policy apply --template <templateId>；高级文件路径用 collection policy apply --from-file <file>',
        });
      }
      const items = await collectionPolicyApply({
        cwd: resolveCwd(args.cwd),
        fromFile: args['from-file'],
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('collection policy', { applied: items.length });
      else consola.success(`已应用 ${items.length} 条策略`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policyListCmd = defineCommand({
  meta: { name: 'list', description: '列出合集策略' },
  args: {
    ...collectionEnvArgs,
    'no-auto-pull': { type: 'boolean' as const },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const policies = await collectionPolicyList({ cwd });
      if (args.json) writeJsonSuccess('collection policy', { policies });
      else {
        for (const pol of policies) {
          consola.info(`${pol.policyId || '-'}  ${pol.policyName || '-'}  status=${pol.status}`);
        }
        if (!policies.length) consola.warn('无策略');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policySetCmd = defineCommand({
  meta: { name: 'set', description: '启用或停用合集策略' },
  args: {
    policyId: { type: 'positional', required: true },
    status: { type: 'positional', required: true, description: '0 | 1' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const status = Number(args.status);
      if (status !== 0 && status !== 1) {
        throw cliError(I18N_KEYS.status_must_be_0_or_1, { code: 4 });
      }
      await collectionPolicySetStatus({
        cwd: resolveCwd(args.cwd),
        policyId: String(args.policyId),
        status,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) {
        writeJsonSuccess('collection policy', { policyId: String(args.policyId), status });
      } else {
        consola.success(`${status === 1 ? '已启用' : '已停用'} ${String(args.policyId)}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policyTemplateListCmd = defineCommand({
  meta: { name: 'list', description: '列出当前合集类型可用的策略模板' },
  args: {
    'resource-type': { type: 'string', description: '合集资源类型 code；不传则读取当前合集工程' },
    ...collectionEnvArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const resourceTypeCode = args['resource-type']
        ? String(args['resource-type'])
        : collectionStoreFromCwd(cwd).load().resourceTypeCode;
      if (!resourceTypeCode) {
        throw cliError('缺少合集资源类型，无法列出策略模板', {
          code: 4,
          hint: '传 --resource-type <collection-type-code>，或在合集工程目录中运行',
        });
      }
      const templates = await listPolicyTemplates({ resourceTypeCodes: [resourceTypeCode] });
      if (args.json) writeJsonSuccess('collection policy template list', { templates });
      else {
        for (const template of templates) {
          const inputs = template.inputs.map((input) => input.name).join(', ') || '-';
          consola.info(`${template.id}  ${template.title}  params=${inputs}`);
        }
        if (!templates.length) consola.warn('当前合集类型没有可用策略模板');
      }
    } catch (error) {
      handleCommandError(error, args.json, 'collection policy template list');
    }
  },
});

const policyTemplateRenderCmd = defineCommand({
  meta: { name: 'render', description: '编译并翻译合集策略模板预览，不写平台' },
  args: {
    template: { type: 'positional', required: false, description: '策略模板 ID' },
    'template-id': { type: 'string', description: '策略模板 ID（等价 positional template）' },
    name: { type: 'string', description: '策略名称；不传则使用模板标题' },
    param: { type: 'string', description: '模板参数，格式 key=value；多个可用逗号分隔' },
    ...collectionEnvArgs,
    'no-auto-pull': { type: 'boolean' as const },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const templateId = resolvePolicyTemplateId(args);
      if (!templateId) {
        throw cliError('请选择合集策略模板', {
          code: 4,
          hint: '先运行 freelog-cli collection policy template list',
        });
      }
      const preview = await collectionPolicyTemplatePreview({
        cwd: resolveCwd(args.cwd),
        templateId,
        policyName: args.name ? String(args.name) : undefined,
        params: parseTemplateParams(args.param as string | string[] | undefined),
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('collection policy template render', preview);
      else printPolicyTemplatePreview(preview);
    } catch (error) {
      handleCommandError(error, args.json, 'collection policy template render');
    }
  },
});

const policyTemplateApplyCmd = defineCommand({
  meta: { name: 'apply', description: '从 Console 同源策略模板应用合集策略' },
  args: {
    template: { type: 'positional', required: false, description: '策略模板 ID' },
    'template-id': { type: 'string', description: '策略模板 ID（等价 positional template）' },
    name: { type: 'string', description: '策略名称；不传则使用模板标题' },
    param: { type: 'string', description: '模板参数，格式 key=value；多个可用逗号分隔' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const applied = await runCollectionPolicyTemplateApply(args);
      if (args.json) writeJsonSuccess('collection policy template apply', applied);
      else {
        consola.success(`已从模板应用合集策略：${applied.policyName}`);
      }
    } catch (error) {
      handleCommandError(error, args.json, 'collection policy template apply');
    }
  },
});

const policyTemplateCommand = defineCommand({
  meta: { name: 'template', description: 'Console 同源合集策略模板 Builder' },
  subCommands: { list: policyTemplateListCmd, render: policyTemplateRenderCmd, apply: policyTemplateApplyCmd },
});

export const policyCommand = defineCommand({
  meta: { name: 'policy', description: '合集策略' },
  subCommands: {
    template: policyTemplateCommand,
    apply: policyApplyCmd,
    list: policyListCmd,
    set: policySetCmd,
  },
});
