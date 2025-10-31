import { initialiseProject, listTemplates } from '../services/init-service.js';
import { isOptionEnabled, getOption } from '../utils/options.js';

export function buildInitCommand(renderer) {
  return {
    matches: (command, subcommand) => command === 'init' && !subcommand,
    handler: async ({ positionals, options }) => {
      if (isOptionEnabled(options, 'list')) {
        const templates = await listTemplates();
        renderer.table(
          templates.map((tpl) => [tpl.name, tpl.description || '-']),
          { header: ['模板', '说明'] }
        );
        return;
      }
      const projectName = positionals[0];
      const templateOption = getOption(options, 'template', 't');
      const force = isOptionEnabled(options, 'force', 'f');
      const version = getOption(options, 'version');

      const result = await initialiseProject({
        projectName,
        template: templateOption,
        force,
        version
      });

      renderer.success(`项目已创建: ${result.projectName}`);
      renderer.list([
        `模板: ${result.template}`,
        `版本: ${result.version}`,
        `目录: ${result.relativePath}`,
        '下一步: cd ' + result.relativePath,
        '          npm install',
        '          npm run dev'
      ]);
    }
  };
}
