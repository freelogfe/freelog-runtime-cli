import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { updateListing } from '../services/resourceService.js';
import { projectStoreFromCwd } from '../services/store/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { cliWriteCommandArgs } from '../core/cliArgs.js';
import { shouldRunFieldWizard, helpSnippet } from '../services/shared/fieldConstraints.js';
import { runUpdateListingWizard } from '../services/updateListingWizard.js';

export const updateCommand = defineCommand({
  meta: { name: 'update', description: '更新 listing（禁止用 status:1 当上架）' },
  args: {
    title: { type: 'string', description: `资源标题（${helpSnippet('FORM-RES-TITLE')}）` },
    intro: { type: 'string', description: `简介（${helpSnippet('FORM-LIST-INTRO')}）` },
    cover: { type: 'string', description: `封面本地路径或 URL（${helpSnippet('FORM-LIST-COVER')}）` },
    tags: { type: 'string', description: `逗号分隔 tags（${helpSnippet('FORM-LIST-TAGS')}）` },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const store = projectStoreFromCwd(resolveCwd(args.cwd));

      let title = typeof args.title === 'string' ? args.title : undefined;
      let intro = args.intro !== undefined ? String(args.intro) : undefined;
      let cover = typeof args.cover === 'string' ? args.cover : undefined;
      let tags = args.tags
        ? args.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined;

      const hasListingFlags = Boolean(title || intro !== undefined || cover || tags);
      if (
        shouldRunFieldWizard({
          yes: args.yes,
          json: args.json,
          hasBusinessFlags: hasListingFlags,
        })
      ) {
        const wizard = await runUpdateListingWizard(store);
        title = wizard.title ?? title;
        intro = wizard.intro ?? intro;
        cover = wizard.cover ?? cover;
        tags = wizard.tags ?? tags;
      } else if (!hasListingFlags) {
        throw cliError(I18N_KEYS.update_at_least_one_field, { code: 4 });
      }

      const data = await updateListing({
        store,
        title,
        intro,
        cover,
        tags,
        noAutoPull: args['no-auto-pull'],
      });
      if (args.json) writeJsonSuccess('update', { resource: data });
      else consola.success('已更新 listing');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
