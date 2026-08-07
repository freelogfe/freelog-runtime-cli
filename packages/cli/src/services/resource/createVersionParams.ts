import { FServiceAPI } from '../../platform/index.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { CustomPropertyDescriptor, VersionProject } from '../../config/project.js';

export type CreateVersionParams = Parameters<typeof FServiceAPI.Resource.createVersion>[0];
type CreateVersionInputAttrs = NonNullable<CreateVersionParams['inputAttrs']>;
type CreateVersionCustomProperty = NonNullable<CreateVersionParams['customPropertyDescriptors']>[number];

const CUSTOM_PROPERTY_TYPES = new Set<CreateVersionCustomProperty['type']>([
  'editableText',
  'readonlyText',
  'radio',
  'checkbox',
  'select',
]);

export function buildCreateVersionInputAttrs(versionCfg: VersionProject): CreateVersionInputAttrs | undefined {
  const inputAttrs = (versionCfg.inputAttrs || [])
    .filter((a) => a?.key && a.key !== 'runtimeVersion')
    .map((a) => ({ key: a.key, value: String(a.value ?? '') }));

  if (versionCfg.runtimeVersion) {
    inputAttrs.push({ key: 'runtimeVersion', value: String(versionCfg.runtimeVersion) });
  }

  return inputAttrs.length ? inputAttrs : undefined;
}

export function normalizeCustomPropertyDescriptors(
  descriptors: CustomPropertyDescriptor[] | undefined,
): CreateVersionCustomProperty[] | undefined {
  if (!descriptors?.length) return undefined;

  return descriptors
    .filter((desc) => desc?.key)
    .map((desc) => {
      if (!CUSTOM_PROPERTY_TYPES.has(desc.type as CreateVersionCustomProperty['type'])) {
        throw cliError(I18N_KEYS.custom_property_type_invalid, {
          code: 4,
          hint: '允许值：editableText / readonlyText / radio / checkbox / select',
          details: { key: desc.key, type: desc.type },
        });
      }
      return {
        key: desc.key,
        name: desc.name || desc.key,
        defaultValue: String(desc.defaultValue ?? ''),
        type: desc.type as CreateVersionCustomProperty['type'],
        candidateItems: desc.candidateItems?.map(String),
        remark: desc.remark,
      };
    });
}

export function buildCreateVersionParams(opts: {
  resourceId: string;
  versionCfg: VersionProject;
  fileSha1: string;
  filename: string;
}): CreateVersionParams {
  const { resourceId, versionCfg, fileSha1, filename } = opts;
  const dependencies = (versionCfg.dependencies || []).map((d) => ({
    resourceId: d.resourceId,
    versionRange: d.versionRange || '',
  }));

  return {
    resourceId,
    version: versionCfg.version,
    fileSha1,
    filename,
    description: versionCfg.description || '',
    videoCover: versionCfg.videoCover?.trim() || undefined,
    dependencies,
    baseUpcastResources: (versionCfg.baseUpcastResources || []).map((r) => ({
      resourceId: r.resourceId,
    })),
    authExcludedItems: (versionCfg.authExcludedItems || []).map((a) => ({
      resourceId: a.resourceId,
      excludedType: a.excludedType,
      excludedValue: a.excludedValue,
    })),
    batchSignContracts:
      versionCfg.batchSignContracts && versionCfg.batchSignContracts.length > 0
        ? versionCfg.batchSignContracts.map((entry) => ({
            resourceId: entry.resourceId,
            policyIds: entry.policyIds,
            ...(entry.subjectType ? { subjectType: entry.subjectType } : {}),
          }))
        : undefined,
    inputAttrs: buildCreateVersionInputAttrs(versionCfg),
    customPropertyDescriptors: normalizeCustomPropertyDescriptors(
      versionCfg.customPropertyDescriptors,
    ),
  };
}
