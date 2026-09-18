/** 合集 listing：标题、封面、简介、标签；不发布、不改目录或收录规则。 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../../core/errors';
import { confirmWrite } from '../../core/tty';
import { updateCollectionIdentity } from '../../local/identity';
import { normalizeProjectPath, resolveExistingProjectPath } from '../../local/projectPath';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

export type CollectionListingApis = CollectionTargetApis & {
  update?: (params: Record<string, unknown>) => Promise<unknown>;
  uploadImage?: (params: { file: Buffer }) => Promise<unknown>;
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif']);

function assertWritable(target: Awaited<ReturnType<typeof resolveCollectionTarget>>): void {
  if (Number(target.info.status) === 2) throw new CliError('冻结合集不能修改信息', 'COLLECTION_FROZEN');
  if (target.info.rssSource === 'yes' || (typeof target.info.feedUrl === 'string' && target.info.feedUrl.trim())) {
    throw new CliError('RSS 合集当前不支持 CLI 信息维护', 'COLLECTION_RSS_READONLY');
  }
}

function imageValid(extension: string, data: Buffer): boolean {
  const jpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const gif = data.subarray(0, 6).toString('ascii') === 'GIF87a' || data.subarray(0, 6).toString('ascii') === 'GIF89a';
  return (extension === '.jpg' || extension === '.jpeg') ? jpeg : extension === '.png' ? png : extension === '.gif' ? gif : false;
}

/** GIF 封面必须只有一个图像帧；无法完整解析时按不安全输入拒绝。 */
function isAnimatedGif(content: Buffer): boolean {
  if ((content.subarray(0, 6).toString('ascii') !== 'GIF87a' && content.subarray(0, 6).toString('ascii') !== 'GIF89a') || content.length < 13) return true;
  let offset = 13;
  if ((content[10]! & 0x80) !== 0) offset += 3 * (2 ** ((content[10]! & 0x07) + 1));
  let frames = 0;
  while (offset < content.length) {
    const marker = content[offset++];
    if (marker === 0x3b) return frames > 1;
    if (marker === 0x2c) {
      frames += 1;
      if (frames > 1 || offset + 9 > content.length) return true;
      const packed = content[offset + 8]!;
      offset += 9;
      if ((packed & 0x80) !== 0) offset += 3 * (2 ** ((packed & 0x07) + 1));
      offset += 1;
    } else if (marker === 0x21) {
      offset += 1;
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

async function uploadCover(cwd: string, source: string, apis?: CollectionListingApis): Promise<string> {
  const normalized = normalizeProjectPath(cwd, source, { code: 'COLLECTION_COVER_OUTSIDE', message: '封面必须位于当前工程内' });
  const localPath = resolveExistingProjectPath(cwd, path.resolve(cwd, normalized), { code: 'COLLECTION_COVER_OUTSIDE', message: '封面必须位于当前工程内' });
  if (!existsSync(localPath) || !statSync(localPath).isFile()) throw new CliError('封面必须是存在的图片文件', 'COLLECTION_COVER_INVALID');
  const stat = statSync(localPath);
  if (stat.size > 5 * 1024 * 1024) throw new CliError('封面不能超过 5MB', 'COLLECTION_COVER_TOO_LARGE');
  const extension = path.extname(localPath).toLowerCase();
  const file = readFileSync(localPath);
  if (!IMAGE_EXTENSIONS.has(extension) || !imageValid(extension, file) || (extension === '.gif' && isAnimatedGif(file))) {
    throw new CliError('封面仅支持 JPG、PNG 或静态 GIF 图片', 'COLLECTION_COVER_INVALID');
  }
  const upload = apis?.uploadImage ?? ((params) => FServiceAPI.Storage.uploadImage(params as never));
  const result = await upload({ file }) as { data?: Record<string, unknown> } | Record<string, unknown>;
  const data = ('data' in result && result.data && typeof result.data === 'object' ? result.data : result) as Record<string, unknown>;
  const url = data.url ?? data.fileUrl ?? data.fileURL;
  if (typeof url !== 'string' || !url.trim()) throw new CliError('封面上传未返回图片 URL', 'COLLECTION_COVER_UPLOAD_INVALID');
  return url;
}

function tagsFromInput(raw: string[]): string[] {
  const tags = raw.map((item) => item.trim().replaceAll('#', ''));
  if (tags.some((item) => !item)) throw new CliError('标签不能包含空项', 'COLLECTION_TAG_EMPTY');
  if (tags.length > 20) throw new CliError('标签最多 20 个', 'COLLECTION_TAGS_TOO_MANY');
  if (tags.some((item) => item.length > 20)) throw new CliError('单个标签不能超过20个字符', 'COLLECTION_TAG_TOO_LONG');
  if (new Set(tags).size !== tags.length) throw new CliError('标签不能重复', 'COLLECTION_TAG_DUPLICATE');
  return tags;
}

function readListing(info: Record<string, unknown>): { title: string; intro: string; tags: string[]; cover?: string } {
  const images = Array.isArray(info.coverImages) ? info.coverImages : [];
  const firstImage = images[0];
  return {
    title: String(info.resourceTitle ?? info.title ?? ''),
    intro: String(info.intro ?? ''),
    tags: Array.isArray(info.tags) ? info.tags.map((tag) => String(tag)) : [],
    ...(typeof firstImage === 'string' ? { cover: firstImage } : {}),
  };
}

function sameTags(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

/** 只发送用户明确提供的 listing 字段；写后同步本地标题缓存。 */
export async function updateCollectionListing(input: {
  cwd: string;
  selector?: string;
  title?: string;
  intro?: string;
  cover?: string;
  tags?: string[];
  clearTags?: boolean;
  yes?: boolean;
  homeDir?: string;
  apis?: CollectionListingApis;
}): Promise<Record<string, unknown>> {
  assertPlatformAllowed();
  if (input.tags !== undefined && input.clearTags) throw new CliError('--tag 与 --clear-tags 不能同时使用', 'COLLECTION_TAGS_CONFLICT');
  if (input.title === undefined && input.intro === undefined && input.cover === undefined && input.tags === undefined && !input.clearTags) {
    throw new CliError('至少提供一个 listing 修改项', 'COLLECTION_LISTING_EMPTY');
  }
  const target = await resolveCollectionTarget(input);
  assertWritable(target);
  const payload: Record<string, unknown> = { resourceId: target.resourceId };
  let title: string | undefined;
  if (input.title !== undefined) {
    title = input.title.trim();
    if (!title) throw new CliError('请输入合集标题', 'COLLECTION_TITLE_REQUIRED');
    if (title.length > 100) throw new CliError('合集标题不超过100个字符', 'COLLECTION_TITLE_TOO_LONG');
    payload.resourceTitle = title;
  }
  if (input.intro !== undefined) {
    const intro = input.intro.trim();
    if (intro.length > 200) throw new CliError('简介不能超过200个字符', 'COLLECTION_INTRO_TOO_LONG');
    payload.intro = intro;
  }
  let cover: string | undefined;
  if (input.cover !== undefined) {
    if (!input.cover.trim()) throw new CliError('请提供封面文件路径；当前不支持清空封面', 'COLLECTION_COVER_REQUIRED');
    cover = await uploadCover(input.cwd, input.cover, input.apis);
    payload.coverImages = [cover];
    // 裁剪能力差异不能因 --yes 或非 TTY 而被隐藏。
    console.warn('提示：CLI 不提供封面裁剪，将上传原图；请先在本地确认构图、尺寸和展示效果。');
  }
  const tags = input.tags !== undefined ? tagsFromInput(input.tags) : input.clearTags ? [] : undefined;
  if (tags !== undefined) payload.tags = tags;
  const update = input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  await confirmWrite(`修改合集展示信息\n${Object.keys(payload).filter((key) => key !== 'resourceId').join('、')}`, input.yes);
  await update(payload);
  const verified = await resolveCollectionTarget(input);
  const actual = readListing(verified.info);
  if ((title !== undefined && actual.title !== title)
    || (input.intro !== undefined && actual.intro !== input.intro.trim())
    || (tags !== undefined && !sameTags(actual.tags, tags))
    || (cover !== undefined && actual.cover !== cover)) {
    throw new CliError('合集展示信息写入后复核不一致；请执行 collection update 前先确认线上状态', 'COLLECTION_LISTING_VERIFY_FAILED');
  }
  if (title !== undefined && verified.local) updateCollectionIdentity(input.cwd, verified.local.n, { title });
  return payload;
}
