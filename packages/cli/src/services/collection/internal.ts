import fs from 'node:fs';
import YAML from 'yaml';
import path from 'node:path';
import { resolveCwd } from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  savePlatformCollectionState,
  savePlatformResourceState,
  type AuthExcludedItem,
  type CollectionProject,
  type CustomPropertyDescriptor,
} from '../../config/project.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import { fetchResourceInfo } from '../shared/platform/index.js';
import { loadResourceProject } from '../../config/project.js';
import { evaluateOnlineGates } from '../onlineGates.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import {
  inheritDataFromVersionConfig,
  resolveCollectionPropertiesFromType,
} from '../fileProperty/index.js';
import { normalizeCreateName } from '../resourceName.js';
import type { UpdateCollectionCustomProperty } from './types.js';

const COLLECTION_CUSTOM_PROPERTY_TYPES = new Set([
  'editableText',
  'readonlyText',
  'radio',
  'checkbox',
  'select',
]);

export function parseAuthExcludedItemsFile(filePath: string, cwd?: string): AuthExcludedItem[] {
  const absolute = path.resolve(resolveCwd(cwd), filePath);
  if (!fs.existsSync(absolute)) {
    throw cliError(I18N_KEYS.auth_excluded_file_not_found, { code: 4 });
  }
  const rawText = fs.readFileSync(absolute, 'utf8');
  const ext = path.extname(absolute).toLowerCase();
  let raw: unknown;
  try {
    raw = ext === '.json' ? JSON.parse(rawText) : YAML.parse(rawText);
  } catch (error) {
    throw cliError(I18N_KEYS.auth_excluded_parse_failed, {
      code: 4,
      details: { cause: error instanceof Error ? error.message : String(error) },
    });
  }
  if (!Array.isArray(raw)) {
    throw cliError(I18N_KEYS.auth_excluded_must_be_array, { code: 4 });
  }
  return raw.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw cliError(I18N_KEYS.auth_excluded_item_must_be_object, { code: 4 });
    }
    const item = row as Record<string, unknown>;
    const resourceId = String(item.resourceId || '').trim();
    const excludedType = item.excludedType;
    const excludedValue = String(item.excludedValue || '').trim();
    if (!resourceId || !excludedValue) {
      throw cliError(I18N_KEYS.auth_excluded_item_missing_fields, { code: 4 });
    }
    if (excludedType !== 'contractId' && excludedType !== 'policyId') {
      throw cliError(I18N_KEYS.auth_excluded_invalid_excluded_type, {
        code: 4,
      });
    }
    return { resourceId, excludedType, excludedValue };
  });
}

export async function hydrateCollectionTypeProperties(
  collection: CollectionProject,
  cwd?: string,
): Promise<CollectionProject> {
  if (!collection.resourceTypeCode) return collection;
  const resolved = await resolveCollectionPropertiesFromType({
    resourceTypeCode: collection.resourceTypeCode,
    inheritData: inheritDataFromVersionConfig(collection),
  });
  return {
    ...collection,
    inputAttrs: resolved.inputAttrs,
    customPropertyDescriptors: resolved.customPropertyDescriptors,
  };
}

export function normalizeCollectionCustomPropertyDescriptors(
  descriptors: CustomPropertyDescriptor[] | undefined,
): UpdateCollectionCustomProperty[] | undefined {
  if (!descriptors?.length) return undefined;

  return descriptors
    .filter((desc) => desc?.key)
    .map((desc) => {
      if (!COLLECTION_CUSTOM_PROPERTY_TYPES.has(desc.type)) {
        throw cliError(I18N_KEYS.custom_property_type_invalid, {
          code: 4,
          hint: '支持的类型：editableText / readonlyText / radio / checkbox / select',
          details: { key: desc.key, type: desc.type },
        });
      }
      return {
        key: desc.key,
        name: desc.name || desc.key,
        defaultValue: String(desc.defaultValue ?? ''),
        type: desc.type as UpdateCollectionCustomProperty['type'],
        candidateItems: desc.candidateItems?.map(String),
        remark: desc.remark,
      };
    });
}

export function resolveCollectionCreateName(opts: {
  explicitName?: string;
  localName?: string;
  title: string;
}): string {
  return normalizeCreateName(opts.explicitName || opts.localName || opts.title);
}

