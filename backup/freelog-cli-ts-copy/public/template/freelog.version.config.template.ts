import type { VersionConfig } from '../freelog.version';

const config: VersionConfig = {
  // ========== ResourceVersionDetailResponse 字段（基础字段） ==========
  
  /** 资源ID（必填）
   * 24位十六进制字符串，与 resource.config 中的 resourceId 保持一致
   * 执行 create 命令后会自动填充
   */
  resourceId: '',
  
  /** 资源类型（必填）
   * 单个资源类型字符串，用于判断文件处理方式
   * 示例: '主题', '插件', '前端库', '图片'
   * 注意: 主题/插件/软件库类型会自动压缩目录，其他类型直接上传文件
   */
  resourceType: '',
  
  /** 资源名称（必填）
   * 与 resource.config 中的 resourceName 保持一致
   * 用于可读性，publish 时会自动移除
   */
  resourceName: '',
  
  /** 用户ID（必填）
   * 资源所有者的用户ID
   * 初始化时设为 0，执行 create 或 syncv 后会自动填充
   */
  userId: 0,
  
  /** 版本描述信息（必填）
   * 当前版本的详细描述，支持 Markdown 格式
   * 示例: '修复了若干bug，新增了xxx功能'
   */
  description: '',
  
  /** 版本号（必填）
   * 语义化版本号，格式: x.y.z（如: 1.0.0, 2.1.3）
   * 每次发布新版本时需要递增
   */
  version: '1.0.0',
  
  /** 版本ID（可选）
   * 创建版本后由服务器返回，用于标识版本
   * 初始化时为空字符串，执行 publish 或 syncv 后会自动填充
   */
  versionId: '',
  
  /** 文件SHA1值（必填）
   * 40位十六进制字符串，文件的 SHA1 哈希值
   * 用于文件去重和校验
   * 执行 publish 命令时会自动计算并填充
   */
  fileSha1: '',
  
  /** 资源依赖信息（可选）
   * 当前版本依赖的其他资源列表
   * 每个依赖包含:
   * - resourceId: 依赖的资源ID（必填）
   * - resourceName: 依赖的资源名称（可选，用于可读性，publish 时会自动移除）
   * - versionRange: 版本范围（必填），如: '^1.0.0', '~2.3.0', '*', '1.2.3'
   * 可以通过 dep add 命令添加: freelog-cli dep add <resourceId>
   * 示例: [
   *   { resourceId: '60a...', resourceName: '依赖资源', versionRange: '^1.0.0' }
   * ]
   */
  dependencies: [],
  
  /** 真实上抛资源列表（可选）
   * 从服务器同步的上抛资源列表，资源的基础上抛子集
   * 每个上抛资源包含:
   * - resourceId: 上抛的资源ID（必填）
   * - resourceName: 上抛的资源名称（可选，用于可读性）
   * 执行 syncv 命令后会自动同步
   * 注意: 与 baseUpcastResources 的区别：
   * - upcastResources: 从服务器同步的，只读
   * - baseUpcastResources: 用于发布第一个版本时传递，可编辑
   */
  upcastResources: [],
  
  /** 版本解决的依赖以及上抛（可选）
   * 从服务器同步的，当前版本实际解决的依赖和上抛资源
   * 每个资源包含:
   * - resourceId: 资源ID（必填）
   * - resourceName: 资源名称（必填）
   * 执行 syncv 命令后会自动同步
   * TODO: 需要进一步了解 resolveResources 的具体含义和使用场景
   */
  resolveResources: [],
  
  /** 系统属性（可选）
   * 系统自动生成的属性，包含文件大小等信息
   * 示例: { fileSize: 1024, ... }
   * 执行 syncv 命令后会自动同步
   */
  systemProperty: {},
  
  /** 自定义系统属性（可选）
   * 根据 customPropertyDescriptors 自动生成的自定义属性值
   * 键值对格式，键对应 customPropertyDescriptors 中的 key
   * 执行 syncv 命令后会自动同步
   * TODO: 需要进一步了解 customProperty 的生成规则和使用场景
   */
  customProperty: {},
  
  /** 自定义属性描述器（可选）
   * 定义版本的自定义属性，用于发布时配置
   * 每个描述器包含:
   * - key: 属性键（必填）
   * - defaultValue: 默认值（必填）
   * - type: 属性类型（必填），可选值: 'editableText', 'readonlyText', 'radio', 'checkbox', 'select'
   * - candidateItems: 选项列表（可选），单选、多选、下拉选择时需要
   * - remark: 字段说明（可选）
   * 示例: [
   *   {
   *     key: 'themeColor',
   *     defaultValue: '#ffffff',
   *     type: 'select',
   *     candidateItems: ['#ffffff', '#000000'],
   *     remark: '主题颜色'
   *   }
   * ]
   */
  customPropertyDescriptors: [],
  
  /** 目录属性（可选）
   * 集合标的物（subjectType=4）才有的属性，用于配置集合的显示方式
   * 包含以下字段（均为可选）:
   * - collection_item_count: 单品数量
   * - collection_item_no_display: 设置序号显示
   * - collection_item_image_display: 设置封面显示
   * - collection_item_descr_display: 设置简介显示
   * - collection_view: 设置默认视图
   * - collection_item_title: 单品标题显示设置
   * - collection_sorting: 展示排序
   * TODO: 需要进一步了解集合标的物的具体使用场景和配置方式
   */
  catalogueProperty: {},
  
  /** 创建日期（可选）
   * 版本创建的日期时间，ISO 8601 格式
   * 执行 syncv 命令后会自动同步
   * 示例: '2024-01-01T00:00:00.000Z'
   */
  createDate: '',
  
  // ========== publish 需要的额外字段 ==========
  
  /** 文件名（可选，publish 时必填）
   * 当前版本对应的文件名或对象名
   * 执行 publish 命令时会自动填充（根据 filePath 生成）
   * 示例: 'my-theme-1.0.0.zip', 'my-file.js'
   */
  filename: '',
  
  /** 版本上抛信息（可选）
   * 用于发布第一个版本时传递的上抛资源列表
   * 每个上抛资源包含:
   * - resourceId: 上抛的资源ID（必填）
   * - resourceName: 上抛的资源名称（可选，用于可读性，publish 时会自动移除）
   * 注意: 只有第一个版本需要传递此参数
   * 可以通过 dep add 命令选择上抛: freelog-cli dep add <resourceId>
   * 示例: [
   *   { resourceId: '60a...', resourceName: '上抛资源' }
   * ]
   */
  baseUpcastResources: [],
  
  /** 批量签约合同（可选）
   * 如果需要在创建版本时自动签约依赖资源，则需要传递此参数
   * 每个合同包含:
   * - resourceId: 要签约的资源ID（必填）
   * - subjectType: 标的物类型（必填），1:资源 2:展品 3:用户组
   * - policyIds: 策略ID数组（必填），要签约的策略列表
   * TODO: 需要进一步了解批量签约的具体使用场景和配置方式
   * 示例: [
   *   { resourceId: '60a...', subjectType: 1, policyIds: ['policy1', 'policy2'] }
   * ]
   */
  batchSignContracts: [],
  
  /** 输入属性数组（可选）
   * 发布版本时传递的输入属性
   * 每个属性包含:
   * - key: 属性键（必填）
   * - value: 属性值（必填）
   * TODO: 需要进一步了解 inputAttrs 的具体使用场景和配置方式
   * 示例: [
   *   { key: 'themeColor', value: '#ffffff' }
   * ]
   */
  inputAttrs: [],
  
  /** 授权排除项（可选）
   * 当前版本的授权排除项，用于排除某些合约或策略的授权
   * 每个排除项包含:
   * - resourceId: 受影响的资源ID（必填）
   * - excludedType: 排除类型（必填），'contractId' 或 'policyId'
   * - excludedValue: 具体的排除值（必填），合约ID或策略ID
   * TODO: 需要进一步了解 authExcludedItems 的具体使用场景和配置方式
   * 示例: [
   *   { resourceId: '60a...', excludedType: 'contractId', excludedValue: 'contract123' }
   * ]
   */
  authExcludedItems: [],
  
  // ========== 本地字段（用于构建和发布） ==========
  
  /** 文件路径（可选）
   * 用于构建和发布的文件路径
   * - 对于主题/插件/软件库: 应该是目录路径（如: 'dist'），会自动压缩为 ZIP
   * - 对于其他资源类型: 应该是文件路径（如: 'dist/index.js'），直接上传
   * 根据 resourceType 自动判断处理方式
   * 示例: 'dist', 'build', 'dist/index.js'
   */
  filePath: '',
};

export default config;

