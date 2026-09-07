import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import { freelogDir } from './identity';
import type { VersionDraft } from './types';

const FORBIDDEN = [
  'subject',
  'resourceId',
  'name',
  'typeCode',
  'filePath',
  'env',
  'title',
  'latestVersion',
  'policies',
  'status',
  'artifactMode',
] as const;

const draftSchema = z.object({
  fromVersion: z.string().min(1).optional(),
  fileSha1: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  description: z.string().optional(),
  inputAttrs: z.array(z.record(z.unknown())).optional(),
  customPropertyDescriptors: z.array(z.record(z.unknown())).optional(),
  dependencies: z.array(z.record(z.unknown())).optional(),
  baseUpcastResources: z.array(z.never()).optional(),
  authExcludedItems: z.array(z.never()).optional(),
});

export function draftFilePath(cwd: string, n: number): string {
  return path.join(freelogDir(cwd), `${n}.version.json`);
}

export function emptyDraft(): VersionDraft {
  return {
    baseUpcastResources: [],
    authExcludedItems: [],
  };
}

function toDraft(data: z.infer<typeof draftSchema>): VersionDraft {
  return {
    ...(data.fromVersion ? { fromVersion: data.fromVersion } : {}),
    ...(data.fileSha1 ? { fileSha1: data.fileSha1 } : {}),
    ...(data.filename ? { filename: data.filename } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.inputAttrs ? { inputAttrs: data.inputAttrs } : {}),
    ...(data.customPropertyDescriptors
      ? { customPropertyDescriptors: data.customPropertyDescriptors }
      : {}),
    ...(data.dependencies ? { dependencies: data.dependencies } : {}),
    baseUpcastResources: [],
    authExcludedItems: [],
  };
}

export function readDraft(cwd: string, n: number): VersionDraft | undefined {
  const filePath = draftFilePath(cwd, n);
  if (!existsSync(filePath)) {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    // i18n: cli.draft.unreadable
    throw new CliError(`工作稿 ${n}.version.json 无法解析`, 'DRAFT_INVALID');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    // i18n: cli.draft.invalid
    throw new CliError(`工作稿 ${n}.version.json 无效`, 'DRAFT_INVALID');
  }
  const keys = Object.keys(raw as object);
  const forbidden = keys.filter((key) => (FORBIDDEN as readonly string[]).includes(key));
  if (forbidden.length > 0) {
    // i18n: cli.draft.forbidden_field
    throw new CliError(`工作稿不能写入 ${forbidden.join('、')}`, 'DRAFT_FORBIDDEN_FIELD');
  }
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) {
    // i18n: cli.draft.invalid
    throw new CliError(`工作稿 ${n}.version.json 无效`, 'DRAFT_INVALID');
  }
  return toDraft(parsed.data);
}

export function writeDraft(cwd: string, n: number, draft: VersionDraft): VersionDraft {
  const normalized = toDraft({
    ...draft,
    baseUpcastResources: [],
    authExcludedItems: [],
  });
  atomicWriteFile(
    draftFilePath(cwd, n),
    `${JSON.stringify(normalized, null, 2)}\n`,
  );
  return normalized;
}

export function deleteDraft(cwd: string, n: number): boolean {
  const filePath = draftFilePath(cwd, n);
  if (!existsSync(filePath)) {
    return false;
  }
  unlinkSync(filePath);
  return true;
}

export function draftSummary(draft: VersionDraft): string {
  const source = draft.fromVersion ?? '首版';
  const sha1 = draft.fileSha1 ? `${draft.fileSha1.slice(0, 8)}…` : '无';
  const custom = draft.customPropertyDescriptors?.length ?? 0;
  const option = draft.inputAttrs?.length ?? 0;
  const deps = draft.dependencies?.length ?? 0;
  const desc = draft.description ? '有' : '无';
  return [
    '将覆盖本地工作稿：',
    `  来源：${source}`,
    `  文件：${draft.filename ?? '无'}  sha1=${sha1}`,
    `  自定义 ${custom} / 可选配置 ${option} / 依赖 ${deps} / 描述：${desc}`,
  ].join('\n');
}