export function looksLikePath(target: string): boolean {
  if (!target) return false;
  if (target.includes('/') || target.includes('\\')) return true;
  if (target.startsWith('.')) return true;
  try {
    return fs.existsSync(path.resolve(target)) && fs.statSync(path.resolve(target)).isDirectory();
  } catch {
    return false;
  }
}

export async function fetchDraftItems(resourceId: string) {
  const all: Array<{ itemId?: string; itemTitle?: string; resourceId?: string }> = [];
  const limit = 500;
  for (let skip = 0; ; skip += limit) {
    const envelope = await FServiceAPI.Resource.getCollectionItems_Draft({
      resourceId,
      skip,
      limit,
    } as Parameters<typeof FServiceAPI.Resource.getCollectionItems_Draft>[0]);
    const data = unwrapData<{
      dataList?: Array<{ itemId?: string; itemTitle?: string; resourceId?: string }>;
    }>(envelope);
    const rows = Array.isArray(data?.dataList)
      ? data.dataList
      : Array.isArray(data)
        ? (data as never[])
        : [];
    all.push(...rows);
    if (rows.length < limit) return all;
  }
}

export async function refreshCollectionDraftState(collection: CollectionProject, cwd?: string) {
  const catalogueDraft = await fetchDraftItems(collection.resourceId!);
  savePlatformCollectionState(collection, cwd, {
    catalogueDraft,
    catalogueProperty: collection.display,
  });
  return catalogueDraft;
}

export async function assertChildCollectionReady(
  resourceId: string,
  childCwd?: string,
): Promise<void> {
  const info = await fetchResourceInfo(resourceId);
  const gates = evaluateOnlineGates(info);
  if (!gates.ok) {
    throw cliError(I18N_KEYS.collection_item_not_ready, {
      code: 4,
      details: {
        resourceId,
        childCwd,
        gates: {
          hasLatestVersion: gates.hasLatestVersion,
          enabledPolicyCount: gates.enabledPolicyCount,
        },
      },
      hint: '请依次完成 publish、policy apply 和 online，再加入合集',
    });
  }
}

export async function onlineImportedChild(childCwd: string): Promise<void> {
  assertExplicitEnvForWriteOperation();
  const { data: child } = loadResourceProject(childCwd);
  if (!child.resourceId) {
    throw cliError(I18N_KEYS.child_missing_resource_id, { code: 4, details: { childCwd } });
  }
  await assertChildCollectionReady(child.resourceId, childCwd);
  const info = await fetchResourceInfo(child.resourceId);
  if (Number(info.status) !== 1) {
    await FServiceAPI.Resource.update({
      resourceId: child.resourceId,
      status: 1,
    } as Parameters<typeof FServiceAPI.Resource.update>[0]);
  }
  savePlatformResourceState({ ...child, ...info, status: 1 }, childCwd);
}

export function mapDisplayFlags(flags: {
  sort?: string;
  title?: string;
  no?: string;
  image?: string;
  descr?: string;
  view?: string;
}): Record<string, string> {
  const display: Record<string, string> = {};
  if (flags.sort) {
    const v = flags.sort === 'desc' || flags.sort === 'descending' ? 'descending' : 'ascending';
    display.collection_sort_list = v;
  }
  if (flags.title) {
    const map: Record<string, string> = {
      rtitle: 'rtitle',
      sn: 'sn',
      empty: 'empty',
      custom: 'custom',
    };
    display.collection_item_title = map[flags.title] || flags.title;
  }
  if (flags.no) {
    display.collection_item_no_display =
      flags.no === 'hide'
        ? 'collection_item_no_display_hide'
        : 'collection_item_no_display_show';
  }
  if (flags.image) {
    display.collection_item_image_display =
      flags.image === 'hide'
        ? 'collection_item_image_display_hide'
        : 'collection_item_image_display_show';
  }
  if (flags.descr) {
    display.collection_item_descr_display =
      flags.descr === 'hide'
        ? 'collection_item_descr_display_hide'
        : 'collection_item_descr_display_show';
  }
  if (flags.view) {
    display.collection_view =
      flags.view === 'card' ? 'collection_view_card' : 'collection_view_list';
  }
  return display;
}
