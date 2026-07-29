import fs from 'node:fs';
import path from 'node:path';
import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/paths.js';
import { writeResourceConfig, writeVersionConfig } from '../config/writeShell.js';
import { FServiceAPI, getSHA1Hash, unwrapData } from '../platform/index.js';
import { uploadFileIfNeeded } from './storageUpload.js';
import { assertResourceTypeCode } from './typeService.js';

const MAX_FILES = 20;
const CONFIG_RE = /^freelog\..*\.config/i;

export interface FromDirCreatedItem {
  subdir: string;
  resourceId: string;
  resourceName: string;
}

function sanitizeBasename(name: string): string {
  const base = path.parse(name).name || 'file';
  const cleaned = base
    .replace(/[\\/:*?"<>|\s@$#]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return cleaned || 'file';
}

function listFlatFiles(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new CliError(`目录不存在: ${dir}`, { code: 4 });
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (CONFIG_RE.test(ent.name)) continue;
    files.push(path.join(dir, ent.name));
  }
  files.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  if (files.length === 0) {
    throw new CliError('目录内无可用扁平文件', { code: 4 });
  }
  if (files.length > MAX_FILES) {
    throw new CliError(`最多 ${MAX_FILES} 个文件，当前 ${files.length}`, { code: 4 });
  }
  return files;
}

function resolveUniqueSubdir(parent: string, safeName: string): string {
  let candidate = path.join(parent, safeName);
  if (!fs.existsSync(candidate)) return candidate;
  let i = 2;
  while (fs.existsSync(path.join(parent, `${safeName}_${i}`))) i += 1;
  return path.join(parent, `${safeName}_${i}`);
}

function writeItemConfigs(opts: {
  subdir: string;
  sourceFile: string;
  resourceId: string;
  resourceName: string;
  resourceTypeCode: string;
  resourceTitle: string;
  userId?: number | string;
  username?: string;
}) {
  fs.mkdirSync(opts.subdir, { recursive: true });
  const destName = path.basename(opts.sourceFile);
  const destFile = path.join(opts.subdir, destName);
  if (path.resolve(opts.sourceFile) !== path.resolve(destFile)) {
    fs.copyFileSync(opts.sourceFile, destFile);
  }

  writeResourceConfig(
    {
      resourceId: opts.resourceId,
      resourceName: opts.resourceName,
      resourceType: [],
      resourceTypeCode: opts.resourceTypeCode,
      resourceTitle: opts.resourceTitle,
      userId: opts.userId,
      username: opts.username,
    },
    opts.subdir,
  );
  writeVersionConfig(
    {
      resourceId: opts.resourceId,
      resourceName: opts.resourceName,
      version: '1.0.0',
      filePath: destName,
      userId: opts.userId,
      username: opts.username,
    },
    opts.subdir,
  );
}

interface PreparedFile {
  absolutePath: string;
  filename: string;
  sha1: string;
  name: string;
  resourceTitle: string;
  safeDir: string;
}

async function prepareFiles(opts: {
  dir: string;
  typeCode: string;
  titlePrefix?: string;
  username: string;
}): Promise<PreparedFile[]> {
  const files = listFlatFiles(opts.dir);
  const prepared: PreparedFile[] = [];
  for (const absolutePath of files) {
    const filename = path.basename(absolutePath);
    const sha1 = await getSHA1Hash(absolutePath);
    await uploadFileIfNeeded(absolutePath, sha1);
    const safeDir = sanitizeBasename(filename);
    const namePart = safeDir.slice(0, 40);
    let name = `${opts.username}/${namePart}`.slice(0, 60);
    if (name.length > 60) name = name.slice(0, 60);
    const resourceTitle = `${opts.titlePrefix || ''}${path.parse(filename).name}`.slice(0, 100);
    prepared.push({ absolutePath, filename, sha1, name, resourceTitle, safeDir });
  }
  return prepared;
}

async function createOneFallback(
  item: PreparedFile,
  typeCode: string,
): Promise<{ resourceId: string; resourceName: string }> {
  const createEnv = await FServiceAPI.Resource.create({
    name: item.name,
    resourceTypeCode: typeCode,
    resourceTitle: item.resourceTitle,
  } as Parameters<typeof FServiceAPI.Resource.create>[0]);
  const created = unwrapData<{ resourceId?: string; resourceName?: string }>(createEnv);
  if (!created?.resourceId) {
    throw new CliError(`create 失败: ${item.filename}`, { code: 1, details: created });
  }
  await FServiceAPI.Resource.createVersion({
    resourceId: created.resourceId,
    version: '1.0.0',
    fileSha1: item.sha1,
    filename: item.filename,
    description: '',
    dependencies: [],
    baseUpcastResources: [],
    authExcludedItems: [],
  } as Parameters<typeof FServiceAPI.Resource.createVersion>[0]);
  return {
    resourceId: created.resourceId,
    resourceName: created.resourceName || item.name,
  };
}

export async function createFromDir(opts: {
  dir: string;
  typeCode: string;
  titlePrefix?: string;
  cwd?: string;
  yes?: boolean;
}): Promise<FromDirCreatedItem[]> {
  const auth = requireAuth();
  if (!auth.username) {
    throw new CliError('登录信息缺少 username', { code: 2, hint: '重新 login' });
  }
  await assertResourceTypeCode(opts.typeCode);

  const parent = path.resolve(opts.dir || opts.cwd || resolveCwd());
  const prepared = await prepareFiles({
    dir: parent,
    typeCode: opts.typeCode,
    titlePrefix: opts.titlePrefix,
    username: auth.username,
  });

  type BatchItem = { resourceId?: string; resourceName?: string; name?: string };
  let batchResults: BatchItem[] | null = null;

  try {
    const envelope = await FServiceAPI.Resource.createBatch({
      resourceTypeCode: opts.typeCode,
      createResourceObjects: prepared.map((p) => ({
        name: p.name,
        resourceTitle: p.resourceTitle,
        version: '1.0.0',
        fileSha1: p.sha1,
        filename: p.filename,
      })),
    } as Parameters<typeof FServiceAPI.Resource.createBatch>[0]);
    const data = unwrapData<BatchItem[] | { dataList?: BatchItem[]; resources?: BatchItem[] }>(
      envelope,
    );
    if (Array.isArray(data)) {
      batchResults = data;
    } else if (data && Array.isArray((data as { dataList?: BatchItem[] }).dataList)) {
      batchResults = (data as { dataList: BatchItem[] }).dataList;
    } else if (data && Array.isArray((data as { resources?: BatchItem[] }).resources)) {
      batchResults = (data as { resources: BatchItem[] }).resources;
    } else {
      throw new CliError('createBatch 响应格式异常', { code: 1, details: data });
    }
  } catch (error) {
    if (error instanceof CliError && error.code === 2) throw error;
    // fallback: 逐个 create + createVersion
    batchResults = null;
  }

  const created: FromDirCreatedItem[] = [];
  const failures: Array<{ file: string; error: string }> = [];

  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i]!;
    try {
      let resourceId: string | undefined;
      let resourceName: string | undefined;

      if (batchResults) {
        const row = batchResults[i];
        resourceId = row?.resourceId;
        resourceName = row?.resourceName || row?.name || item.name;
        if (!resourceId) {
          throw new CliError(`createBatch 未返回第 ${i + 1} 项 resourceId`, {
            code: 1,
            details: row,
          });
        }
      } else {
        const one = await createOneFallback(item, opts.typeCode);
        resourceId = one.resourceId;
        resourceName = one.resourceName;
      }

      const subdir = resolveUniqueSubdir(parent, item.safeDir);
      writeItemConfigs({
        subdir,
        sourceFile: item.absolutePath,
        resourceId,
        resourceName: resourceName || item.name,
        resourceTypeCode: opts.typeCode,
        resourceTitle: item.resourceTitle,
        userId: auth.userId,
        username: auth.username,
      });
      created.push({
        subdir: path.relative(parent, subdir) || path.basename(subdir),
        resourceId,
        resourceName: resourceName || item.name,
      });
    } catch (error) {
      failures.push({
        file: item.filename,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failures.length > 0) {
    throw new CliError(
      `create --from-dir 部分失败（成功 ${created.length}/${prepared.length}）`,
      {
        code: 4,
        details: { created, failures },
        hint: '成功项已写入子目录 config；失败项可单独 create/publish',
      },
    );
  }

  return created;
}
