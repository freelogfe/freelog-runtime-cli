/**
 * 唯一允许 POST 版本的地方（buildVersionPayload + submitVersion）。
 * 体里 baseUpcastResources / authExcludedItems 恒 []（本期不带上抛/排除项，对齐 Console 提交体）。
 * 成功删稿、失败留稿——失败时点名平台校验不过的字段。
 */

import { CliError } from '../../core/errors';
import { draftFilePath, readDraft } from '../../local/draft';
import { assertNoPendingOperation, clearPendingOperation, createPendingVersionSubmit, markPendingVersionSubmitSending, pendingOperationFilePath } from '../../local/pendingOperation';
import { commitLocalTransaction } from '../../local/transaction';
import type { IdentityRecord, VersionDraft } from '../../local/types';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed, getEnv } from '../env';
import { withProjectLock } from '../../local/lock';
import { assertDraftOptionsAllowed } from './form/option';
import type { TypeApis } from '../create/typePick';

export type SubmitApis = TypeApis & {
  createVersion?: (params: Record<string, unknown>) => Promise<unknown>;
};

function fieldName(error: unknown): string | undefined {
  const rec = error as { field?: string; msg?: string; message?: string; result?: { msg?: string } };
  return rec.field;
}

function errorDetail(error: unknown): string | undefined {
  const rec = error as { field?: string; msg?: string; message?: string; result?: { msg?: string } };
  return rec.result?.msg ?? rec.msg ?? rec.message;
}

/** 组 POST 体：稿字段 → 版本字段；上抛/排除恒空数组，不带 batchSignContracts。 */
export function buildVersionPayload(input: {
  resourceId: string;
  version: string;
  draft: VersionDraft;
  description?: string;
}): Record<string, unknown> {
  return {
    resourceId: input.resourceId,
    version: input.version,
    fileSha1: input.draft.fileSha1,
    filename: input.draft.filename,
    description: input.description ?? input.draft.description ?? '',
    customPropertyDescriptors: input.draft.customPropertyDescriptors ?? [],
    dependencies: input.draft.dependencies ?? [],
    inputAttrs: input.draft.inputAttrs ?? [],
    baseUpcastResources: [],
    authExcludedItems: [],
  };
}

/** 提交版本：无稿/缺文件先拦，POST 失败点名字段留稿，成功删稿。 */
export async function submitVersion(input: {
  cwd: string;
  identity: IdentityRecord;
  version: string;
  homeDir?: string;
  apis?: SubmitApis;
}): Promise<void> {
  return withProjectLock(input.cwd, () => submitVersionLocked(input), 'submit-version');
}

async function submitVersionLocked(input: {
  cwd: string;
  identity: IdentityRecord;
  version: string;
  homeDir?: string;
  apis?: SubmitApis;
}): Promise<void> {
  assertPlatformAllowed();
  if (!input.identity.resourceId) {
    // i18n: cli.submit.no_resource
    throw new CliError('请先 create 或 bind', 'SUBMIT_NO_RESOURCE');
  }
  const draft = readDraft(input.cwd, input.identity.n);
  if (!draft?.fileSha1) {
    // i18n: cli.submit.no_file
    throw new CliError('缺少文件', 'SUBMIT_FILE');
  }
  if (draft.analyzedSha1 !== draft.fileSha1) {
    throw new CliError('当前文件尚未完成属性分析，请重新 prepare', 'SUBMIT_ANALYSIS_REQUIRED');
  }
  if ((draft.orphanedInputAttrs ?? []).length > 0) {
    throw new CliError('文件分析变化待处理，请先人工复核附加属性', 'SUBMIT_ORPHANED_INPUT_ATTRS');
  }
  await assertDraftOptionsAllowed({
    cwd: input.cwd,
    typeCode: input.identity.typeCode,
    customPropertyDescriptors: draft.customPropertyDescriptors,
    homeDir: input.homeDir,
    apis: input.apis,
  });
  const payload = buildVersionPayload({
    resourceId: input.identity.resourceId,
    version: input.version,
    draft,
  });
  const createVersion =
    input.apis?.createVersion ??
    ((params) => FServiceAPI.Resource.createVersion(params as never));
  assertNoPendingOperation(input.cwd);
  createPendingVersionSubmit({
    cwd: input.cwd,
    resourceN: input.identity.n,
    resourceId: input.identity.resourceId,
    env: getEnv(),
    version: input.version,
    fileSha1: draft.fileSha1,
  });
  markPendingVersionSubmitSending(input.cwd);
  try {
    await createVersion(payload);
  } catch (error) {
    if (!isDefinitivePlatformRejection(error)) {
      throw new CliError(
        '版本提交请求结果未知；请运行 resource recover 核验，切勿重复提交或重新 bump',
        'SUBMIT_RESULT_UNKNOWN',
      );
    }
    clearPendingOperation(input.cwd);
    const field = fieldName(error);
    const detail = errorDetail(error);
    // i18n: cli.submit.failed
    throw new CliError(
      field ? `提交失败：${field}${detail ? `：${detail}` : ''}` : detail ? `提交失败：${detail}` : '提交失败',
      'SUBMIT_FAILED',
    );
  }
  // 平台已确认成功后，清稿和清未决记录必须同时完成；中断由本地事务前滚恢复。
  commitLocalTransaction(input.cwd, [
    { path: draftFilePath(input.cwd, input.identity.n), content: null },
    { path: pendingOperationFilePath(input.cwd), content: null },
  ]);
}

/** 只有平台明确返回字段/业务错误或 HTTP 4xx 时，才能证明这次 POST 没有成功。 */
function isDefinitivePlatformRejection(error: unknown): boolean {
  if (error instanceof CliError) return true;
  const rec = error as {
    field?: unknown;
    msg?: unknown;
    result?: { msg?: unknown };
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  if (typeof rec.field === 'string' || typeof rec.msg === 'string' || typeof rec.result?.msg === 'string') {
    return true;
  }
  const status = rec.status ?? rec.statusCode ?? rec.response?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}
