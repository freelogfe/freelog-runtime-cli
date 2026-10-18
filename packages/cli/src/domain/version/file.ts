/**
 * 文件链路：确认本地路径（不在 → 禁续用 sha1）→（主题/插件目录先打临时 zip）
 * → sha1 → 秒传判定/上传 → Console 同源 SSE 按类型解析（120s 上限）→ sha1 写入工作稿。
 */

import { createHash } from 'node:crypto';
import { File } from 'node:buffer';
import { createReadStream, existsSync, openAsBlob, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../../core/errors';
import { draftFilePath, prepareDraft, readDraft, serializeDraft } from '../../local/draft';
import { identityFilePath, prepareIdentityUpdate, serializeIdentity } from '../../local/identity';
import { normalizeProjectPath, resolveExistingProjectPath } from '../../local/projectPath';
import { withProjectLock } from '../../local/lock';
import { commitLocalTransaction } from '../../local/transaction';
import type { IdentityRecord } from '../../local/types';
import { FServiceAPI } from '../../platform/api';
import { unwrapFirst } from '../../platform/unwrap';
import { assertPlatformAllowed } from '../env';
import { prepareUploadPath } from './zip';
import { waitAnalyze } from './analyze';
import { loadSystemAttributes, reconcileInputAttrs, assertNoSystemAttributeConflict, type SystemAttributeApis, type SystemAttribute } from './systemAttributes';

export { waitAnalyze, waitAnalyzeSse } from './analyze';

export type FileApis = SystemAttributeApis & {
  fileIsExist?: (params: { sha1: string }) => Promise<unknown>;
  uploadFile?: (params: Record<string, unknown>) => Promise<unknown>;
};

/** 解析本地路径：所有相对路径只相对已解析工程根；不得受启动目录影响。 */
export function resolveExistingPath(cwd: string, raw: string): string | undefined {
  const joined = path.resolve(cwd, raw);
  if (existsSync(joined)) {
    return joined;
  }
  return undefined;
}

/**
 * 发版确认本地路径（06 §3）。
 * spec 里 TTY 问「使用已记录的 dist？」：非交互 CLI 先按记录路径直取，
 * 记录路径本地不在或没有记录时必须显式给出 `--artifact`。
 */
export function confirmLocalPath(
  identity: IdentityRecord,
  file: string | undefined,
  yes: boolean | undefined,
  cwd: string,
): string {
  if (file !== undefined) {
    const normalizedFile = normalizeProjectPath(cwd, file);
    const resolved = resolveExistingPath(cwd, normalizedFile);
    if (!resolved) {
      // i18n: cli.file.missing
      throw new CliError(`本地文件不在：${normalizedFile}。不准续用 sha1`, 'FILE_MISSING');
    }
    // 先以真实路径核验软链接边界，但保留工程的逻辑路径供上传和输出使用；
    // macOS 的 /var → /private/var 别名不应改变同一工程内产物的路径语义。
    resolveExistingProjectPath(cwd, resolved);
    return resolved;
  }

  const recorded = identity.filePath
    ? normalizeProjectPath(cwd, identity.filePath)
    : undefined;
  const recordedExists = recorded ? resolveExistingPath(cwd, recorded) : undefined;
  if (recordedExists) {
    resolveExistingProjectPath(cwd, recordedExists);
    return recordedExists;
  }

  if (yes) {
    // i18n: cli.file.need_flag
    throw new CliError('请 --artifact 指定本地文件或目录', 'FILE_NEED_FLAG');
  }
  if (!recorded) {
    // i18n: cli.file.path_required
    throw new CliError('请指定本地文件路径', 'FILE_PATH_REQUIRED');
  }
  // i18n: cli.file.missing
  throw new CliError(`本地文件不在：${recorded}。不准续用 sha1`, 'FILE_MISSING');
}

type FileFingerprint = {
  size: number;
  mtimeMs: number;
  ctimeMs: number;
};

function fingerprintFile(uploadPath: string): FileFingerprint {
  const stats = statSync(uploadPath);
  if (!stats.isFile()) {
    throw new CliError('产物必须是可读取的文件', 'FILE_ARTIFACT_UNSUPPORTED');
  }
  return { size: stats.size, mtimeMs: stats.mtimeMs, ctimeMs: stats.ctimeMs };
}

function assertFileUnchanged(uploadPath: string, expected: FileFingerprint): void {
  const actual = fingerprintFile(uploadPath);
  if (
    actual.size !== expected.size
    || actual.mtimeMs !== expected.mtimeMs
    || actual.ctimeMs !== expected.ctimeMs
  ) {
    throw new CliError(
      '发布期间本地产物发生变化；请保持产物稳定后重试',
      'FILE_CHANGED_DURING_PUBLISH',
    );
  }
}

/** SHA1 按流读取，避免为大资源复制整份内存；哈希完成后须仍是同一文件。 */
async function sha1OfFile(uploadPath: string): Promise<{ sha1: string; fingerprint: FileFingerprint }> {
  const fingerprint = fingerprintFile(uploadPath);
  const hash = createHash('sha1');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(uploadPath);
    stream.on('data', (chunk: string | Buffer) => { hash.update(chunk); });
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  assertFileUnchanged(uploadPath, fingerprint);
  return { sha1: hash.digest('hex'), fingerprint };
}

async function uploadIfNew(
  uploadPath: string,
  sha1: string,
  fingerprint: FileFingerprint,
  apis: FileApis,
): Promise<void> {
  const fileIsExist =
    apis.fileIsExist ?? ((params) => FServiceAPI.Storage.fileIsExist(params));
  const exists = unwrapFirst(await fileIsExist({ sha1 }));
  if (exists.isExisting || exists.exist || exists.data === true) {
    assertFileUnchanged(uploadPath, fingerprint);
    return;
  }
  const upload = apis.uploadFile ?? ((params) => FServiceAPI.Storage.uploadFile(params as never));
  // 对齐浏览器 Console：必须传带真实 filename / MIME 的 File。仅传 Node Blob 时
  // multipart 会默认 filename="blob"，存储端可能无法按扩展名识别图片或主题 ZIP。
  // File 以 Blob 为 part，不把大产物整体读入 Buffer。
  assertFileUnchanged(uploadPath, fingerprint);
  const filename = path.basename(uploadPath);
  const file = new File([await openAsBlob(uploadPath, { type: mimeForFilename(filename) })], filename, {
    type: mimeForFilename(filename),
  });
  // 对齐 Console：上传端只接收文件；资源类型在 listSSE/info 解析请求中传入。
  await upload({ file });
  assertFileUnchanged(uploadPath, fingerprint);
}

function mimeForFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.pdf': 'application/pdf', '.zip': 'application/zip', '.json': 'application/json', '.txt': 'text/plain',
    '.html': 'text/html', '.htm': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  };
  return types[ext] ?? 'application/octet-stream';
}

