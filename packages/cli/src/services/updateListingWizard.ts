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
  if (isRssRelatedResource(ctx.info)) {
    consola.info('RSS 资源内容由 feed 托管，不能修改标题、封面、标签或简介');
    throw cliError('RSS 托管资源不可编辑 listing', {
      code: 4,
      hint: '可使用 collection rss inspect/bind/sync 管理订阅源',
    });
  }

  const picked = await p.multiselect({
    message: '选择要更新的 listing 字段',
    options: LISTING_FIELD_OPTIONS,
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
