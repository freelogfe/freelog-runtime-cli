/** Owned collection test workspace/process helpers; no producer entry point or acceptance verdict. */
import { spawn } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const loader = new URL('./collection-recovery-loader.mjs', import.meta.url).href;
const preload = new URL('./collection-items-preload.mjs', import.meta.url).href;

export function itemWorkspaceSnapshot(cwd) {
  const entries = [];
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name), stat = lstatSync(file), relative = path.relative(cwd, file).split(path.sep).join('/');
      if (stat.isSymbolicLink()) throw new Error('Unexpected symlink in owned item workspace.');
      if (stat.isDirectory()) { entries.push({ path: relative, kind: 'directory' }); walk(file); }
      else if (stat.isFile()) entries.push({ path: relative, kind: 'file', bytes: readFileSync(file).toString('base64') });
      else throw new Error('Unexpected special file in owned item workspace.');
    }
  }
  walk(cwd); return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function itemChildEnvironment(env, controls, control) {
  const inherited = Object.fromEntries(Object.entries(env).filter(([key, value]) =>
    /^(?:PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|LANG|LC_ALL|TZ)$/iu.test(key) && typeof value === 'string'));
  const home = path.join(controls, 'home');
  return { ...inherited, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, XDG_CONFIG_HOME: home,
    NODE_OPTIONS: '', FREELOG_ENV: 'dev', NO_COLOR: '1', FREELOG_TEST_RECOVERY_CONTROL: control };
}

export function itemChildExecute(installed, argv, cwd, env, entryPreload = preload) {
  return new Promise((resolve) => {
    let child, timer, forced, settled = false, error = null, timedOut = false, count = 0;
    const out = [], err = [];
    const finish = (status, signal) => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(forced);
      resolve({ childPid: Number.isSafeInteger(child?.pid) ? child.pid : null,
        result: { status, signal: signal ?? null, error, timedOut, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') } });
    };
    const stop = (reason) => { error ??= reason; child?.kill('SIGKILL'); forced ??= setTimeout(() => finish(null, 'SIGKILL'), 2000); };
    try {
      child = spawn(process.execPath, ['--no-warnings', '--experimental-loader', loader, '--import', entryPreload, installed.cliBin, ...argv],
        { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      const collect = (target) => (chunk) => {
        count += chunk.length; if (count <= 1_000_000) target.push(Buffer.from(chunk)); else stop('Item child output limit exceeded.');
      };
      child.stdout.on('data', collect(out)); child.stderr.on('data', collect(err));
      child.once('error', (e) => { error = `Item child spawn failed: ${e.code ?? 'UNKNOWN'}`; });
      child.once('close', finish);
      timer = setTimeout(() => { timedOut = true; stop('Item child exceeded 20 second deadline.'); }, 20_000);
    } catch { error = 'Item child could not start.'; finish(null, null); }
  });
}
