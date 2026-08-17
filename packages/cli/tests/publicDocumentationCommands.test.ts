import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSubCommands } from '../src/bin/subCommands.js';
import { mainGlobalArgs } from '../src/core/cliArgs.js';

type CommandLike = {
  args?: Record<string, { type?: string }>;
  subCommands?: Record<string, CommandLike>;
};

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const usageDir = path.join(repoRoot, 'docs/新方案/使用');

function tokenize(command: string): string[] {
  return [...command.matchAll(/"[^"]*"|'[^']*'|\S+/g)].map((match) =>
    match[0]!.replace(/^(?:"|')|(?:"|')$/g, ''),
  );
}

function documentedCommands(): Array<{ file: string; command: string }> {
  return fs
    .readdirSync(usageDir)
    .filter((file) => file.endsWith('.md'))
    .flatMap((file) => {
      const source = fs.readFileSync(path.join(usageDir, file), 'utf8');
      return [...source.matchAll(/```(?:bash|sh|powershell)\s*\n([\s\S]*?)```/g)].flatMap(
        (block) =>
          block[1]!
            .replace(/\\\r?\n\s*/g, ' ')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith('freelog-cli '))
            .map((command) => ({ file, command })),
      );
    });
}

describe('public documentation commands', () => {
  it('only documents mounted public commands and declared flags', () => {
    const rootCommands = createSubCommands(false) as Record<string, CommandLike>;
    const errors: string[] = [];

    for (const { file, command } of documentedCommands()) {
      const tokens = tokenize(command);
      let index = 1;

      while (tokens[index]?.startsWith('--')) {
        const name = tokens[index]!.slice(2).split('=')[0]!;
        if (name === 'help' || name === 'version') {
          index += 1;
          continue;
        }
        const definition = mainGlobalArgs[name as keyof typeof mainGlobalArgs];
        if (!definition) break;
        index += definition.type === 'boolean' || tokens[index]!.includes('=') ? 1 : 2;
      }

      const topLevelName = tokens[index];
      if (!topLevelName) continue;
      let definition = rootCommands[topLevelName];
      if (!definition) {
        errors.push(`${file}: unknown command in ${command}`);
        continue;
      }
      index += 1;

      while (definition.subCommands?.[tokens[index]!]) {
        definition = definition.subCommands[tokens[index]!]!;
        index += 1;
      }

      const declaredFlags = new Set([
        ...Object.keys(mainGlobalArgs),
        ...Object.keys(definition.args || {}),
        'help',
        'version',
      ]);
      for (const token of tokens) {
        if (!token.startsWith('--')) continue;
        const name = token.slice(2).split('=')[0]!;
        if (!declaredFlags.has(name)) {
          errors.push(`${file}: unknown --${name} in ${command}`);
        }
      }
    }

    expect(errors).toEqual([]);
  });
});
