/** `version draft pull/discard` 命令：拉底 / 丢稿。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { draftDiscard } from '../../domain/version/draftDiscard';
import { draftPull } from '../../domain/version/draftPull';

export function createVersionDraftCommand(): Command {
  const draft = addSharedOptions(new Command('draft'));
  draft.description(
    // i18n: cli.command.version.draft.description
    '管本地工作稿',
  );

  addSharedOptions(draft.command('pull'))
    .description(
      // i18n: cli.command.version.draft.pull.description
      '拉已发号写入工作稿',
    )
    .option(
      '--version <ver>',
      // i18n: cli.command.version.draft.pull.version
      '已发号',
    )
    .action(async function(this: Command, options: {
      version?: string;
      yes?: boolean;
      file?: string;
      cwd?: string;
    }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      const text = await draftPull({
        cwd: resolveCwd(options.cwd),
        file: options.file,
        version: options.version,
        yes: options.yes,
      });
      console.log(text);
    });

  addSharedOptions(draft.command('discard'))
    .description(
      // i18n: cli.command.version.draft.discard.description
      '丢掉工作稿',
    )
    .action(function(this: Command, options: { file?: string; cwd?: string }) { const _shared = (this as Command).optsWithGlobals() as Record<string, unknown>; { const _s = _shared as any; if (_s.yes !== undefined && (options as any).yes === undefined) (options as any).yes = _s.yes as any; if (_s.cwd !== undefined && (options as any).cwd === undefined) (options as any).cwd = _s.cwd as any; if (_s.file !== undefined && (options as any).file === undefined) (options as any).file = _s.file as any; if (_s.env !== undefined && (options as any).env === undefined) (options as any).env = _s.env as any; if (_s.json !== undefined && (options as any).json === undefined) (options as any).json = _s.json as any; }
      console.log(draftDiscard(resolveCwd(options.cwd), options.file));
    });

  return draft;
}
