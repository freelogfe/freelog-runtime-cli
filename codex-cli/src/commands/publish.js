import { publish } from '../services/publish-service.js';
import { withSpinner } from '../cli/spinner.js';

export function buildPublishCommand(renderer) {
  return {
    matches: (command, subcommand) => command === 'publish' && !subcommand,
    handler: async ({ options }) => {
      await withSpinner('正在发布作品...', () => publish(options, renderer));
    }
  };
}
