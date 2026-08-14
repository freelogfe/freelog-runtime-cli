import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { cliWriteCommandArgs } from '../core/cliArgs.js';
import { createResource } from '../services/resourceService.js';
import { projectStoreFromCwd } from '../services/store/index.js';
import { shouldRunFieldWizard, helpSnippet } from '../services/shared/fieldConstraints.js';
import { runCreateWizard } from '../services/createWizard.js';
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

      let title = typeof args.title === 'string' ? args.title : undefined;
      let typeCode = typeof args.type === 'string' ? args.type : undefined;
      let name = typeof args.name === 'string' ? args.name : undefined;
      let resourceTypeName =
        typeof args['type-name'] === 'string' ? args['type-name'] : undefined;

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
          throw cliError(I18N_KEYS.non_interactive_needs_yes, {
            code: 4,
            hint: '传齐 --title --type --name，或去掉 --yes 进入 TTY 向导',
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
