/** 发布包内使用文档的定位：安装后优先使用 dist/docs，源码运行时回退到仓库文档。 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 返回可直接打开的使用手册入口绝对路径。 */
export function usageDocsPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const bundledPath = path.resolve(moduleDir, '../docs/README.md');
  if (existsSync(bundledPath)) {
    return bundledPath;
  }
  return path.resolve(moduleDir, '../../../../docs/一期/产品方案/使用/README.md');
}
