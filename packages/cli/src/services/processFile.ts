import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { CliError } from '../core/errors.js';
import { getSHA1Hash } from '../platform/index.js';
import { resolveCwd } from '../config/project.js';
import type { VersionProject } from '../config/project.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import {
  assertLocalFileAllowedByType,
  shouldCompressFromTypeInfo,
} from './resourceTypeCapabilities.js';
import { assertSha1PublishAllowed } from './shared/guards/index.js';

/** 与旧 CLI 一致：主题 / 插件 / 软件库 → 目录打 zip */
const COMPRESS_TYPE_NAMES = new Set(['主题', '插件', '软件库']);

export function shouldCompress(resourceType?: string | string[]): boolean {
  if (!resourceType) return false;
  const list = Array.isArray(resourceType) ? resourceType : [resourceType];
  return list.some((t) => COMPRESS_TYPE_NAMES.has(String(t).trim()));
}

/** 亦接受英文别名 / resourceType 路径拼接（平台偶发） */
export function shouldCompressLoose(
  resourceType?: string | string[],
  resourceTypeCode?: string,
): boolean {
  if (shouldCompress(resourceType)) return true;
  const joined = [
    ...(Array.isArray(resourceType) ? resourceType : [resourceType || '']),
    resourceTypeCode || '',
  ]
    .join(' ')
    .toLowerCase();
  return (
    joined.includes('主题') ||
    joined.includes('插件') ||
    joined.includes('软件库') ||
    joined.includes('theme') ||
    joined.includes('widget') ||
    joined.includes('plugin')
  );
}

export async function compressDirectory(
  buildPath: string,
  outputPath: string,
  filename: string,
): Promise<string> {
  const zip = new AdmZip();
  const entries = fs.readdirSync(buildPath);
  for (const file of entries) {
    const filePath = path.join(buildPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      zip.addLocalFolder(filePath, file);
    } else {
      zip.addLocalFile(filePath);
    }
  }
  fs.mkdirSync(outputPath, { recursive: true });
  const zipPath = path.join(outputPath, filename);
  zip.writeZip(zipPath);
  return zipPath;
}

export interface ProcessFileResult {
  filePath: string;
  filename: string;
  fileSha1: string;
  isTempFile: boolean;
}

export interface DryRunProcessFileResult extends ProcessFileResult {
  requiresCompression: boolean;
  unresolved: string[];
}

/**
 * Resolve and validate the local publish input without creating an archive.
 * A directory-backed release cannot have a final SHA1 until the archive exists,
 * so dry-run reports that value explicitly as unresolved.
 */
export async function planFileForPublish(opts: {
  versionConfig: VersionProject;
  resourceName: string;
  resourceType?: string | string[];
  resourceTypeCode?: string;
  resourceTypeInfo?: unknown;
  cwd?: string;
}): Promise<DryRunProcessFileResult> {
  const { versionConfig, resourceName } = opts;
  const root = resolveCwd(opts.cwd);
  const configuredCompression = shouldCompressFromTypeInfo(opts.resourceTypeInfo) ?? undefined;
  const manifestCompression =
    versionConfig.artifactMode === 'directory-zip'
      ? true
      : versionConfig.artifactMode === 'file'
        ? false
        : undefined;
  if (
    manifestCompression !== undefined &&
    configuredCompression !== undefined &&
    manifestCompression !== configuredCompression
  ) {
    throw new CliError('manifest artifactMode 与平台资源类型能力冲突', { code: 4 });
  }
  const requiresCompression =
    configuredCompression ??
    manifestCompression ??
    shouldCompressLoose(opts.resourceType ?? versionConfig.resourceType, opts.resourceTypeCode);

  if (!requiresCompression) {
    const processed = await processFileForPublish(opts);
    return {
      ...processed,
      requiresCompression: false,
      unresolved: [],
    };
  }

  if (!versionConfig.filePath?.trim()) {
    throw cliError(I18N_KEYS.config_missing_filepath_compress, { code: 4 });
  }
  const absolute = path.resolve(root, versionConfig.filePath);
  if (!fs.existsSync(absolute)) {
    throw cliError(I18N_KEYS.version_filepath_not_found, { code: 4 });
  }
  if (!fs.statSync(absolute).isDirectory()) {
    throw cliError(I18N_KEYS.filepath_must_be_directory, {
      code: 4,
      params: { path: versionConfig.filePath },
      hint: '指向构建产物目录，如 dist',
    });
  }

  const safeName = (resourceName || 'resource').replace(/[^\w.-]+/g, '_');
  return {
    filePath: absolute,
    filename: `${safeName}-${versionConfig.version}.zip`,
    fileSha1: 'unresolved',
    isTempFile: false,
    requiresCompression: true,
    unresolved: [
      'fileSha1',
      'createVersionParams.fileSha1',
      'createVersionParams.inputAttrs',
      'createVersionParams.customPropertyDescriptors',
    ],
  };
}

