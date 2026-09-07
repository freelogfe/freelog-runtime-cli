import { createWriteStream, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import archiver from 'archiver';
import { CliError } from '../../core/errors';

export function isThemeOrWidget(typeCode: string): boolean {
  return typeCode === 'RT001' || typeCode === 'RT002';
}

export function assertArtifactPath(typeCode: string, filePath: string): void {
  const stats = existsSync(filePath) ? statSync(filePath) : undefined;
  const themeOrWidget = isThemeOrWidget(typeCode);
  if (stats?.isDirectory() && !themeOrWidget) {
    // i18n: cli.file.directory_unsupported
    throw new CliError('不支持文件夹，请指定一个文件。', 'FILE_DIRECTORY_UNSUPPORTED');
  }
  if (themeOrWidget && stats?.isFile() && filePath.toLowerCase().endsWith('.zip')) {
    // i18n: cli.file.theme_zip_file
    throw new CliError('主题/插件请指定构建产物目录，不要自己打 zip。', 'FILE_THEME_ZIP');
  }
  if (themeOrWidget && stats?.isFile()) {
    // i18n: cli.file.theme_zip_file
    throw new CliError('主题/插件请指定构建产物目录，不要自己打 zip。', 'FILE_THEME_ZIP');
  }
}

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
}

export async function prepareUploadPath(typeCode: string, filePath: string): Promise<string> {
  assertArtifactPath(typeCode, filePath);
  if (isThemeOrWidget(typeCode) && existsSync(filePath) && statSync(filePath).isDirectory()) {
    return zipDirectoryContents(filePath);
  }
  return filePath;
}
