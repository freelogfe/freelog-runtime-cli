import { FServiceAPI } from '../../platform/index.js';
import { isDeepStrictEqual } from 'node:util';
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
      !(versionCfg.authExcludedItems || []).length &&
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

type ComparableVersionPayload = Omit<CreateVersionParams, 'resourceId'>;

function stableList<T>(items: T[]): T[] {
  return [...items].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeComparablePayload(raw: Record<string, unknown>): ComparableVersionPayload {
  const systemInputAttrs = recordList(raw.systemPropertyDescriptors)
    .filter((entry) => Number(entry.insertMode) === 2 && entry.key !== undefined)
    .map((entry) => ({ key: String(entry.key), value: String(entry.valueDisplay ?? '') }));
  const directInputAttrs = recordList(raw.inputAttrs)
    .filter((entry) => entry.key !== undefined)
    .map((entry) => ({ key: String(entry.key), value: String(entry.value ?? '') }));
  const inputAttrs = systemInputAttrs.length ? systemInputAttrs : directInputAttrs;

  return {
    version: String(raw.version ?? ''),
    fileSha1: String(raw.fileSha1 ?? '').trim().toLowerCase(),
    filename: String(raw.filename ?? '').trim(),
    description: String(raw.description ?? ''),
    videoCover: raw.videoCover ? String(raw.videoCover).trim() : undefined,
    dependencies: stableList(
      recordList(raw.dependencies)
        .filter((entry) => entry.resourceId !== undefined)
        .map((entry) => ({
          resourceId: String(entry.resourceId),
          versionRange: String(entry.versionRange ?? ''),
        })),
    ),
    baseUpcastResources: stableList(
      recordList(raw.baseUpcastResources)
        .filter((entry) => entry.resourceId !== undefined)
        .map((entry) => ({ resourceId: String(entry.resourceId) })),
    ),
    authExcludedItems: stableList(
      recordList(raw.authExcludedItems)
        .filter((entry) => entry.resourceId !== undefined)
        .map((entry) => ({
          resourceId: String(entry.resourceId),
          excludedType: entry.excludedType as 'contractId' | 'policyId',
          excludedValue: String(entry.excludedValue ?? ''),
        })),
    ),
    batchSignContracts: stableList(
      recordList(raw.batchSignContracts)
        .filter((entry) => entry.resourceId !== undefined)
        .map((entry) => ({
          resourceId: String(entry.resourceId),
          policyIds: Array.isArray(entry.policyIds)
            ? entry.policyIds.map(String).sort((a, b) => a.localeCompare(b))
            : [],
          ...(entry.subjectType ? { subjectType: String(entry.subjectType) } : {}),
        })),
    ) as CreateVersionParams['batchSignContracts'],
    inputAttrs: stableList(inputAttrs),
    customPropertyDescriptors: stableList(
      recordList(raw.customPropertyDescriptors)
        .filter((entry) => entry.key !== undefined)
        .map((entry) => ({
          key: String(entry.key),
          name: String(entry.name ?? entry.key),
          defaultValue: String(entry.defaultValue ?? ''),
          type: entry.type as NonNullable<CreateVersionParams['customPropertyDescriptors']>[number]['type'],
          ...(Array.isArray(entry.candidateItems)
            ? { candidateItems: entry.candidateItems.map(String) }
            : {}),
          ...(entry.remark !== undefined ? { remark: String(entry.remark) } : {}),
        })),
    ),
  };
}

/** Compare every immutable createVersion field before treating an existing version as a retry. */
export function diffReleasedVersionIntent(
  remote: Record<string, unknown>,
  expected: CreateVersionParams,
): string[] {
  const expectedComparable = normalizeComparablePayload(expected as unknown as Record<string, unknown>);
  const remoteComparable = normalizeComparablePayload(remote);
  return (Object.keys(expectedComparable) as Array<keyof ComparableVersionPayload>).filter(
    (key) => !isDeepStrictEqual(remoteComparable[key], expectedComparable[key]),
  ).map(String);
}

/** Manifest fields whose concurrent change invalidates the createVersion result being persisted. */
export function versionPublishIntent(version: VersionProject): Partial<VersionProject> {
  return {
    version: version.version,
    description: version.description,
    videoCover: version.videoCover,
    filePath: version.filePath,
    artifactMode: version.artifactMode,
    reusePlatformFile: version.reusePlatformFile,
    runtimeVersion: version.runtimeVersion,
    dependencies: version.dependencies,
    baseUpcastResources: version.baseUpcastResources,
    authExcludedItems: version.authExcludedItems,
    batchSignContracts: version.batchSignContracts,
    inputAttrs: version.inputAttrs,
    customPropertyDescriptors: version.customPropertyDescriptors,
  };
}
