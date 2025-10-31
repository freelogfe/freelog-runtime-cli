import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

let loaded = false;
const envCache = {};

export function loadEnv() {
  if (loaded) {
    return envCache;
  }
  loaded = true;
  loadDotenv({
    path: path.resolve(process.cwd(), '.env'),
    override: false
  });
  envCache.FREELOG_API_BASE_URL = process.env.FREELOG_API_BASE_URL || 'https://api.freelog.com';
  envCache.FREELOG_API_TIMEOUT = Number.parseInt(process.env.FREELOG_API_TIMEOUT ?? '15000', 10);
  envCache.FREELOG_CLI_OFFLINE = process.env.FREELOG_CLI_OFFLINE === '1';
  envCache.FREELOG_CLI_NO_SPINNER = process.env.FREELOG_CLI_NO_SPINNER === '1';
  envCache.FREELOG_UPLOAD_ENDPOINT =
    process.env.FREELOG_UPLOAD_ENDPOINT || '/v2/storages/files/upload';
  envCache.FREELOG_LOGIN_ENDPOINT =
    process.env.FREELOG_LOGIN_ENDPOINT || '/v2/passport/login';
  envCache.FREELOG_LOGOUT_ENDPOINT =
    process.env.FREELOG_LOGOUT_ENDPOINT || '/v2/passport/logout';
  envCache.FREELOG_DEPENDENCY_ENDPOINT =
    process.env.FREELOG_DEPENDENCY_ENDPOINT || '/v2/resources';
  envCache.FREELOG_TEMPLATE_ENDPOINT =
    process.env.FREELOG_TEMPLATE_ENDPOINT || '/v2/templates';
  return envCache;
}

export function getEnv(key) {
  if (!loaded) {
    loadEnv();
  }
  return envCache[key];
}
