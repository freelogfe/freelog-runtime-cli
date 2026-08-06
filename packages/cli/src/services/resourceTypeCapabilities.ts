import fs from 'node:fs';
import path from 'node:path';
import { CliError } from '../core/errors.js';
import type { CustomPropertyDescriptor } from '../config/project.js';

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

export function isCreateBatchSupported(typeInfo: unknown): boolean {
  const config = pickConfig(typeInfo);
  const support = config.supportCreateBatch;
  return support === undefined || support === null || support === '' || support === 2 || support === '2' || support === true;
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

export function shouldCompressFromTypeInfo(typeInfo: unknown): boolean | null {
  const config = pickConfig(typeInfo);
  const value =
    config.compress ??
    config.needCompress ??
    config.isCompress ??
    config.packageMode ??
    config.filePackageMode;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return null;
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
    throw new CliError('该资源类型不支持自定义属性', {
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
    throw new CliError('该资源类型不支持 CLI 本地文件上传', {
      code: 4,
      details: { fileCommitMode: config.fileCommitMode },
      hint: '请选择支持本地文件提交的资源类型，或回 Console 使用该类型支持的提交方式',
    });
  }

  const formats = toStringArray(config.formats || config.format || config.fileFormats);
  if (!formatMatches(opts.filename, formats)) {
    throw new CliError(`文件格式不符合资源类型要求: ${opts.filename}`, {
      code: 4,
      details: { formats },
      hint: `允许格式: ${formats.join(', ')}`,
    });
  }

  const maxBytes = bytesFromLimit(config.fileMaxSize, config.fileMaxSizeUnit);
  if (maxBytes !== null) {
    const size = fs.statSync(opts.filePath).size;
    if (size > maxBytes) {
      throw new CliError('文件大小超过资源类型限制', {
        code: 4,
        details: { size, maxBytes, fileMaxSize: config.fileMaxSize, fileMaxSizeUnit: config.fileMaxSizeUnit },
      });
    }
  }
}
