import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as url from 'node:url';
import { format } from 'node:util';
import vm from 'node:vm';
import test from 'node:test';
import { matchesCommandResult, writeSuiteCases } from '../acceptance/protocol.mjs';
import { fixedTemplateSamples, SampleUnavailableError } from '../acceptance/template-samples.mjs';

const producers = ['run-all-scenarios.mjs', 'verify-commands.mjs', 'verify-collection-policy.mjs', 'verify-policy-template-tty.mjs',
  'verify-scenarios.mjs', 'verify-field-rules.mjs', 'run-resource-pool-scenarios.mjs', 'verify-optional-config.mjs',
  'verify-multi-resource-tty.mjs', 'verify-draft-safety.mjs'];
const dependencyProducers = ['verify-dependency-declarations.mjs', 'verify-collection-dependency-declarations.mjs', 'verify-paid-declaration.mjs'];
const fakePassword = `SYNTHETIC_PRIVATE_${'x'.repeat(1_300)}_END`;
const diagnostic = `unlabelled ${fakePassword}\nAPI query failed: Authorization: Bearer SYNTHETIC_AUTH; Cookie: sid=SYNTHETIC_COOKIE; refresh=SYNTHETIC_REFRESH\npassword marker\n`;
const malformed = '{"primary":{"loginName":"qa","password":                  PW839}}';
const testRoot = url.fileURLToPath(new URL('../', import.meta.url));
const noSecrets = (text, values = ['SYNTHETIC_PRIVATE_', 'SYNTHETIC_AUTH', 'SYNTHETIC_COOKIE', 'SYNTHETIC_REFRESH']) => {
  for (const value of values) assert.equal(String(text).includes(value), false, `Leaked synthetic marker ${value}`);
};

