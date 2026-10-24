/** Guards current local account string-path sync calls, not arbitrary filesystem APIs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { syncBuiltinESMExports } from 'node:module';
import './deny-network.mjs';

const work = process.env.FREELOG_TEST_ACCOUNT_WORK;
const trace = process.env.FREELOG_TEST_ACCOUNT_TRACE;
const mode = process.env.FREELOG_TEST_ACCOUNT_MODE;
const temporary = fs.realpathSync(os.tmpdir());
const physical = (file, directory) => typeof file === 'string' && path.isAbsolute(file) && path.resolve(file) === file
  && fs.realpathSync(file) === file && !fs.lstatSync(file).isSymbolicLink()
  && (directory ? fs.lstatSync(file).isDirectory() : fs.lstatSync(file).isFile());
if (!['logout', 'selector'].includes(mode) || !physical(work, true) || path.dirname(work) !== temporary || !path.basename(work).startsWith('freelog-command-parameters-')
  || !physical(trace, false) || path.dirname(path.dirname(trace)) !== temporary
  || !path.basename(path.dirname(trace)).startsWith('freelog-command-controls-')) {
  throw new Error('Invalid owned account boundary; CLI execution forbidden.');
}
const home = path.join(path.dirname(trace), 'home');
if (!physical(home, true) || os.homedir() !== home) throw new Error('Account HOME is not isolated.');
const record = (event) => fs.appendFileSync(trace, `${JSON.stringify({ schemaVersion: 1, ...event })}\n`);
let blocked = 0;
export function forbidAccountOperation(kind) {
  blocked += 1; record({ event: 'blocked', kind });
  throw new Error('Forbidden operation in isolated account validation.');
}
export function accountKeyringReplaced() { record({ event: 'keyring-replaced' }); }
const selector = (file) => typeof file === 'string' && ['auth', 'auth-default.json'].includes(path.basename(file));
const read = fs.readFileSync;
fs.readFileSync = function (file, ...args) {
  if (selector(file)) {
    if (mode !== 'selector') forbidAccountOperation('selector-read');
    const resolved = path.resolve(file);
    const root = resolved === path.join(work, '.freelog/auth') ? 'work'
      : resolved === path.join(home, '.freelog/auth-default.json') ? 'home' : null;
    if (!root || !physical(resolved, false)) forbidAccountOperation('outside-selector-read');
    record({ event: 'selector-read', root, path: path.relative(root === 'work' ? work : home, resolved).split(path.sep).join('/') });
  }
  return read.call(this, file, ...args);
};
const unlink = fs.unlinkSync;
fs.unlinkSync = function (file) {
  const resolved = typeof file === 'string' ? path.resolve(file) : '';
  const root = [work, home].find((base) => resolved.startsWith(`${base}${path.sep}`));
  if (mode !== 'logout' || !root || !physical(path.dirname(resolved), true) || !physical(resolved, false)) forbidAccountOperation('outside-unlink');
  record({ event: 'unlink', root: root === work ? 'work' : 'home', path: path.relative(root, resolved).split(path.sep).join('/') });
  return unlink.call(this, file);
};
const load = Module._load;
Module._load = function (request, ...args) {
  if (typeof request === 'string' && /(?:@napi-rs[/\\]keyring|keyring.*\.node)/u.test(request)) forbidAccountOperation('native-keyring');
  return load.call(this, request, ...args);
};
syncBuiltinESMExports();
record({ event: 'ready', guard: mode === 'logout' ? 'logout-local-boundary-v1' : 'account-selector-boundary-v1' });
process.once('exit', () => record({ event: 'finished', blocked }));
