import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { policyApplyFromFile, policyList, policySetStatus } from '../services/policyService.js';
import {
  listPolicyTemplates,
  parseTemplateParams,
  policyTemplateApply,
} from '../services/policyTemplateService.js';
import { policyInit } from '../services/scaffoldInit.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

import { cliReadCommandArgs, cliWriteCommandArgs } from '../core/cliArgs.js';
import {
  finalizeSessionCommand,
  resolveSessionMaintenanceStore,
} from '../services/store/index.js';

const policyApply = defineCommand({
  meta: { name: 'apply', description: '从 --from-file 应用策略' },
  args: {
    'from-file': { type: 'string', required: true, description: '策略 JSON 文件路径' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const store = resolveSessionMaintenanceStore({
        cwd: resolveCwd(args.cwd),
        session: args.session,
        'resource-id': args['resource-id'],
      });
      const items = await policyApplyFromFile({
        store,
        fromFile: args['from-file'],
        noAutoPull: args['no-auto-pull'],
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: { applied: items.length },
      });
      if (args.json) {
        writeJsonSuccess('policy apply', payload);
      } else {
        consola.success(`已应用 ${items.length} 条策略`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policyListCmd = defineCommand({
  meta: { name: 'list', description: '列出策略' },
  args: {
    ...cliReadCommandArgs,
    session: cliWriteCommandArgs.session,
    'resource-id': cliWriteCommandArgs['resource-id'],
    'export-project': cliWriteCommandArgs['export-project'],
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const store = resolveSessionMaintenanceStore({
        cwd: resolveCwd(args.cwd),
        session: args.session,
        'resource-id': args['resource-id'],
      });
      const policies = await policyList({ store });
      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: { policies },
      });
      if (args.json) {
        writeJsonSuccess('policy list', payload);
      } else {
        for (const p of policies) {
          consola.info(`${p.policyId || '-'}  ${p.policyName || '-'}  status=${p.status}`);
        }
        if (!policies.length) consola.warn('无策略');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policySetCmd = defineCommand({
  meta: { name: 'set', description: '启用或停用策略' },
  args: {
    policyId: { type: 'positional', required: true, description: '策略 ID' },
    status: { type: 'string', required: true, description: '0=停用 | 1=启用' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const status = Number(args.status);
      if (status !== 0 && status !== 1) {
        throw cliError(I18N_KEYS.status_must_be_0_or_1, { code: 4 });
      }
      const store = resolveSessionMaintenanceStore({
        cwd: resolveCwd(args.cwd),
        session: args.session,
        'resource-id': args['resource-id'],
      });
      await policySetStatus({
        store,
        policyId: String(args.policyId),
        status,
        noAutoPull: args['no-auto-pull'],
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: { policyId: String(args.policyId), status },
      });
      if (args.json) {
        writeJsonSuccess('policy set', payload);
      } else {
        consola.success(`${status === 1 ? '已启用' : '已停用'} ${String(args.policyId)}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const policyTemplateListCmd = defineCommand({
  meta: { name: 'list', description: '列出当前资源类型可用的策略模板' },
  args: {
    'resource-type': { type: 'string', description: '平台资源类型 code；不传则读取当前工程' },
    ...cliReadCommandArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const resourceTypeCode = args['resource-type']
        ? String(args['resource-type'])
        : resolveSessionMaintenanceStore({
            cwd: resolveCwd(args.cwd),
            session: false,
          }).loadResource().resourceTypeCode;
      if (!resourceTypeCode) {
        throw cliError('缺少资源类型，无法列出策略模板', {
          code: 4,
          hint: '传 --resource-type <code>，或在已 init/create 的工程目录中运行',
        });
      }
      const templates = await listPolicyTemplates({ resourceTypeCodes: [resourceTypeCode] });
      if (args.json) {
        writeJsonSuccess('policy template list', { templates });
      } else {
        for (const template of templates) {
          const inputs = template.inputs.map((input) => input.name).join(', ') || '-';
          consola.info(`${template.id}  ${template.title}  params=${inputs}`);
        }
        if (!templates.length) consola.warn('当前资源类型没有可用策略模板');
      }
    } catch (error) {
      handleCommandError(error, args.json, 'policy template list');
    }
  },
});

const policyTemplateApplyCmd = defineCommand({
  meta: { name: 'apply', description: '从 Console 同源策略模板编译、预览并应用策略' },
  args: {
    template: { type: 'positional', required: false, description: '策略模板 ID' },
    'template-id': { type: 'string', description: '策略模板 ID（等价 positional template）' },
    name: { type: 'string', description: '策略名称；不传则使用模板标题' },
    param: { type: 'string', description: '模板参数，格式 key=value；多个可用逗号分隔' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const templateId = String(args.template || args['template-id'] || '').trim();
      if (!templateId) {
        throw cliError('请选择策略模板', {
          code: 4,
          hint: '先运行 freelog-cli policy template list，再运行 freelog-cli policy template apply <templateId>',
        });
      }
      const store = resolveSessionMaintenanceStore({
        cwd: resolveCwd(args.cwd),
        session: args.session,
        'resource-id': args['resource-id'],
      });
      const applied = await policyTemplateApply({
        store,
        templateId,
        policyName: args.name ? String(args.name) : undefined,
        params: parseTemplateParams(args.param as string | string[] | undefined),
        noAutoPull: args['no-auto-pull'],
      });
      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: applied,
      });
      if (args.json) {
        writeJsonSuccess('policy template apply', payload);
      } else {
        consola.success(`已从模板应用策略：${applied.policyName}`);
        if (applied.translation) consola.info(applied.translation);
        consola.info('下一步：freelog-cli online --yes --env dev');
      }
    } catch (error) {
      handleCommandError(error, args.json, 'policy template apply');
    }
  },
});

const policyTemplateCommand = defineCommand({
  meta: { name: 'template', description: 'Console 同源策略模板 Builder' },
  subCommands: {
    list: policyTemplateListCmd,
    apply: policyTemplateApplyCmd,
  },
});

export const policyCommand = defineCommand({
  meta: { name: 'policy', description: '策略管理' },
  subCommands: {
    init: policyInit,
    template: policyTemplateCommand,
    apply: policyApply,
    list: policyListCmd,
    set: policySetCmd,
  },
});
