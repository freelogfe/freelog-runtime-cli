/**
 * 平台响应统一是 `{ ret, errCode, msg, data }` 信封；测试注入的 mock 可能直接给裸对象。
 * 这组函数只做「解包 + 安全取形状」，不校验业务字段——业务判断留在各 domain。
 */

/** 信封 → data（对象）。裸对象原样返回。 */
export function unwrapData(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: unknown };
  const data = envelope.data ?? result;
  return (data ?? {}) as Record<string, unknown>;
}

/** 同 unwrapData，但 data 可能是列表时取第一项（filesListInfo 等批量接口）。 */
export function unwrapFirst(result: unknown): Record<string, unknown> {
  const envelope = result as { data?: unknown };
  const data = envelope.data ?? result;
  if (Array.isArray(data)) {
    return (data[0] as Record<string, unknown>) ?? {};
  }
  return (data ?? {}) as Record<string, unknown>;
}

/** 信封 → data（列表）。不是列表时兜底常见字段名，再不行给空数组。 */
export function unwrapList<T = Record<string, unknown>>(
  result: unknown,
  fields: readonly string[] = ['dataList', 'list'],
): T[] {
  const envelope = result as { data?: unknown };
  const data = envelope.data ?? result;
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (data && typeof data === 'object') {
    for (const field of fields) {
      const list = (data as Record<string, unknown>)[field];
      if (Array.isArray(list)) {
        return list as T[];
      }
    }
  }
  return [];
}
