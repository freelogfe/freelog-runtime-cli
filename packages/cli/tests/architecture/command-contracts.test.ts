import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createProgram } from '../../src/bin/program';

/** 只读注册树，不 parse，不执行 preAction、认证、状态恢复或平台调用。 */
function commandSurface(command: Command, parents: string[] = []): unknown[] {
  const parts = [...parents, command.name()];
  return [{
    command: parts.slice(1).join(' ') || '<root>',
    aliases: command.aliases(),
    args: command.registeredArguments.map((arg) => ({
      name: arg.name(), required: arg.required, variadic: arg.variadic,
    })),
    options: command.options.map((option) => ({
      flags: option.flags,
      mandatory: option.mandatory,
      choices: option.argChoices,
    })),
  }, ...command.commands.flatMap((child) => commandSurface(child, parts))];
}

describe('批准命令表面契约', () => {
  it('新增/删除/改名命令、位置参数或旗标必须显式更新设计和批准快照', () => {
    expect(existsSync(fileURLToPath(new URL('./__snapshots__/command-contracts.test.ts.snap', import.meta.url)))).toBe(true);
    expect(commandSurface(createProgram())).toMatchSnapshot();
  });

  it('固定叶子选择器 type pick 在正式命令参考中有入口', () => {
    const doc = readFileSync(fileURLToPath(new URL('../../../../docs/一期/产品方案/脚手架设计/COMMANDS.md', import.meta.url)), 'utf8');
    expect(doc).toContain('`type pick');
  });

  it('recover真实帮助区分已完成marker与后来新稿，不把远端成功说成无条件删稿', () => {
    const resource = createProgram().commands.find((command) => command.name() === 'resource')!;
    const recover = resource.commands.find((command) => command.name() === 'recover')!;
    expect(recover.helpInformation()).toContain('仅摘要未变才删稿，旧记录或变稿保留');
  });

  it('合集resume默认只读，apply帮助明确yes及变稿保护', () => {
    const collection = createProgram().commands.find((command) => command.name() === 'collection')!;
    const publish = collection.commands.find((command) => command.name() === 'publish')!;
    const resume = publish.commands.find((command) => command.name() === 'resume')!;
    expect(resume.helpInformation()).toContain('只读核验');
    expect(resume.helpInformation()).toContain('--apply');
    expect(resume.helpInformation()).toContain('必须与 --yes 合用，后来变稿保留');
  });

  it('管理候选验收的真实argv必须能被批准的注册树解析，不能让fixture和预期共同使用假旗标', async () => {
    const { managementCommands, managementSetupCommands } = await import(new URL('../../../../test/acceptance/resource-management-evidence.mjs', import.meta.url).href);
    for (const kind of ['theme', 'image']) {
      const specs = [...managementSetupCommands(kind, 'a'.repeat(24)), ...managementCommands(kind, 'a'.repeat(24))];
      for (const { label, argv } of specs) {
        let command = createProgram();
        let index = 0;
        while (index < argv.length && !argv[index].startsWith('-')) {
          const child = command.commands.find((item: Command) => item.name() === argv[index]);
          if (!child) break;
          command = child;
          index += 1;
        }
        expect(index, label).toBeGreaterThan(0);
        // parseOptions only parses tokens: no action/preAction, credential or platform work.
        const parsed = command.parseOptions(argv.slice(index));
        expect(parsed.unknown, `${kind}/${label}`).toEqual([]);
      }
    }
  });
});
