import { CliError } from '../../core/errors';
import { deleteDraft, readDraft } from '../../local/draft';
import type { IdentityRecord, VersionDraft } from '../../local/types';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';

export type SubmitApis = {
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

export async function submitVersion(input: {
  cwd: string;
  identity: IdentityRecord;
  version: string;
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
  const payload = buildVersionPayload({
    resourceId: input.identity.resourceId,
    version: input.version,
    draft,
  });
  const createVersion =
    input.apis?.createVersion ??
    ((params) => FServiceAPI.Resource.createVersion(params as never));
  try {
    await createVersion(payload);
  } catch (error) {
    const field = fieldName(error);
    const detail = errorDetail(error);
    // i18n: cli.submit.failed
    throw new CliError(
      field ? `提交失败：${field}${detail ? `：${detail}` : ''}` : detail ? `提交失败：${detail}` : '提交失败',
      'SUBMIT_FAILED',
    );
  }
  deleteDraft(input.cwd, input.identity.n);
}
