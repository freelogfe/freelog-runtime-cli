import type { requireAuth } from '../../core/auth.js';
import type { CollectionProject } from '../../config/project.js';
import type { PlatformResourceInfo } from '../sync/index.js';
import { FServiceAPI } from '../../platform/index.js';

export interface EnsureCollectionOwnerResult {
  auth: ReturnType<typeof requireAuth>;
  collection: CollectionProject;
  info: PlatformResourceInfo;
}

export type UpdateCollectionParams = Parameters<typeof FServiceAPI.Resource.updateCollection>[0];
export type UpdateCollectionCustomProperty = NonNullable<
  UpdateCollectionParams['customPropertyDescriptors']
>[number];
