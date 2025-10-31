import fs from "fs-extra";
import { DEFAULT_CONFIG_FILE } from "../../constants/paths.js";
import { DEFAULT_FREELOG_CONFIG } from "../../config/default-config.js";
import { withSpinner } from "../../cli/spinner.js";
import { getOption, isOptionEnabled } from "../../utils/options.js";

export function buildDependencyCommands(renderer) {
  return [
    {
      matches: (command, subcommand) => command === "add" && !subcommand,
      handler: async ({ positionals, options }) => {
        if (positionals.length === 0) {
          throw new Error("请指定要添加的依赖，例如 freelog-cli add <resource>@<version>");
        }
        await withSpinner("正在添加依赖...", async () => {
          const spec = parseSpecifier(positionals[0]);
          const config = await loadFreelogConfig();
          const exists = config.dependencies.find((item) => item.name === spec.identifier);
          if (exists) {
            throw new Error(`依赖 ${spec.identifier} 已存在，可使用 change 命令调整。`);
          }
          config.dependencies.push({
            name: spec.identifier,
            version: spec.version || "latest",
            resourceId: spec.identifier,
            policyId: getOption(options, "policy", "policyId") ?? "-",
            authStatus: true
          });
          await saveFreelogConfig(config);
        });
        renderer.success("依赖添加完成。");
      }
    },
    {
      matches: (command, subcommand) => command === "change" && !subcommand,
      handler: async ({ positionals, options }) => {
        if (positionals.length === 0) {
          throw new Error("请指定要修改的依赖，例如 freelog-cli change <resource>@<version>");
        }
        await withSpinner("正在修改依赖...", async () => {
          const spec = parseSpecifier(positionals[0]);
          const config = await loadFreelogConfig();
          const target = config.dependencies.find((item) => item.name === spec.identifier);
          if (!target) {
            throw new Error(`未找到依赖 ${spec.identifier}。`);
          }
          if (spec.version) {
            target.version = spec.version;
          }
          const policy = getOption(options, "policy", "policyId");
          if (policy) {
            target.policyId = policy;
          }
          await saveFreelogConfig(config);
        });
        renderer.success("依赖信息已更新。");
      }
    },
    {
      matches: (command, subcommand) => command === "remove" && !subcommand,
      handler: async ({ positionals }) => {
        if (positionals.length === 0) {
          throw new Error("请指定要删除的依赖。");
        }
        await withSpinner("正在删除依赖...", async () => {
          const config = await loadFreelogConfig();
          const before = config.dependencies.length;
          config.dependencies = config.dependencies.filter((item) => !positionals.includes(item.name));
          if (config.dependencies.length === before) {
            throw new Error("未匹配到需要删除的依赖。");
          }
          await saveFreelogConfig(config);
        });
        renderer.success("依赖删除完成。");
      }
    },
    {
      matches: (command, subcommand) => command === "update" && !subcommand,
      handler: async ({ positionals, options }) => {
        await withSpinner("正在更新依赖...", async () => {
          const config = await loadFreelogConfig();
          const targets = positionals.length > 0 ? positionals : config.dependencies.map((item) => item.name);
          const targetVersion = getOption(options, "to") || "latest";
          targets.forEach((identifier) => {
            const item = config.dependencies.find((dep) => dep.name === identifier);
            if (item) {
              item.version = targetVersion;
            }
          });
          await saveFreelogConfig(config);
        });
        renderer.success("依赖已更新到指定版本。");
      }
    },
    {
      matches: (command, subcommand) => command === "dep" && subcommand === "list",
      handler: async () => {
        const config = await loadFreelogConfig();
        if (config.dependencies.length === 0) {
          renderer.warn("当前没有记录任何依赖。");
          return;
        }
        renderer.table(
          config.dependencies.map((dep) => [dep.name, dep.version, dep.policyId ?? "-", dep.authStatus ? "已授权" : "未授权"]),
          { header: ["名称", "版本", "策略", "授权"] }
        );
      }
    },
    {
      matches: (command, subcommand) => command === "dep" && subcommand === "sync",
      handler: async () => {
        renderer.warn("当前客户端未连接远端依赖仓库，暂不支持同步。");
      }
    }
  ];
}

function parseSpecifier(spec) {
  const at = spec.lastIndexOf("@");
  if (at <= 0) {
    return { identifier: spec, version: null };
  }
  return {
    identifier: spec.slice(0, at),
    version: spec.slice(at + 1)
  };
}

async function loadFreelogConfig() {
  if (!(await fs.pathExists(DEFAULT_CONFIG_FILE))) {
    await fs.writeJson(DEFAULT_CONFIG_FILE, DEFAULT_FREELOG_CONFIG, { spaces: 2 });
  }
  const config = await fs.readJson(DEFAULT_CONFIG_FILE);
  config.dependencies = config.dependencies || [];
  return config;
}

async function saveFreelogConfig(config) {
  await fs.writeJson(DEFAULT_CONFIG_FILE, config, { spaces: 2 });
}
