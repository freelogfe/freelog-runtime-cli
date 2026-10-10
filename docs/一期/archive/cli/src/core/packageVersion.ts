/** 从已安装 CLI 包自身读取版本，避免命令版本与 package.json 手工发版版本脱节。 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 返回当前已安装 CLI 包的 package.json version。 */
export function packageVersion(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packageJson = path.resolve(moduleDir, '../..', 'package.json');
  const value = JSON.parse(readFileSync(packageJson, 'utf8')) as { version?: unknown };
  return typeof value.version === 'string' ? value.version : 'unknown';
}
