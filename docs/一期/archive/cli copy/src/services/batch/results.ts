import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { CreateBatchResultItem } from './types.js';

function getRecordValue<T = unknown>(value: unknown, key: string): T | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return (value as Record<string, T>)[key];
}
function extractArrayItems(data: unknown): CreateBatchResultItem[] | null {
  if (Array.isArray(data)) return data as CreateBatchResultItem[];
  const dataList = getRecordValue<CreateBatchResultItem[]>(data, 'dataList');
  if (Array.isArray(dataList)) return dataList;
  const resources = getRecordValue<CreateBatchResultItem[]>(data, 'resources');
  if (Array.isArray(resources)) return resources;
  return null;
}

export function normalizeCreateBatchResults(
  data: unknown,
  resourceNames: string[],
): CreateBatchResultItem[] {
  const arrayItems = extractArrayItems(data);
  if (arrayItems) return arrayItems;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw cliError(I18N_KEYS.create_batch_response_invalid, { code: 1, details: data });
  }

  const record = data as Record<string, unknown>;
  const hasConsoleShape = resourceNames.some((name) =>
    Object.prototype.hasOwnProperty.call(record, name),
  );
  if (!hasConsoleShape) {
    throw cliError(I18N_KEYS.create_batch_response_invalid, { code: 1, details: data });
  }

  return resourceNames.map((name) => {
    const item = record[name];
    const payload = getRecordValue<CreateBatchResultItem | null>(item, 'data');
    if (payload && typeof payload === 'object') {
      return {
        name,
        ...payload,
      };
    }
    return { name };
  });
}
