/** Guards logout's current string-path readFileSync/unlinkSync calls, not arbitrary filesystem APIs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { syncBuiltinESMExports } from 'node:module';
import './deny-network.mjs';

const work = process.env.FREELOG_TEST_LOGOUT_WORK;
const trace = process.env.FREELOG_TEST_LOGOUT_TRACE;
const temporary = fs.realpathSync(os.tmpdir());
const physical = (file, directory) => typeof file === 'string' && path.isAbsolute(file) && path.resolve(file) === file
  && fs.realpathSync(file) === file && !fs.lstatSync(file).isSymbolicLink()
  && (directory ? fs.lstatSync(file).isDirectory() : fs.lstatSync(file).isFile());
if (!physical(work, true) || path.dirname(work) !== temporary || !path.basename(work).startsWith('freelog-command-parameters-')
  || !physical(trace, false) || path.dirname(path.dirname(trace)) !== temporary
  || !path.basename(path.dirname(trace)).startsWith('freelog-command-controls-')) {
  throw new Error('Invalid owned logout boundary; CLI execution forbidden.');
}
const home = path.join(path.dirname(trace), 'home');
if (!physical(home, true) || os.homedir() !== home) throw new Error('Logout HOME is not isolated.');
const record = (event) => fs.appendFileSync(trace, `${JSON.stringify({ schemaVersion: 1, ...event })}\n`);
let blocked = 0;
export function forbidLogoutOperation(kind) {
  blocked += 1; record({ event: 'blocked', kind });
  throw new Error('Forbidden operation in isolated logout validation.');
}
export function logoutKeyringReplaced() { record({ event: 'keyring-replaced' }); }
const selector = (file) => typeof file === 'string' && ['auth', 'auth-default.json'].includes(path.basename(file));
const read = fs.readFileSync;
fs.readFileSync = function (file, ...args) {
  if (selector(file)) forbidLogoutOperation('selector-read');
  return read.call(this, file, ...args);
};
const unlink = fs.unlinkSync;
fs.unlinkSync = function (file) {
  const resolved = typeof file === 'string' ? path.resolve(file) : '';
  const root = [work, home].find((base) => resolved.startsWith(`${base}${path.sep}`));
  if (!root || !physical(path.dirname(resolved), true) || !physical(resolved, false)) forbidLogoutOperation('outside-unlink');
  record({ event: 'unlink', root: root === work ? 'work' : 'home', path: path.relative(root, resolved).split(path.sep).join('/') });
  return unlink.call(this, file);
};
const load = Module._load;
Module._load = function (request, ...args) {
  if (typeof request === 'string' && /(?:@napi-rs[/\\]keyring|keyring.*\.node)/u.test(request)) forbidLogoutOperation('native-keyring');
  return load.call(this, request, ...args);
};
syncBuiltinESMExports();
record({ event: 'ready', guard: 'logout-local-boundary-v1' });
process.once('exit', () => record({ event: 'finished', blocked }));
