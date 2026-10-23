/** Installed C03 loopback only: no recovery filesystem faults are enabled. */
import { realpathSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { loadRecoveryControl, recoveryTrace } from './collection-recovery-control.mjs';
import { installCollectionLocalTransport } from './collection-local-transport.mjs';
import { itemRouteAllowed } from './collection-items-control.mjs';
const config = loadRecoveryControl();
if (config.fault !== 'none' || realpathSync(process.cwd()) !== config.cwd) throw new Error('Invalid C03 fault/cwd; CLI execution forbidden.');
installCollectionLocalTransport(config, itemRouteAllowed);
syncBuiltinESMExports();
recoveryTrace(config, { event: 'ready', guard: 'collection-items-local-v1' });
process.once('exit', () => recoveryTrace(config, { event: 'finished' }));
