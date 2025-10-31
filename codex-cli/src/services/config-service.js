import { DEFAULT_CONFIG_FILE } from '../constants/paths.js';
import { readJson, writeJson, pathExists } from '../utils/fs.js';
import { DEFAULT_FREELOG_CONFIG } from '../config/default-config.js';

export async function loadFreelogConfig({ path: filePath = DEFAULT_CONFIG_FILE, ensure = true } = {}) {
  const exists = await pathExists(filePath);
  if (!exists) {
    if (!ensure) {
      return null;
    }
    const initial = JSON.parse(JSON.stringify(DEFAULT_FREELOG_CONFIG));
    await writeJson(filePath, initial);
    return initial;
  }
  const config = await readJson(filePath);
  validateConfig(config);
  return config;
}

export async function saveFreelogConfig(config, { path: filePath = DEFAULT_CONFIG_FILE } = {}) {
  validateConfig(config);
  config.meta = {
    ...(config.meta ?? {}),
    updatedAt: new Date().toISOString()
  };
  await writeJson(filePath, config);
  return config;
}

export async function ensureFreelogConfig({ path: filePath = DEFAULT_CONFIG_FILE } = {}) {
  const exists = await pathExists(filePath);
  if (!exists) {
    await writeJson(filePath, DEFAULT_FREELOG_CONFIG);
  }
  return loadFreelogConfig({ path: filePath, ensure: true });
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('freelog.json 内容无效。');
  }
  if (!config.local || typeof config.local !== 'object') {
    throw new Error('freelog.json 缺少 local 配置。');
  }
  if (!config.resource || typeof config.resource !== 'object') {
    throw new Error('freelog.json 缺少 resource 配置。');
  }
  if (!Array.isArray(config.dependencies)) {
    config.dependencies = [];
  }
  if (!config.changelog || typeof config.changelog !== 'object') {
    config.changelog = {};
  }
  return true;
}
