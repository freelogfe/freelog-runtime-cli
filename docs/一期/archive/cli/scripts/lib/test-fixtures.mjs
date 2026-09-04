/** 读取本地测试 fixture（如 frozenResourceId），不提交 git。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '../../../../test/.freelog-test-fixtures.local.json');

export function loadTestFixtures() {
  if (!fs.existsSync(fixturePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

export function resolveFrozenResourceId(env = process.env.FREELOG_TEST_ENV?.trim() || 'dev') {
  const fromEnv = process.env.FREELOG_TEST_FROZEN_RESOURCE_ID?.trim();
  if (fromEnv) return fromEnv;
  const fixtures = loadTestFixtures();
  if (fixtures?.frozenResourceId?.trim() && (!fixtures.env || fixtures.env === env)) {
    return fixtures.frozenResourceId.trim();
  }
  return null;
}

export { fixturePath as testFixturesPath };
