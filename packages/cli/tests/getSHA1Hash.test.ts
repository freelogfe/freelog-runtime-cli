import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getSHA1Hash, getSHA1HashFromBuffer } from '../src/platform/tool/getSHA1Hash.js';

describe('getSHA1Hash', () => {
  it('matches node crypto sha1 hex for same bytes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'freelog-sha1-'));
    const file = path.join(dir, 'a.bin');
    const bytes = Buffer.from('freelog-runtime-cli-sha1-fixture');
    await writeFile(file, bytes);

    const expected = createHash('sha1').update(bytes).digest('hex');
    await expect(getSHA1Hash(file)).resolves.toBe(expected);
    await expect(getSHA1HashFromBuffer(bytes)).resolves.toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{40}$/);
  });
});
