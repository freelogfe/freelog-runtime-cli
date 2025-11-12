import type { VersionConfig } from '../freelog.version';

const config: VersionConfig = {
  version: '1.0.0',
  fileSha1: '',
  filename: '',
  description: '',
  
  // 文件处理配置（根据资源类型选择）
  // resourceType: '主题', // 主题/插件/软件库需要压缩
  // buildPath: 'dist',    // 构建目录路径
  // fileTarget: '',       // 或直接指定文件路径
  
  dependencies: [
    // { resourceId: '', resourceName: '', versionRange: '^1.0.0' }
  ],
  
  customPropertyDescriptors: [],
  
  baseUpcastResources: [
    // { resourceId: '', resourceName: '' }
  ],
  
  // batchSignContracts: [],
  // inputAttrs: [],
  // authExcludedItems: [],
};

export default config;

