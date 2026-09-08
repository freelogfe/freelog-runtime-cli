/**
 * 文件链路：确认本地路径（不在 → 禁续用 sha1）→（主题/插件目录先打临时 zip）
 * → sha1 → 秒传判定/上传 → filesListInfo 轮询解析（120s 上限）→ sha1 写入工作稿。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../../core/errors';
import { draftFilePath, prepareDraft, readDraft, serializeDraft } from '../../local/draft';
import { identityFilePath, listIdentities, prepareIdentityUpdate, serializeIdentity } from '../../local/identity';
import { indexFilePath, indexFromIdentities, serializeIndex } from '../../local/indexFile';
import { normalizeProjectPath } from '../../local/projectPath';
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

/** 解析本地路径：原样在就直接用；否则当相对 cwd 的路径再试一次；都没有返回 undefined。 */
export function resolveExistingPath(cwd: string, raw: string): string | undefined {
  if (existsSync(raw)) {
    return path.resolve(raw);
  }
  const joined = path.resolve(cwd, raw);
  if (existsSync(joined)) {
    return joined;
  }
  return undefined;
}

/**
 * 发版确认本地路径（06 §3）。
 * spec 里 TTY 问「使用已记录的 dist？」：非交互 CLI 先按记录路径直取，
 * 记录路径本地不在或没有记录时必须显式 `--file`。
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
    return resolved;
  }

  const recorded = identity.filePath
    ? normalizeProjectPath(cwd, identity.filePath)
    : undefined;
  const recordedExists = recorded ? resolveExistingPath(cwd, recorded) : undefined;
  if (recordedExists) {
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

function sha1OfFile(uploadPath: string): string {
  return createHash('sha1').update(readFileSync(uploadPath)).digest('hex');
}

async function uploadIfNew(
  uploadPath: string,
  sha1: string,
  typeCode: string,
  apis: FileApis,
): Promise<void> {
  const fileIsExist =
    apis.fileIsExist ?? ((params) => FServiceAPI.Storage.fileIsExist(params));
  const exists = unwrapFirst(await fileIsExist({ sha1 }));
  if (exists.isExisting || exists.exist || exists.data === true) {
    return;
  }
  const upload = apis.uploadFile ?? ((params) => FServiceAPI.Storage.uploadFile(params as never));
  await upload({ file: readFileSync(uploadPath), resourceType: typeCode });
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
  const reuseCurrentAnalysis = !hasMetadata
    && draft.fileSha1 === uploaded.fileSha1
    && draft.analyzedSha1 === uploaded.fileSha1;
  const retainedAttrs = reuseCurrentAnalysis
    ? previousAttrs
    : previousAttrs.filter((item) => additionalKeys.has(String(item.key ?? '')));
  const newlyOrphaned = reuseCurrentAnalysis
    ? []
    : previousAttrs.filter((item) => !additionalKeys.has(String(item.key ?? '')));
  draft.fileSha1 = uploaded.fileSha1;
  draft.filename = uploaded.filename;
  draft.analyzedSha1 = uploaded.fileSha1;
  draft.inputAttrs = retainedAttrs;
  draft.orphanedInputAttrs = [
    ...(draft.orphanedInputAttrs ?? []),
    ...newlyOrphaned.filter((item) => !(draft.orphanedInputAttrs ?? []).some((old) => old.key === item.key)),
  ];
  const nextDraft = prepareDraft(input.cwd, input.identity.n, draft);
  const changes = [{
    path: draftFilePath(input.cwd, input.identity.n),
    content: serializeDraft(nextDraft),
  }];
  if (input.file && input.file !== input.identity.filePath) {
    const updated = prepareIdentityUpdate(input.cwd, input.identity.n, { filePath: input.file });
    const identities = listIdentities(input.cwd)
      .map((item) => item.n === updated.n ? updated : item);
    changes.push(
      { path: identityFilePath(input.cwd, updated.n), content: serializeIdentity(updated) },
      { path: indexFilePath(input.cwd), content: serializeIndex(indexFromIdentities(identities)) },
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
  const recordedFile = input.identity.filePath
    ? normalizeProjectPath(input.cwd, input.identity.filePath)
    : undefined;
  const identity = recordedFile === input.identity.filePath
    ? input.identity
    : { ...input.identity, filePath: recordedFile };
  const localPath = confirmLocalPath(identity, file, input.yes, input.cwd);
  const uploadPath = await prepareUploadPath(identity.typeCode, localPath);
  try {
    const uploaded = { fileSha1: sha1OfFile(uploadPath), filename: path.basename(uploadPath) };
    await uploadIfNew(uploadPath, uploaded.fileSha1, identity.typeCode, input.apis ?? {});
    const analysis = await waitAnalyze(
      uploaded.fileSha1,
      identity.typeCode,
      input.apis ?? {},
      input.now,
      input.sleep,
    );

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

/** 断言路径存在（写盘前对 --file 的快速失败检查）。 */
export function assertLocalExists(filePath: string): void {
  if (!existsSync(filePath)) {
    // i18n: cli.file.missing
    throw new CliError(`本地文件不在：${filePath}。不准续用 sha1`, 'FILE_MISSING');
  }
  statSync(filePath);
}
