import { defineCommand } from 'citty';
import { consola } from 'consola';
import {
  applyCommandFlags,
  applyWriteCommandFlags,
  handleCommandError,
  writeJsonSuccess,
} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { policyApplyFromFile, policyList, policySetStatus } from '../services/policyService.js';
import {
  compilePolicyTemplateForSubject,
  listPolicyTemplates,
  policyTemplateCommitPreview,
  parseTemplateParams,
  policyTemplateApply,
  policyTemplatePreview,
} from '../services/policyTemplate/index.js';
import { policyInit } from '../services/scaffoldInit.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

import { cliReadCommandArgs, cliWriteCommandArgs } from '../core/cliArgs.js';
import {
  finalizeSessionCommand,
  resolveSessionMaintenanceStore,
} from '../services/store/index.js';
import {
  confirmPolicyTemplatePreview,
  printPolicyTemplatePreview,
  resolvePolicyTemplateId,
  shouldConfirmPolicyTemplateApply,
} from './shared/policyTemplateUi.js';

async function runPolicyTemplateApply(args: {
  cwd?: string;
  session?: boolean;
  'resource-id'?: string;
  template?: unknown;
  'template-id'?: unknown;
  name?: string;
  param?: string | string[];
  'no-auto-pull'?: boolean;
  'export-project'?: string;
  yes?: boolean;
  json?: boolean;
}) {
  const templateId = resolvePolicyTemplateId(args);
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
  const params = parseTemplateParams(args.param);
  const applied = shouldConfirmPolicyTemplateApply(args)
    ? await (async () => {
        const preview = await policyTemplatePreview({
          store,
          templateId,
          policyName: args.name ? String(args.name) : undefined,
          params,
          noAutoPull: args['no-auto-pull'],
        });
        await confirmPolicyTemplatePreview(preview, '确认应用此策略模板？');
        return policyTemplateCommitPreview({
          store,
          preview,
          noAutoPull: args['no-auto-pull'],
        });
      })()
    : await policyTemplateApply({
        store,
        templateId,
        policyName: args.name ? String(args.name) : undefined,
        params,
        noAutoPull: args['no-auto-pull'],
      });
  const payload = finalizeSessionCommand({
    store,
    exportProject: args['export-project'],
    result: { ...applied },
  });
  return { applied, payload };
}

const policyApply = defineCommand({
  meta: { name: 'apply', description: '应用策略：推荐 --template；高级路径可用 --from-file' },
  args: {
    'from-file': { type: 'string', description: '高级：策略 JSON 文件路径' },
    template: { type: 'string', description: '策略模板 ID（等价 policy template apply <templateId>）' },
    name: { type: 'string', description: '策略名称；模板路径不传则使用模板标题' },
    param: { type: 'string', description: '模板参数，格式 key=value；多个可用逗号分隔' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      if (args.template) {
        if (args['from-file']) {
          throw cliError('--template 与 --from-file 只能选择一种策略来源', { code: 4 });
        }
        const { applied, payload } = await runPolicyTemplateApply({
          ...args,
          template: args.template,
        });
        if (args.json) {
          writeJsonSuccess('policy apply', payload);
        } else {
          consola.success(`已从模板应用策略：${applied.policyName}`);
          consola.info('下一步：freelog-cli online --yes --env dev');
        }
        return;
      }
      if (!args['from-file']) {
        throw cliError('缺少策略来源', {
          code: 4,
          hint: '普通流程用 policy apply --template <templateId>；高级文件路径用 policy apply --from-file <file>',
        });
      }
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
    status: { type: 'positional', required: true, description: '0=停用 | 1=启用' },
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

const policyTemplateRenderCmd = defineCommand({
  meta: { name: 'render', description: '编译并翻译策略模板预览，不写平台' },
  args: {
    template: { type: 'positional', required: false, description: '策略模板 ID' },
    'template-id': { type: 'string', description: '策略模板 ID（等价 positional template）' },
    'resource-type': { type: 'string', description: '平台资源类型 code；不传则读取当前工程/会话资源' },
    name: { type: 'string', description: '策略名称；不传则使用模板标题' },
    param: { type: 'string', description: '模板参数，格式 key=value；多个可用逗号分隔' },
    ...cliReadCommandArgs,
    session: cliWriteCommandArgs.session,
    'resource-id': cliWriteCommandArgs['resource-id'],
    'no-auto-pull': cliWriteCommandArgs['no-auto-pull'],
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const templateId = resolvePolicyTemplateId(args);
      if (!templateId) {
        throw cliError('请选择策略模板', {
          code: 4,
          hint: '先运行 freelog-cli policy template list，再运行 freelog-cli policy template render <templateId>',
        });
      }
      const params = parseTemplateParams(args.param as string | string[] | undefined);
      const preview = args['resource-type']
        ? await compilePolicyTemplateForSubject({
            resourceTypeCode: String(args['resource-type']),
            templateId,
            policyName: args.name ? String(args.name) : undefined,
            params,
          })
        : await policyTemplatePreview({
            store: resolveSessionMaintenanceStore({
              cwd: resolveCwd(args.cwd),
              session: args.session,
              'resource-id': args['resource-id'],
            }),
            templateId,
            policyName: args.name ? String(args.name) : undefined,
            params,
            noAutoPull: args['no-auto-pull'],
          });
      if (args.json) {
        writeJsonSuccess('policy template render', preview);
      } else {
        printPolicyTemplatePreview(preview);
      }
    } catch (error) {
      handleCommandError(error, args.json, 'policy template render');
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
      const { applied, payload } = await runPolicyTemplateApply(args);
      if (args.json) {
        writeJsonSuccess('policy template apply', payload);
      } else {
        consola.success(`已从模板应用策略：${applied.policyName}`);
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
    render: policyTemplateRenderCmd,
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
