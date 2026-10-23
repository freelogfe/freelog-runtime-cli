/** Fixed SDK transport bridge and exact local fault points, outside the installed package. */
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { installCollectionLocalTransport } from './collection-local-transport.mjs';
import { loadRecoveryControl, recoveryFaultExit, recoveryResource, recoveryRouteAllowed, recoveryTrace } from './collection-recovery-control.mjs';

const config = loadRecoveryControl();
if (fs.realpathSync(process.cwd()) !== config.cwd) throw new Error('Local recovery cwd differs from its owned control.');
const record = (event) => recoveryTrace(config, event);
installCollectionLocalTransport(config, recoveryRouteAllowed);

const intentFile = path.join(config.cwd, '.freelog/collection-forms/intents', `${recoveryResource}.json`);
const originalRename = fs.renameSync;
fs.renameSync = function faultAfterPersist(source, destination) {
  originalRename(source, destination);
  if (destination === intentFile && ['prepared', 'sending'].includes(config.fault)) {
    const value = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
    if (value.state === config.fault) { record({ event: 'fault', kind: config.fault, exitCode: recoveryFaultExit }); process.exit(recoveryFaultExit); }
  }
};
const originalUnlink = fs.unlinkSync;
fs.unlinkSync = function faultIntentCleanup(file) {
  if (file === intentFile && config.fault === 'cleanup') {
    record({ event: 'fault', kind: 'intent-unlink' });
    const error = new Error('Synthetic exact intent cleanup failure.'); error.code = 'EACCES'; throw error;
  }
  return originalUnlink(file);
};
syncBuiltinESMExports();
record({ event: 'ready', guard: 'collection-recovery-local-v1' });
process.once('exit', () => record({ event: 'finished' }));
