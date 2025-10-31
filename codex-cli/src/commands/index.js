import { buildAuthCommands } from './auth/index.js';
import { buildPublishCommand } from './publish.js';
import { buildInitCommand } from './init.js';
import { buildDependencyCommands } from './dependency/index.js';
import { buildSyncCommand } from './sync.js';
import { buildAnalyzeCommand } from './analyze.js';

export function loadCommands(renderer) {
  return [
    ...buildAuthCommands(renderer),
    buildPublishCommand(renderer),
    ...buildDependencyCommands(renderer),
    buildInitCommand(renderer),
    buildSyncCommand(renderer),
    buildAnalyzeCommand(renderer)
  ].filter(Boolean);
}
