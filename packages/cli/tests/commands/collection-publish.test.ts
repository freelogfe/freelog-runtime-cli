import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionPublishCommand } from '../../src/commands/collection/publish';
import * as publishing from '../../src/domain/collection/publish';
import { createProgram } from '../../src/bin/program';
import { resetEnvForTests } from '../../src/domain/env';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const roots: string[] = [];
function transactionFixture() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-resume-entry-'));
  roots.push(cwd); mkdirSync(path.join(cwd, '.freelog'));
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  writeFileSync(path.join(cwd, '.freelog/.sequence'), '1\n');
  writeFileSync(path.join(cwd, '.freelog/.txn.json'), JSON.stringify({ schemaVersion: 1, entries: [{
    path: '.sequence', before: '1\n', beforeSha256: hash('1\n'), after: '2\n', afterSha256: hash('2\n'),
  }] }));
  writeFileSync(path.join(cwd, 'keep.bin'), Buffer.from([0xff, 0, 0xfe]));
  return cwd;
}
function snapshot(cwd: string) {
  const result: Record<string, string | null> = {};
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name), key = path.relative(cwd, file);
      if (entry.isDirectory()) { result[key] = null; visit(file); }
      else result[key] = readFileSync(file).toString('base64');
    }
  };
  visit(cwd); return result;
}

describe('合集恢复命令的显式收尾边界', () => {
  afterEach(() => {
    vi.restoreAllMocks(); resetEnvForTests();
    for (const root of roots.splice(0)) {
      expect(path.dirname(root)).toBe(tmpdir()); expect(path.basename(root)).toMatch(/^freelog-resume-entry-/u);
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each([false, true])('resume apply=%s原样传递意图，yes不隐式变apply', async (apply) => {
    const inspect = vi.spyOn(publishing, 'inspectCollectionPublishIntent').mockResolvedValue({ schemaVersion: 1, verification: 'confirmed', applied: apply });
    const publish = vi.spyOn(publishing, 'publishCollection').mockResolvedValue({});
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createCollectionPublishCommand().parseAsync(['resume', '--cwd', process.cwd(), '--resource', 'id:collection_1', '--yes', ...(apply ? ['--apply'] : [])], { from: 'user' });
    expect(inspect).toHaveBeenCalledWith({ cwd: process.cwd(), selector: 'id:collection_1', apply: apply || undefined, yes: true });
    expect(publish).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual({ schemaVersion: 1, verification: 'confirmed', applied: apply });
  });

  it.each([false, true])('完整CLI默认resume yes=%s不在全局hook前滚事务', async (yes) => {
    const cwd = transactionFixture(), before = snapshot(cwd);
    let atDomain: ReturnType<typeof snapshot> | undefined;
    const inspect = vi.spyOn(publishing, 'inspectCollectionPublishIntent').mockImplementation(async () => {
      atDomain = snapshot(cwd); return { schemaVersion: 1, verification: 'confirmed', applied: false };
    });
    const publish = vi.spyOn(publishing, 'publishCollection').mockResolvedValue({});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await createProgram().parseAsync(['collection', 'publish', 'resume', '--cwd', cwd, '--resource', 'id:collection_1', '--env', 'test', ...(yes ? ['--yes'] : [])], { from: 'user' });
    expect(inspect).toHaveBeenCalledTimes(1); expect(publish).not.toHaveBeenCalled();
    expect(atDomain).toEqual(before); expect(snapshot(cwd)).toEqual(before);
    expect(existsSync(path.join(cwd, '.freelog/.lock'))).toBe(false);
  });

  it('完整CLI apply缺yes在领域校验前也不能前滚事务', async () => {
    const cwd = transactionFixture(), before = snapshot(cwd);
    await expect(createProgram().parseAsync(['collection', 'publish', 'resume', '--cwd', cwd, '--resource', 'id:collection_1', '--env', 'test', '--apply'], { from: 'user' }))
      .rejects.toMatchObject({ code: 'COLLECTION_RECOVER_NEED_YES' });
    expect(snapshot(cwd)).toEqual(before);
  });

  it('普通collection publish仍经过通用事务门禁而非被resume豁免', async () => {
    const cwd = transactionFixture();
    let atDomain: string | undefined;
    const publish = vi.spyOn(publishing, 'publishCollection').mockImplementation(async () => {
      atDomain = readFileSync(path.join(cwd, '.freelog/.sequence'), 'utf8'); return {};
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await createProgram().parseAsync(['collection', 'publish', '--cwd', cwd, '--resource', 'id:collection_1', '--env', 'test', '--yes'], { from: 'user' });
    expect(publish).toHaveBeenCalledTimes(1); expect(atDomain).toBe('2\n');
    expect(existsSync(path.join(cwd, '.freelog/.txn.json'))).toBe(false);
  });

  it('其它祖先路径下同名resume不能获得合集恢复豁免', async () => {
    const cwd = transactionFixture(), program = createProgram();
    let atAction: string | undefined;
    program.commands.find((command) => command.name() === 'resource')!.command('resume')
      .action(() => { atAction = readFileSync(path.join(cwd, '.freelog/.sequence'), 'utf8'); });
    await program.parseAsync(['resource', 'resume', '--cwd', cwd, '--env', 'test'], { from: 'user' });
    expect(atAction).toBe('2\n'); expect(existsSync(path.join(cwd, '.freelog/.txn.json'))).toBe(false);
  });
});
