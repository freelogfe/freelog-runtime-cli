import { forbidLogoutOperation, logoutKeyringReplaced } from './logout-preload.mjs';
logoutKeyringReplaced();
export class Entry {
  constructor() { forbidLogoutOperation('credential'); }
  getPassword() { forbidLogoutOperation('credential'); }
  setPassword() { forbidLogoutOperation('credential'); }
  deleteCredential() { forbidLogoutOperation('credential'); }
}
