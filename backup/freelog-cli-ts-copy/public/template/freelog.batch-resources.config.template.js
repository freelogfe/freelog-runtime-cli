/**
 * Freelog 批量资源配置文件
 * 用于批量管理多个资源（如小说章节、图片集等）
 * @type {import('../freelog.batch-resources').BatchResourceConfig}
 */
const config = {
  /** 批量资源的公共配置（默认值）
   * 所有资源项共享的公共配置，资源项可以覆盖这些默认值
   */
  defaults: {
    /** 资源类型（必填）
     * 用于显示的资源类型列表，可以是多个类型
     * 示例: ['小说章节'], ['图片'], ['音频']
     */
    resourceType: [],
    
    /** 资源类型代码（必填）
     * 用于 API 创建资源的类型代码
     * 可以通过 freelog-cli batch init 命令自动获取
     * 示例: 'text', 'image', 'audio'
     */
    resourceTypeCode: '',
    
    /** 默认版本号（可选）
     * 如果资源项未指定 version，使用此默认值
     * 默认: '1.0.0'
     */
    version: '1.0.0',
    
    /** 默认版本描述（可选）
     * 如果资源项未指定 description，使用此默认值
     * 示例: '初始版本'
     */
    description: '',
    
    /** 默认资源介绍（可选）
     * 如果资源项未指定 intro，使用此默认值
     */
    intro: '',
    
    /** 默认封面图列表（可选）
     * 如果资源项未指定 coverImages，使用此默认值
     */
    coverImages: [],
    
    /** 默认标签列表（可选）
     * 如果资源项未指定 tags，使用此默认值
     */
    tags: [],
    
    /** 默认文件路径（可选）
     * 如果资源项未指定 filePath，使用此默认值
     * 示例: './dist'
     */
    filePath: './dist',
  },
  
  /** 批量资源列表
   * 每个资源项的配置，可以覆盖默认配置
   */
  resources: [
    {
      /** 资源唯一标识（必填）
       * 用于匹配文件夹或标识资源，建议使用文件夹名称
       * 示例: 'chapter-01', 'image-001'
       */
      name: 'resource-01',
      
      /** 资源名称（可选）
       * 如果未设置，将使用 name 作为 resourceName
       * 示例: 'chapter-01', '第一章'
       */
      resourceName: 'resource-01',
      
      /** 资源标题（可选）
       * 资源的显示标题，用于展示给用户
       * 示例: '第一章 开始', '图片001'
       */
      resourceTitle: '',
      
      /** 资源介绍（可选）
       * 覆盖默认的资源介绍
       */
      intro: '',
      
      /** 封面图列表（可选）
       * 覆盖默认的封面图列表
       */
      coverImages: [],
      
      /** 标签列表（可选）
       * 覆盖默认的标签列表
       */
      tags: [],
      
      /** 文件路径（必填）
       * 相对于批量配置文件的实际文件路径
       * 示例: './chapters/chapter-01/dist', './images/image-001.jpg'
       */
      filePath: './resource-01/dist',
      
      /** 资源ID（可选）
       * 如果资源已创建，填写此字段
       * 执行 batch create 命令后会自动填充
       */
      resourceId: '',
      
      /** 版本号（可选）
       * 覆盖默认版本号
       */
      version: '1.0.0',
      
      /** 版本描述（可选）
       * 覆盖默认版本描述
       */
      description: '',
      
      /** 资源类型（可选）
       * 覆盖默认资源类型
       */
      resourceType: [],
      
      /** 资源类型代码（可选）
       * 覆盖默认资源类型代码
       */
      resourceTypeCode: '',
      
      /** 版本ID（可选）
       * 发布版本后由服务器返回，会自动填充
       */
      versionId: '',
      
      /** 文件SHA1值（可选）
       * 发布版本后自动计算并填充
       */
      fileSha1: '',
      
      /** 是否跳过此资源（可选）
       * 设置为 true 时，批量操作会跳过此资源
       */
      skip: false,
    },
    // 可以添加更多资源项...
  ],
};

module.exports = config;

