import { forbidAccountOperation, accountKeyringReplaced } from './account-preload.mjs';
accountKeyringReplaced();
export class Entry {
  constructor() { forbidAccountOperation('credential'); }
  getPassword() { forbidAccountOperation('credential'); }
  setPassword() { forbidAccountOperation('credential'); }
  deleteCredential() { forbidAccountOperation('credential'); }
}
