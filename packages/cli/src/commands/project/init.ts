/** init：普通资源统一类型选择；主题/插件固定类型和受控线上模板。 */

import { Command } from 'commander';
import { addLeafSubcommand, addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { askInput, isInteractive, selectQuestion } from '../../core/tty';
import { requireAuth, resolveCwd } from '../../domain/account/login';
import { chooseLeafType, getTypeInfo } from '../../domain/create/typePick';
import { initProject } from '../../domain/init/scaffold';
import { listTemplates } from '../../domain/init/templates';

function sharedOptions(command: Command): { cwd?: string; yes?: boolean } {
  return command.optsWithGlobals() as { cwd?: string; yes?: boolean };
}

async function chooseTemplate(shortcut: 'theme' | 'widget', explicit?: string): Promise<string> {
  if (explicit) return explicit;
  if (!isInteractive()) throw new CliError('非交互 init theme/widget 请提供 --template', 'INIT_TEMPLATE_REQUIRED');
  const templates = listTemplates().filter((item) => item.targets.includes(shortcut));
  return selectQuestion('选择模板', templates.map((item) => ({ name: `${item.name} (${item.id}@${item.version})`, value: item.id })));
}

/** 目录省略只适合人在 TTY 中明确确认；脚本不得默默写入当前工作目录。 */
async function chooseProjectDir(dir?: string): Promise<string> {
  if (dir?.trim()) return dir;
  if (!isInteractive()) {
    throw new CliError('非交互 init 请显式提供 [dir]', 'INIT_DIR_REQUIRED');
  }
  const selected = (await askInput('项目目录')).trim();
  if (!selected) {
    throw new CliError('请提供项目目录', 'INIT_DIR_REQUIRED');
  }
  return selected;
}

async function chooseArtifact(artifact: string | undefined, yes?: boolean): Promise<string> {
  if (artifact?.trim()) return artifact;
  if (yes || !isInteractive()) {
    throw new CliError('init 必须通过 --artifact 关联本地产物', 'INIT_ARTIFACT_REQUIRED');
  }
  const selected = (await askInput('本地产物文件或构建目录')).trim();
  if (!selected) throw new CliError('init 必须通过 --artifact 关联本地产物', 'INIT_ARTIFACT_REQUIRED');
  return selected;
}

/** 构造 init、init theme 与 init widget 命令。 */
export function createInitCommand(): Command {
  const init = addSharedOptions(new Command('init'));
  init.description('建立首份本地资源状态')
    .argument('[dir]', '目标目录')
    .option('--type <leaf-code>', '普通资源最终叶子类型')
    .option('--artifact <path>', '要关联的本地产物文件或构建目录')
    .option('--resource-type <leaf-code>', '已弃用：请改用 --type')
    .action(async function (this: Command, dir: string | undefined, options: { type?: string; resourceType?: string; artifact?: string }) {
      if (options.type && options.resourceType) throw new CliError('--type 与 --resource-type 不能同时使用', 'INIT_TYPE_CONFLICT');
      if (options.resourceType) console.warn('警告：--resource-type 已弃用，请改用 --type');
      const shared = sharedOptions(this);
      const cwd = resolveCwd(shared.cwd);
      const targetDir = await chooseProjectDir(dir);
      requireAuth({ cwd });
      const selected = options.type ?? options.resourceType;
      const type = selected ? await getTypeInfo(selected) : await chooseLeafType();
      const created = await initProject({
        cwd, dir: targetDir, typeCode: type.code, typeValidator: async () => type,
        artifact: await chooseArtifact(options.artifact, shared.yes), yes: shared.yes,
      });
      console.log(`已创建本地身份 ${created.n}.json`);
    });

  for (const shortcut of ['theme', 'widget'] as const) {
    addLeafSubcommand(init, shortcut, shortcut === 'theme' ? '主题工程' : '插件工程')
      .argument('[dir]', '目标目录')
      .option('--template <id>', '模板编号')
      .action(async function (this: Command, dir: string | undefined, options: { template?: string }) {
        const shared = sharedOptions(this);
        const targetDir = await chooseProjectDir(dir);
        const created = await initProject({
          cwd: resolveCwd(shared.cwd), dir: targetDir, shortcut,
          template: await chooseTemplate(shortcut, options.template), yes: shared.yes,
        });
        console.log(`已创建${shortcut === 'theme' ? '主题' : '插件'}工程与本地身份 ${created.n}.json`);
      });
  }
  return init;
}
