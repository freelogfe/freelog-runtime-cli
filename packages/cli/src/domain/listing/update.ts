/** listing 更新：title/intro/cover/tags 的 PUT。--yes 且无 flag = 拒绝空更新；不带 status。 */

import { CliError } from '../../core/errors';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { assertRemoteResourceWritable, resolveBoundIdentity } from '../version/gates';
import { updateIdentity } from '../../local/identity';
import { normalizeProjectPath, resolveExistingProjectPath } from '../../local/projectPath';
import { unwrapData } from '../../platform/unwrap';

export type ListingApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  update?: (params: Record<string, unknown>) => Promise<unknown>;
  uploadImage?: (params: { file: Buffer }) => Promise<unknown>;
};

const MAX_TITLE = 100;
const MAX_INTRO = 200;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 20;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif']);

/** 标题 ≤100（对照 Console FInput lengthLimit=100；空串「请输入资源标题」）。 */
function assertTitle(title: string): void {
  if (!title) {
    throw new CliError('请输入资源标题', 'UPDATE_TITLE_REQUIRED');
  }
  if (title.length > MAX_TITLE) {
    // i18n: cli.update.title_too_long
    throw new CliError('标题不能超过100个字符', 'UPDATE_TITLE_LONG');
  }
}

function isAnimatedGif(content: Buffer): boolean {
  if ((content.subarray(0, 6).toString('ascii') !== 'GIF87a' && content.subarray(0, 6).toString('ascii') !== 'GIF89a') || content.length < 13) {
    return true;
  }
  let offset = 13;
  if ((content[10]! & 0x80) !== 0) {
    offset += 3 * (2 ** ((content[10]! & 0x07) + 1));
  }
  let frames = 0;
  while (offset < content.length) {
    const marker = content[offset++];
    if (marker === 0x3b) return frames > 1;
    if (marker === 0x2c) {
      frames += 1;
      if (frames > 1) return true;
      if (offset + 9 > content.length) return true;
      const packed = content[offset + 8]!;
      offset += 9;
      if ((packed & 0x80) !== 0) offset += 3 * (2 ** ((packed & 0x07) + 1));
      offset += 1; // LZW 最小码长
    } else if (marker === 0x21) {
      offset += 1; // extension label
    } else {
      return true;
    }
    while (offset < content.length) {
      const size = content[offset++]!;
      if (size === 0) break;
      offset += size;
    }
  }
  return true;
}

function assertCoverContent(extension: string, content: Buffer): void {
  const isJpeg = content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  const isPng = content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = content.subarray(0, 6).toString('ascii') === 'GIF87a' || content.subarray(0, 6).toString('ascii') === 'GIF89a';
  if ((extension === '.jpg' || extension === '.jpeg') && isJpeg) return;
  if (extension === '.png' && isPng) return;
  if (extension === '.gif' && isGif && !isAnimatedGif(content)) return;
  throw new CliError('封面必须是 JPG、PNG 或静态 GIF 图片', 'UPDATE_COVER_INVALID');
}

async function uploadCover(cwd: string, cover: string, apis?: ListingApis): Promise<string> {
  const normalized = normalizeProjectPath(cwd, cover, {
    code: 'UPDATE_COVER_OUTSIDE',
    message: '封面必须位于当前工程内',
  });
  const localPath = resolveExistingProjectPath(cwd, path.resolve(cwd, normalized), {
    code: 'UPDATE_COVER_OUTSIDE',
    message: '封面必须位于当前工程内',
  });
  if (!existsSync(localPath)) {
    throw new CliError(`封面文件不存在：${normalized}`, 'UPDATE_COVER_MISSING');
  }
  const stats = statSync(localPath);
  if (!stats.isFile()) {
    throw new CliError('封面必须是一个图片文件', 'UPDATE_COVER_INVALID');
  }
  if (stats.size > MAX_COVER_BYTES) {
    throw new CliError('封面不能超过 5MB', 'UPDATE_COVER_TOO_LARGE');
  }
  const extension = path.extname(normalized).toLowerCase();
  if (!COVER_EXTENSIONS.has(extension)) {
    throw new CliError('封面只支持 JPG、PNG 或静态 GIF', 'UPDATE_COVER_INVALID');
  }
  const content = readFileSync(localPath);
  assertCoverContent(extension, content);
  const upload = apis?.uploadImage
    ?? ((params: { file: Buffer }) => FServiceAPI.Storage.uploadImage(params as never));
  const result = unwrapData(await upload({ file: content }));
  const url = result.url ?? result.fileUrl ?? result.fileURL;
  if (typeof url !== 'string' || !url.trim()) {
    throw new CliError('封面上传成功但平台未返回图片 URL', 'UPDATE_COVER_UPLOAD_INVALID');
  }
  return url;
}

/** 简介 ≤200（对照 Console FIntroductionInput lengthLimit 默认 200）。 */
function assertIntro(intro: string): void {
  if (intro.length > MAX_INTRO) {
    // i18n: cli.update.intro_too_long
    throw new CliError('简介不能超过200个字符', 'UPDATE_INTRO_LONG');
  }
}

/** 标签 ≤20 条、每条 ≤20 字符、不重复（输入中的 # 只是展示前缀，解析时剥掉）。 */
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
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  if (input.yes && input.title === undefined && input.intro === undefined && input.cover === undefined && input.tags === undefined) {
    // i18n: cli.update.no_flags
    throw new CliError('--yes 且无修改项，拒绝空更新', 'UPDATE_NO_FLAGS');
  }
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const info = input.apis?.info ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.info(params as never));
  const remote = unwrapData(await info({ resourceIdOrName: identity.resourceId }));
  assertRemoteResourceWritable({ info: remote, resourceId: identity.resourceId!, authUserId: auth.userId });
  const payload: Record<string, unknown> = {
    resourceId: identity.resourceId,
  };
  const title = input.title?.trim();
  if (input.title !== undefined) {
    assertTitle(title ?? '');
    payload.resourceTitle = title;
  }
  if (input.intro !== undefined) {
    const intro = input.intro.trim();
    assertIntro(intro);
    payload.intro = intro;
  }
  if (input.cover !== undefined) {
    if (!input.cover.trim()) {
      throw new CliError('请提供封面图片路径；本期不支持清空封面', 'UPDATE_COVER_REQUIRED');
    }
    payload.coverImages = [await uploadCover(input.cwd, input.cover, input.apis)];
  }
  if (input.tags !== undefined) {
    const rawTags = input.tags === ''
      ? []
      : input.tags.split(',').map((item) => item.trim().replaceAll('#', ''));
    if (rawTags.some((tag) => !tag)) {
      throw new CliError('标签不能包含空项', 'UPDATE_TAG_EMPTY');
    }
    assertTags(rawTags);
    payload.tags = rawTags;
  }
  if ('status' in payload) {
    delete payload.status;
  }
  const update =
    input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  await update(payload);
  if (title !== undefined) updateIdentity(input.cwd, identity.n, { title });
  return payload;
}
