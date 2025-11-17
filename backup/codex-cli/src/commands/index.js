import { buildAuthCommands } from './auth/index.js';
import { buildPublishCommand } from './publish.js';
import { buildInitCommand } from './init.js';
import { buildDependencyCommands } from './dependency/index.js';

export function loadCommands(renderer) {
  return [
    ...buildAuthCommands(renderer),
    buildPublishCommand(renderer),
    ...buildDependencyCommands(renderer),
    buildInitCommand(renderer)
  ].filter(Boolean);
}
