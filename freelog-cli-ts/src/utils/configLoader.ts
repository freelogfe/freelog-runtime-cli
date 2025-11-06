import JSON5 from "json5";
import yaml from "js-yaml";
import fs from "fs-extra";
import path from "path";
import type { CreateResourceVersionBody } from "../api/dataType";

/**
 * 加载 Freelog 配置文件
 * 支持 JSON、JSON5 和 YAML 格式
 */
export async function loadFreelogConfig(
  configPath?: string
): Promise<CreateResourceVersionBody> {
  // 默认配置文件路径（按优先级排序）
  const defaultPaths = [
    "freelog.yaml",      // YAML 格式（推荐）
    "freelog.yml",       // YAML 格式（简写）
    "freelog.json5",     // JSON5 格式
    "freelog.json",      // JSON 格式
    ".freelogrc.yaml",
    ".freelogrc.yml",
    ".freelogrc.json5",
    ".freelogrc.json",
  ];

  let filePath: string;

  if (configPath) {
    // 使用指定路径
    filePath = path.resolve(configPath);
  } else {
    // 自动查找配置文件
    const foundPath = defaultPaths.find((p) => fs.existsSync(p));
    if (!foundPath) {
      throw new Error(
        `找不到配置文件，请创建以下文件之一：${defaultPaths.join(", ")}`
      );
    }
    filePath = path.resolve(foundPath);
  }

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    throw new Error(`配置文件不存在: ${filePath}`);
  }

  // 读取文件内容
  const fileContent = await fs.readFile(filePath, "utf-8");

  // 根据文件扩展名选择解析方式
  let config: CreateResourceVersionBody;
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === ".yaml" || ext === ".yml") {
      // 使用 YAML 解析
      config = yaml.load(fileContent) as CreateResourceVersionBody;
    } else if (ext === ".json5") {
      // 使用 JSON5 解析
      config = JSON5.parse(fileContent);
    } else {
      // 使用标准 JSON 解析
      config = JSON.parse(fileContent);
    }
  } catch (error) {
    throw new Error(
      `解析配置文件失败: ${filePath}\n${error instanceof Error ? error.message : String(error)}`
    );
  }

  // 验证必填字段
  validateConfig(config);

  return config;
}

/**
 * 验证配置文件
 */
function validateConfig(config: any): asserts config is CreateResourceVersionBody {
  const errors: string[] = [];

  // 验证必填字段
  if (!config.version) {
    errors.push("缺少必填字段: version");
  } else if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
    errors.push("version 格式不正确，应为语义化版本号（如: 1.0.0）");
  }

  if (!config.fileSha1) {
    errors.push("缺少必填字段: fileSha1");
  } else if (!/^[a-f0-9]{40}$/.test(config.fileSha1)) {
    errors.push("fileSha1 格式不正确，应为40位十六进制字符串");
  }

  if (!config.filename) {
    errors.push("缺少必填字段: filename");
  }

  // 验证依赖配置
  if (config.dependencies && Array.isArray(config.dependencies)) {
    config.dependencies.forEach((dep: any, index: number) => {
      if (!dep.resourceId) {
        errors.push(`dependencies[${index}] 缺少 resourceId 字段`);
      }
      if (!dep.versionRange) {
        errors.push(`dependencies[${index}] 缺少 versionRange 字段`);
      }
    });
  }

  // 验证自定义属性配置
  if (
    config.customPropertyDescriptors &&
    Array.isArray(config.customPropertyDescriptors)
  ) {
    config.customPropertyDescriptors.forEach((prop: any, index: number) => {
      if (!prop.key) {
        errors.push(`customPropertyDescriptors[${index}] 缺少 key 字段`);
      }
      if (prop.defaultValue === undefined) {
        errors.push(`customPropertyDescriptors[${index}] 缺少 defaultValue 字段`);
      }
      if (!prop.type) {
        errors.push(`customPropertyDescriptors[${index}] 缺少 type 字段`);
      } else {
        const validTypes = [
          "editableText",
          "readonlyText",
          "radio",
          "checkbox",
          "select",
        ];
        if (!validTypes.includes(prop.type)) {
          errors.push(
            `customPropertyDescriptors[${index}] type 值无效，应为: ${validTypes.join(", ")}`
          );
        }
      }

      // 验证需要 candidateItems 的类型
      if (["radio", "checkbox", "select"].includes(prop.type)) {
        if (!prop.candidateItems || !Array.isArray(prop.candidateItems)) {
          errors.push(
            `customPropertyDescriptors[${index}] type 为 ${prop.type} 时需要提供 candidateItems 数组`
          );
        }
      }
    });
  }

  // 验证授权排除项
  if (config.authExcludedItems && Array.isArray(config.authExcludedItems)) {
    config.authExcludedItems.forEach((item: any, index: number) => {
      if (!item.resourceId) {
        errors.push(`authExcludedItems[${index}] 缺少 resourceId 字段`);
      }
      if (!item.excludedType) {
        errors.push(`authExcludedItems[${index}] 缺少 excludedType 字段`);
      } else if (!["contractId", "policyId"].includes(item.excludedType)) {
        errors.push(
          `authExcludedItems[${index}] excludedType 值无效，应为: contractId 或 policyId`
        );
      }
      if (!item.excludedValue) {
        errors.push(`authExcludedItems[${index}] 缺少 excludedValue 字段`);
      }
    });
  }

  if (errors.length > 0) {
    throw new Error(`配置文件验证失败:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
}

/**
 * 保存配置文件
 */
export async function saveFreelogConfig(
  config: CreateResourceVersionBody,
  outputPath: string = "freelog.yaml"
): Promise<void> {
  const ext = path.extname(outputPath).toLowerCase();
  let content: string;

  if (ext === ".yaml" || ext === ".yml") {
    // 使用 YAML 格式
    content = yaml.dump(config, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });
  } else if (ext === ".json5") {
    // 使用 JSON5 格式
    content = JSON5.stringify(config, null, 2);
  } else {
    // 使用标准 JSON 格式
    content = JSON.stringify(config, null, 2);
  }

  await fs.writeFile(outputPath, content, "utf-8");
}

/**
 * 初始化配置文件模板
 */
export async function initFreelogConfig(
  outputPath: string = "freelog.json5"
): Promise<void> {
  const templatePath = path.join(__dirname, "../../public/freelog.json5");
  
  if (fs.existsSync(outputPath)) {
    throw new Error(`配置文件已存在: ${outputPath}`);
  }

  await fs.copy(templatePath, outputPath);
}

