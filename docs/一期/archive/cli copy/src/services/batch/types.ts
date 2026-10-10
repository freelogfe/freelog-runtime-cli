import type {
  AuthExcludedItem,
  BaseUpcastResource,
  BatchSignContract,
  CustomPropertyDescriptor,
  ManifestPolicy,
  VersionDependency,
} from '../../config/project.js';

export interface FromDirCreatedItem {
  subdir: string;
  resourceId: string;
  resourceName: string;
  resourceTitle: string;
  itemTitle?: string;
  authExcludedItems?: AuthExcludedItem[];
}

export type CreateBatchResultItem = {
  resourceId?: string;
  resourceName?: string;
  name?: string;
};

export interface PreparedFile {
  absolutePath: string;
  filename: string;
  sha1: string;
  name: string;
  resourceTitle: string;
  resourceTypeCode: string;
  resourceTypeName?: string;
  safeDir: string;
  version: string;
  description: string;
  intro?: string;
  coverImages?: string[];
  tags?: string[];
  policies?: ManifestPolicy[];
  dependencies?: VersionDependency[];
  baseUpcastResources?: BaseUpcastResource[];
  authExcludedItems?: AuthExcludedItem[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  itemTitle?: string;
}

export interface BatchResourceConfigDefaults {
  resourceTypeCode?: string;
  resourceTypeName?: string;
  version?: string;
  description?: string;
  intro?: string;
  coverImages?: string[];
  tags?: string[];
  policies?: ManifestPolicy[];
  policyFile?: string;
  dependencies?: VersionDependency[];
  baseUpcastResources?: BaseUpcastResource[];
  authExcludedItems?: AuthExcludedItem[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
}

export interface BatchResourceConfigItem extends BatchResourceConfigDefaults {
  filePath: string;
  name?: string;
  resourceTitle?: string;
  itemTitle?: string;
  skip?: boolean;
}

export interface BatchResourceConfig {
  defaults?: BatchResourceConfigDefaults;
  items: BatchResourceConfigItem[];
}
