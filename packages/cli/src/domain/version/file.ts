import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../../core/errors';
import { isInteractive } from '../../core/tty';
import { readDraft, writeDraft } from '../../local/draft';
import { updateIdentity } from '../../local/identity';
import { repairIndex } from '../../local/indexFile';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';
import { prepareUploadPath } from './zip';
import type { IdentityRecord } from '../../local/types';

export type FileApis = {
  fileIsExist?: (params: { sha1: string }) => Promise<unknown>;
  uploadFile?: (params: Record<string, unknown>) => Promise<unknown>;
  filesListInfo?: (params: {
    sha1: string;
    resourceTypeCode: string;
  }) => Promise<unknown>;
};

const ANALYZE_TIMEOUT_MS = 120_000;

function unwrapData(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: Record<string, unknown> | unknown[] };
  const data = envelope.data ?? result;
  if (Array.isArray(data)) {
    return (data[0] as Record<string, unknown>) ?? {};
  }
  return (data as Record<string, unknown>) ?? {};
}

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

export function confirmLocalPath(
  identity: IdentityRecord,
  file: string | undefined,
  yes: boolean | undefined,
  cwd: string,
): string {
  if (file) {
    const resolved = resolveExistingPath(cwd, file);
    if (!resolved) {
      // i18n: cli.file.missing
      throw new CliError(`本地文件不在：${file}。不准续用 sha1`, 'FILE_MISSING');
    }
    return resolved;
  }

  const recorded = identity.filePath;
  const recordedExists = recorded ? resolveExistingPath(cwd, recorded) : undefined;

  if (recordedExists) {
    if (yes || !isInteractive()) {
      return recordedExists;
    }
    // TTY 问句由调用方处理；非 --yes 的交互在此要求显式确认
    return recordedExists;
  }

  if (yes) {
    // i18n: cli.file.need_flag
    throw new CliError('请 --file 指定本地文件或目录', 'FILE_NEED_FLAG');
  }
  if (!recorded) {
    // i18n: cli.file.path_required
    throw new CliError('请指定本地文件路径', 'FILE_PATH_REQUIRED');
  }
  // i18n: cli.file.missing
  throw new CliError(`本地文件不在：${recorded}。不准续用 sha1`, 'FILE_MISSING');
}

export async function waitAnalyze(
  sha1: string,
  typeCode: string,
  apis: FileApis,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Record<string, unknown>> {
  const filesListInfo =
    apis.filesListInfo ?? ((params) => FServiceAPI.Storage.filesListInfo(params));
  const started = now();
  while (now() - started <= ANALYZE_TIMEOUT_MS) {
    const info = unwrapData(
      await filesListInfo({ sha1, resourceTypeCode: typeCode }),
    );
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
    await sleep(200);
  }
  // i18n: cli.file.analyze_timeout
  throw new CliError('属性解析超时', 'FILE_ANALYZE_TIMEOUT');
}

export async function uploadAndAnalyze(input: {
  cwd: string;
  identity: IdentityRecord;
  file?: string;
  yes?: boolean;
  apis?: FileApis;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ fileSha1: string; filename: string }> {
  assertPlatformAllowed();
  const localPath = confirmLocalPath(input.identity, input.file, input.yes, input.cwd);
  const uploadPath = await prepareUploadPath(input.identity.typeCode, localPath);
  const filename = path.basename(uploadPath);
  const sha1 = createHash('sha1').update(readFileSync(uploadPath)).digest('hex');

  const fileIsExist =
    input.apis?.fileIsExist ?? ((params) => FServiceAPI.Storage.fileIsExist(params));
  const exists = unwrapData(await fileIsExist({ sha1 }));
  if (!exists.isExisting && !exists.exist && exists.data !== true) {
    const upload =
      input.apis?.uploadFile ?? ((params) => FServiceAPI.Storage.uploadFile(params as never));
    await upload({ file: readFileSync(uploadPath), resourceType: input.identity.typeCode });
  }

  await waitAnalyze(
    sha1,
    input.identity.typeCode,
    input.apis ?? {},
    input.now,
    input.sleep,
  );

  if (uploadPath !== localPath && existsSync(uploadPath)) {
    try {
      unlinkSync(uploadPath);
    } catch {
      // 临时 zip 删不掉不挡主路径
    }
  }

  const draft = readDraft(input.cwd, input.identity.n) ?? {
    baseUpcastResources: [] as [],
    authExcludedItems: [] as [],
  };
  draft.fileSha1 = sha1;
  draft.filename = filename;
  writeDraft(input.cwd, input.identity.n, draft);
  if (input.file && input.file !== input.identity.filePath) {
    updateIdentity(input.cwd, input.identity.n, { filePath: input.file });
    repairIndex(input.cwd);
  }
  return { fileSha1: sha1, filename };
}

export function assertLocalExists(filePath: string): void {
  if (!existsSync(filePath)) {
    // i18n: cli.file.missing
    throw new CliError(`本地文件不在：${filePath}。不准续用 sha1`, 'FILE_MISSING');
  }
  statSync(filePath);
}