/**
 * ≅ 旧 processFileForPublish：
 * - 主题/插件/软件库：filePath 须为目录 → zip 到临时文件
 * - 其它：filePath 为文件，或 目录+filename
 */
export async function processFileForPublish(opts: {
  versionConfig: VersionProject;
  resourceName: string;
  resourceType?: string | string[];
  resourceTypeCode?: string;
  resourceTypeInfo?: unknown;
  cwd?: string;
}): Promise<ProcessFileResult> {
  const { versionConfig, resourceName } = opts;
  const root = resolveCwd(opts.cwd);
  const configuredCompression = shouldCompressFromTypeInfo(opts.resourceTypeInfo) ?? undefined;
  const manifestCompression =
    versionConfig.artifactMode === 'directory-zip'
      ? true
      : versionConfig.artifactMode === 'file'
        ? false
        : undefined;
  if (
    manifestCompression !== undefined &&
    configuredCompression !== undefined &&
    manifestCompression !== configuredCompression
  ) {
    throw new CliError('manifest artifactMode 与平台资源类型能力冲突', { code: 4 });
  }
  const needCompress =
    configuredCompression ??
    manifestCompression ??
    shouldCompressLoose(opts.resourceType ?? versionConfig.resourceType, opts.resourceTypeCode);

  let filePath: string;
  let filename: string;
  let isTempFile = false;

  if (needCompress) {
    if (!versionConfig.filePath?.trim()) {
      throw cliError(I18N_KEYS.config_missing_filepath_compress, { code: 4 });
    }
    const absolute = path.resolve(root, versionConfig.filePath);
    if (!fs.existsSync(absolute)) {
      throw cliError(I18N_KEYS.version_filepath_not_found, { code: 4 });
    }
    const stats = fs.statSync(absolute);
    if (!stats.isDirectory()) {
      throw cliError(I18N_KEYS.filepath_must_be_directory, {
        code: 4,
        params: { path: versionConfig.filePath },
        hint: '指向构建产物目录，如 dist',
      });
    }
    const safeName = (resourceName || 'resource').replace(/[^\w.-]+/g, '_');
    filename = `${safeName}-${versionConfig.version}.zip`;
    const tempDir = path.join(os.tmpdir(), 'freelog-publish');
    filePath = await compressDirectory(absolute, tempDir, filename);
    isTempFile = true;
  } else {
    if (!versionConfig.filePath?.trim()) {
      if (!versionConfig.filename) {
        throw cliError(I18N_KEYS.config_missing_filename_and_filepath, { code: 4 });
      }
      filename = versionConfig.filename;
      filePath = path.resolve(root, filename);
    } else {
      const absolute = path.resolve(root, versionConfig.filePath);
      if (!fs.existsSync(absolute)) {
        throw cliError(I18N_KEYS.version_filepath_not_found, { code: 4 });
      }
      const stats = fs.statSync(absolute);
      if (stats.isFile()) {
        filePath = absolute;
        filename = versionConfig.filename || path.basename(absolute);
      } else {
        if (!versionConfig.filename) {
          throw cliError(I18N_KEYS.filepath_dir_needs_filename, {
            code: 4,
            hint: '或把 filePath 指到具体文件',
          });
        }
        filename = versionConfig.filename;
        filePath = path.resolve(absolute, filename);
      }
    }
    if (!fs.existsSync(filePath)) {
      throw cliError(I18N_KEYS.file_not_found, { code: 4 });
    }
    if (!fs.statSync(filePath).isFile()) {
      throw cliError(I18N_KEYS.filepath_must_be_file, {
        code: 4,
      });
    }
  }

  if (opts.resourceTypeInfo !== undefined) {
    assertLocalFileAllowedByType({
      typeInfo: opts.resourceTypeInfo,
      filePath,
      filename,
    });
  }

  const fileSha1 = await getSHA1Hash(filePath);
  await assertSha1PublishAllowed(fileSha1);
  return { filePath, filename, fileSha1, isTempFile };
}

export function cleanupTempFile(filePath: string | null | undefined): void {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}
