// 自定义属性描述器
export interface CustomPropertyDescriptor {
  key: string;
  defaultValue: string;
  type: "editableText" | "readonlyText" | "radio" | "checkbox" | "select";
  candidateItems?: string[];
  remark?: string;
}

// 依赖信息
export interface Dependency {
  resourceId: string;
  versionRange: string;
}

// 基础上抛资源
export interface BaseUpcastResource {
  resourceId: string;
}

// 批量签约合同
export interface BatchSignContract {
  resourceId: string;
  subjectType: number;
  policyIds: string[];
}

// 输入属性
export interface InputAttr {
  key: string;
  value: any;
}

// 授权排除项
export interface AuthExcludedItem {
  resourceId: string;
  excludedType: "contractId" | "policyId";
  excludedValue: string;
}

// 创建资源版本请求体
export interface CreateResourceVersionBody {
  version: string;
  fileSha1: string;
  filename: string;
  description?: string;
  dependencies?: Dependency[];
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  baseUpcastResources?: BaseUpcastResource[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: InputAttr[];
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
