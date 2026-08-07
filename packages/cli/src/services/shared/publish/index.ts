export type {
  FilePropertyInheritData,
  SystemProperty,
  HandleFilePropertiesResult,
  CreateVersionProperties,
} from './types.js';

export {
  inheritDataFromVersionConfig,
  createVersionPropertiesFromHandleData,
  pollFilesSha1Info,
  handleFilePropertiesBySha1,
  resolveCreateVersionPropertiesFromFile,
  resolveCollectionPropertiesFromType,
} from './fileProperty.js';
