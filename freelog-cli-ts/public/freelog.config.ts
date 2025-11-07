import type { FreelogConfig } from './freelog';

/**
 * Freelog 资源版本配置
 * 
 * 这是一个 TypeScript 配置文件，提供完整的类型检查和智能提示
 */
const config: FreelogConfig = {
  // ========== 必填字段 ==========
  
  // 资源 ID - 资源的唯一标识符
  resourceId: "",
  
  // 版本号 - 遵循语义化版本规范
  version: "1.0.0",
  
  // 文件 SHA1 值 - 40位十六进制字符串
  fileSha1: "",
  
  // 文件名或对象名
  filename: "",
  
  // ========== 可选字段 ==========
  
  // 版本描述信息
  description: "资源版本描述信息",
  
  // 版本依赖信息
  // 定义当前资源版本依赖的其他资源
  dependencies: [
    // {
    //   resourceId: "5ef04fb1bfe6f11cb0424e50",
    //   versionRange: "^1.0.0",  // 版本范围: ^1.0.0, ~1.2.3, >=1.0.0 <2.0.0
    // }
  ],
  
  // 自定义属性定义
  // 为资源版本定义可配置的自定义属性
  customPropertyDescriptors: [
    // {
    //   key: "theme",
    //   defaultValue: "light",
    //   type: "select",  // editableText, readonlyText, radio, checkbox, select
    //   candidateItems: ["light", "dark"],
    //   remark: "主题选择",
    // }
  ],
  
  // 版本上抛信息
  // 第一个版本需要传递此参数
  baseUpcastResources: [
    // {
    //   resourceId: "60a1b2c3d4e5f6g7h8i9j0k1"
    // }
  ],
  
  // 批量签约配置
  // 如果需要在创建版本时自动签约
  batchSignContracts: [
    // {
    //   resourceId: "5ef04fb1bfe6f11cb0424e50",
    //   subjectType: 1,
    //   policyIds: ["f182dbabc6e4b24e88a9d1998cb13589"],
    // }
  ],
  
  // 输入属性数组
  // 传递给资源的额外属性
  inputAttrs: [
    // {
    //   key: "environment",
    //   value: "production",
    // }
  ],
  
  // 授权排除项
  // 配置当前版本的授权排除规则
  authExcludedItems: [
    // {
    //   resourceId: "5ef04fb1bfe6f11cb0424e50",
    //   excludedType: "policyId",  // contractId 或 policyId
    //   excludedValue: "f182dbabc6e4b24e88a9d1998cb13589",
    // }
  ],
};

export default config;