// Node 22 needs this flag for its native VM modules. Root verify can invoke the test normally.
if (!vm.SourceTextModule) {
  test('legacy producer synthetic VM regressions', () => {
    const child = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', url.fileURLToPath(import.meta.url)], {
      encoding: 'utf8', timeout: 60_000, env: { ...process.env, NODE_OPTIONS: '' },
    });
    assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  });
} else {
  async function exercise(file, mode, { reportPath } = {}) {
    const state = { logs: [], files: new Map(), calls: [], reports: [], network: 0, tty: [], exitCode: null, error: null };
    class Exit extends Error { constructor(code) { super(`Synthetic process exit ${code}`); this.code = code; } }
    const cliResult = () => ({ status: 1, signal: null, stdout: '{"code":"SYNTHETIC_FAILURE","message":"failure retained"}', stderr: diagnostic });
    const fs = {
      existsSync: () => true, statSync: () => ({ isFile: () => true, isDirectory: () => false }),
      readFileSync(file) {
        if (path.basename(String(file)) === '.freelog-test-credentials.local.json') {
          if (mode === 'parse') return malformed;
          if (mode === 'read') throw new Error('Synthetic read failure PW839');
          return JSON.stringify({ primary: { loginName: 'qa', password: fakePassword } });
        }
        if (String(file).includes('resource-pool')) return JSON.stringify({ resources: [{ resourceId: 'synthetic-target', resourceName: 'qa/target', resourceTypeCode: 'RT005001' }] });
        if (String(file).includes('optional-config')) return JSON.stringify({ typeCode: 'RT005001', artifact: 'fixtures/media/sample-image.png' });
        if (path.basename(String(file)) === '1.json') return '{"resourceId":"synthetic-source"}';
        return state.files.get(String(file)) ?? 'synthetic fixture';
      },
      writeFileSync(file, value) { state.files.set(String(file), String(value)); },
      appendFileSync(file, value) { state.files.set(String(file), (state.files.get(String(file)) ?? '') + String(value)); },
      mkdirSync() {}, copyFileSync() {}, cpSync() {},
      mkdtempSync: (prefix) => `${prefix}synthetic`, readdirSync: () => [],
      createWriteStream: () => { throw new Error('Synthetic failure test must not create archives'); },
    };
    const spawn = (_command, args, options) => {
      state.calls.push({ args, input: options?.input });
      if (mode === 'throw') throw new Error(diagnostic);
      if (mode === 'pty') {
        const words = args.slice(1);
        let stdout = 'synthetic unchanged policy list';
        if (words.includes('template')) stdout = JSON.stringify({ templates: Array.from({ length: 21 }, (_, n) => ({ id: `t${n}`, parameters: [] })) });
        return { status: 0, signal: null, stdout, stderr: '' };
      }
      return cliResult();
    };
    const proc = {
      argv: ['node', path.join(testRoot, file), '--env', 'dev', '--skip-build'], env: {}, platform: process.platform,
      execPath: process.execPath, cwd: () => path.dirname(testRoot),
      exit(code) { state.exitCode = code; throw new Exit(code); },
      get exitCode() { return state.exitCode; }, set exitCode(code) { state.exitCode = code; },
    };
    const context = vm.createContext({ Buffer, URL, Error, process: proc, console: {
      log: (...args) => state.logs.push(format(...args)), error: (...args) => state.logs.push(format(...args)),
    }, AbortController, setTimeout, clearTimeout,
      fetch: async () => { state.network += 1; throw new Error('Synthetic VM forbids network'); },
    });
    const modules = new Map();
    const synthetic = (key, values) => {
      if (!modules.has(key)) modules.set(key, new vm.SyntheticModule(Object.keys(values), function() {
        for (const [name, value] of Object.entries(values)) this.setExport(name, value);
      }, { context, identifier: key }));
      return modules.get(key);
    };
    const builtins = { 'node:fs': { ...fs, default: fs }, 'node:path': { ...path, default: path },
      'node:os': { tmpdir: () => path.join(path.dirname(testRoot), '.synthetic-unused'), default: { tmpdir: () => path.join(path.dirname(testRoot), '.synthetic-unused') } },
      'node:url': url, 'node:crypto': crypto, 'node:zlib': zlib, 'node:child_process': { spawnSync: spawn },
      'node:module': { createRequire: () => () => () => { throw new Error('Synthetic failure test must not create archives'); } },
    };
    const linker = async (specifier, parent) => {
      if (builtins[specifier]) return synthetic(specifier, builtins[specifier]);
      if (specifier.endsWith('/cli-bin.mjs')) return synthetic('cli-bin', { resolveCliBin: () => '/synthetic-cli.mjs', skipWorkspaceBuild: () => true });
      if (specifier.endsWith('/cleanup.mjs')) return synthetic('cleanup', { cleanupWorkspace: () => undefined });
      if (specifier.endsWith('/template-samples.mjs')) return synthetic('samples', { fixedTemplateSamples, SampleUnavailableError });
      if (specifier.endsWith('/protocol.mjs')) return synthetic('protocol', {
        matchesCommandResult,
        writeSuiteCases(cases) {
          state.reports.push(JSON.parse(JSON.stringify(cases)));
          if (reportPath) writeSuiteCases(cases, reportPath);
        },
      });
      if (specifier.endsWith('/tty-driver.mjs')) return synthetic('tty', {
        probeTty: async () => ({ available: true }),
        runTty: async () => {
          const result = { completed: false, signal: null, status: 1, stdout: diagnostic, stderr: diagnostic, completedSteps: 0, matchedPrompts: [] };
          state.tty.push(result); return result;
        },
      });
      if (specifier.endsWith('/dist/node.mjs')) return synthetic('sdk', { FServiceAPI: {}, FUtil: { configurePlatform() {} } });
      const resolved = new URL(specifier, parent.identifier);
      if (!['evidence-redaction.mjs', 'read-private-json.mjs', 'dependency-declaration-helpers.mjs', 'readback.mjs'].includes(path.basename(resolved.pathname))) throw new Error(`Unexpected synthetic import: ${specifier}`);
      return load(resolved);
    };
    const load = async (location) => {
      if (modules.has(location.href)) return modules.get(location.href);
      let source = readFileSync(location, 'utf8');
      // Await an existing entry promise only so VM failures cannot escape as unhandled rejections.
      if (location.href.endsWith(`/${file}`)) source = source.replace(/\bmain\(\)\.catch\(/u, 'await main().catch(');
      const module = new vm.SourceTextModule(source, { context, identifier: location.href, initializeImportMeta(meta) { meta.url = location.href; } });
      modules.set(location.href, module); await module.link(linker); return module;
    };
    try { await (await load(new URL(`../${file}`, import.meta.url))).evaluate({ timeout: 3_000 }); }
    catch (error) { if (error instanceof Exit) state.exitCode = error.code; else { state.error = error; state.exitCode ??= 1; state.logs.push(String(error.stack ?? error)); } }
    return state;
  }

  for (const file of [...producers, ...dependencyProducers]) for (const mode of ['parse', 'read']) {
    test(`${file}: credential ${mode} failure has a fixed safe boundary, no CLI or network`, async () => {
      const result = await exercise(file, mode);
      assert.notEqual(result.exitCode, 0); assert.notEqual(result.exitCode, null);
      assert.equal(result.calls.length, 0); assert.equal(result.network, 0);
      noSecrets([...result.logs, ...result.files.values(), JSON.stringify(result.reports)].join('\n'), ['PW839']);
      assert.match(result.logs.join('\n') + [...result.files.values()].join('\n'), /凭据.*(?:读取|解析|读取或解析).*失败/u);
      if (result.error) assert.equal(result.error.cause, undefined);
    });
  }
  for (const file of producers) for (const mode of ['output', 'throw']) {
    test(`${file}: ${mode} diagnostic sinks redact before slicing and retain failure`, async () => {
      const result = await exercise(file, mode);
      assert.notEqual(result.exitCode, 0); assert.ok(result.calls.length > 0, result.logs.join('\n')); assert.equal(result.network, 0);
      // verify-commands starts with --help; the other first actions are fake login.
      assert.equal(result.calls[0].input?.trimEnd(), file === 'verify-commands.mjs' ? undefined : fakePassword);
      noSecrets([...result.logs, ...result.files.values(), JSON.stringify(result.reports)].join('\n'));
      assert.ok(!result.reports.some((cases) => cases.some((item) => item.status === 'PASS')));
      for (const contents of result.files.values()) assert.doesNotMatch(contents, /结果: PASS/u);
    });
  }
  test('actual policy TTY failed transcript reason reaches actual suite writer safely, original PTY remains intact', async (t) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-legacy-redaction-quality-')));
    t.after(() => {
      assert.equal(path.dirname(root), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith('freelog-legacy-redaction-quality-'));
      rmSync(root, { recursive: true, force: true });
    });
    const output = path.join(root, 'suite.json');
    const originalRun = process.env.FREELOG_TEST_RUN_ID;
    process.env.FREELOG_TEST_RUN_ID = 'synthetic-legacy-pty';
    let result;
    try { result = await exercise('verify-policy-template-tty.mjs', 'pty', { reportPath: output }); }
    finally { if (originalRun === undefined) delete process.env.FREELOG_TEST_RUN_ID; else process.env.FREELOG_TEST_RUN_ID = originalRun; }
    assert.equal(result.exitCode, 1); assert.equal(result.tty.length, 1); assert.equal(result.network, 0);
    assert.equal(result.tty[0].stdout, diagnostic); assert.equal(result.tty[0].stderr, diagnostic);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.cases[0].status, 'FAIL'); assert.deepEqual(report.cases[0].assertions, []);
    for (const file of readdirSync(root)) noSecrets(readFileSync(path.join(root, file), 'utf8'));
    noSecrets(result.logs.join('\n'));
  });
}
