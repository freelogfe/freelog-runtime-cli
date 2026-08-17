import { installToolsLibForNode } from '../platform/bootstrap.js';

installToolsLibForNode();

import { createRequire } from 'node:module';
import { defineCommand, runMain } from 'citty';
import { tryPrintInitPresetHelpFromArgv } from '../commands/initHelp.js';
import { createSubCommands } from './subCommands.js';

if (tryPrintInitPresetHelpFromArgv(process.argv)) {
  process.exit(0);
}

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version?: string };

const subCommands = createSubCommands();

import { mainGlobalArgs } from '../core/cliArgs.js';

const main = defineCommand({
  meta: {
    name: 'freelog-cli',
    version: pkg.version || '0.5.0',
    description: 'Freelog CLI — 与 Console 同源 @freelog/tools-lib2 的资源脚手架与发行工具',
  },
  args: mainGlobalArgs,
  subCommands,
});

runMain(main);
