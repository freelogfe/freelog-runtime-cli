/** Synthetic read-only identity. Never import, inspect or delete a host credential. */
import { loadRecoveryControl, recoveryKey, recoveryTrace } from './collection-recovery-control.mjs';

const config = loadRecoveryControl();
recoveryTrace(config, { event: 'keyring-replaced' });
export class Entry {
  constructor(service, account) {
    if (service !== 'freelog-runtime-cli' || account !== recoveryKey) {
      recoveryTrace(config, { event: 'blocked', kind: 'keyring-identity' });
      throw new Error('Unexpected synthetic credential identity.');
    }
  }
  getPassword() {
    recoveryTrace(config, { event: 'keyring-get' });
    return JSON.stringify({ schemaVersion: 1, token: 'local-recovery-synthetic-token' });
  }
  setPassword() { this.forbidden(); }
  deleteCredential() { this.forbidden(); }
  forbidden() {
    recoveryTrace(config, { event: 'blocked', kind: 'keyring-write' });
    throw new Error('Credential writes are forbidden in local recovery acceptance.');
  }
}
