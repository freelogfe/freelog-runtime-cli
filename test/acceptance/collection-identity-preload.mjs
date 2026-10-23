/** Existing isolated transport/keyring, with only the C01 route family enabled. */
import { realpathSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { loadRecoveryControl, recoveryTrace } from './collection-recovery-control.mjs';
import { installCollectionLocalTransport } from './collection-local-transport.mjs';
import { identityRouteAllowed } from './collection-identity-control.mjs';
const config = loadRecoveryControl();
if (config.fault !== 'none' || realpathSync(process.cwd()) !== config.cwd) throw new Error('Invalid C01 fault/cwd; CLI forbidden.');
installCollectionLocalTransport(config, identityRouteAllowed); syncBuiltinESMExports();
recoveryTrace(config, { event: 'ready', guard: 'collection-identity-local-v1' });
process.once('exit', () => recoveryTrace(config, { event: 'finished' }));
