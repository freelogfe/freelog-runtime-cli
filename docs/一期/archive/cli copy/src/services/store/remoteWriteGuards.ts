import { isDeepStrictEqual } from 'node:util';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';

/** 平台写入后回写本地时使用的最小并发校验。 */
export function assertExpectedFields<T extends object>(
  current: T,
  expected: Partial<T> | undefined,
  patch: Partial<T>,
): void {
  if (!expected) return;
  const conflicts = (Object.keys(expected) as Array<keyof T>).filter(
    (key) =>
      !isDeepStrictEqual(current[key], expected[key]) &&
      !isDeepStrictEqual(current[key], patch[key]),
  );
  if (!conflicts.length) return;
  throw cliError(I18N_KEYS.project_revision_conflict, {
    code: 3,
    details: { error: 'REMOTE_WRITE_LOCAL_CONFLICT', conflictingFields: conflicts.map(String) },
    hint: '平台写入已完成，但对应本地字段已变化；请保留当前修改并重试，CLI 会先对账平台状态',
  });
}

export function assertExpectedBinding(
  currentResourceId: string | undefined,
  expectedResourceId?: string,
): void {
  if (!expectedResourceId || currentResourceId?.trim() === expectedResourceId.trim()) return;
  throw cliError(I18N_KEYS.project_revision_conflict, {
    code: 3,
    details: {
      error: 'REMOTE_WRITE_BINDING_CONFLICT',
      currentResourceId,
      expectedResourceId,
    },
    hint: '平台写入已完成，但当前目录绑定已变化；请保留现场并人工核对',
  });
}
