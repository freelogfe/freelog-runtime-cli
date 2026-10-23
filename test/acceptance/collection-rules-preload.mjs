/** Reuse the existing isolated transport/keyring; only C05 routes are admitted. */
import { realpathSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { loadRecoveryControl, recoveryTrace } from './collection-recovery-control.mjs';
import { installCollectionLocalTransport } from './collection-local-transport.mjs';
import { rulesRouteAllowed } from './collection-rules-control.mjs';
const config = loadRecoveryControl();
if (config.fault !== 'none' || realpathSync(process.cwd()) !== config.cwd) throw new Error('Invalid C05 fault/cwd; CLI forbidden.');
installCollectionLocalTransport(config, rulesRouteAllowed); syncBuiltinESMExports();
recoveryTrace(config, { event: 'ready', guard: 'collection-rules-local-v1' });
process.once('exit', () => recoveryTrace(config, { event: 'finished' }));
