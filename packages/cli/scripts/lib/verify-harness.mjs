import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliErrorCode, parseCliJson } from './cli-json.mjs';
import { verificationLoginArgs } from './verification-credentials.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const cliRoot = path.resolve(__dirname, '..', '..');
export const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');
export const testPhoto = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');

export function createHarness(env = 'dev') {
  const results = [];

  function pass(name, detail) {
    results.push({ status: 'pass', name, detail });
    console.log(`✔ ${name}${detail ? `: ${detail}` : ''}`);
  }

  function skip(name, detail) {
    results.push({ status: 'skip', name, detail });
    console.log(`○ ${name}${detail ? `: ${detail}` : ''}`);
  }

  function fail(name, detail) {
    results.push({ status: 'fail', name, detail });
    console.error(`✘ ${name}${detail ? `: ${detail}` : ''}`);
  }

  function assertCliBuilt() {
    if (!fs.existsSync(cliBin)) {
      throw new Error('dist/bin/index.js 不存在，请先 pnpm build');
    }
  }

  function runCli(args, opts = {}) {
    assertCliBuilt();
    const envFlag = opts.includeEnv === false ? '' : ` --env ${opts.env || env}`;
    const cmd = `node "${cliBin}" ${args}${envFlag}`;
    return execSync(cmd, {
      cwd: opts.cwd || cliRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FREELOG_DEV: '1', ...(opts.envVars || {}) },
    });
  }

  function runCliExpectFail(args, opts = {}) {
    try {
      const stdout = runCli(args, opts);
      return { failed: false, stdout, stderr: '', exitCode: 0 };
    } catch (error) {
      return {
        failed: true,
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || error.message || '',
        exitCode: typeof error.status === 'number' ? error.status : 1,
      };
    }
  }

  function parseJson(stdout) {
    return parseCliJson(stdout);
  }

  function parseCliErrorJson(text) {
    const start = text.indexOf('{');
    if (start < 0) return null;
    try {
      return parseCliJson(text.slice(start));
    } catch {
      return null;
    }
  }

  function expectFailCode(result, code) {
    const text = `${result.stderr || ''}${result.stdout || ''}`;
    const parsed = parseCliErrorJson(text);
    const errCode = cliErrorCode(parsed);
    if (errCode === code) return true;
    return text.includes(`"code":${code}`) || text.includes(`"code": ${code}`);
  }

  function expectEnvelope(parsed, opts = {}) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.schemaVersion !== 1) return false;
    if (typeof parsed.command !== 'string') return false;
    if (!parsed.meta || typeof parsed.meta !== 'object') return false;
    if (opts.ok === true && parsed.ok !== true) return false;
    if (opts.ok === false && parsed.ok !== false) return false;
    if (opts.ok === false && (!parsed.error || typeof parsed.error !== 'object')) return false;
    if (opts.command && parsed.command !== opts.command) return false;
    return true;
  }

  function loginPrimary() {
    runCli(verificationLoginArgs());
  }

  function copyUniqueFile(src, dest, tag) {
    fs.copyFileSync(src, dest);
    fs.appendFileSync(dest, String(tag));
  }

  function writePolicyFile(filePath) {
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        policyName: '免费',
        policyText: 'for public\r\n\r\ninitial[active]:\r\nterminate\r\n',
        status: 1,
      }),
      'utf8',
    );
  }

  function summarize(title) {
    const failed = results.filter((row) => row.status === 'fail');
    const skipped = results.filter((row) => row.status === 'skip');
    const passed = results.filter((row) => row.status === 'pass');
    console.log(
      `\n=== ${title}: ${passed.length} 通过, ${skipped.length} 跳过, ${failed.length} 失败 (共 ${results.length} 项) ===\n`,
    );
    if (skipped.length) {
      console.log('跳过项：');
      for (const row of skipped) {
        console.log(`  ○ ${row.name}${row.detail ? `: ${row.detail}` : ''}`);
      }
      console.log('');
    }
    return failed.length;
  }

  return {
    env,
    results,
    pass,
    skip,
    fail,
    runCli,
    runCliExpectFail,
    parseJson,
    parseCliErrorJson,
    expectFailCode,
    expectEnvelope,
    loginPrimary,
    copyUniqueFile,
    writePolicyFile,
    summarize,
    assertCliBuilt,
  };
}
