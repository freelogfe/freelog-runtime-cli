/**
 * 验证器工具
 */

import semver from 'semver';
import { FreelogError } from '../core/errors';

/**
 * 验证版本号
 */
export function validateVersion(version: string): boolean {
  if (!semver.valid(version)) {
    throw new FreelogError('VERSION_001', `无效的版本号: ${version}`);
  }
  return true;
}

/**
 * 比较版本号
 */
export function compareVersions(v1: string, v2: string): number {
  return semver.compare(v1, v2);
}

/**
 * 检查版本是否满足范围
 */
export function satisfiesVersion(version: string, range: string): boolean {
  return semver.satisfies(version, range);
}

/**
 * 递增版本号
 */
export function incrementVersion(version: string, type: 'major' | 'minor' | 'patch' = 'patch'): string {
  validateVersion(version);

  const validTypes = ['major', 'minor', 'patch'];
  if (!validTypes.includes(type)) {
    throw new Error(`无效的版本递增类型: ${type}`);
  }

  return semver.inc(version, type) || version;
}

/**
 * 解析资源标识符
 */
export function parseResourceIdentifier(identifier: string): { type: string; value: string; version: string | null } {
  // 检查是否为URL
  if (identifier.startsWith('http://') || identifier.startsWith('https://')) {
    return {
      type: 'url',
      value: identifier,
      version: null
    };
  }

  // 检查是否包含版本号 (resource@1.0.0)
  const versionMatch = identifier.match(/^(.+)@(.+)$/);
  if (versionMatch) {
    const [, resourcePart, versionPart] = versionMatch;
    return {
      type: 'identifier',
      value: resourcePart,
      version: versionPart === 'latest' ? 'latest' : versionPart
    };
  }

  return {
    type: 'identifier',
    value: identifier,
    version: null
  };
}

