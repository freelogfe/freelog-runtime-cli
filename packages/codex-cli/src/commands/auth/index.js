import { buildLoginCommand } from './login.js';
import { buildLogoutCommand } from './logout.js';
import { buildStatusCommand } from './status.js';

export function buildAuthCommands(renderer) {
  return [buildLoginCommand(renderer), buildLogoutCommand(renderer), buildStatusCommand(renderer)];
}
