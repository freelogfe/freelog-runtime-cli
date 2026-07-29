import path from 'node:path';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { CliError } from '../core/errors.js';
import { findConfigPath, resolveCwd, type ConfigKind } from './paths.js';
import type { CollectionShell, ResourceShell, VersionShell } from './writeShell.js';
import {
  writeCollectionConfig,
  writeResourceConfig,
  writeVersionConfig,
} from './writeShell.js';

const jiti = createJiti(fileURLToPath(import.meta.url), {
  interopDefault: true,
});

function pickExport(mod: unknown, keys: string[]): Record<string, unknown> {
  if (!mod || typeof mod !== 'object') {
    throw new CliError('配置模块导出非法', { code: 4 });
  }
  const obj = mod as Record<string, unknown>;
  for (const key of keys) {
    if (obj[key] && typeof obj[key] === 'object') {
      return obj[key] as Record<string, unknown>;
    }
  }
  if (obj.default && typeof obj.default === 'object') {
    return obj.default as Record<string, unknown>;
  }
  // module.exports = { ... }
  return obj;
}

export function loadConfigFile(filePath: string, exportKeys: string[]): Record<string, unknown> {
  try {
    const mod = jiti(filePath);
    return pickExport(mod, exportKeys);
  } catch (error) {
    throw new CliError(`无法加载配置: ${filePath}`, {
      code: 4,
      cause: error,
      hint: '检查 freelog.*.config.ts/js 语法与导出',
    });
  }
}

export function loadResourceConfig(cwd?: string): { path: string; data: ResourceShell } {
  const file = findConfigPath('resource', cwd);
  if (!file) {
    throw new CliError('未找到 freelog.resource.config', {
      code: 4,
      hint: '在资源目录执行，或传 --cwd',
    });
  }
  return {
    path: file,
    data: loadConfigFile(file, ['resourceConfig']) as unknown as ResourceShell,
  };
}

export function loadVersionConfig(cwd?: string): { path: string; data: VersionShell } {
  const file = findConfigPath('version', cwd);
  if (!file) {
    throw new CliError('未找到 freelog.version.config', {
      code: 4,
      hint: '在资源目录执行，或传 --cwd',
    });
  }
  return {
    path: file,
    data: loadConfigFile(file, ['versionConfig']) as unknown as VersionShell,
  };
}

export function loadCollectionConfig(cwd?: string): { path: string; data: CollectionShell } {
  const file = findConfigPath('collection', cwd);
  if (!file) {
    throw new CliError('未找到 freelog.collection.config', { code: 4 });
  }
  return {
    path: file,
    data: loadConfigFile(file, ['collectionConfig']) as unknown as CollectionShell,
  };
}

export function tryLoadCollectionConfig(
  cwd?: string,
): { path: string; data: CollectionShell } | null {
  const file = findConfigPath('collection', cwd);
  if (!file) return null;
  return {
    path: file,
    data: loadConfigFile(file, ['collectionConfig']) as unknown as CollectionShell,
  };
}

export function tryLoadResourceConfig(cwd?: string): { path: string; data: ResourceShell } | null {
  const file = findConfigPath('resource', cwd);
  if (!file) return null;
  return {
    path: file,
    data: loadConfigFile(file, ['resourceConfig']) as unknown as ResourceShell,
  };
}

export function tryLoadVersionConfig(cwd?: string): { path: string; data: VersionShell } | null {
  const file = findConfigPath('version', cwd);
  if (!file) return null;
  return {
    path: file,
    data: loadConfigFile(file, ['versionConfig']) as unknown as VersionShell,
  };
}

export function saveResourceConfig(data: ResourceShell, cwd?: string): string {
  const existing = findConfigPath('resource', cwd);
  const format = existing?.endsWith('.js') || existing?.endsWith('.cjs') ? 'js' : 'ts';
  return writeResourceConfig(data, cwd, format);
}

export function saveVersionConfig(data: VersionShell, cwd?: string): string {
  const existing = findConfigPath('version', cwd);
  const format = existing?.endsWith('.js') || existing?.endsWith('.cjs') ? 'js' : 'ts';
  return writeVersionConfig(data, cwd, format);
}

export function saveCollectionConfig(data: CollectionShell, cwd?: string): string {
  const existing = findConfigPath('collection', cwd);
  const format = existing?.endsWith('.js') || existing?.endsWith('.cjs') ? 'js' : 'ts';
  return writeCollectionConfig(data, cwd, format);
}

export function configKindLabel(kind: ConfigKind): string {
  return path.basename(findConfigPath(kind) || `freelog.${kind}.config`);
}

export { resolveCwd };