function removeTempZip(uploadPath: string, localPath: string): void {
  if (uploadPath === localPath || !existsSync(uploadPath)) {
    return;
  }
  try {
    unlinkSync(uploadPath);
  } catch {
    // 临时 zip 删不掉不挡主路径
  }
}

function writeSha1ToDraft(
  input: { cwd: string; identity: IdentityRecord; file?: string },
  uploaded: { fileSha1: string; filename: string },
  attributes: SystemAttribute[],
): void {
  const draft = readDraft(input.cwd, input.identity.n) ?? {
    baseUpcastResources: [] as [],
    authExcludedItems: [] as [],
  };
  // 系统字段优先，但冲突不能静默删掉用户稿；在事务写入前明确失败。
  for (const item of draft.customPropertyDescriptors ?? []) {
    assertNoSystemAttributeConflict(attributes, { key: String(item.key ?? ''), name: String(item.name ?? '') });
  }
  const reconciled = reconcileInputAttrs({
    inputAttrs: draft.inputAttrs ?? [],
    orphanedInputAttrs: draft.orphanedInputAttrs ?? [],
    attributes,
  });
  draft.fileSha1 = uploaded.fileSha1;
  draft.filename = uploaded.filename;
  draft.analyzedSha1 = uploaded.fileSha1;
  draft.inputAttrs = reconciled.inputAttrs;
  draft.orphanedInputAttrs = reconciled.orphanedInputAttrs;
  const nextDraft = prepareDraft(input.cwd, input.identity.n, draft);
  const changes = [{
    path: draftFilePath(input.cwd, input.identity.n),
    content: serializeDraft(nextDraft),
  }];
  if (input.file && input.file !== input.identity.filePath) {
    const updated = prepareIdentityUpdate(input.cwd, input.identity.n, { filePath: input.file });
    changes.push(
      { path: identityFilePath(input.cwd, updated.n), content: serializeIdentity(updated) },
    );
  }
  commitLocalTransaction(input.cwd, changes);
}

