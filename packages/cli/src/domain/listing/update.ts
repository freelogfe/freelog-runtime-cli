/** listing 更新：title/intro/cover/tags 的 PUT。--yes 且无 flag = 拒绝空更新；不带 status。 */

import { CliError } from '../../core/errors';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { askInput, confirmWrite, isInteractive } from '../../core/tty';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { assertRemoteResourceOwned, assertRemoteResourceWritable, resolveBoundIdentity } from '../version/gates';
import { updateIdentity } from '../../local/identity';
import { withProjectLock } from '../../local/lock';
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

/** 先完整读取并校验本地封面；用户确认前不能发生存储上传。 */
function readCover(cwd: string, cover: string): Buffer {
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
  return content;
}

async function uploadCover(content: Buffer, apis?: ListingApis): Promise<string> {
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

export type ListingView = {
  resourceName: string;
  title: string;
  intro: string;
  tags: string[];
  coverImages: string[];
  status: number;
};
export type ListingUpdateResult = { resourceId: string; changed: boolean; listing: ListingView };
type ListingInput = {
  cwd: string;
  file?: string;
  title?: string;
  intro?: string;
  cover?: string;
  tags?: string;
  yes?: boolean;
  json?: boolean;
  homeDir?: string;
  apis?: ListingApis;
  /** 命令只接收公开投影，用来在提问/写入之前展示当前资料。 */
  onCurrent?: (listing: ListingView) => void;
};

function listingView(info: Record<string, unknown>): ListingView {
  if (typeof info.resourceName !== 'string' || !info.resourceName || typeof info.resourceTitle !== 'string' || !info.resourceTitle.trim()
    || typeof info.intro !== 'string' || !Array.isArray(info.tags) || info.tags.some((item) => typeof item !== 'string')
    || !Array.isArray(info.coverImages) || info.coverImages.some((item) => typeof item !== 'string')
    || ![0, 1, 4].includes(info.status as number)) {
    throw new CliError('平台资源资料字段缺失或无效，拒绝修改', 'UPDATE_INFO_INVALID');
  }
  return { resourceName: info.resourceName, title: info.resourceTitle, intro: info.intro,
    tags: [...info.tags] as string[], coverImages: [...info.coverImages] as string[], status: info.status as number };
}

function parseTags(value: string): string[] {
  const tags = value === '' ? [] : value.split(',').map((item) => item.trim().replaceAll('#', ''));
  if (tags.some((tag) => !tag)) throw new CliError('标签不能包含空项', 'UPDATE_TAG_EMPTY');
  assertTags(tags);
  return tags;
}

/** 每项空输入只表示保留；显式清空应使用 --intro "" / --tags ""。 */
async function askField(label: string, current: string, validate: (value: string) => void, output?: Parameters<typeof askInput>[1]): Promise<string | undefined> {
  for (;;) {
    const value = (await askInput(`${label}（当前：${current || '（空）'}；回车保留）`, output)).trim();
    if (!value) return undefined;
    try { validate(value); return value; }
    catch (error) {
      if (!(error instanceof CliError)) throw error;
      console.warn(error.message);
    }
  }
}

function resultUnknown(): CliError {
  return new CliError('资源信息更新结果未知；请先核对线上资料，勿重复执行。', 'UPDATE_RESULT_UNKNOWN');
}

/** 全量校验、确认后至多写一次，精确读回后才同步本地标题；status永不进入PUT。 */
export async function updateListing(input: ListingInput): Promise<ListingUpdateResult> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const noFlags = input.title === undefined && input.intro === undefined && input.cover === undefined && input.tags === undefined;
  if (noFlags && (input.yes || !isInteractive())) {
    // i18n: cli.update.no_flags
    throw new CliError('请提供修改字段；交互编辑请在终端执行不带 --yes 的 update', 'UPDATE_NO_FLAGS');
  }
  return withProjectLock(input.cwd, () => updateListingLocked(input, auth.userId, noFlags), 'update-listing');
}

