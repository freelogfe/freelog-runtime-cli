import { afterEach, beforeEach, vi } from 'vitest';

// Temp home只隔离selector文件，不隔离OS keyring。原生模块须在生产适配器导入前封锁；
// 漏注入或resetModules后恢复默认store时也只能失败，不能读写宿主凭据。
vi.mock('@napi-rs/keyring', () => ({
  Entry: class {
    constructor() { throw new Error('UNIT_NATIVE_CREDENTIAL_ACCESS_FORBIDDEN'); }
  },
}));

let releaseCredentials: (() => void) | undefined;

beforeEach(async () => {
  const { setCredentialStoreForTests } = await import('../src/local/auth');
  const values = new Map<string, string>();
  setCredentialStoreForTests({
    get: (key) => values.get(key),
    set: (key, value) => { values.set(key, value); },
    delete: (key) => values.delete(key),
  });
  // resetModules可创建新auth实例，静态导出的旧实例仍须解除本项Map引用。
  releaseCredentials = () => { values.clear(); setCredentialStoreForTests(); };
});

afterEach(async () => {
  releaseCredentials?.();
  releaseCredentials = undefined;
  const { setCredentialStoreForTests } = await import('../src/local/auth');
  setCredentialStoreForTests();
});
