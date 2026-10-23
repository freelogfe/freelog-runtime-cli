/** Native keyring is replaced before import, not after loading its native binding. */
import { loadRecoveryControl, recoveryTrace } from './collection-recovery-control.mjs';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@napi-rs/keyring') return { url: new URL('./collection-recovery-keyring.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('@napi-rs/keyring')) {
    recoveryTrace(loadRecoveryControl(), { event: 'blocked', kind: 'native-keyring-esm' });
    throw new Error('Native keyring subpaths are forbidden in local recovery acceptance.');
  }
  return nextResolve(specifier, context);
}
