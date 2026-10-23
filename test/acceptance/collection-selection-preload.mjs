/** Actual PTY child remains within its exact owned control and selection route family. */
import { realpathSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { loadRecoveryControl, recoveryTrace } from './collection-recovery-control.mjs';
import { installCollectionLocalTransport } from './collection-local-transport.mjs';
import { selectionRouteAllowed } from './collection-selection-control.mjs';
const config = loadRecoveryControl();
if (config.fault !== 'none' || realpathSync(process.cwd()) !== config.cwd) throw new Error('Invalid selection fault/cwd; CLI forbidden.');
installCollectionLocalTransport(config, selectionRouteAllowed); syncBuiltinESMExports();
recoveryTrace(config, { event: 'ready', guard: 'collection-selection-local-v1' });
process.once('exit', () => recoveryTrace(config, { event: 'finished' }));
