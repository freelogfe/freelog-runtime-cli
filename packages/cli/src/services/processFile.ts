import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { CliError } from '../core/errors.js';
import { getSHA1Hash } from '../platform/index.js';
import { resolveCwd } from '../config/project.js';
import type { VersionProject } from '../config/project.js';

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
  cwd?: string;
}): Promise<ProcessFileResult> {
  const { versionConfig, resourceName } = opts;
  const root = resolveCwd(opts.cwd);
  const needCompress = shouldCompressLoose(
    opts.resourceType ?? versionConfig.resourceType,
    opts.resourceTypeCode,
  );

  let filePath: string;
  let filename: string;
  let isTempFile = false;

  if (needCompress) {
    if (!versionConfig.filePath?.trim()) {
      throw new CliError('配置中未指定 filePath（需压缩的资源类型）', { code: 4 });
    }
    const absolute = path.resolve(root, versionConfig.filePath);
    if (!fs.existsSync(absolute)) {
      throw new CliError(`文件路径不存在: ${versionConfig.filePath}`, { code: 4 });
    }
    const stats = fs.statSync(absolute);
    if (!stats.isDirectory()) {
      throw new CliError(
        `filePath 应该是目录路径（主题/插件/软件库需压缩）: ${versionConfig.filePath}`,
        { code: 4, hint: '指向构建产物目录，如 dist' },
      );
    }
    const safeName = (resourceName || 'resource').replace(/[^\w.-]+/g, '_');
    filename = `${safeName}-${versionConfig.version}.zip`;
    const tempDir = path.join(os.tmpdir(), 'freelog-publish');
    filePath = await compressDirectory(absolute, tempDir, filename);
    isTempFile = true;
  } else {
    if (!versionConfig.filePath?.trim()) {
      if (!versionConfig.filename) {
        throw new CliError('配置中未指定 filename，且 filePath 为空', { code: 4 });
      }
      filename = versionConfig.filename;
      filePath = path.resolve(root, filename);
    } else {
      const absolute = path.resolve(root, versionConfig.filePath);
      if (!fs.existsSync(absolute)) {
        throw new CliError(`文件路径不存在: ${versionConfig.filePath}`, { code: 4 });
      }
      const stats = fs.statSync(absolute);
      if (stats.isFile()) {
        filePath = absolute;
        filename = versionConfig.filename || path.basename(absolute);
      } else {
        if (!versionConfig.filename) {
          throw new CliError('filePath 是目录时须指定 filename（非压缩类型）', {
            code: 4,
            hint: '或把 filePath 指到具体文件',
          });
        }
        filename = versionConfig.filename;
        filePath = path.resolve(absolute, filename);
      }
    }
    if (!fs.existsSync(filePath)) {
      throw new CliError(`文件不存在: ${filePath}`, { code: 4 });
    }
    if (!fs.statSync(filePath).isFile()) {
      throw new CliError(`filePath 应该是文件路径（不需要压缩的资源类型）: ${filePath}`, {
        code: 4,
      });
    }
  }

  const fileSha1 = await getSHA1Hash(filePath);
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
