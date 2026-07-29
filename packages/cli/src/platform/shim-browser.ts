/**
 * @freelog/tools-lib 顶层会读 window（Request 跳转 / i18n / 部分 Tool）。
 * 必须在任何 tools-lib import 之前执行。
 *
 * 域名后缀对齐源码 domain.ts：
 *   prod → .freelog.cn · test → .testfreelog.com · dev → .devfreelog.com
 */

export type ShimEnv = 'production' | 'test' | 'dev';

interface WindowLike {
  location: {
    hostname: string;
    origin: string;
    href: string;
    protocol: string;
    host: string;
    replace: (url: string) => void;
  };
  localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
}

interface DocumentLike {
  cookie: string;
}

const HOST: Record<ShimEnv, string> = {
  production: 'console.freelog.cn',
  test: 'console.testfreelog.com',
  dev: 'console.devfreelog.com',
};

const memoryStore = new Map<string, string>();

function ensureGlobals(): WindowLike {
  const g = globalThis as typeof globalThis & {
    window?: WindowLike;
    document?: DocumentLike;
  };

  if (!g.window) {
    const hostname = HOST.production;
    const origin = `https://${hostname}`;
    g.window = {
      location: {
        hostname,
        origin,
        href: `${origin}/`,
        protocol: 'https:',
        host: hostname,
        replace: () => {
          /* CLI：禁止页面跳转 */
        },
      },
      localStorage: {
        getItem: (key) => memoryStore.get(key) ?? null,
        setItem: (key, value) => {
          memoryStore.set(key, value);
        },
        removeItem: (key) => {
          memoryStore.delete(key);
        },
      },
    };
  }

  if (!g.document) {
    g.document = { cookie: '' };
  }

  (globalThis as { window: WindowLike }).window = g.window;
  return g.window;
}

ensureGlobals();

/** 与 CLI `--test` / FREELOG_ENV 同步，供未 patch 的 Domain 辅助读取 */
export function syncShimEnv(env: ShimEnv): void {
  const win = ensureGlobals();
  const hostname = HOST[env];
  const origin = `https://${hostname}`;
  win.location.hostname = hostname;
  win.location.host = hostname;
  win.location.origin = origin;
  win.location.href = `${origin}/`;
}
