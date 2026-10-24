/** Reuse isolated transport/keyring with only the S03 subject-1 read routes. */
import { realpathSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { loadRecoveryControl, recoveryTrace } from './collection-recovery-control.mjs';
import { installCollectionLocalTransport } from './collection-local-transport.mjs';
import { typeInitRouteAllowed } from './type-init-control.mjs';
const config = loadRecoveryControl();
if (config.fault !== 'none' || realpathSync(process.cwd()) !== config.cwd) throw new Error('Invalid owned S03 control; CLI forbidden.');
installCollectionLocalTransport(config, typeInitRouteAllowed);
syncBuiltinESMExports();
recoveryTrace(config, { event: 'ready', guard: 'type-init-local-v1' });
process.once('exit', () => recoveryTrace(config, { event: 'finished' }));
