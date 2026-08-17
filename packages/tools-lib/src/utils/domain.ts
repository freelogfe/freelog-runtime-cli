import { getPlatform } from '../platform/runtime';
import type { EnvType } from '../platform/types';

export type { EnvType };

const ENV_SUFFIX: Record<EnvType, string> = {
  prod: '.freelog.cn',
  dev: '.devfreelog.com',
  test: '.testfreelog.com',
};

export const STATIC_ORIGIN = 'https://static.freelog.cn';
export const IMAGE_ORIGIN = 'https://image.freelog.cn';

/**
 * 从当前 hostname 解析与 api/www/user 同环的根域后缀（含前导点）。
 * 例：www.freelog.cn → .freelog.cn；未匹配（如 localhost）→ .testfreelog.com
 */
function publicSuffixFromHostname(hostname: string): string {
  const h = hostname.toLowerCase();
  const m = h.match(/^(?:.*\.)?(testfreelog\.com|devfreelog\.com|freelog\.cn)$/);
  if (!m) {
    return ENV_SUFFIX.test;
  }
  return `.${m[1]}`;
}

function envFromPublicSuffix(suffix: string): EnvType {
  if (suffix === ENV_SUFFIX.prod) return 'prod';
  if (suffix === ENV_SUFFIX.dev) return 'dev';
  return 'test';
}

/** api / www / user 等与当前访问域名同环的公网后缀 */
export function getHostMatchedPublicSuffix(): string {
  const platform = getPlatform();
  const hostname = platform.getHostname?.();
  if (hostname) return publicSuffixFromHostname(hostname);
  return ENV_SUFFIX[platform.getEnv()];
}

export function getCurrentEnv(): EnvType {
  const platform = getPlatform();
  const hostname = platform.getHostname?.();
  if (hostname) return envFromPublicSuffix(publicSuffixFromHostname(hostname));
  return platform.getEnv();
}

export function isProdEnv(): boolean {
  return getCurrentEnv() === 'prod';
}

export function isDevEnv(): boolean {
  return getCurrentEnv() === 'dev';
}

export function isTestEnv(): boolean {
  return getCurrentEnv() === 'test';
}

export function getEnvSuffix(env?: EnvType): string {
  if (env !== undefined) {
    return ENV_SUFFIX[env];
  }
  return getHostMatchedPublicSuffix();
}

/**
 * 根据域名获取完整的 URL
 * @param domain 域名
 * @returns 完整的 URL
 */
export function completeUrlByDomain(domain: string): string {
  if (domain === 'image') return IMAGE_ORIGIN;
  if (domain === 'static') return STATIC_ORIGIN;
  const platform = getPlatform();
  const hostname = platform.getHostname?.();
  const suffix = hostname ? publicSuffixFromHostname(hostname) : ENV_SUFFIX[platform.getEnv()];
  return `https://${domain}${suffix}`;
}

export function getMicroAppName(baseName: string): string {
  if (isTestEnv()) return `${baseName}_test`;
  if (isDevEnv()) return `${baseName}_dev`;
  return baseName;
}
