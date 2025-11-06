/**
 * 配置文件使用示例
 */

import { loadFreelogConfig, saveFreelogConfig, initFreelogConfig } from "../utils/configLoader";
import { createResourceVersion } from "../api/update";

// ========== 示例 1: 加载并使用配置 ==========

async function example1() {
  try {
    // 自动查找并加载配置文件
    const config = await loadFreelogConfig();
    
    console.log("配置加载成功:", config);
    
    // 使用配置创建资源版本
    const resourceId = "your-resource-id";
    const result = await createResourceVersion(resourceId, config);
    
    console.log("资源版本创建成功:", result);
  } catch (error) {
    console.error("错误:", error);
  }
}

// ========== 示例 2: 加载指定路径的配置 ==========

async function example2() {
  try {
    // 加载指定路径的配置文件
    const config = await loadFreelogConfig("./custom-config.json5");
    
    console.log("配置加载成功:", config);
  } catch (error) {
    console.error("错误:", error);
  }
}

// ========== 示例 3: 初始化配置文件 ==========

async function example3() {
  try {
    // 在当前目录创建配置文件模板
    await initFreelogConfig("./freelog.json5");
    
    console.log("配置文件模板已创建: ./freelog.json5");
  } catch (error) {
    console.error("错误:", error);
  }
}

// ========== 示例 4: 保存配置 ==========

async function example4() {
  try {
    const config = {
      version: "1.0.0",
      fileSha1: "4a10ed3b6e45f8014b8240ad37f44cfc9c75e754",
      filename: "resource.zip",
      description: "程序化生成的配置",
      dependencies: [],
      customPropertyDescriptors: [
        {
          key: "theme",
          defaultValue: "dark",
          type: "select" as const,
          candidateItems: ["light", "dark"],
          remark: "主题选择"
        }
      ],
      baseUpcastResources: [],
      batchSignContracts: [],
      inputAttrs: [],
      authExcludedItems: []
    };
    
    // 保存为 JSON5 格式
    await saveFreelogConfig(config, "./output.json5");
    
    console.log("配置文件已保存: ./output.json5");
  } catch (error) {
    console.error("错误:", error);
  }
}

// ========== 示例 5: 错误处理 ==========

async function example5() {
  try {
    // 加载配置（如果配置文件有错误，会抛出详细的验证错误）
    const config = await loadFreelogConfig();
    
    console.log("配置验证通过");
  } catch (error) {
    if (error instanceof Error) {
      // 输出详细的验证错误信息
      console.error("配置验证失败:");
      console.error(error.message);
      
      // 错误信息示例：
      // 配置文件验证失败:
      //   - 缺少必填字段: version
      //   - fileSha1 格式不正确，应为40位十六进制字符串
      //   - customPropertyDescriptors[0] type 值无效，应为: editableText, readonlyText, radio, checkbox, select
    }
  }
}

// ========== 示例 6: 结合 CLI 使用 ==========

async function example6() {
  // 在 CLI 命令中使用
  const program = require("commander");
  
  program
    .command("publish")
    .option("-c, --config <path>", "配置文件路径")
    .option("-r, --resource-id <id>", "资源 ID")
    .action(async (options: any) => {
      try {
        // 加载配置
        const config = await loadFreelogConfig(options.config);
        
        console.log(`正在发布资源版本 ${config.version}...`);
        
        // 创建资源版本
        const result = await createResourceVersion(options.resourceId, config);
        
        console.log("发布成功！");
        console.log("版本 ID:", result.versionId);
      } catch (error) {
        console.error("发布失败:", error);
        process.exit(1);
      }
    });
}

// 导出示例函数
export {
  example1,
  example2,
  example3,
  example4,
  example5,
  example6
};

