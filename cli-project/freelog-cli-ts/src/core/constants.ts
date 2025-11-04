import { Environment } from '../types';

export const ENVIRONMENT = {
  development: { apiUrl: 'http://api.testfreelog.com', webUrl: 'http://testfreelog.com' },
  production: { apiUrl: 'https://api.freelog.com', webUrl: 'https://freelog.com' }
};

export function getCurrentEnv(): Environment {
  return (process.env.FREELOG_ENV as Environment) || 'production';
}

export function getApiBaseURL(): string {
  return ENVIRONMENT[getCurrentEnv()].apiUrl;
}

export const API_CONFIG = {
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
};

export const AUTH_FILE = { global: '.freelog-auth', workspace: '.freelog-auth' };
export const CONFIG_FILE = 'freelog.json';
export const CRYPTO_KEY = process.env.FREELOG_CRYPTO_KEY || 'freelog-cli-secret-key-32chars';
export const CRYPTO_IV = process.env.FREELOG_CRYPTO_IV || '16-chars-iv-key';

