/**
 * Freelog 资源配置文件
 * @type {import('../freelog').FreelogConfig}
 */
const config = {
  // 资源 ID（必填）- 在 Freelog 平台创建资源后获得
  resourceId: '',
  
  // 资源名称（可选）- 方便识别，提交时会自动过滤
  resourceName: '',
  
  // 资源类型（可选）- 判断发布时的文件处理方式
  // "主题"、"插件"、"软件库" 会压缩 buildPath 目录后上传
  // 其他类型直接上传 fileTarget 指定的文件
  resourceType: '',
  
  // 构建目录（可选）- 当 resourceType 为 "主题"、"插件"、"软件库" 时使用
  buildPath: 'dist',
  
  // 目标文件（可选）- 当 resourceType 不是 "主题"、"插件"、"软件库" 时使用
  // fileTarget: 'output/resource.zip',
  
  // 版本号（必填）- 遵循语义化版本规范，如 1.0.0
  version: '1.0.0',
  
  // 文件 SHA1（必填）- 资源文件的 SHA1 哈希值
  fileSha1: '',
  
  // 文件名（必填）- 资源文件名
  filename: '',
  
  // 版本描述（可选）- 描述此版本的更新内容
  description: '',
  
  // 依赖列表（可选）- 此资源依赖的其他资源
  dependencies: [
    // 示例：
    // {
    //   resourceId: '5ef081b8fb172026e434e2fa',  // 依赖资源的ID
    //   resourceName: 'my-dependency',           // 资源名称（可选，方便识别）
    //   versionRange: '^1.0.0',                   // 版本范围
    // }
  ],
  
  // 自定义属性描述符（可选）- 定义资源的自定义属性
  customPropertyDescriptors: [
    // 示例：
    // {
    //   key: 'theme',
    //   defaultValue: 'light',
    //   type: 'select',
    //   candidateItems: ['light', 'dark'],
    //   remark: '主题设置',
    // }
  ],
  
  // 基础上抛资源（可选）- 指定基础上抛的资源
  baseUpcastResources: [
    // 示例：
    // {
    //   resourceId: '5ef081b8fb172026e434e2fb',  // 上抛资源的ID
    //   resourceName: 'base-resource',           // 资源名称（可选，方便识别）
    // }
  ],
};

module.exports = config;

