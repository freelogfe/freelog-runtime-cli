/**
 * 自定义属性描述器
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export interface CustomPropertyDescriptor {
  /** 自定义属性名称（必选） */
  key: string;
  /** 自定义属性对应的值（必选） */
  defaultValue: string;
  /** 属性类型（必选）：editableText:可编辑文本, readonlyText:只读文本, radio:单选, checkbox:多选, select:下拉选项 */
  type: "editableText" | "readonlyText" | "radio" | "checkbox" | "select";
  /** 选项列表（可选），单选、多选、下拉选择时需要提供选项 */
  candidateItems?: string[];
  /** 字段说明（可选） */
  remark?: string;
}

/**
 * 依赖信息
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export interface Dependency {
  /** 依赖的资源ID（必选） */
  resourceId: string;
  /** 依赖的资源版本范围（必选） */
  versionRange: string;
}

/**
 * 基础上抛资源
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 * 第一个版本需要传递此参数
 */
export interface BaseUpcastResource {
  /** 上抛的资源ID（必选） */
  resourceId: string;
}

/**
 * 批量签约合同
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 * 如果需要在创建版本时签约，则需要传递此参数
 */
export interface BatchSignContract {
  /** 解决的资源ID（必选） */
  resourceId: string;
  /** 标的物类型（必选） */
  subjectType: number;
  /** 策略ID（必选） */
  policyIds: string[];
}

/**
 * 输入属性
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export interface InputAttr {
  /** 属性键 */
  key: string;
  /** 属性值 */
  value: any;
}

/**
 * 授权排除项
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export interface AuthExcludedItem {
  /** 受影响的资源ID（必选） */
  resourceId: string;
  /** 排除类型（必选）：contractId:以合约ID作为排除属性, policyId:以策略ID作为排除属性 */
  excludedType: "contractId" | "policyId";
  /** 具体的排除值（必选），例如合约ID或者策略ID */
  excludedValue: string;
}

/**
 * 创建资源版本请求体
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export interface CreateResourceVersionBody {
  /** 版本号（必选） */
  version: string;
  /** 当前版本对应的文件sha1值（必选） */
  fileSha1: string;
  /** 当前版本对应的文件名or对象名（必选） */
  filename: string;
  /** 版本描述信息（可选） */
  description?: string;
  /** 版本依赖信息（可选） */
  dependencies?: Dependency[];
  /** 版本自定义属性定义（可选） */
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  /** 版本上抛信息（可选），第一个版本需要传递此参数 */
  baseUpcastResources?: BaseUpcastResource[];
  /** 如果需要在创建版本时签约，则需要传递此参数（可选） */
  batchSignContracts?: BatchSignContract[];
  /** 输入属性数组（可选） */
  inputAttrs?: InputAttr[];
  /** 当前版本的授权排除项（可选） */
  authExcludedItems?: AuthExcludedItem[];
}

// 保存资源版本草稿请求体
export interface SaveResourceVersionDraftBody {
  draftData: IResourceCreateVersionDraftType;
}

export interface IResourceCreateVersionDraftType {
  versionInput: string;
  selectedFileInfo: {
    name: string;
    sha1: string;
    from: string;
  } | null;
  additionalProperties: {
    key: string;
    value: string;
  }[];
  customProperties: {
    key: string;
    name: string;
    value: string;
    description: string;
  }[];
  customConfigurations: {
    key: string;
    name: string;
    description: string;
    type: "input" | "select";
    input: string;
    select: string[];
  }[];
  directDependencies: {
    id: string;
    name: string;
    type: "resource" | "object";
    versionRange?: string;
  }[];
  baseUpcastResources: {
    resourceID: string;
    resourceName: string;
  }[];
  descriptionEditorInput: string;
}
