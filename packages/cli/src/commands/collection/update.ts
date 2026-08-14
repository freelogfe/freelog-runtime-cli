import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../../core/command.js';
import { resolveCwd } from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { collectionUpdate } from '../../services/collection/index.js';
import { collectionCommonArgs } from './common.js';
import { shouldRunFieldWizard, helpSnippet } from '../../services/shared/fieldConstraints.js';
import { runCollectionUpdateWizard } from '../../services/collectionUpdateWizard.js';
import { isInteractive } from '../../core/tty.js';

export const updateCmd = defineCommand({
  meta: { name: 'update', description: '更新合集 listing / 展示设置' },
  args: {
    title: { type: 'string', description: `合集标题（${helpSnippet('FORM-RES-TITLE')}）` },
    intro: { type: 'string', description: `简介（${helpSnippet('FORM-LIST-INTRO')}）` },
    cover: { type: 'string', description: `封面 URL 或本地路径（${helpSnippet('FORM-LIST-COVER')}）` },
    tags: { type: 'string', description: `逗号分隔（${helpSnippet('FORM-LIST-TAGS')}）` },
    'display-sort': { type: 'string', description: 'asc|desc' },
    'display-title': { type: 'string', description: 'rtitle|sn|empty|custom' },
    'display-no': { type: 'string', description: 'show|hide' },
    'display-image': { type: 'string', description: 'show|hide' },
    'display-descr': { type: 'string', description: 'show|hide' },
    'display-view': { type: 'string', description: 'list|card' },
    ...collectionCommonArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const cwd = resolveCwd(args.cwd);

      const hasDisplay =
        args['display-sort'] ||
        args['display-title'] ||
        args['display-no'] ||
        args['display-image'] ||
        args['display-descr'] ||
        args['display-view'];
      const hasListingFlags = Boolean(
        args.title || args.intro !== undefined || args.cover || args.tags || hasDisplay,
      );

      let title = typeof args.title === 'string' ? args.title : undefined;
      let intro = args.intro !== undefined ? String(args.intro) : undefined;
      let cover = typeof args.cover === 'string' ? args.cover : undefined;
      let tags = args.tags
        ? args.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined;
      let displaySort = typeof args['display-sort'] === 'string' ? args['display-sort'] : undefined;
      let displayTitle = typeof args['display-title'] === 'string' ? args['display-title'] : undefined;
      let displayNo = typeof args['display-no'] === 'string' ? args['display-no'] : undefined;
      let displayImage = typeof args['display-image'] === 'string' ? args['display-image'] : undefined;
      let displayDescr = typeof args['display-descr'] === 'string' ? args['display-descr'] : undefined;
      let displayView = typeof args['display-view'] === 'string' ? args['display-view'] : undefined;

      if (
        shouldRunFieldWizard({
          yes: args.yes,
          json: args.json,
          hasBusinessFlags: hasListingFlags,
        })
      ) {
        const wizard = await runCollectionUpdateWizard({ cwd });
        title = wizard.title ?? title;
        intro = wizard.intro ?? intro;
        cover = wizard.cover ?? cover;
        tags = wizard.tags ?? tags;
        displaySort = wizard.displaySort ?? displaySort;
        displayTitle = wizard.displayTitle ?? displayTitle;
        displayNo = wizard.displayNo ?? displayNo;
        displayImage = wizard.displayImage ?? displayImage;
        displayDescr = wizard.displayDescr ?? displayDescr;
        displayView = wizard.displayView ?? displayView;
      } else if (!hasListingFlags) {
        throw cliError(I18N_KEYS.collection_listing_or_display_required, { code: 4 });
      } else if (!isInteractive(args.yes) && !hasListingFlags) {
        throw cliError(I18N_KEYS.non_interactive_needs_yes, { code: 4 });
      }

      const data = await collectionUpdate({
        cwd,
        noAutoPull: args['no-auto-pull'],
        title,
        intro,
        cover,
        tags,
        displaySort,
        displayTitle,
        displayNo,
        displayImage,
        displayDescr,
        displayView,
      });
      if (args.json) writeJsonSuccess('collection update', { collection: data });
      else consola.success('已更新合集');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
