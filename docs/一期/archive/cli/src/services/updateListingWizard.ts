import * as p from '@clack/prompts';
import { consola } from 'consola';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { ensureSynced } from './sync/index.js';
import type { ProjectStore } from './store/types.js';
import { isRssRelatedResource } from './collection/rssContract.js';
import { clackTextField, parseTagsCsv } from './shared/fieldConstraints.js';

export interface UpdateListingWizardResult {
  title?: string;
  intro?: string;
  cover?: string;
  tags?: string[];
}

const LISTING_FIELD_OPTIONS = [
  { value: 'title' as const, label: '资源标题', hint: 'FORM-RES-TITLE' },
  { value: 'intro' as const, label: '简介', hint: 'FORM-LIST-INTRO' },
  { value: 'cover' as const, label: '封面', hint: 'FORM-LIST-COVER' },
  { value: 'tags' as const, label: '标签', hint: 'FORM-LIST-TAGS' },
];

/** TTY：RSS 预检 + 多选 listing 字段 prompt */
export async function runUpdateListingWizard(store: ProjectStore): Promise<UpdateListingWizardResult> {
  const ctx = await ensureSynced({ store });
  const listingOptions = isRssRelatedResource(ctx.info)
    ? LISTING_FIELD_OPTIONS.filter((option) => option.value === 'tags')
    : LISTING_FIELD_OPTIONS;
  if (isRssRelatedResource(ctx.info)) {
    consola.info('RSS 资源标题、封面、简介由 feed 托管；标签仍可手动维护');
  }

  const picked = await p.multiselect({
    message: '选择要更新的 listing 字段',
    options: listingOptions,
    required: true,
  });
  if (p.isCancel(picked)) throw cliError(I18N_KEYS.cancelled, { code: 4 });

  const fields = new Set(picked as Array<'title' | 'intro' | 'cover' | 'tags'>);
  const result: UpdateListingWizardResult = {};

  if (fields.has('title')) {
    const answer = await p.text(
      clackTextField('FORM-RES-TITLE', { defaultValue: ctx.resource.resourceTitle || '' }),
    );
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.title = String(answer).trim();
  }
  if (fields.has('intro')) {
    const answer = await p.text(
      clackTextField('FORM-LIST-INTRO', { defaultValue: ctx.resource.intro || '' }),
    );
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.intro = String(answer);
  }
  if (fields.has('cover')) {
    const answer = await p.text(clackTextField('FORM-LIST-COVER'));
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.cover = String(answer).trim();
  }
  if (fields.has('tags')) {
    const defaultTags = (ctx.resource.tags || []).join(', ');
    const answer = await p.text(clackTextField('FORM-LIST-TAGS', { defaultValue: defaultTags }));
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.tags = parseTagsCsv(String(answer));
  }

  return result;
}
