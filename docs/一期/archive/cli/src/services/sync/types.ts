import type { requireAuth } from '../../core/auth.js';
import type { ResourceProject, VersionProject } from '../../config/project.js';
import type { ProjectMode } from '../store/types.js';
export type { PlatformResourceInfo, PlatformVersionDraft } from '../shared/platform/types.js';

export interface EnsureOwnerResult {
  auth: ReturnType<typeof requireAuth>;
  resource: ResourceProject;
  info: import('../shared/platform/types.js').PlatformResourceInfo;
  version?: VersionProject;
}

export interface OperationContext {
  mode: ProjectMode;
  auth: ReturnType<typeof requireAuth>;
  resource: ResourceProject;
  version?: VersionProject;
  platform: import('../shared/platform/types.js').PlatformResourceInfo;
  listingDrifted: boolean;
}
