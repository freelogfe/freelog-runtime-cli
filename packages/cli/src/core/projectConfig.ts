import fs from 'node:fs';
import path from 'node:path';
import type { FreelogEnv } from './env.js';
import { normalizeCliEnvForWriteGuard } from './env.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

export interface ProjectConfig {
  schemaVersion?: 1;
  defaultEnv?: FreelogEnv;
}

const CONFIG_REL = path.join('.freelog', 'config.json');

export function projectConfigPath(cwd: string): string {
  return path.join(path.resolve(cwd), CONFIG_REL);
}

function readProjectConfig(file: string): ProjectConfig {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectConfig;
  } catch (error) {
    throw cliError(I18N_KEYS.project_config_invalid, {
      code: 4,
      params: { path: file },
      cause: error,
    });
  }
}

/** 从 cwd 向上查找 `.freelog/config.json`（最多 8 层） */
export function findProjectConfig(startCwd?: string): { path: string; config: ProjectConfig } | null {
  let dir = path.resolve(startCwd || process.cwd());
  for (let i = 0; i < 8; i += 1) {
    const file = path.join(dir, CONFIG_REL);
    if (fs.existsSync(file)) {
      return { path: file, config: readProjectConfig(file) };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadProjectDefaultEnv(startCwd?: string): FreelogEnv | undefined {
  const found = findProjectConfig(startCwd);
  if (!found?.config.defaultEnv) return undefined;
  return normalizeCliEnvForWriteGuard(found.config.defaultEnv);
}

export function writeProjectConfig(cwd: string, patch: Partial<ProjectConfig>): string {
  const file = projectConfigPath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let current: ProjectConfig = { schemaVersion: 1 };
  if (fs.existsSync(file)) {
    current = { ...current, ...readProjectConfig(file) };
  }
  const next: ProjectConfig = { ...current, ...patch, schemaVersion: 1 };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return file;
}

export const DEFAULT_PROJECT_CONFIG_COMMENT = {
  schemaVersion: 1 as const,
  defaultEnv: 'dev' as FreelogEnv,
};
