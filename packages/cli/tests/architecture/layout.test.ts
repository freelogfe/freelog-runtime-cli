import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { createProgram } from '../../src/bin/program';
import { createSubCommands } from '../../src/commands/index';
import { usageDocsPath } from '../../src/core/usageDocs';

const srcDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src',
);

const FORBIDDEN_TOP_LEVEL = [
  'publish',
  'release',
  'dep',
  'pull',
  'session',
  'studio',
  'collection',
  'import-dir',
] as const;

const ALLOWED_TOP_LEVEL = new Set([
  'login',
  'logout',
  'init',
  'template',
  'type',
  'resource',
  'bind',
  'status',
  'create',
  'version',
  'create-version',
  'update-version',
  'update',
  'policy',
  'validate',
  'online',
  'offline',
]);

function listTsFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8').replaceAll('\\', '/');
}

function overrideExit(command: Command): Command {
  command.exitOverride();
  for (const subcommand of command.commands) {
    overrideExit(subcommand);
  }
  return command;
}

async function helpFromParse(): Promise<string> {
  const program = overrideExit(createProgram());
  let text = '';
  program.configureOutput({
    writeOut: (chunk) => {
      text += chunk;
    },
    writeErr: (chunk) => {
      text += chunk;
    },
  });
  try {
    await program.parseAsync(['--help'], { from: 'user' });
  } catch {
    // commander 把 --help 当成退出
  }
  return text;
}

describe('命令注册表', () => {
  it('--help 没有禁止名单里的命令', async () => {
    const program = createProgram();
    const parsedHelp = await helpFromParse();
    const helpText = `${parsedHelp}\n${program.helpInformation()}`;

    expect(helpText).toMatch(/--env/);
    expect(helpText).toMatch(/--yes/);
    expect(helpText).toMatch(/--cwd/);
    expect(helpText).toMatch(/--json/);
    expect(helpText).not.toMatch(/--file/);
    expect(helpText).toContain(`使用文档：${usageDocsPath()}`);
    expect(existsSync(usageDocsPath())).toBe(true);

    for (const name of FORBIDDEN_TOP_LEVEL) {
      expect(helpText.toLowerCase()).not.toContain(name);
    }

    const topLevel = program
      .commands
      .map((command) => command.name())
      .filter((name) => name !== 'help');
    expect(new Set(topLevel)).toEqual(ALLOWED_TOP_LEVEL);
    for (const name of FORBIDDEN_TOP_LEVEL) {
      expect(topLevel).not.toContain(name);
    }
  });

  it('update-version --prepare 当未知选项失败', async () => {
    const program = overrideExit(createProgram());
    await expect(
      program.parseAsync(['update-version', '--prepare'], { from: 'user' }),
    ).rejects.toMatchObject({
      exitCode: 1,
      code: 'commander.unknownOption',
    });
  });

  it('create-version --prepare 是已注册旗', () => {
    const program = createProgram();
    const command = program.commands.find((item) => item.name() === 'create-version');
    const flags = command?.options.map((option) => option.long) ?? [];
    expect(flags).toContain('--prepare');
  });

  it('createSubCommands 只含 COMMANDS 允许的顶层命令', () => {
    const registry = createSubCommands();
    const names = Object.keys(registry);
    expect(names).not.toHaveLength(0);
    for (const name of names) {
      expect(ALLOWED_TOP_LEVEL.has(name)).toBe(true);
      expect(registry[name]?.name()).toBe(name);
    }
    for (const name of FORBIDDEN_TOP_LEVEL) {
      expect(names).not.toContain(name);
    }
  });
});

describe('依赖方向', () => {
  it('新代码不 import archive、不 import 旧路径', () => {
    const forbiddenSnippets = [
      'docs/一期/archive',
      'config/project',
      'services/store',
      'adapters/versionDraftAdapter',
      'services/draftService',
      'services/resource/publishVersion',
      'allowUnknownOption',
    ];

    for (const filePath of listTsFiles(srcDir)) {
      const source = readSource(filePath);
      for (const snippet of forbiddenSnippets) {
        expect(source, filePath).not.toContain(snippet);
      }
    }
  });

  it('commands 不打平台、根下没有命令实现文件', () => {
    const commandsDir = path.join(srcDir, 'commands');
    const rootFiles = readdirSync(commandsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name);
    expect(rootFiles).toEqual(['index.ts']);

    const platformMarks = [
      'FServiceAPI',
      'Resource.',
      'Storage.',
      'Contract.',
      'Policy.',
    ];
    for (const filePath of listTsFiles(commandsDir)) {
      const source = readSource(filePath);
      for (const mark of platformMarks) {
        expect(source, filePath).not.toContain(mark);
      }
    }
  });

  it('local 不 import domain 或 commands', () => {
    const localDir = path.join(srcDir, 'local');
    for (const filePath of listTsFiles(localDir)) {
      const source = readSource(filePath);
      expect(source, filePath).not.toMatch(/from ['"].*\/domain\//);
      expect(source, filePath).not.toMatch(/from ['"].*\/commands\//);
    }
  });

  it('createVersion 与 updateVersion 不得互相 import', () => {
    const createVersionPath = path.join(
      srcDir,
      'domain/version/createVersion.ts',
    );
    const updateVersionPath = path.join(
      srcDir,
      'domain/version/updateVersion.ts',
    );
    if (!existsSync(createVersionPath) || !existsSync(updateVersionPath)) {
      return;
    }
    const createSource = readSource(createVersionPath);
    const updateSource = readSource(updateVersionPath);
    expect(createSource).not.toMatch(/updateVersion/);
    expect(updateSource).not.toMatch(/createVersion/);
  });
});
