import fs from 'node:fs';
import path from 'node:path';
import type { CustomPropertyDescriptor } from '../config/project.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function firstRecord(...values: unknown[]): RecordValue {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return {};
}

function pickConfig(typeInfo: unknown): RecordValue {
  const record = asRecord(typeInfo) || {};
  return {
    ...record,
    ...firstRecord(record.resourceConfig),
    ...firstRecord(record.fileConfig),
    ...firstRecord(record.versionConfig),
  };
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function includesLocalUploadMode(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  const modes = Array.isArray(value) ? value : [value];
  return modes.some((mode) => {
    if (mode === 1 || mode === '1') return true;
    const numeric = Number(mode);
    if (Number.isFinite(numeric) && (numeric & 1) === 1) return true;
    const text = String(mode).toLowerCase();
    return text.includes('upload') || text.includes('file') || text.includes('local');
  });
}

/** 读取平台 typeInfo 的批量创建能力；缺失能力按 Console 兼容默认值处理。 */
export function isCreateBatchSupported(typeInfo: unknown): boolean {
  const config = pickConfig(typeInfo);
  const support = config.supportCreateBatch;
  return support === undefined || support === null || support === '' || support === 2 || support === '2' || support === true;
}

/** Console resourceConfig.autoGenerateCover === 2 → batch Handle 自动封面 */
export function isAutoGenerateCoverEnabled(typeInfo: unknown): boolean {
  const config = pickConfig(typeInfo);
  const v = config.autoGenerateCover;
  return v === 2 || v === '2' || v === true;
}

function bytesFromLimit(size: unknown, unit: unknown): number | null {
  const numeric = Number(size);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (unit === undefined || unit === null || unit === '') return numeric;
  const text = String(unit).trim().toLowerCase();
  if (unit === 0 || text === '0' || text === 'b' || text === 'byte' || text === 'bytes') {
    return numeric;
  }
  if (unit === 1 || text === '1' || text === 'm' || text === 'mb') return numeric * 1024 * 1024;
  if (unit === 2 || text === '2' || text === 'g' || text === 'gb') return numeric * 1024 * 1024 * 1024;
  if (unit === 3 || text === '3' || text === 'k' || text === 'kb') return numeric * 1024;
  return numeric;
}

function formatSizeUnit(unit: unknown): string {
  if (unit === 2 || unit === '2') return 'GB';
  if (unit === 1 || unit === '1') return 'MB';
  if (unit === 3 || unit === '3') return 'KB';
  return 'B';
}

/** TTY publish / version set：类型文件大小上限说明（来自 capability，非写死） */
export function describeTypeFileSizeLimit(typeInfo: unknown): string | undefined {
  const config = pickConfig(typeInfo);
  const maxBytes = bytesFromLimit(config.fileMaxSize, config.fileMaxSizeUnit);
  if (maxBytes === null || config.fileMaxSize === undefined || config.fileMaxSize === '') {
    return undefined;
  }
  const unit = formatSizeUnit(config.fileMaxSizeUnit);
  return `该资源类型文件大小上限：${config.fileMaxSize}${unit}`;
}

function normalizedExt(filename: string): string {
  return path.extname(filename).toLowerCase();
}

function mimeFromExt(ext: string): string | null {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.webm': 'video/webm',
    '.zip': 'application/zip',
  };
  return map[ext] || null;
}

/** Console Task 硬上限：视频 1GB / 其它 200MB（叠加上类型 fileMaxSize） */
export const TASK_VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
export const TASK_DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

function isVideoFileContext(typeInfo: unknown, filename: string): boolean {
  const record = asRecord(typeInfo) || {};
  const config = pickConfig(typeInfo);
  const code = String(record.code || record.resourceTypeCode || config.code || '').trim();
  if (/^RT006/i.test(code)) return true;
  const labels = [
    String(record.name || record.resourceTypeName || config.name || ''),
    ...toStringArray(record.resourceType ?? config.resourceType),
  ]
    .join(' ')
    .toLowerCase();
  if (labels.includes('视频') || labels.includes('video')) return true;
  const mime = mimeFromExt(normalizedExt(filename));
  return Boolean(mime?.startsWith('video/'));
}

export function assertTaskFileSizeLimit(opts: {
  typeInfo?: unknown;
  filePath: string;
  filename: string;
}): void {
  const size = fs.statSync(opts.filePath).size;
  const isVideo = isVideoFileContext(opts.typeInfo, opts.filename);
  const maxBytes = isVideo ? TASK_VIDEO_MAX_BYTES : TASK_DEFAULT_MAX_BYTES;
  if (size > maxBytes) {
    throw cliError(
      isVideo ? I18N_KEYS.cli_file_size_video_1gb : I18N_KEYS.cli_file_size_default_200mb,
      { code: 4, details: { size, maxBytes, isVideo } },
    );
  }
}

function formatMatches(filename: string, formats: string[]): boolean {
  if (!formats.length) return true;
  const ext = normalizedExt(filename);
  const mime = mimeFromExt(ext);
  return formats.some((format) => {
    const f = format.trim().toLowerCase();
    if (!f) return false;
    if (f === '*' || f === '*/*') return true;
    if (f.startsWith('.')) return f === ext;
    if (!f.includes('/')) return `.${f}` === ext;
    if (mime && f.endsWith('/*')) return mime.startsWith(f.slice(0, -1));
    return Boolean(mime && f === mime);
  });
}

