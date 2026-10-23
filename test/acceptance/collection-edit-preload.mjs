/** Installed C02 edits use synthetic credentials and loopback only, no filesystem faults. */
import {realpathSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {loadRecoveryControl,recoveryTrace} from './collection-recovery-control.mjs';
import {installCollectionLocalTransport} from './collection-local-transport.mjs';
import {editRouteAllowed} from './collection-edit-control.mjs';
const config=loadRecoveryControl();
if(config.fault!=='none'||realpathSync(process.cwd())!==config.cwd)throw new Error('Invalid edit fault/cwd; CLI forbidden.');
installCollectionLocalTransport(config,editRouteAllowed);syncBuiltinESMExports();
recoveryTrace(config,{event:'ready',guard:'collection-edit-local-v1'});process.once('exit',()=>recoveryTrace(config,{event:'finished'}));
