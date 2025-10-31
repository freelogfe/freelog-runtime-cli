import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import figlet from 'figlet';
import { parseArgv } from './cli/argv.js';
import { createRenderer } from './cli/output.js';
import { loadCommands } from './commands/index.js';
import { ensureInitialised } from './services/bootstrap-service.js';
import { getEnv } from './config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function printVersion(renderer) {
  const pkg = await import(path.join(__dirname, '..', 'package.json'), {
    assert: { type: 'json' }
  });
  renderer.raw(pkg.default.version || '0.0.0');
}

async function printHelp(renderer) {
  const banner = figlet.textSync('Freelog CLI', { font: 'Standard' });
  renderer.raw(banner);
  renderer.newline();
  renderer.headline('Freelog Codex CLI 帮助');
  renderer.raw('用法: freelog-cli <命令> [参数]');
  renderer.newline();
  renderer.raw('可用命令:');
  renderer.table(
    [
      ['init', '初始化 Freelog 项目，支持模板选择'],
      ['login', '全局或工作空间登录'],
      ['logout', '清除登录状态'],
      ['login status', '查看当前登录信息'],
      ['publish', '发布作品或草稿，支持语义化版本递增'],
      ['add / change / remove / update', '依赖管理快捷命令'],
      ['dep list', '列出依赖信息'],
      ['dep sync', '从远端同步依赖（支持离线回退）'],
      ['sync', '同步作品信息或指定模块'],
      ['analyze', '分析构建结果，输出结构摘要']
    ],
    { header: ['命令', '说明'] }
  );
  renderer.newline();
  renderer.list([
    `接口地址: ${getEnv('FREELOG_API_BASE_URL')}`,
    `上传接口: ${getEnv('FREELOG_UPLOAD_ENDPOINT')}`,
    `登录接口: ${getEnv('FREELOG_LOGIN_ENDPOINT')}`
  ]);
  renderer.newline();
  renderer.muted('示例: freelog-cli publish --patch -m "修复问题"');
}

export async function runCli(argv) {
  const parsed = parseArgv(argv);
  const renderer = createRenderer({ json: parsed.options.json });

  if (parsed.versionRequested) {
    await printVersion(renderer);
    return;
  }

  await ensureInitialised();

  const commandRegistry = loadCommands(renderer);

  if (!parsed.command || parsed.helpRequested) {
    await printHelp(renderer);
    return;
  }

  const matched = commandRegistry.find((entry) => entry.matches(parsed.command, parsed.subcommand));
  if (!matched) {
    renderer.error(`未知命令: ${parsed.command}${parsed.subcommand ? ` ${parsed.subcommand}` : ''}`);
    renderer.muted('使用 freelog-cli --help 查看可用命令。');
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
    if (process.env.DEBUG === '1' && error.stack) {
      renderer.muted(error.stack);
    }
    process.exitCode = 1;
  }
}
