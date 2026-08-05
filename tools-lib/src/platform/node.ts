import { createHash } from 'node:crypto';
import type { EnvType, LanguageKeyType, PlatformAdapter } from './types';

let i18nCache: string | null = null;
let locale: LanguageKeyType = 'zh_CN';

function normalizeEnv(value: string | undefined): EnvType {
  const env = (value || '').toLowerCase();
  if (env === 'prod' || env === 'production') return 'prod';
  if (env === 'dev' || env === 'development') return 'dev';
  return 'test';
}

async function toUint8Array(input: Blob | ArrayBuffer | ArrayBufferView): Promise<Uint8Array> {
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer());
  if (ArrayBuffer.isView(input)) {
    const copy = new Uint8Array(input.byteLength);
    copy.set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
    return copy;
  }
  return new Uint8Array(input);
}

async function nodeSha1(input: Blob | ArrayBuffer | ArrayBufferView): Promise<string> {
  const bytes = await toUint8Array(input);
  return createHash('sha1').update(bytes).digest('hex');
}

function appendFormValue(formData: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  if (value instanceof Blob) {
    formData.append(key, value);
    return;
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes =
      value instanceof ArrayBuffer
        ? value
        : toArrayBuffer(value);
    formData.append(key, new Blob([bytes]));
    return;
  }
  formData.append(key, String(value));
}

function toArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return copy.buffer;
}

export function createNodePlatform(): PlatformAdapter {
  return {
    withCredentials: false,
    getEnv: () => normalizeEnv(process.env.FREELOG_ENV),
    getAuthorization: () => process.env.FREELOG_TOKEN,
    getUserId: () => Number(process.env.FREELOG_UID || -1),
    getLocale: () => locale,
    setLocale: (lng) => {
      locale = lng;
    },
    getI18nCache: () => i18nCache,
    setI18nCache: (json) => {
      i18nCache = json;
    },
    useProdI18nBundle: () => normalizeEnv(process.env.FREELOG_ENV) === 'prod',
    onAuthError: ({ kind, result }) => {
      const error = new Error(`[@freelog/tools-lib] auth error: ${kind}`);
      (error as Error & { result?: any }).result = result;
      throw error;
    },
    onApiError: ({ errCode, result }) => {
      const message =
        result && typeof result === 'object' && 'msg' in result
          ? String((result as { msg?: unknown }).msg || 'API request failed')
          : 'API request failed';
      const error = new Error(message);
      (error as Error & { errCode?: number; result?: any }).errCode = errCode;
      (error as Error & { errCode?: number; result?: any }).result = result;
      throw error;
    },
    sha1: nodeSha1,
    createFormData: (params) => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(params)) {
        appendFormValue(formData, key, value);
      }
      return formData;
    },
  };
}
