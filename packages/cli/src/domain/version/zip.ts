/**
 * 主题/插件打 zip：仅 RT001/RT002 且确认路径是目录 → 目录内容打成临时 zip（根不套 dist/），传完即删。
 * 其它类型给目录失败；RT001/RT002 给文件（含 .zip）直接上传。打不打 zip 只看类型+路径，不看 artifactMode。
 */

import { createWriteStream, existsSync, lstatSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import archiver from 'archiver';
import { CliError } from '../../core/errors';
import { resolveExistingProjectPath } from '../../local/projectPath';

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
export function assertArtifactAnchor(typeCode: string, filePath: string, cwd?: string): void {
  if (!existsSync(filePath)) {
    throw new CliError(`本地产物不存在：${filePath}`, 'ARTIFACT_ANCHOR_MISSING');
  }
  if (cwd) resolveExistingProjectPath(cwd, filePath);
  const stats = statSync(filePath);
  assertArtifactPath(typeCode, filePath);
  if (!isThemeOrWidget(typeCode) && !stats.isFile()) {
    throw new CliError('不支持文件夹，请指定一个文件。', 'FILE_DIRECTORY_UNSUPPORTED');
  }
}

/**
 * 在删除工作稿、确认覆盖等有损步骤之前，验证该路径确实能作为本次上传输入。
 * 这里不创建临时 zip；真正上传时仍会重新打包，以避免把临时文件当成业务状态。
 */
export function assertUploadArtifactReady(typeCode: string, filePath: string, cwd?: string): void {
  if (cwd) resolveExistingProjectPath(cwd, filePath);
  assertArtifactPath(typeCode, filePath);
  const stats = existsSync(filePath) ? statSync(filePath) : undefined;
  if (!stats) {
    throw new CliError(`本地产物不存在：${filePath}`, 'ARTIFACT_ANCHOR_MISSING');
  }
  if (stats.isDirectory() && isThemeOrWidget(typeCode)) {
    assertZipDirectoryReady(filePath);
    return;
  }
  if (!stats.isFile()) {
    throw new CliError('产物必须是文件，或主题/插件的非空构建目录。', 'FILE_ARTIFACT_UNSUPPORTED');
  }
}

/** 主题/插件目录在压缩前必须满足的纯本地条件，不产生临时文件。 */
function assertZipDirectoryReady(dir: string): void {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new CliError(`没有构建产物 ${dir}，请先构建`, 'ZIP_MISSING');
  }
  if (existsSync(path.join(dir, '.freelog'))) {
    throw new CliError('不要把工程根当产物目录，请指定 dist 或 build。', 'ZIP_PROJECT_ROOT');
  }
  if (readdirSync(dir).length === 0) {
    throw new CliError('构建产物是空的，请先构建', 'ZIP_EMPTY');
  }
}

/** 目录内容打成临时 zip（根不套一层文件夹，条目逐个进包），返回临时文件路径。 */
export async function zipDirectoryContents(dir: string): Promise<string> {
  assertZipDirectoryReady(dir);
  const outPath = path.join(
    tmpdir(),
    `freelog-zip-${process.pid}-${randomUUID()}.zip`,
  );
  const output = createWriteStream(outPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  try {
    archive.on('error', (error) => output.destroy(error));
    archive.pipe(output);
    // `archive.directory()` 的递归顺序依赖文件系统。逐层排序并拒绝任何链接，
    // 让同一构建输入得到稳定条目，也不把目录内指向工程外的链接带进发布包。
    const appendEntries = (currentDir: string, prefix = ''): void => {
      for (const entry of readdirSync(currentDir).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))) {
        const full = path.join(currentDir, entry);
        const stats = lstatSync(full);
        const entryName = prefix ? `${prefix}/${entry}` : entry;
        if (stats.isSymbolicLink()) {
          throw new CliError(`构建目录不能包含软链接：${entryName}`, 'ZIP_SYMLINK_UNSUPPORTED');
        }
        if (stats.isDirectory()) {
          // Zip 不需要显式目录条目；只追加已排序的文件可避免 archiver 异步处理目录
          // 条目时打乱中央目录顺序，也避免空目录改变同一产物的字节内容。
          appendEntries(full, entryName);
        } else if (stats.isFile()) {
          // archive.file() 会异步 stat，多个条目在中央目录中的完成顺序并不等于
          // append 顺序。这里在已排序遍历时读取确定快照再 append，保证 zip 条目序。
          archive.append(readFileSync(full), { name: entryName });
        } else {
          throw new CliError(`构建目录包含不支持的条目：${entryName}`, 'ZIP_ENTRY_UNSUPPORTED');
        }
      }
    };
    appendEntries(dir);
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
export async function prepareUploadPath(typeCode: string, filePath: string, cwd?: string): Promise<string> {
  assertUploadArtifactReady(typeCode, filePath, cwd);
  if (isThemeOrWidget(typeCode) && existsSync(filePath) && statSync(filePath).isDirectory()) {
    return zipDirectoryContents(filePath);
  }
  return filePath;
}
