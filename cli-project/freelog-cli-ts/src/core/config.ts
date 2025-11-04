import fs from 'fs-extra';
import path from 'path';
import { FreelogConfig } from '../types';
import { CONFIG_FILE } from './constants';

export function getConfigPath(dir: string = process.cwd()): string {
  return path.join(dir, CONFIG_FILE);
}

export function readConfig(dir: string = process.cwd(), required: boolean = false): FreelogConfig {
  const configPath = getConfigPath(dir);
  if (!fs.existsSync(configPath)) {
    if (required) throw new Error(`配置文件不存在: ${configPath}`);
    return {} as FreelogConfig;
  }
  return fs.readJsonSync(configPath) as FreelogConfig;
}

export function saveConfig(config: FreelogConfig, dir: string = process.cwd()): void {
  fs.writeJsonSync(getConfigPath(dir), config, { spaces: 2 });
}

export function updateConfig(updates: Partial<FreelogConfig>, dir: string = process.cwd()): FreelogConfig {
  const config = readConfig(dir);
  const newConfig = { ...config, ...updates };
  saveConfig(newConfig, dir);
  return newConfig;
}

