import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyWriteCommandFlags, handleCommandError, writeJsonSuccess } from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { cliWriteCommandArgs } from '../core/cliArgs.js';
import { createResource } from '../services/resourceService.js';
import { projectStoreFromCwd } from '../services/store/index.js';
import { shouldRunFieldWizard, helpSnippet } from '../services/shared/fieldConstraints.js';
import { resolveCreateCommandInput, runCreateWizard } from '../services/createWizard.js';
import { isInteractive } from '../core/tty.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

export const createCommand = defineCommand({
  meta: { name: 'create', description: '创建平台资源壳并写回 owner' },
  args: {
    title: { type: 'string', description: `资源标题（${helpSnippet('FORM-RES-TITLE')}）` },
    type: { type: 'string', description: 'resourceTypeCode（须为平台叶子类型）' },
    name: { type: 'string', description: `短授权标识（${helpSnippet('FORM-RES-NAME')}）` },
    'type-name': { type: 'string', description: '自定义类型名（可选）' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);

      const cwd = resolveCwd(args.cwd);
      const store = projectStoreFromCwd(cwd);
      const resolved = resolveCreateCommandInput(
        {
          title: typeof args.title === 'string' ? args.title : undefined,
          typeCode: typeof args.type === 'string' ? args.type : undefined,
          name: typeof args.name === 'string' ? args.name : undefined,
          resourceTypeName:
            typeof args['type-name'] === 'string' ? args['type-name'] : undefined,
        },
        store.loadResource(),
      );
      let { title, typeCode, name, resourceTypeName } = resolved;

      if (
        shouldRunFieldWizard({
          yes: args.yes,
          json: args.json,
          hasBusinessFlags: Boolean(title && typeCode && name),
        })
      ) {
        const wizard = await runCreateWizard({ title, typeCode, name });
        title = wizard.title;
        typeCode = wizard.typeCode;
        name = wizard.name;
        resourceTypeName = resourceTypeName || wizard.resourceTypeName;
      } else if (!title || !typeCode || !name) {
        if (!isInteractive(args.yes)) {
          const fields = [!title && 'title', !typeCode && 'type', !name && 'name'].filter(Boolean);
          throw cliError(I18N_KEYS.create_fields_required, {
            code: 4,
            params: { fields: fields.join(', ') },
            hint: '在 freelog.manifest.json 补齐字段，或传对应 create 覆盖参数',
          });
        }
      }

      const data = await createResource({
        store,
        title,
        typeCode,
        name,
        resourceTypeName,
      });

      if (args.json) {
        writeJsonSuccess('create', { resource: data });
      } else {
        consola.success(`已创建资源 ${data.resourceId}（${data.resourceName}）`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
