/**
 * Freelog 版本配置文件
 * @type {import('../freelog.version').VersionConfig}
 */
const config = {
  // ========== ResourceVersionDetailResponse 字段（基础字段） ==========
  resourceId: '',
  resourceType: '',
  resourceName: '',
  userId: 0,
  description: '',
  version: '1.0.0',
  versionId: '',
  fileSha1: '',
  
  dependencies: [
    // { resourceId: '', resourceName: '', versionRange: '^1.0.0' }
  ],
  
  upcastResources: [
    // { resourceId: '', resourceName: '' }
  ],
  
  resolveResources: [],
  
  systemProperty: {},
  customProperty: {},
  customPropertyDescriptors: [],
  
  catalogueProperty: {},
  
  createDate: '',
  
  // ========== publish 需要的额外字段 ==========
  filename: '',
  
  baseUpcastResources: [
    // { resourceId: '', resourceName: '' }
  ],
  
  batchSignContracts: [],
  inputAttrs: [],
  authExcludedItems: [],
  
  // ========== 本地字段（用于构建和发布） ==========
  filePath: '', // 文件路径（目录路径或文件路径，根据资源类型决定）
};

export default config;

