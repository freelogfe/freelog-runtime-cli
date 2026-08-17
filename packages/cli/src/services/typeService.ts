import { FServiceAPI, unwrapData } from '../platform/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import {
  findTypeInForestByCode,
  isLeafType,
  parseResourceTypeForest,
  resolveScaffoldResourceTypeFromForest,
  type ResourceTypeNode,
  type ScaffoldPreset,
} from './resourceTypeTree.js';

export async function assertResourceTypeCode(code: string): Promise<unknown> {
  if (!code?.trim()) {
    throw cliError(I18N_KEYS.missing_resource_type_code, { code: 4 });
  }
  const envelope = await FServiceAPI.Resource.getResourceTypeInfoByCode({
    code: code.trim(),
  } as Parameters<typeof FServiceAPI.Resource.getResourceTypeInfoByCode>[0]);
  const data = unwrapData<unknown>(envelope);
  if (data === null || data === undefined || data === '') {
    throw cliError(I18N_KEYS.unknown_resource_type_code, {
      code: 4,
      hint: 'freelog-cli 使用平台 resourceTypes 返回的 code',
    });
  }
  return data;
}

function collectScaffoldPresetCodes(forest: ResourceTypeNode[]): Set<string> {
  const codes = new Set<string>();
  for (const preset of ['theme', 'widget', 'package'] as ScaffoldPreset[]) {
    try {
      const { node } = resolveScaffoldResourceTypeFromForest(forest, preset);
      codes.add(node.code);
    } catch {
      // 当前环境无该定稿类型时跳过
    }
  }
  return codes;
}

/** create / import 路径：禁止脚本传入非叶子类型（平台主题/插件定稿 code 除外）。 */
export async function assertLeafResourceTypeCode(code: string): Promise<unknown> {
  const typeInfo = await assertResourceTypeCode(code);
  const trimmed = code.trim();
  const typeRecord =
    typeInfo && typeof typeInfo === 'object' ? (typeInfo as Record<string, unknown>) : null;
  if (typeRecord?.category === 2) {
    throw cliError(I18N_KEYS.resource_type_custom_parent, {
      code: 4,
      params: { code: trimmed, name: String(typeRecord.name || trimmed) },
      hint: '请选 category=1 的基础叶子类型（如 type search 文章）',
    });
  }
  let forest: ResourceTypeNode[] = [];
  try {
    const envelope = await listResourceTypes({ status: 1 });
    forest = parseResourceTypeForest(envelope);
  } catch {
    return typeInfo;
  }
  if (!forest.length) return typeInfo;

  const presetCodes = collectScaffoldPresetCodes(forest);
  if (presetCodes.has(trimmed)) return typeInfo;

  const found = findTypeInForestByCode(forest, trimmed);
  if (found && !isLeafType(found.node)) {
    throw cliError(I18N_KEYS.resource_type_not_leaf, {
      code: 4,
      params: { code: trimmed, name: found.node.name },
      hint: '交互 init / type pick 会选到叶子；脚本请 type info 确认无 children',
    });
  }
  return typeInfo;
}

export async function listResourceTypes(opts?: {
  codeOrName?: string;
  category?: 1 | 2;
  isMine?: boolean;
  status?: 0 | 1;
  supportCreateBatch?: 1 | 2;
  subjectType?: 1 | 4 | 5;
}) {
  const envelope = await FServiceAPI.Resource.resourceTypes(
    (opts || {}) as Parameters<typeof FServiceAPI.Resource.resourceTypes>[0],
  );
  return unwrapData<unknown>(envelope);
}
