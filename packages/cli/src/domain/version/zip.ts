/**
 * 主题/插件打 zip：仅 RT001/RT002 且确认路径是目录 → 目录内容打成临时 zip（根不套 dist/），传完即删。
 * 其它类型给目录失败；RT001/RT002 给文件（含 .zip）直接上传。打不打 zip 只看类型+路径，不看 artifactMode。
 */

import { createWriteStream, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import archiver from 'archiver';
import { CliError } from '../../core/errors';

/** 类型是不是主题/插件（RT001/RT002）——仅目录产物需要临时压缩。 */
export function isThemeOrWidget(typeCode: string): boolean {
  return typeCode === 'RT001' || typeCode === 'RT002';
}

/** 产物形态门禁：只有非主题/插件拒绝目录；所有类型都可直接提交文件。 */
export function assertArtifactPath(typeCode: string, filePath: string): void {
  const stats = existsSync(filePath) ? statSync(filePath) : undefined;
  const themeOrWidget = isThemeOrWidget(typeCode);
  if (stats?.isDirectory() && !themeOrWidget) {
    // i18n: cli.file.directory_unsupported
    throw new CliError('不支持文件夹，请指定一个文件。', 'FILE_DIRECTORY_UNSUPPORTED');
  }
}

/**
 * 写入 N.json 前校验产物锚点：每份状态都必须指向当前工程内实际存在、且形态与类型一致的产物。
 * 发版比这里更严格：主题/插件的目录产物还必须非空并能压缩；文件可直接上传。
 */
export function assertArtifactAnchor(typeCode: string, filePath: string): void {
  if (!existsSync(filePath)) {
    throw new CliError(`本地产物不存在：${filePath}`, 'ARTIFACT_ANCHOR_MISSING');
  }
  const stats = statSync(filePath);
  assertArtifactPath(typeCode, filePath);
  if (!isThemeOrWidget(typeCode) && !stats.isFile()) {
    throw new CliError('不支持文件夹，请指定一个文件。', 'FILE_DIRECTORY_UNSUPPORTED');
  }
}

/** 目录内容打成临时 zip（根不套一层文件夹，条目逐个进包），返回临时文件路径。 */
export async function zipDirectoryContents(dir: string): Promise<string> {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    // i18n: cli.zip.missing
    throw new CliError(`没有构建产物 ${dir}，请先构建`, 'ZIP_MISSING');
  }
  if (existsSync(path.join(dir, '.freelog'))) {
    // i18n: cli.zip.project_root
    throw new CliError('不要把工程根当产物目录，请指定 dist 或 build。', 'ZIP_PROJECT_ROOT');
  }
  const entries = readdirSync(dir);
  if (entries.length === 0) {
    // i18n: cli.zip.empty
    throw new CliError('构建产物是空的，请先构建', 'ZIP_EMPTY');
  }
  const outPath = path.join(
    tmpdir(),
    `freelog-zip-${process.pid}-${Date.now()}.zip`,
  );
  const output = createWriteStream(outPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  try {
    archive.on('error', (error) => output.destroy(error));
    archive.pipe(output);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        archive.directory(full, entry);
      } else {
        archive.file(full, { name: entry });
      }
    }
    await archive.finalize();
    await finished(output);
    return outPath;
  } catch (error) {
    if (existsSync(outPath)) {
      try {
        unlinkSync(outPath);
      } catch {
        // 打包失败时也尽力清理；清理失败不能掩盖原错误。
      }
    }
    throw error;
  }
}

/** 上传路径决策：主题/插件目录打临时 zip，所有文件原样返回（含门禁检查）。 */
export async function prepareUploadPath(typeCode: string, filePath: string): Promise<string> {
  assertArtifactPath(typeCode, filePath);
  if (isThemeOrWidget(typeCode) && existsSync(filePath) && statSync(filePath).isDirectory()) {
    return zipDirectoryContents(filePath);
  }
  return filePath;
}
