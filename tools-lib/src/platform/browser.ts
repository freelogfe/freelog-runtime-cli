import Cookies from 'js-cookie';
import type { EnvType, LanguageKeyType, PlatformAdapter } from './types';

const ENV_SUFFIX: Record<EnvType, string> = {
  prod: '.freelog.cn',
  dev: '.devfreelog.com',
  test: '.testfreelog.com',
};

function publicSuffixFromHostname(hostname: string): string {
  const h = hostname.toLowerCase();
  const m = h.match(/^(?:.*\.)?(testfreelog\.com|devfreelog\.com|freelog\.cn)$/);
  if (!m) return ENV_SUFFIX.test;
  return `.${m[1]}`;
}

function envFromPublicSuffix(suffix: string): EnvType {
  if (suffix === ENV_SUFFIX.prod) return 'prod';
  if (suffix === ENV_SUFFIX.dev) return 'dev';
  return 'test';
}

function cookieDomain(): string {
  return publicSuffixFromHostname(window.location.hostname);
}

function viewToArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return copy.buffer;
}

async function browserSha1(input: Blob | ArrayBuffer | ArrayBufferView): Promise<string> {
  const buffer =
    input instanceof Blob
      ? await input.arrayBuffer()
      : ArrayBuffer.isView(input)
        ? viewToArrayBuffer(input)
        : input;
  const digest = await self.crypto.subtle.digest('SHA-1', buffer);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
}

function getCookieUserId(): number {
  const uid = document.cookie.split('; ').find((co) => co.startsWith('uid='));
  if (!uid) return -1;
  return Number(uid.replace('uid=', ''));
}

export function createBrowserPlatform(): PlatformAdapter {
  return {
    withCredentials: true,
    getHostname: () => window.location.hostname,
    getEnv: () => envFromPublicSuffix(publicSuffixFromHostname(window.location.hostname)),
    getCurrentHref: () => window.location.href,
    getUserId: getCookieUserId,
    getLocale: () => Cookies.get('locale') as LanguageKeyType | undefined,
    setLocale: (lng) => {
      Cookies.set('locale', lng, {
        expires: 36525,
        domain: cookieDomain(),
      });
    },
    getI18nCache: () => window.localStorage.getItem('i18nextResources'),
    setI18nCache: (json) => window.localStorage.setItem('i18nextResources', json),
    useProdI18nBundle: () => window.location.origin.includes('.freelog.cn'),
    openUrl: (url) => {
      window.location.href = url;
    },
    sha1: browserSha1,
    createFormData: (params) => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          formData.append(key, value as string | Blob);
        }
      }
      return formData;
    },
  };
}
