#!/usr/bin/env node
/**
 * 离线场景子集（OFF-*）：无 API，供 CI linux 矩阵。用法：node scripts/verify-scenarios-offline.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHarness, cliRoot } from './lib/verify-harness.mjs';

const h = createHarness('dev');
const { pass, fail, runCli, parseJson, summarize, assertCliBuilt } = h;

console.log('\n=== 离线场景验证 (OFF-*) ===\n');
assertCliBuilt();

try {
  execSync(
    'pnpm exec vitest run tests/initFiveChoice.test.ts tests/p2Engineering.test.ts tests/batchImportRobustness.test.ts tests/authAndDebug.test.ts',
    { cwd: cliRoot, stdio: 'pipe', encoding: 'utf8' },
  );
  pass('OFF-01 核心单元子集', 'vitest');
} catch (e) {
  fail('OFF-01 核心单元子集', e.stdout?.slice(-200) || e.message);
}

try {
  const help = runCli('--help', { includeEnv: false });
  if (help.includes('init') && help.includes('resource') && help.includes('collection')) {
    pass('OFF-02 顶层命令面');
  } else {
    fail('OFF-02 顶层命令面');
  }
  runCli('init theme --help', { includeEnv: false });
  pass('OFF-02 init theme --help');
} catch (e) {
  fail('OFF-02 命令面', e.message);
}

const p2Root = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-off-p2-'));
try {
  const cfgInit = parseJson(runCli('config init --default-env dev --json', { cwd: p2Root }));
  if (cfgInit.ok !== false) pass('OFF-03 config init');
  else fail('OFF-03 config init', JSON.stringify(cfgInit).slice(0, 120));

  parseJson(runCli('policy init --json', { cwd: p2Root }));
  pass('OFF-03 policy init');

  parseJson(runCli('dep init-auth-map --json', { cwd: p2Root }));
  pass('OFF-03 dep init-auth-map');

  const wsApp = path.join(p2Root, 'apps', 'demo');
  fs.mkdirSync(wsApp, { recursive: true });
  fs.writeFileSync(
    path.join(wsApp, 'freelog.manifest.json'),
    JSON.stringify({ subject: 'resource', identity: { name: 'off-demo' } }),
    'utf8',
  );
  const ws = parseJson(runCli('workspace list --json', { cwd: p2Root }));
  if (ws.projects?.length >= 1) pass('OFF-03 workspace list', `${ws.projects.length} 项`);
  else fail('OFF-03 workspace list');
} catch (e) {
  fail('OFF-03 工程化离线', e.message);
} finally {
  fs.rmSync(p2Root, { recursive: true, force: true });
}

process.exit(summarize('OFF 汇总') ? 1 : 0);
