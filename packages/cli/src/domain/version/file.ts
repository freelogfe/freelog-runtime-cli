/**
 * 文件链路：确认本地路径（不在 → 禁续用 sha1）→（主题/插件目录先打临时 zip）
 * → sha1 → 秒传判定/上传 → filesListInfo 轮询解析（120s 上限）→ sha1 写入工作稿。
 */

import { createHash } from 'node:crypto';
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

export type FileApis = {
  fileIsExist?: (params: { sha1: string }) => Promise<unknown>;
  uploadFile?: (params: Record<string, unknown>) => Promise<unknown>;
  filesListInfo?: (params: {
    sha1: string;
    resourceTypeCode: string;
  }) => Promise<unknown>;
};

const ANALYZE_TIMEOUT_MS = 120_000;
const ANALYZE_POLL_INTERVAL_MS = 200;

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

/** 轮询平台解析结果（filesListInfo，status 2=完成 3=失败），最长 120 秒；超时/失败都报错。 */
export async function waitAnalyze(
  sha1: string,
  typeCode: string,
  apis: FileApis,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Record<string, unknown>> {
  const filesListInfo =
    apis.filesListInfo ?? ((params) => FServiceAPI.Storage.filesListInfo(params));
  const started = now();
  while (now() - started <= ANALYZE_TIMEOUT_MS) {
    const info = unwrapFirst(await filesListInfo({ sha1, resourceTypeCode: typeCode }));
    const status = Number(info.metaAnalyzeStatus ?? info.status);
    if (status === 2) {
      return info;
    }
    if (status === 3) {
      // i18n: cli.file.analyze_failed
      throw new CliError('属性解析失败', 'FILE_ANALYZE_FAILED');
    }
    if (now() - started > ANALYZE_TIMEOUT_MS) {
      break;
    }
    await sleep(ANALYZE_POLL_INTERVAL_MS);
  }
  // i18n: cli.file.analyze_timeout
  throw new CliError('属性解析超时', 'FILE_ANALYZE_TIMEOUT');
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
  typeCode: string,
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
  // `openAsBlob` 是文件背书的 Blob；fetch/FormData 在传输时读取，不把整个产物放进 Buffer。
  assertFileUnchanged(uploadPath, fingerprint);
  const file = await openAsBlob(uploadPath);
  await upload({ file, resourceType: typeCode });
  assertFileUnchanged(uploadPath, fingerprint);
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
  analysis: Record<string, unknown>,
): void {
  const draft = readDraft(input.cwd, input.identity.n) ?? {
    baseUpcastResources: [] as [],
    authExcludedItems: [] as [],
  };
  const hasMetadata = Array.isArray(analysis.metaInfoArray);
  const metadata: unknown[] = hasMetadata ? analysis.metaInfoArray as unknown[] : [];
  const additionalKeys = new Set(
    metadata
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .filter((item) => Number(item.insertMode) === 2)
      .map((item) => String(item.key ?? ''))
      .filter(Boolean),
  );
  const previousAttrs = draft.inputAttrs ?? [];
  const previousOrphans = draft.orphanedInputAttrs ?? [];
  const reuseCurrentAnalysis = !hasMetadata
    && draft.fileSha1 === uploaded.fileSha1
    && draft.analyzedSha1 === uploaded.fileSha1;
  const retainedAttrs = reuseCurrentAnalysis ? previousAttrs : [
    ...previousAttrs.filter((item) => additionalKeys.has(String(item.key ?? ''))),
    // 新分析重新出现同 key 时，恢复用户上次保留的值；它不应永远卡在待复核队列。
    ...previousOrphans.filter((item) => additionalKeys.has(String(item.key ?? ''))
      && !previousAttrs.some((current) => additionalKeys.has(String(current.key ?? '')) && current.key === item.key)),
  ];
  const newlyOrphaned = reuseCurrentAnalysis
    ? []
    : previousAttrs.filter((item) => !additionalKeys.has(String(item.key ?? '')));
  const unresolvedOrphans = reuseCurrentAnalysis
    ? previousOrphans
    : previousOrphans.filter((item) => !additionalKeys.has(String(item.key ?? '')));
  draft.fileSha1 = uploaded.fileSha1;
  draft.filename = uploaded.filename;
  draft.analyzedSha1 = uploaded.fileSha1;
  draft.inputAttrs = retainedAttrs;
  draft.orphanedInputAttrs = [
    ...unresolvedOrphans,
    ...newlyOrphaned.filter((item) => !unresolvedOrphans.some((old) => old.key === item.key)),
  ];
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
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
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
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
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
    await uploadIfNew(uploadPath, uploaded.fileSha1, hashed.fingerprint, identity.typeCode, input.apis ?? {});
    const analysis = await waitAnalyze(
      uploaded.fileSha1,
      identity.typeCode,
      input.apis ?? {},
      input.now,
      input.sleep,
    );
    assertFileUnchanged(uploadPath, hashed.fingerprint);

    writeSha1ToDraft(
      {
        ...input,
        // 用原身份写回，令已存在的 `./dist` 之类旧路径也在成功发版后收敛为规范值。
        identity: input.identity,
        file: file ?? (recordedFile !== input.identity.filePath ? recordedFile : undefined),
      },
      uploaded,
      analysis,
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
