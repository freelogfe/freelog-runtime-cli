import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { resolveCwd } from '../../config/project.js';
import type {
  AuthExcludedItem,
  BaseUpcastResource,
  BatchSignContract,
  CustomPropertyDescriptor,
  ManifestPolicy,
  VersionDependency,
} from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { parsePolicyFile } from '../policyService.js';
import type {
  BatchResourceConfig,
  BatchResourceConfigDefaults,
  BatchResourceConfigItem,
} from './types.js';

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw cliError(I18N_KEYS.label_must_be_object, { code: 4 });
  }
  return value as Record<string, unknown>;
}

function toStringList(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw cliError(I18N_KEYS.label_must_be_string_array, { code: 4 });
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function toPolicyList(value: unknown, label: string): ManifestPolicy[] | undefined {
  if (value === undefined) return undefined;
  const rows = Array.isArray(value) ? value : [value];
  return rows.map((row, index) => {
    const item = asObject(row, `${label}[${index}]`);
    const policyName = String(item.policyName || '').trim();
    const policyText = String(item.policyText || '');
    if (!policyName || !policyText) {
      throw cliError(I18N_KEYS.label_item_missing_policy_fields, { code: 4 });
    }
    const status = item.status === undefined ? 1 : Number(item.status);
    if (status !== 0 && status !== 1) {
      throw cliError(I18N_KEYS.label_item_status_invalid, { code: 4 });
    }
    return { policyName, policyText, status: status as 0 | 1 };
  });
}

function normalizeBatchSignContractsFromRaw(value: unknown, label: string): BatchSignContract[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw cliError(I18N_KEYS.label_must_be_array, { code: 4 });
  return value.map((row, index) => {
    const item = asObject(row, `${label}[${index}]`);
    const resourceId = String(item.resourceId || '').trim();
    const policyIds = toStringList(item.policyIds, `${label}[${index}].policyIds`);
    if (!resourceId || !policyIds?.length) {
      throw cliError(I18N_KEYS.label_item_missing_dep_fields, { code: 4 });
    }
    return {
      resourceId,
      policyIds,
      subjectType: item.subjectType === undefined ? undefined : String(item.subjectType),
    };
  });
}

function normalizeConfigDefaults(
  value: unknown,
  label: string,
): BatchResourceConfigDefaults {
  if (value === undefined) return {};
  const raw = asObject(value, label);
  return {
    resourceTypeCode:
      raw.resourceTypeCode === undefined ? undefined : String(raw.resourceTypeCode).trim(),
    resourceTypeName:
      raw.resourceTypeName === undefined ? undefined : String(raw.resourceTypeName).trim(),
    version: raw.version === undefined ? undefined : String(raw.version).trim(),
    description: raw.description === undefined ? undefined : String(raw.description),
    intro: raw.intro === undefined ? undefined : String(raw.intro),
    coverImages: toStringList(raw.coverImages, `${label}.coverImages`),
    tags: toStringList(raw.tags, `${label}.tags`),
    policies: toPolicyList(raw.policies, `${label}.policies`),
    policyFile: raw.policyFile === undefined ? undefined : String(raw.policyFile).trim(),
    dependencies: Array.isArray(raw.dependencies)
      ? (raw.dependencies as VersionDependency[])
      : undefined,
    baseUpcastResources: Array.isArray(raw.baseUpcastResources)
      ? (raw.baseUpcastResources as BaseUpcastResource[])
      : undefined,
    authExcludedItems: Array.isArray(raw.authExcludedItems)
      ? (raw.authExcludedItems as AuthExcludedItem[])
      : undefined,
    batchSignContracts: normalizeBatchSignContractsFromRaw(raw.batchSignContracts, `${label}.batchSignContracts`),
    inputAttrs: Array.isArray(raw.inputAttrs)
      ? (raw.inputAttrs as Array<{ key: string; value: string | number | boolean }>)
      : undefined,
    customPropertyDescriptors: Array.isArray(raw.customPropertyDescriptors)
      ? (raw.customPropertyDescriptors as CustomPropertyDescriptor[])
      : undefined,
  };
}

function normalizeConfigItem(value: unknown, index: number): BatchResourceConfigItem {
  const raw = asObject(value, `items[${index}]`);
  const defaults = normalizeConfigDefaults(raw, `items[${index}]`);
  const filePath = String(raw.filePath || '').trim();
  if (!filePath) throw cliError(I18N_KEYS.batch_item_filepath_required, { code: 4 });
  return {
    ...defaults,
    filePath,
    name: raw.name === undefined ? undefined : String(raw.name).trim(),
    resourceTitle: raw.resourceTitle === undefined ? undefined : String(raw.resourceTitle).trim(),
    itemTitle: raw.itemTitle === undefined ? undefined : String(raw.itemTitle).trim(),
    skip: Boolean(raw.skip),
  };
}

export function parseBatchConfig(raw: unknown): BatchResourceConfig {
  const root = asObject(raw, 'batch config');
  if (!Array.isArray(root.items)) {
    throw cliError(I18N_KEYS.batch_items_must_be_array, { code: 4 });
  }
  const items = root.items
    .map((item, index) => normalizeConfigItem(item, index))
    .filter((item) => !item.skip);
  if (!items.length) {
    throw cliError(I18N_KEYS.batch_items_empty, { code: 4 });
  }
  return {
    defaults: normalizeConfigDefaults(root.defaults, 'defaults'),
    items,
  };
}

export function readBatchConfig(configFile: string): BatchResourceConfig {
  if (!fs.existsSync(configFile)) {
    throw cliError(I18N_KEYS.batch_config_not_found, { code: 4 });
  }
  const rawText = fs.readFileSync(configFile, 'utf8');
  let raw: unknown;
  try {
    raw = /\.(ya?ml)$/i.test(configFile) ? YAML.parse(rawText) : JSON.parse(rawText);
  } catch (error) {
    throw cliError(I18N_KEYS.batch_config_invalid, { code: 4, cause: error });
  }
  return parseBatchConfig(raw);
}

export function resolveConfigPath(cwd: string | undefined, dir: string, configFile?: string): string | undefined {
  if (!configFile?.trim()) {
    const json = path.join(dir, 'freelog.batch.json');
    const yaml = path.join(dir, 'freelog.batch.yaml');
    if (fs.existsSync(json)) return json;
    if (fs.existsSync(yaml)) return yaml;
    return undefined;
  }
  const fromCwd = path.resolve(resolveCwd(cwd), configFile);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(dir, configFile);
}

export function loadPoliciesFromFile(configBaseDir: string, policyFile?: string): ManifestPolicy[] | undefined {
  if (!policyFile) return undefined;
  return parsePolicyFile(path.resolve(configBaseDir, policyFile));
}
