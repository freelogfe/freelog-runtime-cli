/** Owned C08 instrumentation: actual intent persistence, no change to the installed CLI. */
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { loadRecoveryControl, recoveryRouteAllowed, recoveryTrace } from './collection-recovery-control.mjs';
import { installCollectionLocalTransport } from './collection-local-transport.mjs';
const config = loadRecoveryControl();
if (config.fault !== 'none' || fs.realpathSync(process.cwd()) !== config.cwd) throw new Error('Invalid owned C08 control; CLI forbidden.');
installCollectionLocalTransport(config, recoveryRouteAllowed);
const intentFile = path.join(config.cwd, '.freelog/collection-forms/intents/local_collection.json');
const rename = fs.renameSync;
fs.renameSync = function observeIntent(source, destination) {
  const result = rename(source, destination);
  if (destination === intentFile) recoveryTrace(config, { event: 'intent-persisted', at: new Date().toISOString(), bytes: fs.readFileSync(intentFile).toString('base64') });
  return result;
};
syncBuiltinESMExports();
recoveryTrace(config, { event: 'ready', guard: 'collection-publish-preflight-local-v1' });
process.once('exit', () => recoveryTrace(config, { event: 'finished' }));
