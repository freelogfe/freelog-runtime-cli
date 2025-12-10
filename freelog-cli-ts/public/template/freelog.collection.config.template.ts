import type { CollectionConfig } from "../freelog.collection";

const config: CollectionConfig = {
  /** 资源ID（24位十六进制字符串）
   * 创建合集后由服务器返回，用于标识合集资源
   * 初始化时为空字符串，执行 collection create 命令后会自动填充
   */
  resourceId: "",

  /** 资源名称（可选）
   * 用于标识合集资源的名称，创建合集时必填
   * 示例: 'my-collection', 'book-series'
   */
  resourceName: "",

  /** 资源类型数组（必填）
   * 用于显示的资源类型列表，可以是多个类型
   * 示例: ['合集'], ['书籍合集']
   * 注意: 如果设置了 resourceTypeCode，建议第一个元素与 resourceTypeCode 保持一致
   */
  resourceType: [],

  /** 资源类型代码（必填）
   * 用于 API 创建合集资源的类型代码
   * 合集资源需要通过 listResourceTypesByGroup({ subjectType: [2] }) 获取类型列表
   * 创建合集时必填（可通过 resourceTypeCode 或 resourceType 数组提供）
   */
  resourceTypeCode: "",

  /** 资源标题（可选）
   * 合集的显示标题，用于展示给用户
   * 示例: '我的合集', '书籍系列'
   */
  resourceTitle: "",

  /** 资源介绍（可选）
   * 合集的详细描述信息，支持 Markdown 格式
   * 可以通过 collection update 命令更新
   */
  intro: "",

  /** 封面图URL列表（可选，最多10张）
   * 合集的封面图片，用于展示
   * 示例: ['https://example.com/cover1.jpg', 'https://example.com/cover2.jpg']
   * 可以通过 collection update 命令更新
   */
  coverImages: [],

  /** 标签列表（可选，最多20个）
   * 合集的标签，用于分类和搜索
   * 示例: ['合集', '书籍', '系列']
   * 可以通过 collection update 命令更新
   */
  tags: [],

  /** 资源状态（可选）
   * 0: 待发行（默认）
   * 1: 上架
   * 2: 冻结
   * 4: 下架
   * 可以通过 collection update 命令更新
   */
  status: 0,

  /** 资源策略信息（可选）
   * 合集的授权策略列表，每个策略包含：
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

  /** 合集属性（可选）
   * 合集特有的显示属性配置
   */
  catalogueProperty: {
    /** 是否显示单品编号 */
    collection_item_no_display: "collection_item_no_display_show",
    /** 是否显示单品图片 */
    collection_item_image_display: "collection_item_image_display_show",
    /** 是否显示单品描述 */
    collection_item_descr_display: "collection_item_descr_display_show",
    /** 合集视图类型 */
    collection_view: "collection_view_list",
  },

  /** 合集单品列表（可选）
   * 合集中包含的单品资源列表
   * 每个单品包含：
   * - resourceId: 资源ID（必填）
   * - resourceName: 资源名称（可选，用于可读性）
   * - version: 版本号（可选）
   * - itemTitle: 单品标题（可选）
   * - itemDescription: 单品描述（可选）
   * - coverImage: 封面图（可选）
   * - itemId: 单品ID（可选，从服务器获取后保存）
   * 示例: [
   *   { resourceId: 'xxx', resourceName: '单品1', version: '1.0.0' },
   *   { resourceId: 'yyy', resourceName: '单品2', version: '1.0.0' }
   * ]
   */
  items: [],
};

export default config;

