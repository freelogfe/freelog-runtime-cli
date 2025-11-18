/**
 * Freelog 资源配置文件
 * @type {import('../freelog.resource').ResourceConfig}
 */
const config = {
  /** 资源ID（24位十六进制字符串）
   * 创建资源后由服务器返回，用于标识资源
   * 初始化时为空字符串，执行 create 命令后会自动填充
   */
  resourceId: '691bea7823328d002f20e8ed',
  
  /** 资源名称（可选）
   * 用于标识资源的名称，创建资源时必填
   * 示例: 'my-theme', 'my-widget'
   */
  resourceName: 'snnaenu/my-freelog-project',
  
  /** 资源类型数组（必填）
   * 用于显示的资源类型列表，可以是多个类型
   * 示例: ['主题'], ['插件'], ['前端库']
   * 注意: 如果设置了 resourceTypeCode，建议第一个元素与 resourceTypeCode 保持一致
   */
  resourceType: [
      "主题"
    ],
  
  /** 资源标题（可选）
   * 资源的显示标题，用于展示给用户
   * 示例: '我的主题', '我的插件'
   */
  resourceTitle: '测试脚手架',
  
  /** 资源介绍（可选）
   * 资源的详细描述信息，支持 Markdown 格式
   * 可以通过 update 命令更新: freelog-cli update --intro "新的介绍"
   */
  intro: '这是一个测试脚手架的呃呃',
  
  /** 封面图URL列表（可选，最多10张）
   * 资源的封面图片，用于展示
   * 示例: ['https://example.com/cover1.jpg', 'https://example.com/cover2.jpg']
   * 可以通过 update 命令更新: freelog-cli update --cover "url1,url2"
   */
  coverImages: [],
  
  /** 标签列表（可选，最多20个）
   * 资源的标签，用于分类和搜索
   * 示例: ['React', 'Vue', '主题']
   * 可以通过 update 命令更新: freelog-cli update --tags "tag1,tag2"
   */
  tags: [
      "测试",
      "脚手架"
    ],
  
  /** 资源类型代码（可选）
   * 用于 API 创建资源的类型代码，如: 'theme', 'widget', 'package', 'text'
   * 如果未设置，会使用 resourceType 数组的第一个元素
   * 创建资源时必填（可通过 resourceTypeCode 或 resourceType 数组提供）
   */
  resourceTypeCode: 'RT001',
  
  /** 资源状态（可选）
   * 0: 待发行（默认）
   * 1: 上架
   * 2: 冻结
   * 4: 下架
   * 可以通过 update 命令更新: freelog-cli update --status 1
   */
  status: 0,
  
  /** 资源策略信息（可选）
   * 资源的授权策略列表，每个策略包含：
   * - policyName: 策略名称（必填，数组内唯一）
   * - policyText: 策略文本（可选，创建时需要）
   * - status: 策略启用状态（可选，1:上线 0:下线）
   * - policyId: 策略ID（可选，从服务器获取后保存）
   * 示例: [
   *   { policyName: '免费策略', policyText: '...', status: 1 },
   *   { policyName: '付费策略', policyText: '...', status: 1 }
   * ]
   */
  policies: [],
};

export default config;

