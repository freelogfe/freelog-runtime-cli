import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';
import {
  assertSystemAttributeValue,
  loadSystemAttributes,
  type SystemAttribute,
} from '../version/systemAttributes';

export type CollectionSystemApis = {
  filesInfo?: (params: { resourceTypeCode: string }) => Promise<unknown>;
  getAttrsInfoByKey?: (params: { key: string }) => Promise<unknown>;
};

export type CollectionSystemRules = {
  namespace: Array<{ key: string; name: string }>;
  attrs: SystemAttribute[];
};

function responseInvalid(): never {
  throw new CliError('无法读取完整有效的合集系统属性配置', 'COLLECTION_SYSTEM_RESPONSE_INVALID');
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !/[\p{Cc}\p{Cf}]/u.test(value);
}

/** 系统标识保持平台原样；它们不受自定义字段的字母/长度正则约束。 */
function identity(value: unknown): { key: string; name: string } {
  if (!record(value) || !identifier(value.key) || !identifier(value.name)) return responseInvalid();
  return { key: value.key, name: value.name };
}

async function requestData(request: () => Promise<unknown>): Promise<Record<string, unknown>> {
  let response: unknown;
  try {
    response = await request();
  } catch {
    return responseInvalid();
  }
  if (!record(response) || response.ret !== 0 || response.errCode !== 0 || !record(response.data)) {
    return responseInvalid();
  }
  return response.data;
}

/** 合集无文件，仍必须读取当前叶子类型的 filesInfo，不能用 attrs 代替可写集合。 */
export async function loadCollectionSystemRules(
  type: { code: string; attrs?: unknown },
  apis: CollectionSystemApis = {},
): Promise<CollectionSystemRules> {
  if (!identifier(type.code) || !Array.isArray(type.attrs)) return responseInvalid();
  const namespace = type.attrs.map(identity);
  const keys = new Map<string, string>();
  const names = new Map<string, string>();
  const addIdentity = ({ key, name }: { key: string; name: string }, sameIdentityAllowed: boolean) => {
    if (keys.has(key) || names.has(name)) {
      if (!sameIdentityAllowed || keys.get(key) !== name || names.get(name) !== key) responseInvalid();
      return;
    }
    keys.set(key, name);
    names.set(name, key);
    if (sameIdentityAllowed) namespace.push({ key, name });
  };
  for (const field of namespace) addIdentity(field, false);

  const filesInfo = apis.filesInfo ?? ((params) => {
    assertPlatformAllowed();
    return FServiceAPI.Storage.filesInfo(params);
  });
  const data = await requestData(() => filesInfo({ resourceTypeCode: type.code }));
  if (!Array.isArray(data.metaInfoArray)) return responseInvalid();
  const metadataKeys = new Set<string>();
  const metadataNames = new Set<string>();
  for (const row of data.metaInfoArray) {
    const field = identity(row);
    if (!record(row) || row.insertMode !== 1 && row.insertMode !== 2
      || Object.hasOwn(row, 'remark') && typeof row.remark !== 'string'
      || Object.hasOwn(row, 'valueDisplay') && typeof row.valueDisplay !== 'string'
      || metadataKeys.has(field.key) || metadataNames.has(field.name)) return responseInvalid();
    metadataKeys.add(field.key);
    metadataNames.add(field.name);
    addIdentity(field, true);
  }
  const getDefinition = apis.getAttrsInfoByKey ?? ((params) => {
    assertPlatformAllowed();
    return FServiceAPI.Resource.getAttrsInfoByKey(params);
  });
  let attrs: SystemAttribute[];
  try {
    attrs = await loadSystemAttributes({
      typeCode: type.code,
      analysis: { ret: 0, errCode: 0, data },
      includeDefinitions: true,
      apis: {
        getAttrsInfoByKey: async ({ key }) => {
          const definition = await requestData(() => getDefinition({ key }));
          if (definition.key !== key || typeof definition.format !== 'number' || !Number.isInteger(definition.format)) {
            return responseInvalid();
          }
          if (definition.format < 4 || definition.format > 10) {
            throw new CliError('合集系统属性包含暂不支持的格式', 'COLLECTION_SYSTEM_FORMAT_UNSUPPORTED');
          }
          return { ret: 0, errCode: 0, data: definition };
        },
      },
    });
  } catch (error) {
    if (error instanceof CliError && error.code === 'COLLECTION_SYSTEM_FORMAT_UNSUPPORTED') throw error;
    return responseInvalid();
  }
  return { namespace, attrs };
}

/** 初次无继承值，与 Console 一样显式构造每个可写字段的空串。 */
export function initialCollectionInputs(rules: CollectionSystemRules): Array<{ key: string; value: string }> {
  return rules.attrs.filter((attribute) => attribute.insertMode === 2).map(({ key }) => ({ key, value: '' }));
}

/** 写入前核对完整可写字段、实时值规则及系统保留命名空间；失败不改表单。 */
export function assertCollectionSystemForm(form: {
  inputs: Array<{ key: string; value: string }>;
  properties: Array<{ key: string; name: string }>;
  options: Array<{ key: string; name: string }>;
}, rules: CollectionSystemRules): void {
  const writable = new Map(rules.attrs.filter((attribute) => attribute.insertMode === 2).map((attribute) => [attribute.key, attribute]));
  const seen = new Set<string>();
  for (const input of form.inputs) {
    if (!record(input) || typeof input.key !== 'string' || typeof input.value !== 'string'
      || !writable.has(input.key) || seen.has(input.key)) {
      throw new CliError('inputs 必须精确包含全部当前可写系统字段；清空请显式提供空串', 'COLLECTION_SYSTEM_INPUT_INVALID');
    }
    seen.add(input.key);
  }
  if (seen.size !== writable.size) {
    throw new CliError('inputs 必须精确包含全部当前可写系统字段；清空请显式提供空串', 'COLLECTION_SYSTEM_INPUT_INVALID');
  }
  for (const input of form.inputs) {
    try {
      assertSystemAttributeValue(writable.get(input.key)!, input.value);
    } catch {
      throw new CliError('合集系统附加值不符合当前格式规则', 'COLLECTION_SYSTEM_VALUE_INVALID');
    }
  }
  const reservedKeys = new Set(rules.namespace.map(({ key }) => key));
  const reservedNames = new Set(rules.namespace.map(({ name }) => name));
  for (const field of [...form.properties, ...form.options]) {
    if (reservedKeys.has(field.key) || reservedNames.has(field.name)) {
      throw new CliError('自定义属性或可选配置与系统字段的 key/name 冲突', 'COLLECTION_SYSTEM_CONFLICT');
    }
  }
}
