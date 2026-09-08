import { Entry } from '@napi-rs/keyring';
import type { CredentialStore } from '../../ports/credential';

/** 稳定服务名；账号由 credentialKey 区分，秘密由操作系统凭据库保护。 */
const SERVICE_NAME = 'freelog-runtime-cli';

function entry(credentialKey: string): Entry {
  return new Entry(SERVICE_NAME, credentialKey);
}

/** Windows Credential Manager / macOS Keychain / Linux Secret Service 的唯一生产实现。 */
export const systemCredentialStore: CredentialStore = {
  get(credentialKey) {
    return entry(credentialKey).getPassword() ?? undefined;
  },
  set(credentialKey, value) {
    entry(credentialKey).setPassword(value);
  },
  delete(credentialKey) {
    return entry(credentialKey).deleteCredential();
  },
};
