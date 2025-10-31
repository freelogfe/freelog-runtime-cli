import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import figlet from "figlet";
import fs from "fs-extra";
import { parseArgv } from "./cli/argv.js";
import { createRenderer } from "./cli/output.js";
import { loadCommands } from "./commands/index.js";
import {
  GLOBAL_DATA_DIR,
  WORKSPACE_DATA_DIR,
  LOG_DIR,
  WORKSPACE_LOG_DIR
} from "./constants/paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_HOST = "https://api.freelog.com";
const TEST_HOST = "https://api.testfreelog.com";

async function printVersion(renderer) {
  const pkg = await import(path.join(__dirname, "..", "package.json"), {
    assert: { type: "json" }
  });
  renderer.raw(pkg.default.version || "0.0.0");
}

async function printHelp(renderer) {
  const banner = figlet.textSync("Freelog CLI", { font: "Standard" });
  renderer.raw(banner);
  renderer.newline();
  renderer.headline("Freelog Codex CLI 帮助");
  renderer.raw("用法：freelog-cli <命令> [参数]");
  renderer.newline();
  renderer.raw("可用命令：");
  renderer.table(
    [
      ["init", "初始化 Freelog 项目，支持模板选择"],
      ["login", "全局或工作空间登录"],
      ["logout", "清除登录状态"],
      ["login status", "查看当前登录信息"],
      ["publish", "发布作品或草稿，支持语义化版本递增"],
      ["add / change / remove / update", "依赖管理快捷命令"],
      ["dep list", "列出依赖信息"],
      ["dep sync", "从远端同步依赖（支持离线回退）"]
    ],
    { header: ["命令", "说明"] }
  );
  renderer.newline();
  const host = globalThis.FREELOG_HOST ?? DEFAULT_HOST;
  renderer.list([
    `接口地址：${host}`,
    `上传接口：${host}/v2/storages/files/upload`,
    `登录接口：${host}/v2/passport/login`
  ]);
  renderer.newline();
  renderer.muted("示例：freelog-cli publish --patch -m \"修复问题\"");
}

function chooseHost(options) {
  if (Object.prototype.hasOwnProperty.call(options, "t")) {
    delete options.t;
    return TEST_HOST;
  }
  return DEFAULT_HOST;
}

async function ensureStorageDirectories() {
  const dirs = [GLOBAL_DATA_DIR, WORKSPACE_DATA_DIR, LOG_DIR, WORKSPACE_LOG_DIR];
  await Promise.all(dirs.map((dir) => fs.ensureDir(dir)));
}

export async function runCli(argv) {
  const parsed = parseArgv(argv);
  const renderer = createRenderer({ json: parsed.options.json });

  globalThis.FREELOG_HOST = chooseHost(parsed.options);
  await ensureStorageDirectories();

  if (parsed.versionRequested) {
    await printVersion(renderer);
    return;
  }

  const commandRegistry = loadCommands(renderer);

  if (!parsed.command || parsed.helpRequested) {
    await printHelp(renderer);
    return;
  }

  const matched = commandRegistry.find((entry) => entry.matches(parsed.command, parsed.subcommand));
  if (!matched) {
    renderer.error(`未知命令：${parsed.command}${parsed.subcommand ? ` ${parsed.subcommand}` : ""}`);
    renderer.muted("使用 freelog-cli --help 查看可用命令。");
    process.exitCode = 1;
    return;
  }

  try {
    await matched.handler({
      command: parsed.command,
      subcommand: parsed.subcommand,
      positionals: parsed.positionals,
      options: parsed.options,
      rawOptions: parsed.rawOptions,
      renderer
    });
  } catch (error) {
    renderer.error(error.message || String(error));
    if (process.env.DEBUG === "1" && error.stack) {
      renderer.muted(error.stack);
    }
    process.exitCode = 1;
  }
}
