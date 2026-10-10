/** `create-version` 命令：首版备稿（--prepare）/ 提交（--yes）。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { runCreateVersion } from '../../domain/version/createVersion';
import { confirmDraftDestruction } from './draftConfirmation';

/** create-version 命令装配（--prepare 备稿 / --yes 提交）。 */
export function createCreateVersionCommand(): Command {
  const command = addSharedOptions(new Command('create-version'));
  command
    .description(
      // i18n: cli.command.create_version.description
      '提交首版',
    )
    .option(
      '--prepare',
      // i18n: cli.command.create_version.prepare
      '只备稿，不提交',
    )
    .option(
      '--reset',
      // i18n: cli.command.create_version.reset
      '丢掉工作稿重来',
    )
    .option(
      '--artifact <path>',
      // i18n: cli.command.version.artifact
      '本次上传并记录的本地文件或目录',
    )
    .action(async function(this: Command, options: {
      prepare?: boolean;
      reset?: boolean;
      artifact?: string;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) {
      const shared = readSharedOptions(this);
      const cwd = resolveCwd(shared.cwd);
      const result = await runCreateVersion({
        cwd,
        file: shared.file,
        artifact: options.artifact,
        prepare: options.prepare,
        reset: options.reset,
        confirmReset: options.reset
          ? (summary) => confirmDraftDestruction({ summary, yes: shared.yes, action: '丢弃工作稿并重置首版' })
          : undefined,
        yes: shared.yes,
      });
      console.log(result);
    });
  return command;
}
