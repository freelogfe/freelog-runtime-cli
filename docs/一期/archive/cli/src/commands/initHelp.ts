/** init theme|widget|package 预设路由的专用 --help（citty 无法为手动路由生成独立 USAGE） */

import type { ScaffoldPreset } from '../services/init/index.js';

const PRESET_HELP: Record<
  ScaffoldPreset,
  { title: string; usage: string; required: string[]; notes: string[] }
> = {
  theme: {
    title: '创建主题工程',
    usage: 'freelog-cli init theme <dir> [OPTIONS]',
    required: ['<dir> 项目目录', '--runtime 0.4|0.5（非交互必填）', '--template <id>（非交互必填，如 vite-react-ts）'],
    notes: [
      '定稿平台类型树中的「主题」，不问大类；resourceTypeCode 由 preset 解析',
      '非交互示例：freelog-cli init theme my-theme --template vite-react-ts --runtime 0.5 --yes --env dev',
    ],
  },
  widget: {
    title: '创建插件工程',
    usage: 'freelog-cli init widget <dir> [OPTIONS]',
    required: ['<dir> 项目目录', '--runtime 0.4|0.5（非交互必填）', '--template <id>（非交互必填，如 vite-vue-ts）'],
    notes: [
      '定稿平台类型树中的「插件」',
      '非交互示例：freelog-cli init widget my-widget --template vite-vue-ts --runtime 0.5 --yes --env dev',
    ],
  },
  package: {
    title: '创建前端库/软件库工程',
    usage: 'freelog-cli init package <dir> [OPTIONS]',
    required: [
      '<dir> 项目目录',
      '--namespace <npmScope>（非交互必填）',
      '--template 可选；省略时非交互会失败，须显式传或使用交互 init',
    ],
    notes: [
      '定稿「前端库/软件库」类型；scaffold=package',
      '非交互示例：freelog-cli init package my-lib --template package-js --namespace com.example.lib --yes --skip-install --env dev',
    ],
  },
};

export function printInitPresetHelp(preset: ScaffoldPreset): void {
  const block = PRESET_HELP[preset];
  process.stdout.write(`\n${block.title} (${preset})\n\n`);
  process.stdout.write(`USAGE ${block.usage}\n\n`);
  process.stdout.write('REQUIRED (非交互)\n\n');
  for (const line of block.required) {
    process.stdout.write(`  ${line}\n`);
  }
  process.stdout.write('\nOPTIONS\n\n');
  process.stdout.write(
    '  与 freelog-cli init --help 相同（--cwd --env --yes --json --resource-type --title …）\n',
  );
  process.stdout.write('\nNOTES\n\n');
  for (const line of block.notes) {
    process.stdout.write(`  ${line}\n`);
  }
  process.stdout.write('\n');
}

export function tryPrintInitPresetHelpFromArgv(argv: string[]): boolean {
  const initIdx = argv.findIndex((a) => a === 'init');
  if (initIdx < 0) return false;
  const next = argv[initIdx + 1];
  if (next !== 'theme' && next !== 'widget' && next !== 'package') return false;
  if (!argv.slice(initIdx + 2).some((a) => a === '--help' || a === '-h')) return false;
  printInitPresetHelp(next);
  return true;
}
