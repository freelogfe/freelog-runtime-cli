/**
 * 唯一允许 POST 版本的地方（buildVersionPayload + submitVersion）。
 * 体里 baseUpcastResources / authExcludedItems 恒 []（本期不带上抛/排除项，对齐 Console 提交体）。
 * 成功只清发送时未变稿，后来变稿保留并提示；失败留稿，未知结果留marker核验。
 */

import { CliError } from '../../core/errors';
import { draftFilePath, readDraftSha256, readDraftSnapshot } from '../../local/draft';
import { assertNoPendingOperation, createPendingVersionSubmit, markPendingVersionSubmitSending, pendingOperationFilePath } from '../../local/pendingOperation';
import { readIdentity } from '../../local/identity';
import { commitLocalTransaction } from '../../local/transaction';
import type { IdentityRecord, VersionDraft } from '../../local/types';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed, getEnv } from '../env';
import { withProjectLock } from '../../local/lock';
import { assertDraftOptionsAllowed } from './form/option';
import type { TypeApis } from '../create/typePick';
import { assertNoSystemAttributeConflict, assertSystemAttributeValue, loadAttributeNamespace, type SystemAttributeApis } from './systemAttributes';
import { assertCustomPropertyDescriptors } from './form/customProperties';

export type SubmitApis = TypeApis & SystemAttributeApis & {
  createVersion?: (params: Record<string, unknown>) => Promise<unknown>;
};
export type SubmitVersionResult = { draftRetained: boolean };

function fieldName(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const rec = error as { field?: unknown };
  return typeof rec.field === 'string' ? rec.field : undefined;
}

