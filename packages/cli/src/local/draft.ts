/** v1 版本工作稿：唯一缓存未 POST 的下一版；旧/无 schema 稿不迁移。 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import { freelogDir, readIdentity } from './identity';
import { withProjectLock } from './lock';
import type { VersionDraft } from './types';

const itemList = z.array(z.record(z.unknown()));
const draftSchema = z.object({
  schemaVersion: z.literal(1),
  draftKind: z.enum(['initial', 'update']),
  resourceId: z.string().min(1),
  resourceTypeCode: z.string().min(1),
  fromVersion: z.string().min(1).optional(),
  fileSha1: z.string().min(1).nullable(),
  filename: z.string().min(1).nullable(),
  analyzedSha1: z.string().min(1).nullable(),
  description: z.string(),
  inputAttrs: itemList,
  orphanedInputAttrs: itemList,
  customPropertyDescriptors: itemList,
  dependencies: itemList,
  baseUpcastResources: z.array(z.never()),
  authExcludedItems: z.array(z.never()),
}).strict().superRefine((draft, ctx) => {
  if (draft.draftKind === 'initial' && (draft.fromVersion || draft.description !== '')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'initial 工作稿不能有来源版本或描述' });
  }
  if (draft.draftKind === 'update' && !draft.fromVersion) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'update 工作稿必须有来源版本' });
  }
  if (draft.analyzedSha1 !== null && draft.analyzedSha1 !== draft.fileSha1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'analyzedSha1 必须等于 fileSha1' });
  }
  if (draft.fileSha1 === null && (draft.filename !== null || draft.analyzedSha1 !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '无文件时不能保留文件名或分析 SHA' });
  }
});

/** 工作稿路径。 */
export function draftFilePath(cwd: string, n: number): string {
  return path.join(freelogDir(cwd), `${n}.version.json`);
}

/** 供表单开始编辑时使用的最小 patch；实际身份快照由 writeDraft 统一补齐。 */
export function emptyDraft(): VersionDraft {
  return { baseUpcastResources: [], authExcludedItems: [] };
}

/** 在不写盘的情况下按当前身份归一、校验一份完整 v1 工作稿。 */
export function prepareDraft(cwd: string, n: number, input: Partial<VersionDraft>): z.infer<typeof draftSchema> {
  const identity = readIdentity(cwd, n);
  if (!identity.resourceId) {
    throw new CliError('请先 create 或 bind，再编辑版本工作稿', 'DRAFT_IDENTITY_UNBOUND');
  }
  if (input.resourceId !== undefined && input.resourceId !== identity.resourceId) {
    throw new CliError(`工作稿 ${n}.version.json 与身份不一致`, 'DRAFT_IDENTITY_MISMATCH');
  }
  if (input.resourceTypeCode !== undefined && input.resourceTypeCode !== identity.typeCode) {
    throw new CliError(`工作稿 ${n}.version.json 与身份不一致`, 'DRAFT_IDENTITY_MISMATCH');
  }
  const draftKind = input.draftKind ?? (input.fromVersion ? 'update' : 'initial');
  const fileSha1 = input.fileSha1 ?? null;
  const value = {
    schemaVersion: 1 as const,
    draftKind,
    resourceId: identity.resourceId,
    resourceTypeCode: input.resourceTypeCode ?? identity.typeCode,
    ...(draftKind === 'update' ? { fromVersion: input.fromVersion } : {}),
    fileSha1,
    filename: fileSha1 ? input.filename ?? null : null,
    analyzedSha1: fileSha1 ? input.analyzedSha1 ?? null : null,
    description: draftKind === 'initial' ? '' : input.description ?? '',
    inputAttrs: input.inputAttrs ?? [],
    orphanedInputAttrs: input.orphanedInputAttrs ?? [],
    customPropertyDescriptors: input.customPropertyDescriptors ?? [],
    dependencies: input.dependencies ?? [],
    baseUpcastResources: [],
    authExcludedItems: [],
  };
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) throw new CliError(`工作稿 ${n}.version.json 无效`, 'DRAFT_INVALID');
  return parsed.data;
}

/** 工作稿的唯一序列化形式，供跨主本事务生成目标内容。 */
export function serializeDraft(draft: VersionDraft): string {
  return `${JSON.stringify(draft, null, 2)}\n`;
}

/** 读完整 v1 稿；无 schema 的旧稿明确拒绝，不做字段猜测或迁移。 */
export function readDraft(cwd: string, n: number): VersionDraft | undefined {
  const filePath = draftFilePath(cwd, n);
  if (!existsSync(filePath)) return undefined;
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(filePath, 'utf8')); } catch {
    throw new CliError(`工作稿 ${n}.version.json 无法解析`, 'DRAFT_INVALID');
  }
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) throw new CliError(`工作稿 ${n}.version.json 无效；仅支持 schemaVersion=1`, 'DRAFT_INVALID');
  const identity = readIdentity(cwd, n);
  if (!identity.resourceId
    || parsed.data.resourceId !== identity.resourceId
    || parsed.data.resourceTypeCode !== identity.typeCode) {
    throw new CliError(`工作稿 ${n}.version.json 与身份不一致`, 'DRAFT_IDENTITY_MISMATCH');
  }
  return parsed.data;
}

/** 每次表单修改都原子重写完整 v1 工作稿。 */
export function writeDraft(cwd: string, n: number, draft: Partial<VersionDraft>): VersionDraft {
  return withProjectLock(cwd, () => {
    const normalized = prepareDraft(cwd, n, draft);
    atomicWriteFile(draftFilePath(cwd, n), serializeDraft(normalized));
    return normalized;
  }, 'write-version-draft');
}

/** 成功发行才删稿；不存在等价于已清理。 */
export function deleteDraft(cwd: string, n: number): boolean {
  return withProjectLock(cwd, () => {
    const filePath = draftFilePath(cwd, n);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    return true;
  }, 'delete-version-draft');
}

/** 稿摘要。 */
export function draftSummary(draft: VersionDraft): string {
  const source = draft.draftKind === 'update' ? draft.fromVersion ?? '更新' : '首版';
  const sha1 = draft.fileSha1 ? `${draft.fileSha1.slice(0, 8)}…` : '无';
  return ['将覆盖本地工作稿：', `  来源：${source}`, `  文件：${draft.filename ?? '无'}  sha1=${sha1}`, `  属性 ${(draft.customPropertyDescriptors ?? []).length} / 依赖 ${(draft.dependencies ?? []).length}`].join('\n');
}
