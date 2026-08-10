export type ProjectSubject = 'resource' | 'collection';
export type RuntimeVersion = '0.4' | '0.5';
export type ArtifactMode = 'file' | 'directory-zip';

export interface DraftSyncMeta {
  schemaVersion?: 1;
  lastFingerprint: string;
  lastRemoteUpdateDate?: string;
  lastPushedAt?: string;
  lastPulledAt?: string;
}

export interface VersionDependency {
  resourceId: string;
  resourceName?: string;
  versionRange?: string;
}

export interface BaseUpcastResource {
  resourceId: string;
  resourceName?: string;
}

export interface AuthExcludedItem {
  resourceId: string;
  excludedType: 'contractId' | 'policyId';
  excludedValue: string;
}

export interface BatchSignContract {
  resourceId: string;
  policyIds: string[];
  subjectType?: string;
}

export interface CustomPropertyDescriptor {
  key: string;
  name?: string;
  type: string;
  defaultValue?: string;
  remark?: string;
  candidateItems?: string[];
}

export interface ManifestPolicy {
  policyId?: string;
  policyName: string;
  policyText: string;
  status?: 0 | 1;
}

export interface FreelogManifest {
  $schema?: string;
  schemaVersion: 1;
  subject: ProjectSubject;
  identity: {
    name: string;
  };
  resource: {
    typeCode: string;
    typeName?: string;
    title: string;
    intro?: string;
    tags?: string[];
    coverImages?: string[];
  };
  version?: {
    version: string;
    filePath: string;
    artifactMode?: ArtifactMode;
    description?: string;
    videoCover?: string;
    runtimeVersion?: RuntimeVersion | null;
    dependencies?: VersionDependency[];
    baseUpcastResources?: BaseUpcastResource[];
    authExcludedItems?: AuthExcludedItem[];
    batchSignContracts?: BatchSignContract[];
    inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
    customPropertyDescriptors?: CustomPropertyDescriptor[];
  } | null;
  policies?: ManifestPolicy[];
  collection?: {
    version?: string;
    description?: string;
    display?: Record<string, string>;
    items?: unknown[];
    collectRules?: unknown;
    rssFeedUrl?: string;
    dependencies?: VersionDependency[];
    baseUpcastResources?: BaseUpcastResource[];
    authExcludedItems?: AuthExcludedItem[];
    inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
    customPropertyDescriptors?: CustomPropertyDescriptor[];
  } | null;
}

export interface FreelogState {
  schemaVersion: 1;
  env?: string | null;
  resource: {
    resourceId?: string | null;
    resourceName?: string | null;
    resourceType?: string[] | null;
    resourceTypeCode?: string | null;
    resourceTypeName?: string | null;
    subjectType?: number | null;
    owner?: {
      userId?: number | string | null;
      username?: string | null;
    } | null;
    status?: number | null;
    latestVersion?: string | null;
    policies?: Array<{ policyId?: string; policyName?: string; status?: number }> | null;
  };
  version: {
    lastPublishedVersion?: string | null;
    lastPublishedVersionId?: string | null;
    fileSha1?: string | null;
    filename?: string | null;
    draftSync?: DraftSyncMeta | null;
  };
  collection: {
    catalogueDraft?: unknown[] | null;
    catalogueProperty?: Record<string, string> | null;
    /** 上次发版后目录草稿指纹；用于 isMergeCatalogueDraft 条件化 */
    cataloguePublishedFingerprint?: string | null;
    collectRules?: unknown;
    rss?: {
      feedUrl?: string | null;
    } | null;
    draftSync?: DraftSyncMeta | null;
  };
  sync: {
    lastPulledAt?: string | null;
    listingFingerprint?: string | null;
    platformUpdateDate?: string | null;
  };
}

export interface ResourceProject {
  resourceId?: string;
  resourceName: string;
  resourceType: string[];
  resourceTypeCode?: string;
  resourceTypeName?: string;
  resourceTitle?: string;
  intro?: string;
  coverImages?: string[];
  tags?: string[];
  userId?: number | string;
  username?: string;
  status?: number;
  latestVersion?: string;
  policies?: Array<{ policyId?: string; policyName?: string; status?: number }>;
}

export interface VersionProject {
  resourceId?: string;
  resourceName?: string;
  resourceType?: string;
  resourceTypeCode?: string;
  userId?: number | string;
  username?: string;
  version: string;
  description?: string;
  videoCover?: string;
  filePath: string;
  artifactMode?: ArtifactMode;
  fileSha1?: string | null;
  filename?: string | null;
  versionId?: string | null;
  published?: boolean;
  runtimeVersion?: RuntimeVersion;
  dependencies?: VersionDependency[];
  baseUpcastResources?: BaseUpcastResource[];
  authExcludedItems?: AuthExcludedItem[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  draftSync?: DraftSyncMeta | null;
}

export type CollectionProject = ResourceProject & {
  collectRules?: unknown;
  catalogueItems?: unknown[];
  display?: Record<string, string>;
  rssFeedUrl?: string;
  version?: string;
  description?: string;
  dependencies?: VersionDependency[];
  baseUpcastResources?: BaseUpcastResource[];
  authExcludedItems?: AuthExcludedItem[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  draftSync?: DraftSyncMeta | null;
};
