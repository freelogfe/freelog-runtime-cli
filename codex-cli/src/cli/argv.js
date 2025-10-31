import { Command } from 'commander';

const SHORT_OPTION_PATTERN = /^-([a-zA-Z][\w-]*)$/;
const LONG_OPTION_PATTERN = /^--([\w-]+)(?:=(.*))?$/;

export function parseArgv(argv) {
  const baseProgram = new Command();
  baseProgram.allowUnknownOption(true);
  baseProgram.exitOverride();
  baseProgram.enablePositionalOptions(false);
  baseProgram.option('-h, --help');
  baseProgram.option('-v, --version');
  baseProgram.option('-j, --json');
  baseProgram.option('--json');
  let operands = [];
  let unknown = [];
  try {
    const result = baseProgram.parseOptions(argv.slice(2));
    operands = result.operands;
    unknown = result.unknown;
  } catch (error) {
    if (error.code !== 'commander.helpDisplayed') {
      throw error;
    }
  }
  const baseOptions = baseProgram.opts();
  const tokens = [...operands, ...unknown];
  const positionals = [];
  const options = {};
  const rawOptions = [];
  let command = null;
  let subcommand = null;
  let parsingOptions = true;

  while (tokens.length > 0) {
    const token = tokens.shift();
    if (parsingOptions && token === '--') {
      parsingOptions = false;
      continue;
    }
    if (parsingOptions && LONG_OPTION_PATTERN.test(token)) {
      const [, key, inlineValue] = LONG_OPTION_PATTERN.exec(token);
      if (inlineValue !== undefined) {
        setOption(options, key, inlineValue);
        rawOptions.push({ key, value: inlineValue });
        continue;
      }
      if (tokens.length > 0 && !tokens[0].startsWith('-')) {
        const value = tokens.shift();
        setOption(options, key, value);
        rawOptions.push({ key, value });
      } else {
        setOption(options, key, true);
        rawOptions.push({ key, value: true });
      }
      continue;
    }
    if (parsingOptions && SHORT_OPTION_PATTERN.test(token)) {
      const [, key] = SHORT_OPTION_PATTERN.exec(token);
      if (tokens.length > 0 && !tokens[0].startsWith('-')) {
        const value = tokens.shift();
        setOption(options, key, value);
        rawOptions.push({ key, value });
      } else {
        setOption(options, key, true);
        rawOptions.push({ key, value: true });
      }
      continue;
    }
    if (!command) {
      command = token;
      continue;
    }
    if (!subcommand && token && !token.startsWith('-')) {
      subcommand = token;
      continue;
    }
    positionals.push(token);
  }

  if (baseOptions.help) {
    setOption(options, 'help', true);
  }
  if (baseOptions.version) {
    setOption(options, 'version', true);
  }
  if (baseOptions.json) {
    setOption(options, 'json', true);
  }

  const helpRequested = Boolean(options.help || options.h);
  const versionRequested = Boolean(options.version) && !command;

  return {
    command,
    subcommand,
    positionals,
    options,
    rawOptions,
    helpRequested,
    versionRequested
  };
}

function setOption(target, key, value) {
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    const existing = target[key];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      target[key] = [existing, value];
    }
    return;
  }
  target[key] = value;
}