function errorDetail(error: unknown): string | undefined {
  if (error instanceof CliError) return error.message;
  if (!error || typeof error !== 'object') return undefined;
  const rec = error as { msg?: unknown; result?: { msg?: unknown } };
  const detail = typeof rec.result?.msg === 'string' ? rec.result.msg : rec.msg;
  return typeof detail === 'string' ? detail : undefined;
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

/** 提交版本：快照校验→武装→POST；只清本次未变稿，返回留稿事实供编排提示。 */
export async function submitVersion(input: {
  cwd: string;
  identity: IdentityRecord;
  version: string;
  homeDir?: string;
  apis?: SubmitApis;
}): Promise<SubmitVersionResult> {
  return withProjectLock(input.cwd, () => submitVersionLocked(input), 'submit-version');
}

async function submitVersionLocked(input: {
  cwd: string;
  identity: IdentityRecord;
  version: string;
  homeDir?: string;
  apis?: SubmitApis;
}): Promise<SubmitVersionResult> {
  assertPlatformAllowed();
  if (!input.identity.resourceId) {
    // i18n: cli.submit.no_resource
    throw new CliError('请先 create 或 bind', 'SUBMIT_NO_RESOURCE');
  }
  const snapshot = readDraftSnapshot(input.cwd, input.identity.n);
  const draft = snapshot?.draft;
  if (!snapshot || !draft?.fileSha1) {
    // i18n: cli.submit.no_file
    throw new CliError('缺少文件', 'SUBMIT_FILE');
  }
  assertSelectedIdentity(input.cwd, input.identity, draft);
  if (draft.analyzedSha1 !== draft.fileSha1) {
    throw new CliError('当前文件尚未完成属性分析，请重新 prepare', 'SUBMIT_ANALYSIS_REQUIRED');
  }
  if ((draft.orphanedInputAttrs ?? []).length > 0) {
    throw new CliError('文件分析变化待处理，请先人工复核附加属性', 'SUBMIT_ORPHANED_INPUT_ATTRS');
  }
  // 一次提交只读同一主体的类型快照；独立操作仍重新读取，不落盘缓存平台定义。
  let typeInfo: Promise<unknown> | undefined;
  const apis: SubmitApis = {
    ...input.apis,
    getByCode: (params) => typeInfo ??= Promise.resolve().then(() => input.apis?.getByCode
      ? input.apis.getByCode(params)
      : FServiceAPI.Resource.getResourceTypeInfoByCode(params)),
  };
  await assertDraftOptionsAllowed({
    cwd: input.cwd,
    typeCode: input.identity.typeCode,
    customPropertyDescriptors: draft.customPropertyDescriptors,
    homeDir: input.homeDir,
    apis,
  });
  assertCustomPropertyDescriptors(draft.customPropertyDescriptors ?? []);
  // 手工编辑 JSON 不能绕过表单。始终以当前平台定义检查，不信旧缓存格式。
  if ((draft.inputAttrs ?? []).length || (draft.customPropertyDescriptors ?? []).length) {
    const system = await loadAttributeNamespace({ typeCode: input.identity.typeCode, sha1: draft.fileSha1, apis, includeDefinitions: (draft.inputAttrs ?? []).length > 0 });
    for (const item of draft.customPropertyDescriptors ?? []) {
      assertNoSystemAttributeConflict(system, { key: String(item.key ?? ''), name: String(item.name ?? '') });
    }
    const seen = new Set<string>();
    for (const item of draft.inputAttrs ?? []) {
      const definition = system.find((field) => field.key === item.key);
      if (!definition || typeof item.value !== 'string' || seen.has(String(item.key))) {
        throw new CliError(`系统附加属性 ${String(item.key)} 无效；请 version attr list 后复核`, 'ATTR_SYSTEM_VALUE');
      }
      assertSystemAttributeValue(definition, item.value);
      seen.add(String(item.key));
    }
  }
  assertDraftDependenciesValid(draft);
  const payload = buildVersionPayload({
    resourceId: input.identity.resourceId,
    version: input.version,
    draft,
  });
  const createVersion =
    input.apis?.createVersion ??
    ((params) => FServiceAPI.Resource.createVersion(params as never));
  assertNoPendingOperation(input.cwd);
  if (readDraftSha256(input.cwd, input.identity.n) !== snapshot.sha256) {
    throw new CliError('工作稿在提交校验期间已变化，未提交版本；请检查当前稿后重新提交', 'SUBMIT_DRAFT_CHANGED');
  }
  assertSelectedIdentity(input.cwd, input.identity, draft);
  const prepared = createPendingVersionSubmit({
    cwd: input.cwd,
    resourceN: input.identity.n,
    resourceId: input.identity.resourceId,
    env: getEnv(),
    version: input.version,
    fileSha1: draft.fileSha1,
    draftSha256: snapshot.sha256,
  });
  const marker = markPendingVersionSubmitSending(input.cwd, prepared.sha256);
  try {
    await createVersion(payload);
  } catch (error) {
    if (!isDefinitivePlatformRejection(error)) {
      throw new CliError(
        '版本提交请求结果未知；请运行 resource recover 核验，切勿重复提交或重新 bump',
        'SUBMIT_RESULT_UNKNOWN',
      );
    }
    commitLocalTransaction(input.cwd, [{ path: pendingOperationFilePath(input.cwd), content: null, expectedBeforeSha256: marker.sha256 }]);
    const field = fieldName(error);
    const detail = errorDetail(error);
    // i18n: cli.submit.failed
    throw new CliError(
      field ? `提交失败：${field}${detail ? `：${detail}` : ''}` : detail ? `提交失败：${detail}` : '提交失败',
      'SUBMIT_FAILED',
    );
  }
  // 远端成功不授权删除后来修改的稿；最后一次await后重读，事务创建再核对预期前态。
  assertSelectedIdentity(input.cwd, input.identity, draft);
  const currentSha256 = readDraftSha256(input.cwd, input.identity.n);
  const draftRetained = currentSha256 !== undefined && currentSha256 !== snapshot.sha256;
  commitLocalTransaction(input.cwd, [
    ...(currentSha256 === snapshot.sha256 ? [{ path: draftFilePath(input.cwd, input.identity.n), content: null, expectedBeforeSha256: snapshot.sha256 }] : []),
    { path: pendingOperationFilePath(input.cwd), content: null, expectedBeforeSha256: marker.sha256 },
  ]);
  return { draftRetained };
}

/** 磁盘身份与稿即使自洽，也不能替代本次编排已经选中的不可变主体。 */
function assertSelectedIdentity(cwd: string, selected: IdentityRecord, draft: VersionDraft): void {
  const current = readIdentity(cwd, selected.n);
  if (draft.resourceId !== selected.resourceId || draft.resourceTypeCode !== selected.typeCode
    || current.resourceId !== selected.resourceId || current.typeCode !== selected.typeCode
    || (current.env ?? 'prod') !== (selected.env ?? 'prod')) {
    throw new CliError('工作稿或本地身份与本次选中主体不一致；如请求已发出请 resource recover 核对，勿重发', 'DRAFT_IDENTITY_MISMATCH');
  }
}

function assertDraftDependenciesValid(draft: VersionDraft): void {
  for (const item of draft.dependencies ?? []) {
    const resourceId = typeof item.resourceId === 'string' ? item.resourceId.trim() : '';
    if (!resourceId) {
      throw new CliError('工作稿依赖缺少有效 resourceId，未提交版本', 'SUBMIT_DEP_INVALID');
    }
  }
}

/** 只有平台明确返回字段/业务错误或 HTTP 4xx 时，才能证明这次 POST 没有成功。 */
function isDefinitivePlatformRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const rec = error as {
    field?: unknown;
    msg?: unknown;
    result?: { msg?: unknown };
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const status = rec.status ?? rec.statusCode ?? rec.response?.status;
  // 可读消息不能证明失败的 POST 未生效；适配器的明确 5xx 始终保留待核验记录。
  if (typeof status === 'number' && status >= 500) return false;
  if (error instanceof CliError) return true;
  if (typeof rec.field === 'string' || typeof rec.msg === 'string' || typeof rec.result?.msg === 'string') {
    return true;
  }
  return typeof status === 'number' && status >= 400 && status < 500;
}
