import type { FreelogConfig } from './freelog';

/**
 * Freelog 资源版本配置示例
 * 
 * 包含所有字段的完整示例
 */
const config: FreelogConfig = {
  // ========== 基本信息 ==========
  
  version: "1.0.0",
  fileSha1: "4a10ed3b6e45f8014b8240ad37f44cfc9c75e754",
  filename: "resource.zip",
  description: "这是一个示例资源版本，包含了完整的配置选项",
  
  // ========== 依赖配置 ==========
  
  dependencies: [
    {
      resourceId: "5ef04fb1bfe6f11cb0424e50",
      versionRange: "^1.0.0",  // 兼容 1.x.x 版本
    },
    {
      resourceId: "5ef04fb1bfe6f11cb0424e51",
      versionRange: "~1.2.3",  // 兼容 1.2.x 版本
    },
  ],
  
  // ========== 自定义属性 ==========
  
  customPropertyDescriptors: [
    // 下拉选择示例
    {
      key: "theme",
      defaultValue: "light",
      type: "select",
      candidateItems: ["light", "dark", "auto"],
      remark: "主题选择",
    },
    
    // 可编辑文本示例
    {
      key: "title",
      defaultValue: "默认标题",
      type: "editableText",
      remark: "可编辑的标题",
    },
    
    // 只读文本示例
    {
      key: "author",
      defaultValue: "Freelog",
      type: "readonlyText",
      remark: "只读作者信息",
    },
    
    // 单选示例
    {
      key: "language",
      defaultValue: "zh-CN",
      type: "radio",
      candidateItems: ["zh-CN", "en-US", "ja-JP"],
      remark: "语言选择",
    },
    
    // 多选示例
    {
      key: "features",
      defaultValue: "search,filter",
      type: "checkbox",
      candidateItems: ["search", "filter", "sort", "export"],
      remark: "功能选择（多选）",
    },
  ],
  
  // ========== 上抛配置 ==========
  
  baseUpcastResources: [
    {
      resourceId: "60a1b2c3d4e5f6g7h8i9j0k1",
    },
  ],
  
  // ========== 签约配置 ==========
  
  batchSignContracts: [
    {
      resourceId: "5ef04fb1bfe6f11cb0424e50",
      subjectType: 1,
      policyIds: ["f182dbabc6e4b24e88a9d1998cb13589"],
    },
  ],
  
  // ========== 输入属性 ==========
  
  inputAttrs: [
    {
      key: "environment",
      value: "production",
    },
    {
      key: "maxConnections",
      value: 100,
    },
    {
      key: "enableCache",
      value: true,
    },
    {
      key: "config",
      value: {
        timeout: 3000,
        retry: 3,
      },
    },
  ],
  
  // ========== 授权排除 ==========
  
  authExcludedItems: [
    {
      resourceId: "5ef04fb1bfe6f11cb0424e50",
      excludedType: "policyId",
      excludedValue: "f182dbabc6e4b24e88a9d1998cb13589",
    },
    {
      resourceId: "5ef04fb1bfe6f11cb0424e51",
      excludedType: "contractId",
      excludedValue: "contract123456789",
    },
  ],
};

export default config;

