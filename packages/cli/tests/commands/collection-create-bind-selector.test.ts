import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createProgram } from '../../src/bin/program';
import * as creation from '../../src/domain/collection/create';
import * as binding from '../../src/domain/collection/bind';
import { resetEnvForTests } from '../../src/domain/env';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); resetEnvForTests();
  for (const root of roots.splice(0)) {
    expect(path.dirname(root)).toBe(realpathSync(tmpdir()));
    expect(path.basename(root)).toMatch(/^freelog-selector-reject-/u);
    rmSync(root, { recursive: true, force: true });
  }
});
function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else result[path.relative(root, file)] = readFileSync(file).toString('base64');
    }
  }
  visit(root); return result;
}
for (const command of ['create', 'bind']) for (const level of ['root', 'group', 'leaf']) {
  it.each(['id:collection_1', ''])(`${command} refuses ${level} --resource=%j before transaction recovery`, async (selector) => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-selector-reject-')));
    roots.push(cwd); mkdirSync(path.join(cwd, '.freelog'));
    const hash = (s: string) => createHash('sha256').update(s).digest('hex');
    writeFileSync(path.join(cwd, '.freelog/.sequence'), '1\n');
    writeFileSync(path.join(cwd, '.freelog/.txn.json'), JSON.stringify({ schemaVersion: 1, entries: [{
      path: '.sequence', before: '1\n', beforeSha256: hash('1\n'), after: '2\n', afterSha256: hash('2\n'),
    }] }));
    const before = snapshot(cwd);
    const create = vi.spyOn(creation, 'createCollection').mockResolvedValue({} as never);
    const bind = vi.spyOn(binding, 'bindCollection').mockResolvedValue({} as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const flag = ['--resource', selector];
    const argv = [...(level === 'root' ? flag : []), 'collection', ...(level === 'group' ? flag : []),
      command, ...(command === 'bind' ? ['id:online_collection'] : []), ...(level === 'leaf' ? flag : []),
      '--env', 'dev', '--cwd', cwd];
    await expect(createProgram().parseAsync(argv, { from: 'user' }))
      .rejects.toMatchObject({ code: 'COLLECTION_RESOURCE_NOT_SUPPORTED' });
    expect(create).not.toHaveBeenCalled(); expect(bind).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
    expect(readdirSync(path.join(cwd, '.freelog')).sort()).toEqual(['.sequence', '.txn.json']);
  });
}
