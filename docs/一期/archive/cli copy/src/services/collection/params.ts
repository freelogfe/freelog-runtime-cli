import type { CollectionProject } from '../../config/project.js';
import { normalizeCollectionCustomPropertyDescriptors } from './internal.js';
import type { UpdateCollectionParams } from './types.js';

export function buildCollectionSyncPropertiesParams(opts: {
  resourceId: string;
  collection: CollectionProject;
}): UpdateCollectionParams {
  const { resourceId, collection } = opts;
  return {
    resourceId,
    authExcludedItems: (collection.authExcludedItems || []).map((item) => ({
      resourceId: item.resourceId,
      excludedType: item.excludedType,
      excludedValue: item.excludedValue,
    })),
    customPropertyDescriptors:
      normalizeCollectionCustomPropertyDescriptors(collection.customPropertyDescriptors) ?? [],
  };
}

export function buildCollectionPublishParams(opts: {
  resourceId: string;
  collection: CollectionProject;
  mergeCatalogueDraft: 0 | 1;
}): UpdateCollectionParams {
  const { resourceId, collection, mergeCatalogueDraft } = opts;

  return {
    resourceId,
    description: collection.description || '',
    catalogueProperty: collection.display as UpdateCollectionParams['catalogueProperty'],
    isMergeCatalogueDraft: mergeCatalogueDraft,
    inputAttrs: collection.inputAttrs?.map((attr) => ({
      key: attr.key,
      value: String(attr.value ?? ''),
    })),
    customPropertyDescriptors: normalizeCollectionCustomPropertyDescriptors(
      collection.customPropertyDescriptors,
    ),
    dependencies: collection.dependencies?.map((dep) => ({
      resourceId: dep.resourceId,
      versionRange: dep.versionRange || '',
    })),
    baseUpcastResources: collection.baseUpcastResources?.map((resource) => ({
      resourceId: resource.resourceId,
    })),
    authExcludedItems: (collection.authExcludedItems || []).map((item) => ({
      resourceId: item.resourceId,
      excludedType: item.excludedType,
      excludedValue: item.excludedValue,
    })),
  };
}