/** 锁内只处理同一份已绑定身份；不在确认后重新选择N.json。 */
async function updateListingLocked(input: ListingInput, authUserId: number, noFlags: boolean): Promise<ListingUpdateResult> {
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const info = input.apis?.info ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.info(params as never));
  const remote = unwrapData(await info({ resourceIdOrName: identity.resourceId }));
  assertRemoteResourceWritable({ info: remote, resourceId: identity.resourceId!, authUserId });
  if (['feedUrl', 'rssGuid', 'rssPubDate'].some((key) => typeof remote[key] === 'string' && (remote[key] as string).trim())) {
    throw new CliError('RSS 相关资源当前不支持修改展示信息', 'UPDATE_RSS_READONLY');
  }
  const before = listingView(remote);
  input.onCurrent?.(structuredClone(before));
  let { title, intro, cover, tags } = input;
  const promptOutput = input.json ? process.stderr : undefined;
  if (noFlags) {
    title = await askField('标题', before.title, assertTitle, promptOutput);
    cover = await askField('封面图片路径', before.coverImages.length ? '已有封面' : '无封面', (value) => { readCover(input.cwd, value); }, promptOutput);
    intro = await askField('简介', before.intro, assertIntro, promptOutput);
    tags = await askField('标签（逗号分隔）', before.tags.join('、'), (value) => { parseTags(value); }, promptOutput);
  }
  const payload: Record<string, unknown> = {
    resourceId: identity.resourceId,
  };
  title = title?.trim();
  if (title !== undefined) {
    assertTitle(title);
    if (title !== before.title) payload.resourceTitle = title;
  }
  if (intro !== undefined) {
    intro = intro.trim();
    assertIntro(intro);
    if (intro !== before.intro) payload.intro = intro;
  }
  let coverBytes: Buffer | undefined;
  if (cover !== undefined) {
    if (!cover.trim()) {
      throw new CliError('请提供封面图片路径；本期不支持清空封面', 'UPDATE_COVER_REQUIRED');
    }
    coverBytes = readCover(input.cwd, cover);
  }
  if (tags !== undefined) {
    const parsed = parseTags(tags);
    if (!isDeepStrictEqual(parsed, before.tags)) payload.tags = parsed;
  }
  if (Object.keys(payload).length === 1 && !coverBytes) return { resourceId: identity.resourceId!, changed: false, listing: before };
  await confirmWrite(`修改资源展示信息\n标识：${before.resourceName}\n${Object.entries(payload).filter(([key]) => key !== 'resourceId').map(([key, value]) => `${key}：${JSON.stringify(value)}`).join('\n')}${coverBytes ? `\n封面：${cover}` : ''}`, input.yes, promptOutput);
  if (coverBytes) {
    payload.coverImages = [await uploadCover(coverBytes, input.apis)];
  }
  const update =
    input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  try {
    const response = await update(payload) as { ret?: unknown; errCode?: unknown } | null;
    if (!response || typeof response !== 'object' || Array.isArray(response)
      || (response.ret !== undefined && response.ret !== 0) || (response.errCode !== undefined && response.errCode !== 0)) throw resultUnknown();
  } catch { throw resultUnknown(); }
  let afterInfo: Record<string, unknown>;
  try { afterInfo = unwrapData(await info({ resourceIdOrName: identity.resourceId })); }
  catch { throw resultUnknown(); }
  let after: ListingView;
  try {
    assertRemoteResourceOwned({ info: afterInfo, resourceId: identity.resourceId!, authUserId });
    after = listingView(afterInfo);
    const expected = { ...before,
      ...(payload.resourceTitle !== undefined ? { title: payload.resourceTitle } : {}),
      ...(payload.intro !== undefined ? { intro: payload.intro } : {}),
      ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
      ...(payload.coverImages !== undefined ? { coverImages: payload.coverImages } : {}),
    };
    if (afterInfo.isFrozen === true || !isDeepStrictEqual(after, expected)) throw new Error('Listing mismatch');
  } catch { throw new CliError('资源信息写入后读回不一致；请先核对线上资料，勿重复执行。', 'UPDATE_VERIFY_FAILED'); }
  if (payload.resourceTitle !== undefined) {
    try { updateIdentity(input.cwd, identity.n, { title: after.title }); }
    catch { throw new CliError('线上资料已核验更新成功，但本地标题同步失败；请使用 resource sync，不要重复更新线上资料。', 'UPDATE_LOCAL_CACHE_FAILED'); }
  }
  return { resourceId: identity.resourceId!, changed: true, listing: after };
}
