import { Command, CommanderError } from 'commander';
import { addSharedOptions, createSubCommands } from '../commands/index';
import { CliError, formatCliError } from '../core/errors';
import { resolveCwd } from '../domain/account/login';
import { applyCliEnv } from '../domain/env';
import { setAuthSearchCwd } from '../local/auth';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('freelog-cli')
    .description(
      // i18n: cli.program.description
      'Freelog 命令行',
    )
    .version(
      '0.5.0',
      '-V, --version',
      // i18n: cli.flag.cli_version
      '打印 CLI 版本',
    );

  addSharedOptions(program);

  program.hook('preAction', (thisCommand) => {
    const envFlag = findOptionValue(thisCommand, 'env');
    applyCliEnv({ flag: typeof envFlag === 'string' ? envFlag : undefined });
    const cwdFlag = findOptionValue(thisCommand, 'cwd');
    setAuthSearchCwd(resolveCwd(typeof cwdFlag === 'string' ? cwdFlag : undefined));
  });

  for (const command of Object.values(createSubCommands())) {
    program.addCommand(command);
  }

  return program;
}

export async function runCli(
  argv: string[],
  options: {
    from?: 'node' | 'user';
    writeOut?: (text: string) => void;
    writeErr?: (text: string) => void;
  } = {},
): Promise<number> {
  const writeOut = options.writeOut ?? ((text) => {
    process.stdout.write(text);
  });
  const writeErr = options.writeErr ?? ((text) => {
    process.stderr.write(text);
  });
  const program = createProgram();
  program.exitOverride();
  program.configureOutput({
    writeOut,
    writeErr,
  });

  try {
    await program.parseAsync(argv, { from: options.from ?? 'user' });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    if (error instanceof CliError) {
      const text = formatCliError(error, argv);
      if (argv.includes('--json')) {
        writeOut(`${text}\n`);
      } else {
        writeErr(`${text}\n`);
      }
      return 1;
    }
    throw error;
  }
}

function findOptionValue(command: Command, name: string): unknown {
  let current: Command | null = command;
  while (current) {
    const value = current.getOptionValue(name);
    if (value !== undefined) {
      return value;
    }
    current = current.parent;
  }
  return undefined;
}