/** 将平台能力映射为是否目录压缩；未声明能力返回 null，禁止按展示名猜测。 */
export function shouldCompressFromTypeInfo(typeInfo: unknown): boolean | null {
  const mode = artifactModeFromTypeInfo(typeInfo);
  return mode === null ? null : mode === 'directory-zip';
}

export type ArtifactMode = 'file' | 'directory-zip';

function artifactModeValueFromTypeInfo(typeInfo: unknown): unknown {
  const config = pickConfig(typeInfo);
  return (
    config.artifactMode ??
    config.compress ??
    config.needCompress ??
    config.isCompress ??
    config.packageMode ??
    config.filePackageMode
  );
}

/**
 * Read only an explicit platform capability. Resource type names and codes are
 * labels/identifiers, not a packaging contract, so they must never be guessed.
 */
export function artifactModeFromTypeInfo(typeInfo: unknown): ArtifactMode | null {
  const value = artifactModeValueFromTypeInfo(typeInfo);
  if (typeof value === 'boolean') return value ? 'directory-zip' : 'file';
  if (value === 1 || value === '1') return 'directory-zip';
  if (value === 0 || value === '0') return 'file';
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  if (['directory-zip', 'directory', 'zip', 'archive', 'compress'].includes(normalized)) {
    return 'directory-zip';
  }
  if (['file', 'single-file', 'raw', 'none'].includes(normalized)) return 'file';
  return null;
}

/** 合并平台 capability 与 manifest artifactMode；两者冲突/平台值非法时 fail closed。 */
export function resolveArtifactMode(opts: {
  typeInfo?: unknown;
  manifestArtifactMode?: ArtifactMode;
}): ArtifactMode {
  const capabilityValue = artifactModeValueFromTypeInfo(opts.typeInfo);
  const capabilityMode = artifactModeFromTypeInfo(opts.typeInfo);
  const manifestMode = opts.manifestArtifactMode;
  if (
    capabilityMode === null &&
    capabilityValue !== undefined &&
    capabilityValue !== null &&
    capabilityValue !== ''
  ) {
    throw cliError(I18N_KEYS.artifact_mode_invalid, {
      code: 4,
      details: { source: 'platform', value: capabilityValue, supported: ['file', 'directory-zip'] },
      hint: '平台返回了无法识别的打包能力；请修正资源类型配置后重试',
    });
  }
  if (capabilityMode && manifestMode && capabilityMode !== manifestMode) {
    throw cliError(I18N_KEYS.artifact_mode_capability_conflict, {
      code: 4,
      details: { capabilityMode, manifestMode },
      hint: '平台资源类型能力优先；请把 manifest.version.artifactMode 调整为一致值',
    });
  }
  if (capabilityMode) return capabilityMode;
  if (manifestMode) return manifestMode;
  throw cliError(I18N_KEYS.artifact_mode_invalid, {
    code: 4,
    details: { reason: 'missing', supported: ['file', 'directory-zip'] },
    hint: '平台未返回打包能力；请在 manifest.version.artifactMode 中显式设置 file 或 directory-zip',
  });
}

export function assertOptionalConfigAllowed(opts: {
  typeInfo: unknown;
  inputAttrs?: unknown[];
  customPropertyDescriptors?: CustomPropertyDescriptor[];
}): void {
  const config = pickConfig(opts.typeInfo);
  const support = config.supportOptionalConfig;
  const allowed =
    support === undefined ||
    support === null ||
    support === '' ||
    support === true ||
    support === 2 ||
    support === '2';
  if (allowed) return;
  if (opts.customPropertyDescriptors?.length) {
    throw cliError(I18N_KEYS.type_no_custom_properties, {
      code: 4,
      details: {
        customPropertyDescriptors: opts.customPropertyDescriptors?.length || 0,
      },
      hint: '移除 manifest 中的 customPropertyDescriptors 后重试；文件解析出的系统属性仍会自动提交',
    });
  }
}

export function assertLocalFileAllowedByType(opts: {
  typeInfo: unknown;
  filePath: string;
  filename: string;
}): void {
  const config = pickConfig(opts.typeInfo);
  if (!includesLocalUploadMode(config.fileCommitMode)) {
    throw cliError(I18N_KEYS.type_no_local_upload, {
      code: 4,
      details: { fileCommitMode: config.fileCommitMode },
      hint: '请选择支持本地文件提交的资源类型，或回 Console 使用该类型支持的提交方式',
    });
  }

  const formats = toStringArray(config.formats || config.format || config.fileFormats);
  if (!formatMatches(opts.filename, formats)) {
    throw cliError(I18N_KEYS.file_format_not_allowed, {
      code: 4,
      details: { formats },
      hint: `允许格式: ${formats.join(', ')}`,
    });
  }

  const maxBytes = bytesFromLimit(config.fileMaxSize, config.fileMaxSizeUnit);
  if (maxBytes !== null) {
    const size = fs.statSync(opts.filePath).size;
    if (size > maxBytes) {
      throw cliError(I18N_KEYS.file_size_exceeds_type_limit, {
        code: 4,
        details: { size, maxBytes, fileMaxSize: config.fileMaxSize, fileMaxSizeUnit: config.fileMaxSizeUnit },
        hint: `文件大小不能超过 ${config.fileMaxSize}${config.fileMaxSizeUnit === 2 || config.fileMaxSizeUnit === '2' ? 'GB' : config.fileMaxSizeUnit === 1 || config.fileMaxSizeUnit === '1' ? 'MB' : ''}`,
      });
    }
  }

  assertTaskFileSizeLimit({
    typeInfo: opts.typeInfo,
    filePath: opts.filePath,
    filename: opts.filename,
  });
}
