/** `update-version` 命令：发新号（--version 或 --bump 定号）。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { runUpdateVersion } from '../../domain/version/updateVersion';
import { confirmDraftDestruction } from './draftConfirmation';

/** update-version 命令装配（--version|--bump，须 > latest）。 */
export function createUpdateVersionCommand(): Command {
  const command = addSharedOptions(new Command('update-version'));
  command
    .description(
      // i18n: cli.command.update_version.description
      '定新号并提交',
    )
    .option(
      '--reuse-version <ver>',
      // i18n: cli.command.update_version.reuse_version
      '这次提交认的底',
    )
    .option(
      '--version <ver>',
      // i18n: cli.command.update_version.version
      '新号',
    )
    .option(
      '--bump <level>',
      // i18n: cli.command.update_version.bump
      '按 patch / minor / major 递增',
    )
    .option(
      '--reset',
      // i18n: cli.command.update_version.reset
      '丢掉再按回显源拉',
    )
    .option(
      '--artifact <path>',
      // i18n: cli.command.version.artifact
      '本次上传并记录的本地文件或目录',
    )
    .action(async function(this: Command, options: {
      reuseVersion?: string;
      version?: string;
      bump?: string;
      reset?: boolean;
      artifact?: string;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) {
      const shared = readSharedOptions(this);
      const cwd = resolveCwd(shared.cwd);
      const result = await runUpdateVersion({
        cwd,
        file: shared.file,
        artifact: options.artifact,
        version: options.version,
        bump: options.bump,
        reuseVersion: options.reuseVersion,
        reset: options.reset,
        confirmReset: options.reset
          ? (summary) => confirmDraftDestruction({ summary, yes: shared.yes, action: '丢弃工作稿并重置更新版本' })
          : undefined,
        yes: shared.yes,
      });
      console.log(result);
    });
  return command;
}
