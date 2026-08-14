import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { consola } from 'consola';
import { requireAuth } from '../../core/auth.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { getSHA1Hash } from '../../platform/index.js';
import { assertLeafResourceTypeCode } from '../typeService.js';
import { assertLocalFileAllowedByType } from '../resourceTypeCapabilities.js';
import { assertSha1PublishAllowed } from '../shared/guards/index.js';
import {
  applyGeneratedResourceNames,
  createOneResource,
  resolveExistingImportBySha1,
  resolveInitialBatchResourceName,
  resolveUniqueSubdir,
  writeItemConfigs,
} from '../batch/prepare.js';

const CONFIG_RE = /^freelog\..*\.config/i;

function listRootMediaFiles(workspaceRoot: string): string[] {
  if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((ent) => ent.isFile() && !CONFIG_RE.test(ent.name))
    .map((ent) => path.join(workspaceRoot, ent.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

/** studio：从工作区根目选择单个媒体文件发行并落盘子工程。 */
export async function studioPublishOneFile(workspaceRoot: string): Promise<string | null> {
  assertExplicitEnvForWriteOperation();
  const auth = requireAuth();
  if (!auth.username) {
    throw new Error('auth_missing_username');
  }

  const files = listRootMediaFiles(workspaceRoot);
  if (files.length === 0) {
    consola.warn('工作文件夹内没有可发行的文件');
    return null;
  }

  const pick = await p.select({
    message: '选择要发行的文件',
    options: files.map((file) => ({
      value: file,
      label: path.basename(file),
    })),
  });
  if (p.isCancel(pick)) return null;

  const absolutePath = String(pick);
  const sha1 = await getSHA1Hash(absolutePath);
  const basename = path.parse(absolutePath).name;
  const safeDir = basename.replace(/[\\/:*?"<>|\s@$#]+/g, '_').replace(/_+/g, '_') || 'file';
  const name = resolveInitialBatchResourceName(undefined, safeDir);
  const draftPrepared = {
    absolutePath,
    filename: path.basename(absolutePath),
    sha1,
    name,
    resourceTitle: basename,
    resourceTypeCode: '',
    safeDir,
    version: '1.0.0',
    description: '',
  };
  const existing = resolveExistingImportBySha1(workspaceRoot, draftPrepared);
  if (existing) {
    consola.info(`该文件已有子工程: ${existing.subdir}（resourceId=${existing.resourceId}）`);
    return path.join(workspaceRoot, existing.subdir);
  }

  const typeCode = await p.text({
    message: '资源类型 code（如 RT005001）',
    validate: (v) => (v?.trim() ? undefined : '必填'),
  });
  if (p.isCancel(typeCode)) return null;
  const typeInfo = await assertLeafResourceTypeCode(String(typeCode).trim());
  assertLocalFileAllowedByType({
    typeInfo,
    filePath: absolutePath,
    filename: path.basename(absolutePath),
  });
  await assertSha1PublishAllowed(sha1);

  draftPrepared.resourceTypeCode = String(typeCode).trim();
  const [prepared] = await applyGeneratedResourceNames([
    {
      ...draftPrepared,
      resourceTypeCode: String(typeCode).trim(),
    },
  ]);

  const subdir = resolveUniqueSubdir(workspaceRoot, prepared.safeDir);
  const spinner = p.spinner();
  spinner.start('发行中…');
  try {
    const created = await createOneResource(prepared);
    writeItemConfigs({
      subdir,
      sourceFile: absolutePath,
      resourceId: created.resourceId,
      resourceName: created.resourceName,
      resourceTypeCode: prepared.resourceTypeCode,
      resourceTypeName: prepared.resourceTypeName,
      resourceTitle: prepared.resourceTitle,
      fileSha1: prepared.sha1,
      filename: prepared.filename,
      version: prepared.version,
      description: prepared.description,
      intro: prepared.intro,
      coverImages: prepared.coverImages,
      tags: prepared.tags,
      dependencies: prepared.dependencies,
      baseUpcastResources: prepared.baseUpcastResources,
      authExcludedItems: prepared.authExcludedItems,
      inputAttrs: prepared.inputAttrs,
      customPropertyDescriptors: prepared.customPropertyDescriptors,
      versionId: created.versionId,
      userId: auth.userId,
      username: auth.username,
    });
    spinner.stop(`已发行 → ${path.relative(workspaceRoot, subdir) || path.basename(subdir)}`);
    consola.info(`resourceId=${created.resourceId} owner=${auth.username || auth.userId}`);
    return subdir;
  } catch (error) {
    spinner.stop('发行失败');
    throw error;
  }
}

export function summarizeStudioWorkspace(workspaceRoot: string): void {
  if (!fs.existsSync(workspaceRoot)) {
    consola.warn('工作文件夹不存在');
    return;
  }
  const subdirs = fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const files = listRootMediaFiles(workspaceRoot).map((f) => path.basename(f));
  consola.info(`工作文件夹: ${workspaceRoot}`);
  consola.info(`根目录文件: ${files.length ? files.join(', ') : '（无）'}`);
  consola.info(`子工程: ${subdirs.length ? subdirs.join(', ') : '（无）'}`);
}
