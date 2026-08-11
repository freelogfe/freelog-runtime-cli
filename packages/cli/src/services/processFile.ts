import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { getSHA1Hash } from '../platform/index.js';
import { resolveCwd } from '../config/project.js';
import type { VersionProject } from '../config/project.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import {
  assertLocalFileAllowedByType,
  resolveArtifactMode,
} from './resourceTypeCapabilities.js';
import { assertSha1PublishAllowed } from './shared/guards/index.js';
import { isIgnoredPath, loadFreelogIgnorePatterns } from './freelogIgnore.js';

const STABLE_DOS_TIMESTAMP = 0x00210000; // 1980-01-01 00:00:00, stored without Date/TZ conversion
const TEMP_DIR_PREFIX = 'freelog-publish-';

export async function compressDirectory(
  buildPath: string,
  outputPath: string,
  filename: string,
  options: { ignoreRoot?: string } = {},
): Promise<string> {
  const zip = new AdmZip();
  const ignoreRoot = path.resolve(options.ignoreRoot || buildPath);
  const patterns = loadFreelogIgnorePatterns(ignoreRoot);

  const addDirectory = (absoluteDir: string, archiveDir = ''): void => {
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const absolutePath = path.join(absoluteDir, entry.name);
      const archivePath = archiveDir ? `${archiveDir}/${entry.name}` : entry.name;
      const projectPath = normalizeArchivePath(path.relative(ignoreRoot, absolutePath));
      if (isIgnoredPath(projectPath, entry.isDirectory(), patterns)) continue;
      if (entry.isSymbolicLink()) {
        throw new Error(`压缩目录不支持符号链接: ${projectPath}`);
      }
      if (entry.isDirectory()) {
        addDirectory(absolutePath, archivePath);
        continue;
      }
      if (!entry.isFile()) continue;
      zip.addFile(normalizeArchivePath(archivePath), fs.readFileSync(absolutePath));
      const added = zip.getEntries().at(-1);
      if (added) {
        (added.header as typeof added.header & { timeval: number }).timeval = STABLE_DOS_TIMESTAMP;
        added.header.attr = 0;
      }
    }
  }
  addDirectory(buildPath);
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

function normalizeArchivePath(value: string): string {
  return value.replace(/\\/g, '/');
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
  const requiresCompression = resolveArtifactMode({
    typeInfo: opts.resourceTypeInfo,
    manifestArtifactMode: versionConfig.artifactMode,
  }) === 'directory-zip';

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
 * 根据 artifactMode 处理正式发行物：
 * - directory-zip：filePath 须为目录 → 确定性 zip 临时文件
 * - file：filePath 须为单文件
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
  const needCompress = resolveArtifactMode({
    typeInfo: opts.resourceTypeInfo,
    manifestArtifactMode: versionConfig.artifactMode,
  }) === 'directory-zip';

  let filePath: string;
  let filename: string;
  let isTempFile = false;
  let ownedTempDir: string | undefined;

  try {
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
      ownedTempDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
      filePath = await compressDirectory(absolute, ownedTempDir, filename, { ignoreRoot: root });
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
  } catch (error) {
    if (ownedTempDir) cleanupOwnedTempDirectory(ownedTempDir);
    throw error;
  }
}

export function cleanupTempFile(filePath: string | null | undefined): void {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const parent = path.dirname(path.resolve(filePath));
    if (isOwnedTempDirectory(parent) && fs.existsSync(parent)) fs.rmdirSync(parent);
  } catch {
    // ignore
  }
}

function isOwnedTempDirectory(directory: string): boolean {
  const resolved = path.resolve(directory);
  return (
    path.dirname(resolved) === path.resolve(os.tmpdir()) &&
    path.basename(resolved).startsWith(TEMP_DIR_PREFIX)
  );
}

function cleanupOwnedTempDirectory(directory: string): void {
  if (!isOwnedTempDirectory(directory)) return;
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures; preserve the original publish error
  }
}
