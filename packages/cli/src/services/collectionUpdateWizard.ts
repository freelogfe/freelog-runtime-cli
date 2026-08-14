import * as p from '@clack/prompts';
import { consola } from 'consola';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { ensureCollectionSynced } from './collection/owner.js';
import { isRssRelatedResource } from './collection/rssContract.js';
import { clackTextField, parseTagsCsv } from './shared/fieldConstraints.js';

export interface CollectionUpdateWizardResult {
  title?: string;
  intro?: string;
  cover?: string;
  tags?: string[];
  displaySort?: string;
  displayTitle?: string;
  displayNo?: string;
  displayImage?: string;
  displayDescr?: string;
  displayView?: string;
}

const LISTING_OPTIONS = [
  { value: 'title' as const, label: '合集标题' },
  { value: 'intro' as const, label: '简介' },
  { value: 'cover' as const, label: '封面' },
  { value: 'tags' as const, label: '标签' },
] as const;

const DISPLAY_OPTIONS = [
  { value: 'display-sort' as const, label: '条目排序', hint: 'asc | desc' },
  { value: 'display-title' as const, label: '条目标题显示', hint: 'rtitle | sn | empty | custom' },
  { value: 'display-no' as const, label: '条目序号', hint: 'show | hide' },
  { value: 'display-image' as const, label: '条目封面', hint: 'show | hide' },
  { value: 'display-descr' as const, label: '条目简介', hint: 'show | hide' },
  { value: 'display-view' as const, label: '目录视图', hint: 'list | card' },
] as const;

type ListingKey = (typeof LISTING_OPTIONS)[number]['value'];
type DisplayKey = (typeof DISPLAY_OPTIONS)[number]['value'];

/** TTY：合集 update — RSS 预检 + listing / display 多选 prompt */
export async function runCollectionUpdateWizard(opts: {
  cwd?: string;
}): Promise<CollectionUpdateWizardResult> {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd });
  if (isRssRelatedResource(ctx.info)) {
    consola.info('RSS 合集内容由 feed 托管，不能修改标题、封面、标签、简介或目录展示');
    throw cliError('RSS 托管合集不可编辑 listing / display', {
      code: 4,
      hint: '可使用 collection rss inspect/bind/sync 管理订阅源',
    });
  }

  const groups = await p.group({
    listing: () =>
      p.multiselect({
        message: '选择要更新的 listing 字段（可跳过）',
        options: [...LISTING_OPTIONS],
      }),
    display: () =>
      p.multiselect({
        message: '选择要更新的目录展示字段（可跳过）',
        options: [...DISPLAY_OPTIONS],
      }),
  });
  if (p.isCancel(groups)) throw cliError(I18N_KEYS.cancelled, { code: 4 });

  const listingFields = new Set((groups.listing || []) as ListingKey[]);
  const displayFields = new Set((groups.display || []) as DisplayKey[]);
  if (!listingFields.size && !displayFields.size) {
    throw cliError(I18N_KEYS.collection_listing_or_display_required, { code: 4 });
  }

  const result: CollectionUpdateWizardResult = {};
  const collection = ctx.collection;

  if (listingFields.has('title')) {
    const answer = await p.text(
      clackTextField('FORM-RES-TITLE', { defaultValue: collection.resourceTitle || '' }),
    );
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.title = String(answer).trim();
  }
  if (listingFields.has('intro')) {
    const answer = await p.text(
      clackTextField('FORM-LIST-INTRO', { defaultValue: collection.intro || '' }),
    );
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.intro = String(answer);
  }
  if (listingFields.has('cover')) {
    const answer = await p.text(clackTextField('FORM-LIST-COVER'));
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.cover = String(answer).trim();
  }
  if (listingFields.has('tags')) {
    const answer = await p.text(
      clackTextField('FORM-LIST-TAGS', { defaultValue: (collection.tags || []).join(', ') }),
    );
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.tags = parseTagsCsv(String(answer));
  }

  if (displayFields.has('display-sort')) {
    const answer = await p.select({
      message: '条目排序\n  asc=升序，desc=降序',
      options: [
        { value: 'asc', label: 'asc（升序）' },
        { value: 'desc', label: 'desc（降序）' },
      ],
    });
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.displaySort = String(answer);
  }
  if (displayFields.has('display-title')) {
    const answer = await p.select({
      message: '条目标题显示方式',
      options: [
        { value: 'rtitle', label: 'rtitle（资源标题）' },
        { value: 'sn', label: 'sn（短名）' },
        { value: 'empty', label: 'empty（不显示）' },
        { value: 'custom', label: 'custom（自定义）' },
      ],
    });
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.displayTitle = String(answer);
  }
  for (const [key, message, options] of [
    ['display-no', '条目序号', ['show', 'hide']],
    ['display-image', '条目封面', ['show', 'hide']],
    ['display-descr', '条目简介', ['show', 'hide']],
  ] as const) {
    if (!displayFields.has(key)) continue;
    const answer = await p.select({
      message: `${message}\n  show | hide`,
      options: options.map((v) => ({ value: v, label: v })),
    });
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    if (key === 'display-no') result.displayNo = String(answer);
    else if (key === 'display-image') result.displayImage = String(answer);
    else result.displayDescr = String(answer);
  }
  if (displayFields.has('display-view')) {
    const answer = await p.select({
      message: '目录视图\n  list | card',
      options: [
        { value: 'list', label: 'list（列表）' },
        { value: 'card', label: 'card（卡片）' },
      ],
    });
    if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    result.displayView = String(answer);
  }

  return result;
}
