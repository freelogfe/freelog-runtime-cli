import axios from 'axios';
import FormData from 'form-data';
import { getEnv } from '../config/env.js';
import { getLogger } from './logger.js';

let client;

async function createClient() {
  const logger = await getLogger();
  const instance = axios.create({
    baseURL: getEnv('FREELOG_API_BASE_URL'),
    timeout: getEnv('FREELOG_API_TIMEOUT'),
    headers: {
      'User-Agent': `Freelog Codex CLI/${process.versions.node}`
    }
  });
  instance.interceptors.request.use((config) => {
    logger.info(`HTTP ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
  });
  instance.interceptors.response.use(
    (response) => {
      logger.info(`HTTP ${response.status} ${response.config.url}`);
      return response;
    },
    (error) => {
      logger.error(
        `HTTP ERROR ${error.response?.status ?? 'unknown'} ${error.config?.url} - ${error.message}`
      );
      return Promise.reject(error);
    }
  );
  return instance;
}

async function getClient() {
  if (!client) {
    client = await createClient();
  }
  return client;
}

export async function httpGet(url, config = {}) {
  const instance = await getClient();
  const response = await instance.get(url, config);
  return response.data;
}

export async function httpPost(url, data, config = {}) {
  const instance = await getClient();
  const response = await instance.post(url, data, config);
  return response.data;
}

export async function getHttpClient() {
  return getClient();
}

export { FormData };
