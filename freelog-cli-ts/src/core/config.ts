import fs from 'fs-extra';
import path from 'path';
import { FreelogConfig } from '../types';
import { CONFIG_FILE } from './constants';

function normalizeDir(dir: string): string {
  return path.resolve(dir);
}

function getEnvConfigPath(): string | undefined {
  const envPath = process.env.FREELOG_CONFIG_PATH;
  return envPath ? path.resolve(envPath) : undefined;
}

function getEnvWorkspaceRoot(): string | undefined {
  const envRoot = process.env.FREELOG_WORKSPACE_ROOT;
  return envRoot ? path.resolve(envRoot) : undefined;
}

function findConfigDirectory(startDir: string): string | null {
  let current = normalizeDir(startDir);
  const root = path.parse(current).root;

  while (true) {
    const candidate = path.join(current, CONFIG_FILE);
    if (fs.existsSync(candidate)) return current;
    if (current === root) break;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

export function findWorkspaceRoot(dir: string = process.cwd()): string | null {
  return getEnvWorkspaceRoot() ?? findConfigDirectory(dir);
}

export function resolveConfigPath(dir: string = process.cwd(), searchExisting = false): string {
  const envPath = getEnvConfigPath();
  if (envPath) return envPath;

  if (searchExisting) {
    const locatedDir = findConfigDirectory(dir);
    if (locatedDir) {
      return path.join(locatedDir, CONFIG_FILE);
    }
  }

  return path.join(normalizeDir(dir), CONFIG_FILE);
}

export function getConfigPath(dir: string = process.cwd()): string {
  return resolveConfigPath(dir, false);
}

export function readConfig(dir: string = process.cwd(), required: boolean = false): FreelogConfig {
  const configPath = resolveConfigPath(dir, true);
  if (!fs.existsSync(configPath)) {
    if (required) throw new Error(`配置文件不存在: ${configPath}`);
    return {} as FreelogConfig;
  }
  return fs.readJsonSync(configPath) as FreelogConfig;
}

export function saveConfig(config: FreelogConfig, dir: string = process.cwd()): void {
  const targetPath = resolveConfigPath(dir, false);
  fs.ensureDirSync(path.dirname(targetPath));
  fs.writeJsonSync(targetPath, config, { spaces: 2 });
}

export function updateConfig(updates: Partial<FreelogConfig>, dir: string = process.cwd()): FreelogConfig {
  const targetPath = resolveConfigPath(dir, true);
  const currentConfig = fs.existsSync(targetPath)
    ? (fs.readJsonSync(targetPath) as FreelogConfig)
    : ({} as FreelogConfig);
  const newConfig = { ...currentConfig, ...updates };
  fs.ensureDirSync(path.dirname(targetPath));
  fs.writeJsonSync(targetPath, newConfig, { spaces: 2 });
  return newConfig;
}