/** 上传+解析主链路：定路径 → （必要时打 zip）→ sha1 → 秒传判定/上传 → 等解析 → sha1 写稿并更新 filePath。 */
export async function uploadAndAnalyze(input: {
  cwd: string;
  identity: IdentityRecord;
  file?: string;
  yes?: boolean;
  apis?: FileApis;
}): Promise<{ fileSha1: string; filename: string }> {
  return withProjectLock(input.cwd, () => uploadAndAnalyzeLocked(input), 'version-upload-analyze');
}

/** 文件分析结果与工作稿/记录路径的回写必须共用一个临界区。 */
async function uploadAndAnalyzeLocked(input: {
  cwd: string;
  identity: IdentityRecord;
  file?: string;
  yes?: boolean;
  apis?: FileApis;
}): Promise<{ fileSha1: string; filename: string }> {
  assertPlatformAllowed();
  const file = input.file !== undefined
    ? normalizeProjectPath(input.cwd, input.file)
    : undefined;
  const recordedFile = normalizeProjectPath(input.cwd, input.identity.filePath);
  const identity = recordedFile === input.identity.filePath
    ? input.identity
    : { ...input.identity, filePath: recordedFile };
  const localPath = confirmLocalPath(identity, file, input.yes, input.cwd);
  const uploadPath = await prepareUploadPath(identity.typeCode, localPath, input.cwd);
  try {
    const hashed = await sha1OfFile(uploadPath);
    const uploaded = { fileSha1: hashed.sha1, filename: path.basename(uploadPath) };
    await uploadIfNew(uploadPath, uploaded.fileSha1, hashed.fingerprint, input.apis ?? {});
    const analysis = await waitAnalyze(
      uploaded.fileSha1,
      identity.typeCode,
      input.apis ?? {},
    );
    const attributes = await loadSystemAttributes({
      typeCode: identity.typeCode,
      analysis,
      apis: input.apis,
    });
    assertFileUnchanged(uploadPath, hashed.fingerprint);

    writeSha1ToDraft(
      {
        ...input,
        // 用原身份写回，令已存在的 `./dist` 之类旧路径也在成功发版后收敛为规范值。
        identity: input.identity,
        file: file ?? (recordedFile !== input.identity.filePath ? recordedFile : undefined),
      },
      uploaded,
      attributes,
    );
    return uploaded;
  } finally {
    removeTempZip(uploadPath, localPath);
  }
}

/** 断言路径存在（写盘前对 `--artifact` 的快速失败检查）。 */
export function assertLocalExists(filePath: string): void {
  if (!existsSync(filePath)) {
    // i18n: cli.file.missing
    throw new CliError(`本地文件不在：${filePath}。不准续用 sha1`, 'FILE_MISSING');
  }
  statSync(filePath);
}
