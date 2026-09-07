/** listing 更新：title/intro/cover/tags 的 PUT。--yes 且无 flag = 拒绝空更新；不带 status。 */

import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { resolveBoundIdentity } from '../version/gates';

export type ListingApis = {
  update?: (params: Record<string, unknown>) => Promise<unknown>;
};

const MAX_TITLE = 100;
const MAX_INTRO = 200;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 20;

/** 标题 ≤100（对照 Console FInput lengthLimit=100；空串「请输入资源标题」）。 */
function assertTitle(title: string): void {
  if (title.length > MAX_TITLE) {
    // i18n: cli.update.title_too_long
    throw new CliError('标题不能超过100个字符', 'UPDATE_TITLE_LONG');
  }
}

/** 简介 ≤200（对照 Console FIntroductionInput lengthLimit 默认 200）。 */
function assertIntro(intro: string): void {
  if (intro.length > MAX_INTRO) {
    // i18n: cli.update.intro_too_long
    throw new CliError('简介不能超过200个字符', 'UPDATE_INTRO_LONG');
  }
}

/** 标签 ≤20 条、每条 ≤20 字符、不重复、不含 #（对照 Console FResourceLabelEditor）。 */
function assertTags(tags: string[]): void {
  if (tags.length > MAX_TAGS) {
    // i18n: cli.update.tags_too_many
    throw new CliError('标签最多 20 个', 'UPDATE_TAGS_TOO_MANY');
  }
  for (const tag of tags) {
    if (tag.length > MAX_TAG_LENGTH) {
      // i18n: form_input_tag_error_length
      throw new CliError('单个标签长度不能超过20个字符', 'UPDATE_TAG_LONG');
    }
    if (tag.includes('#')) {
      // i18n: cli.update.tag_invalid
      throw new CliError(`标签不能包含 #：${tag}`, 'UPDATE_TAG_INVALID');
    }
  }
  if (tags.some((tag, i) => tags.indexOf(tag) !== i)) {
    // i18n: form_input_tag_error_existed
    throw new CliError('该标签已添加', 'UPDATE_TAG_DUPLICATE');
  }
}

/** 只更新给了的 listing 字段（PUT /v2/resources/{id}）；status 永不携带，上下架走 shelf 命令。 */
export async function updateListing(input: {
  cwd: string;
  file?: string;
  title?: string;
  intro?: string;
  cover?: string;
  tags?: string;
  yes?: boolean;
  homeDir?: string;
  apis?: ListingApis;
}): Promise<Record<string, unknown>> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  if (input.yes && !input.title && !input.intro && !input.cover && !input.tags) {
    // i18n: cli.update.no_flags
    throw new CliError('--yes 且无修改项，拒绝空更新', 'UPDATE_NO_FLAGS');
  }
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const payload: Record<string, unknown> = {
    resourceId: identity.resourceId,
  };
  if (input.title) {
    assertTitle(input.title);
    payload.resourceTitle = input.title;
  }
  if (input.intro) {
    assertIntro(input.intro);
    payload.intro = input.intro;
  }
  if (input.cover) payload.coverImages = [input.cover];
  if (input.tags) {
    const tags = input.tags
      .split(',')
      .map((item) => item.trim().replaceAll('#', ''))
      .filter(Boolean);
    assertTags(tags);
    payload.tags = tags;
  }
  if ('status' in payload) {
    delete payload.status;
  }
  const update =
    input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  await update(payload);
  return payload;
}
